import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { SubagentTask } from "./types.js";
import { filterSkills } from "./utils.js";
import { loadAgents, disabledSkills, disabledAgents, activeSubagentProcesses, loadPermissions, savePermissions } from "./store.js";
import { runSubagent } from "./runner.js";
import { selectCwd, manageSubagents, manageSkills, createAgent } from "./ui.js";

// --- Extension Entry Point ---

export default function (pi: ExtensionAPI) {
  
  // 1. System Prompt Orchestration
  pi.on("before_agent_start", async (event, ctx) => {
    // Load permissions if not already loaded (or refresh from disk)
    loadPermissions(ctx.cwd);

    let { systemPrompt } = event;
    if (!systemPrompt) return undefined;

    // A. Skill Filtering (Main Agent AND Subagent Whitelisting)
    const subagentWhitelistRaw = process.env.SUBAGENT_WHITELIST;
    if (subagentWhitelistRaw !== undefined) {
      const allowed = new Set(subagentWhitelistRaw.split(",").filter(Boolean));
      systemPrompt = filterSkills(systemPrompt, allowed, undefined);
    } else if (disabledSkills.size > 0) {
      systemPrompt = filterSkills(systemPrompt, undefined, disabledSkills);
    }

    // B. Subagent Injection & Proactivity Rules
    const agents = loadAgents(ctx.cwd).filter(a => !disabledAgents.has(a.name));
    let injection = "";
    if (agents.length > 0) {
      const agentList = agents.map(a => 
        `  <agent>\n    <name>${a.name}</name>\n    <description>${a.description}</description>\n  </agent>`
      ).join("\n");
      injection += `\n\n<available_subagents>\n${agentList}\n</available_subagents>\n`;
      injection += `\n<delegation_rules>\nIf a task is predicted to be substantial, focused, or highly specialized (e.g., pure research, heavy refactoring, or specific domain optimization), you SHOULD proactively suggest creating a new subagent or delegating to an existing one from <available_subagents> using the 'invoke_subagent' tool.\n</delegation_rules>\n`;
    }

    const skillEnd = systemPrompt.indexOf("</available_skills>");
    if (skillEnd !== -1) {
      systemPrompt = systemPrompt.substring(0, skillEnd + "</available_skills>".length) + injection + systemPrompt.substring(skillEnd + "</available_skills>".length);
    } else {
      systemPrompt = injection + systemPrompt;
    }

    return { systemPrompt };
  });

  // 2. invoke_subagent tool
  pi.registerTool({
    name: "invoke_subagent",
    description: "Delegate a specific task to specialized subagents. Supports multiple agents via the 'tasks' parameter. Only use agents listed in <available_subagents>.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Name of the agent to invoke (ignored if 'tasks' provided)" },
        task: { type: "string", description: "The instructions for the agent (ignored if 'tasks' provided)" },
        cwd: { type: "string", description: "Optional: Override working directory for the agent" },
        session_id: { type: "string", description: "Optional: ID of a previous session to resume" },
        parallel: { type: "boolean", description: "Run multiple tasks in parallel (default: false)" },
        tasks: { 
          type: "array", 
          items: {
            type: "object",
            properties: {
              agent: { type: "string" },
              task: { type: "string" },
              cwd: { type: "string" }
            },
            required: ["agent", "task"]
          },
          description: "Batch multiple subagent tasks."
        }
      },
      required: []
    },
    async execute(_id, params, signal, onUpdate, ctx) {
      const p = params as { 
        agent?: string, 
        task?: string, 
        cwd?: string, 
        session_id?: string,
        parallel?: boolean,
        tasks?: SubagentTask[]
      };

      const tasksToRun: SubagentTask[] = p.tasks || (p.agent && p.task ? [{ agent: p.agent, task: p.task, cwd: p.cwd }] : []);
      if (tasksToRun.length === 0) throw new Error("No tasks or agent/task provided.");

      const agents = loadAgents(ctx.cwd);
      const isParallel = p.parallel === true;
      const spinner = ["|", "/", "-", "\\"];
      let spinnerIdx = 0;

      const taskStatuses = tasksToRun.map((t) => ({ 
        name: t.agent, 
        task: t.task,
        cwd: t.cwd || ctx.cwd,
        status: "pending", 
        output: "", 
        toolCalls: [] as string[] 
      }));

      const updateUI = () => {
        if (!onUpdate || signal?.aborted) return;
        const char = spinner[spinnerIdx++ % spinner.length];
        const summary = taskStatuses.map(s => {
          const toolText = s.toolCalls.length > 0 ? ` [${s.toolCalls.join("->")}]` : "";
          const statusText = s.status === "running" ? char : s.status;
          return `- **${s.name}**: ${statusText}${toolText}\n  - *Task:* ${s.task.slice(0, 100)}${s.task.length > 100 ? "..." : ""}\n  - *CWD:* ${path.basename(s.cwd)}`;
        }).join("\n");
        const fullOutput = taskStatuses.map(s => `#### Output from ${s.name}\n${s.output || "(Waiting...)"}`).join("\n\n");
        onUpdate({ content: [{ type: "text", text: `### Subagent Execution Dashboard\n${summary}\n\n${fullOutput}` }] });
      };

      if (isParallel) {
        if (ctx.hasUI) ctx.ui.notify(`DELEGATING ${tasksToRun.length} TASKS IN PARALLEL`, "info");
        const results = await Promise.all(tasksToRun.map(async (taskInfo, i) => {
          const agentConfig = agents.find(a => a.name === taskInfo.agent);
          if (!agentConfig) throw new Error(`Agent '${taskInfo.agent}' not found.`);
          if (disabledAgents.has(taskInfo.agent)) throw new Error(`Agent '${taskInfo.agent}' is currently disabled.`);
          const activeSessionId = p.session_id || randomUUID();
          taskStatuses[i]!.status = "running";
          const output = await runSubagent(agentConfig, taskInfo.task, taskStatuses[i]!.cwd, activeSessionId, (data) => {
            taskStatuses[i]!.output = data.output;
            taskStatuses[i]!.toolCalls = data.toolCalls;
            updateUI();
          }, signal);
          taskStatuses[i]!.status = "completed";
          taskStatuses[i]!.output = output;
          return { name: taskInfo.agent, output, sessionId: activeSessionId };
        }));
        if (signal?.aborted) return { content: [{ type: "text", text: "Parallel batch aborted by user." }] };
        const resultsText = results.map((r, i) => `### Result [${i+1}/${results.length}] from Subagent: ${r.name}\n\n${r.output}\n\n<session_resumption_id>\nsession_id: ${r.sessionId}\n</session_resumption_id>`).join("\n\n---\n\n");
        return { content: [{ type: "text", text: resultsText }] };
      } else {
        let resultsText = "";
        for (let i = 0; i < tasksToRun.length; i++) {
          const taskInfo = tasksToRun[i]!;
          const agentConfig = agents.find(a => a.name === taskInfo.agent);
          if (!agentConfig) throw new Error(`Agent '${taskInfo.agent}' not found.`);
          if (disabledAgents.has(taskInfo.agent)) throw new Error(`Agent '${taskInfo.agent}' is currently disabled.`);
          const activeSessionId = p.session_id || randomUUID();
          taskStatuses[i]!.status = "running";
          if (ctx.hasUI) ctx.ui.notify(`DELEGATING [${i+1}/${tasksToRun.length}] TO '${taskInfo.agent}'`, "info");
          const output = await runSubagent(agentConfig, taskInfo.task, taskStatuses[i]!.cwd, activeSessionId, (data) => {
            taskStatuses[i]!.output = data.output;
            taskStatuses[i]!.toolCalls = data.toolCalls;
            updateUI();
          }, signal);
          if (signal?.aborted) return { content: [{ type: "text", text: resultsText + "\n\nBatch aborted by user." }] };
          taskStatuses[i]!.status = "completed";
          taskStatuses[i]!.output = output;
          const taskResult = `### Result [${i+1}/${tasksToRun.length}] from Subagent: ${taskInfo.agent}\n\n${output}\n\n<session_resumption_id>\nsession_id: ${activeSessionId}\n</session_resumption_id>`;
          resultsText = resultsText ? `${resultsText}\n\n---\n\n${taskResult}` : taskResult;
        }
        return { content: [{ type: "text", text: resultsText }] };
      }
    }
  });

  // 3. Command /agents for GUI
  pi.registerCommand("agents", {
    description: "Manage subagents, skill permissions, and orchestrator prompt",
    handler: async (_args, ctx) => {
      while (true) {
        const choice = await ctx.ui.select("Agent Manager", [
          "Manage Subagents",
          "Manage Skill Permissions",
          "Done"
        ]);
        if (!choice || choice === "Done") break;
        if (choice === "Manage Subagents") await manageSubagents(pi, ctx);
        else if (choice === "Manage Skill Permissions") await manageSkills(pi, ctx, disabledSkills, "Main Agent Skill Permissions");
      }
    }
  });

  pi.registerCommand("subagent:multi", {
    description: "Interactive batch subagent invocation GUI",
    handler: async (_args, ctx) => {
      const agents = loadAgents(ctx.cwd).filter(a => !disabledAgents.has(a.name));
      const batch: SubagentTask[] = [];
      let isParallel = false;
      while (true) {
        const currentBatchSummary = batch.map((t, i) => `${i+1}. ${t.agent} (@ ${path.basename(t.cwd || ctx.cwd)})`).join("\n");
        const options = [...agents.map(a => `Add ${a.name}`), "---", `${isParallel ? "✅" : "❌"} Run in Parallel`, "Execute Batch", "Clear Batch", "Cancel"];
        const choice = await ctx.ui.select(`Multi-Agent Queue:\n${currentBatchSummary || "(Empty)"}`, options);
        if (!choice || choice === "Cancel") break;
        if (choice.includes("Run in Parallel")) { isParallel = !isParallel; continue; }
        if (choice === "Execute Batch") {
          if (batch.length === 0) { ctx.ui.notify("Queue is empty.", "warning"); continue; }
          pi.sendUserMessage(`invoke_subagent(tasks=${JSON.stringify(batch)}, parallel=${isParallel})`, { deliverAs: "steer" });
          break;
        }
        if (choice === "Clear Batch") { batch.length = 0; continue; }
        if (choice.startsWith("Add ")) {
          const agentName = choice.replace("Add ", "");
          const task = await ctx.ui.input(`Prompt for ${agentName}`, "Enter specific instructions...");
          if (!task) continue;
          const targetCwd = await selectCwd(ctx);
          batch.push({ agent: agentName, task, cwd: targetCwd });
        }
      }
    }
  });

  pi.on("session_start", (_event, ctx) => { if (ctx.hasUI) ctx.ui.notify("Agent Manager loaded. Use /agents to configure.", "info"); });

  pi.registerCommand("subagent:abort", {
    description: "Abort all currently running subagent processes.",
    handler: async (_args, ctx) => {
      if (activeSubagentProcesses.size === 0) { ctx.ui.notify("No active processes.", "warning"); return; }
      const count = activeSubagentProcesses.size;
      for (const [pid, name] of activeSubagentProcesses.entries()) try { process.kill(pid, "SIGTERM"); } catch {}
      activeSubagentProcesses.clear();
      ctx.ui.notify(`Aborted ${count} processes.`, "info");
    }
  });

  const allSubagents = loadAgents(process.cwd());
  for (const sub of allSubagents) {
    pi.registerCommand(`subagent:${sub.name}`, {
      description: `Invoke the ${sub.name} subagent: /subagent:${sub.name} <prompt>`,
      handler: async (args, ctx) => {
        const task = args.trim();
        if (!task || disabledAgents.has(sub.name)) {
          if (!task) ctx.ui.notify("Prompt required.", "warning");
          else ctx.ui.notify(`Subagent disabled.`, "warning");
          return;
        }
        pi.sendUserMessage(`invoke_subagent(agent="${sub.name}", task="${task.replace(/"/g, '\\"')}")`, { deliverAs: "steer" });
      }
    });
  }

  pi.on("input", async (event, ctx) => {
    const text = event.text.trim();
    if (!text.startsWith("/subagent:")) return { action: "continue" };
    const match = text.match(/^\/subagent:([\w-]+)\s*([\s\S]*)$/i);
    if (!match || match[1] === "multi" || match[1] === "abort") return { action: "continue" };
    const [, name, task] = match;
    const agents = loadAgents(ctx.cwd);
    const agent = agents.find(a => a.name?.toLowerCase() === name?.toLowerCase());
    if (!agent || !task || disabledAgents.has(agent.name)) { return { action: "handled" }; }
    pi.sendUserMessage(`invoke_subagent(agent="${agent.name}", task="${task.replace(/"/g, '\\"')}")`, { deliverAs: "steer" });
    return { action: "handled" };
  });
}
