import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentConfig } from "./types.js";
import { bareSkillName, serializeFrontmatter } from "./utils.js";
import { loadAgents, disabledAgents, savePermissions } from "./store.js";
import { disabledSkills } from "./store.js";

/**
 * Interactive fuzzy path picker.
 * Empty by default, starts searching as the user provides input.
 */
export async function selectCwd(ctx: ExtensionContext): Promise<string> {
  let query = "";
  while (true) {
    query = (await ctx.ui.input("Search directory (@)", "Type a folder name to search...")) || "";

    if (!query || query === "." || query === "./") {
      const confirm = await ctx.ui.select("No search query provided. Use project root?", [
        "Yes, use root",
        "No, search again",
      ]);
      if (confirm === "Yes, use root") return ctx.cwd;
      continue;
    }

    let dirs: string[] = [];
    const findArgs = [
      ".",
      "-maxdepth",
      "4",
      "-type",
      "d",
      "-not",
      "-path",
      "*/.*",
      "-iname",
      `*${query}*`,
    ];
    const findProc = spawn("find", findArgs, { cwd: ctx.cwd });

    dirs = await new Promise((resolve) => {
      let buf = "";
      findProc.stdout.on("data", (d) => (buf += d));
      findProc.on("close", () => {
        resolve(
          buf
            .split("\n")
            .map((d) => d.trim())
            .filter((d) => d && d !== "." && d !== "./"),
        );
      });
    });

    if (dirs.length === 0) {
      const next = await ctx.ui.select(`No directories matching "${query}" found.`, [
        "Try Again",
        "Use Project Root",
        "Cancel",
      ]);
      if (next === "Use Project Root" || next === "Cancel") return ctx.cwd;
      continue;
    }

    const options = [
      "-- Search Again --",
      ...dirs.map((d) => (d.startsWith("./") ? d : `./${d}`)).slice(0, 50),
    ];
    const choice = await ctx.ui.select(`Results for "${query}" (Select one)`, options);

    if (!choice || choice === "-- Search Again --") continue;
    return path.resolve(ctx.cwd, choice.replace("./", ""));
  }
}

export async function selectModel(
  ctx: ExtensionContext,
  current?: string,
): Promise<string | undefined> {
  const models = (ctx as any).modelRegistry
    .getAvailable()
    .map((m: any) => `${m.provider}/${m.id}`)
    .sort();
  const options = ["Default", ...models];
  const choice = await ctx.ui.select(
    current ? `Current Model: ${current}` : "Select Model",
    options,
  );
  if (!choice) return undefined;
  return choice === "Default" ? "" : choice;
}

export async function manageSubagents(pi: ExtensionAPI, ctx: ExtensionContext) {
  while (true) {
    const agents = loadAgents(ctx.cwd);
    const options = [
      ...agents.map((a) => `${disabledAgents.has(a.name) ? "❌" : "✅"} ${a.name}`),
      "---",
      "Create New Agent",
      "Back",
    ];
    const choice = await ctx.ui.select("Subagents", options);
    if (!choice || choice === "Back") break;
    if (choice === "---") continue;
    if (choice === "Create New Agent") await createAgent(pi, ctx);
    else {
      const name = choice.replace(/^[✅❌]\s*/, "");
      const agent = agents.find((a) => a.name === name);
      if (!agent) continue;
      const action = await ctx.ui.select(`Agent: ${name}`, [
        "Toggle Enable/Disable",
        "Change Model",
        "Manage Skill Permissions",
        "Edit Prompt",
        "Delete",
        "Back",
      ]);
      if (action === "Toggle Enable/Disable") {
        if (disabledAgents.has(name)) disabledAgents.delete(name);
        else disabledAgents.add(name);
        savePermissions(ctx.cwd);
      } else if (action === "Change Model") {
        const newModel = await selectModel(ctx, agent.model);
        if (newModel !== undefined) {
          fs.writeFileSync(
            agent.filePath,
            serializeFrontmatter({ ...agent, model: newModel || undefined }) +
              "\n" +
              agent.systemPrompt,
          );
          ctx.ui.notify(`Model for '${name}' updated.`, "info");
        }
      } else if (action === "Manage Skill Permissions") {
        const allowedSkills = new Set<string>();
        if (agent.skillPermissions)
          for (const [s, act] of Object.entries(agent.skillPermissions))
            if (act === "allow" && s !== "*") allowedSkills.add(s);
        await manageSkills(pi, ctx, allowedSkills, `Skills for ${name} (WHITELIST)`);
        const newPermissions: Record<string, "allow" | "deny"> = { "*": "deny" };
        for (const s of allowedSkills) newPermissions[s] = "allow";
        fs.writeFileSync(
          agent.filePath,
          serializeFrontmatter({ ...agent, skillPermissions: newPermissions }) +
            "\n" +
            agent.systemPrompt,
        );
        ctx.ui.notify(`Skill permissions for '${name}' updated.`, "info");
      } else if (action === "Edit Prompt") {
        const newPrompt = await ctx.ui.input("System Prompt", agent.systemPrompt);
        if (newPrompt !== undefined)
          fs.writeFileSync(agent.filePath, serializeFrontmatter(agent) + "\n" + newPrompt);
      } else if (action === "Delete") {
        if (await ctx.ui.confirm("Delete Agent", `Delete agent '${name}'?`)) {
          fs.unlinkSync(agent.filePath);
          disabledAgents.delete(name);
          savePermissions(ctx.cwd);
          ctx.ui.notify(`Agent '${name}' deleted.`, "info");
        }
      }
    }
  }
}

export async function createAgent(pi: ExtensionAPI, ctx: ExtensionContext) {
  const rawName = await ctx.ui.input("Agent Name (e.g. 'security-expert')");
  if (!rawName) return;
  const name = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name) {
    ctx.ui.notify("Invalid agent name.", "error");
    return;
  }
  const description = await ctx.ui.input("Short Description");
  if (!description) return;
  const model = await selectModel(ctx);
  if (model === undefined) return;
  const scope = await ctx.ui.select("Storage Location", [
    "Project (.pi/agents)",
    "Global (~/.pi/agent/agents)",
  ]);
  if (!scope) return;
  const dir =
    scope === "Project (.pi/agents)"
      ? path.join(ctx.cwd, ".pi", "agents")
      : path.join(os.homedir(), ".pi", "agent", "agents");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.md`);
  if (fs.existsSync(filePath)) {
    ctx.ui.notify(`Agent already exists.`, "error");
    return;
  }
  fs.writeFileSync(
    filePath,
    serializeFrontmatter({
      name,
      description: "Placeholder.",
      model: model || undefined,
      skillPermissions: { "*": "deny" },
    }) + "\n\nPlaceholder prompt.",
  );
  ctx.ui.notify(`Agent created. Requesting enhancement...`, "info");
  const enhancementRequest = `[AGENT_ARCHITECT_MODE]\nTarget: ${filePath}\nInitial Goal: "${description}"\n\nYou MUST refine this subagent into an expert-level specialist. \n\n### STRUCTURE REQUIREMENTS\nThe agent body MUST follow this XML-pilled structure:\n<role_and_objective>Expert persona and core mission.</role_and_objective>\n<instructions>\n- Use RFC 2119 keywords (MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, OPTIONAL).\n- Define clear behavioral boundaries.\n- You MUST include a directive that the agent SHALL remain focused on the task at hand and the specified working directory.\n- You MUST explicitly state that the agent MUST NOT invoke further subagents or attempt to retrieve information from previous sessions unless specifically instructed.\n</instructions>\n<workflow>Step-by-step execution logic.</workflow>\n<output_format>Strict definition of how the agent returns findings.</output_format>\n\n### FRONTMATTER REQUIREMENTS\n- description: A concise (1-3 sentences), instruction-heavy rule for the Main Agent.\n- permission:\n    skill:\n      "*": "deny"\n      "relevant-skill-name": "allow"\n\n### TASK\n1. Research best practices.\n2. Generate .md content.\n3. Use 'edit' tool.\n4. Confirm initialization and 'invoke_subagent' usage.`;
  pi.sendUserMessage(enhancementRequest, { deliverAs: "steer" });
}

export async function manageSkills(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  skillSet: Set<string>,
  title: string,
) {
  const piAny = pi as any;
  if (typeof piAny.getCommands !== "function") return;
  const allSkills = (piAny.getCommands() as any[])
    .filter((c) => c.source === "skill")
    .map((c) => bareSkillName(c.name))
    .sort();
  while (true) {
    const options = [...allSkills.map((s) => `${skillSet.has(s) ? "✅" : "❌"} ${s}`), "Back"];
    const choice = await ctx.ui.select(title, options);
    if (!choice || choice === "Back") break;
    const name = choice.replace(/^[✅❌]\s*/, "");
    if (skillSet.has(name)) skillSet.delete(name);
    else skillSet.add(name);

    // If this is the main disabledSkills set, persist it
    if (skillSet === disabledSkills) {
      savePermissions(ctx.cwd);
    }
  }
}
