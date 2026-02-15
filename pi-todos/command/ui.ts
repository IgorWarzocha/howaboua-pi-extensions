import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoListMode, TodoMenuAction, TodoRecord } from "../types.js";
import {
  buildCreatePrdPrompt,
  buildCreateSpecPrompt,
  buildCreateTodoPrompt,
  buildEditChecklistPrompt,
  buildReviewPrompt,
  buildValidateAuditPrompt,
} from "../format.js";
import { attachLinks, deleteTodo, ensureTodoExists, getTodoPath, getTodosDir, listTodos } from "../file-io.js";
import {
  TodoActionMenuComponent,
  TodoCreateInputComponent,
  TodoDetailPreviewComponent,
  TodoEditChecklistInputComponent,
  TodoSelectorComponent,
  SpecPrdSelectComponent,
  TodoParentSelectComponent,
  LinkSelectComponent,
  ValidateSelectComponent,
} from "../tui/index.js";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import { applyTodoAction, handleQuickAction } from "./actions.js";
import { getCliPath } from "../cli-path.js";
import { runValidateCli } from "./validate.js";
import { footer, leader } from "../gui/detail.js";

export async function runTodoUi(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<string | null> {
  const todosDir = getTodosDir(ctx.cwd);
  const todos = await listTodos(todosDir);
  const currentSessionId = ctx.sessionManager.getSessionId();
  const searchTerm = (args ?? "").trim();
  let nextPrompt: string | null = null;
  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const selectors: Partial<Record<TodoListMode, TodoSelectorComponent>> = {};
    const modes: TodoListMode[] = ["tasks", "prds", "specs", "closed"];
    let index = 0;
    let all: TodoFrontMatter[] = todos;
    let createInput: TodoCreateInputComponent | null = null;
    let editInput: TodoEditChecklistInputComponent | null = null;
    let active: {
      render: (width: number) => string[];
      invalidate: () => void;
      handleInput?: (data: string) => void;
      focused?: boolean;
    } | null = null;
    let focused = false;
    const isDeprecated = (todo: TodoFrontMatter) => {
      const status = todo.status.toLowerCase();
      return status === "abandoned" || status === "deprecated";
    };
    const isDone = (todo: TodoFrontMatter) => {
      const status = todo.status.toLowerCase();
      return status === "done" || status === "closed";
    };
    const modified = (todo: TodoFrontMatter) => Date.parse(todo.modified_at || todo.created_at || "") || 0;
    const listTasks = (all: TodoFrontMatter[]) =>
      all.filter((todo) => (todo.kind || "todo") === "todo" && !isDone(todo) && !isDeprecated(todo));
    const listPrds = (all: TodoFrontMatter[]) =>
      all.filter((todo) => todo.kind === "prd" && !isDone(todo) && !isDeprecated(todo));
    const listSpecs = (all: TodoFrontMatter[]) =>
      all.filter((todo) => todo.kind === "spec" && !isDone(todo) && !isDeprecated(todo));
    const listClosed = (all: TodoFrontMatter[]) => {
      const prds = all
        .filter((todo) => todo.kind === "prd" && (isDone(todo) || isDeprecated(todo)))
        .sort((a, b) => modified(b) - modified(a));
      const specs = all
        .filter((todo) => todo.kind === "spec" && (isDone(todo) || isDeprecated(todo)))
        .sort((a, b) => modified(b) - modified(a));
      const tasks = all
        .filter((todo) => (todo.kind || "todo") === "todo" && (isDone(todo) || isDeprecated(todo)))
        .sort((a, b) => modified(b) - modified(a));
      return [...prds, ...specs, ...tasks];
    };
    const setPrompt = (value: string) => {
      nextPrompt = value;
    };
    const currentMode = (): TodoListMode => modes[index] || "tasks";
    const currentSelector = () => selectors[currentMode()] ?? null;
    const setActive = (
      component: {
        render: (width: number) => string[];
        invalidate: () => void;
        handleInput?: (data: string) => void;
        focused?: boolean;
      } | null,
    ) => {
      if (active && "focused" in active) active.focused = false;
      active = component;
      if (active && "focused" in active) active.focused = focused;
      tui.requestRender();
    };
    const refresh = async () => {
      const updated = await listTodos(todosDir);
      all = updated;
      selectors.tasks?.setTodos(listTasks(updated));
      selectors.prds?.setTodos(listPrds(updated));
      selectors.specs?.setTodos(listSpecs(updated));
      selectors.closed?.setTodos(listClosed(updated));
    };
    const runListCommand = async (action: "sweep-abandoned" | "sweep-completed" | "review-all") => {
      if (action === "review-all") {
        const mode = currentMode();
        const updated = await listTodos(todosDir);
        const scoped =
          mode === "prds"
            ? listPrds(updated)
            : mode === "specs"
              ? listSpecs(updated)
              : mode === "closed"
                ? listClosed(updated)
                : listTasks(updated);
        if (!scoped.length) {
          ctx.ui.notify("No items available to review", "error");
          return;
        }
        const lines = scoped.map((todo) => `- ${buildReviewPrompt(todo.title || "(untitled)", todo.links)}`).join("\n\n");
        setPrompt(`Review all items in ${mode} list:\n\n${lines}`);
        done();
        return;
      }
      const updated = await listTodos(todosDir);
      const ids = updated
        .filter((todo) =>
          action === "sweep-abandoned"
            ? todo.status === "abandoned"
            : todo.status === "done" || todo.status === "closed",
        )
        .map((todo) => todo.id);
      for (const id of ids) await deleteTodo(todosDir, id, ctx);
      await refresh();
      ctx.ui.notify(
        action === "sweep-abandoned"
          ? `Deleted ${ids.length} abandoned todos`
          : `Deleted ${ids.length} completed/closed todos`,
        "info",
      );
    };
    const resolve = async (todo: TodoFrontMatter): Promise<TodoRecord | null> => {
      const record = await ensureTodoExists(getTodoPath(todosDir, todo.id), todo.id);
      if (record) return record;
      ctx.ui.notify("Todo not found", "error");
      return null;
    };
    const showDetailView = (record: TodoRecord, source: TodoListMode) => {
      const preview = new TodoDetailPreviewComponent(tui, theme, record);
      const detailFooter = footer(record);
      const leaderFooter = leader(record);
      let previewVisible = true;
      let leaderActive = false;
      let leaderTimer: ReturnType<typeof setTimeout> | null = null;
      const clearLeader = () => {
        if (leaderTimer) clearTimeout(leaderTimer);
        leaderTimer = null;
        leaderActive = false;
        detailMenu.setFooter(detailFooter);
        tui.requestRender();
      };
      const startLeader = () => {
        if (leaderActive) return clearLeader();
        leaderActive = true;
        if (leaderTimer) clearTimeout(leaderTimer);
        leaderTimer = setTimeout(() => clearLeader(), 2000);
        detailMenu.setFooter(leaderFooter, "warning");
        tui.requestRender();
      };
      const detailMenu = new TodoActionMenuComponent(
        theme,
        record,
        (action) => {
          void handleSelection(record, action, source);
        },
        () => setActive(selectors[source] ?? currentSelector()),
        {
          showView: false,
          footer: detailFooter,
        },
      );
      const detailView = {
        render(width: number) {
          const rows = tui.terminal.rows || 24;
          const maxHeight = Math.max(10, Math.floor(rows * 0.55));
          const previewLines = previewVisible ? preview.render(width, maxHeight) : [];
          const menuLines = detailMenu.render(width);
          if (!previewVisible) return [...menuLines];
          return [...previewLines, "", ...menuLines];
        },
        invalidate() {
          preview.invalidate();
          detailMenu.invalidate();
        },
        handleInput(data: string) {
          if (leaderActive) {
            if (
              data === "x" ||
              data === "X" ||
              data === "\u0018" ||
              matchesKey(data, Key.ctrl("x"))
            )
              return clearLeader();
            if (data === "w" || data === "W")
              return (clearLeader(), void handleSelection(record, "work", source));
            if (data === "r" || data === "R")
              return (clearLeader(), void handleSelection(record, "refine", source));
            if (data === "y" || data === "Y")
              return (clearLeader(), void handleSelection(record, "review-item", source));
            if (data === "c" || data === "C")
              return (clearLeader(), void handleSelection(record, "complete", source));
            if (data === "a" || data === "A")
              return (clearLeader(), void handleSelection(record, "abandon", source));
            if (data === "v" || data === "V") {
              clearLeader();
              previewVisible = !previewVisible;
              tui.requestRender();
              return;
            }
            if ((data === "e" || data === "E") && record.checklist?.length) {
              clearLeader();
              return showEditChecklistInput(record, source);
            }
            return clearLeader();
          }
          if (data === "\u0018" || matchesKey(data, Key.ctrl("x"))) return startLeader();
          if (data === "v") {
            previewVisible = !previewVisible;
            tui.requestRender();
            return;
          }
          if (data === "k") return detailMenu.handleInput("\u001b[A");
          if (data === "j") return detailMenu.handleInput("\u001b[B");
          if (data === "K") {
            if (!previewVisible) return detailMenu.handleInput("\u001b[A");
            preview.scrollBy(-1);
            tui.requestRender();
            return;
          }
          if (data === "J") {
            if (!previewVisible) return detailMenu.handleInput("\u001b[B");
            preview.scrollBy(1);
            tui.requestRender();
            return;
          }
          detailMenu.handleInput(data);
        },
        focused,
      };
      setActive(detailView);
    };
    const showAttachInput = (record: TodoRecord, source: TodoListMode) => {
      const prds = all.filter((item) => item.id !== record.id && item.kind === "prd");
      const specs = all.filter((item) => item.id !== record.id && item.kind === "spec");
      const todos = all.filter((item) => item.id !== record.id && (item.kind || "todo") === "todo");
      const picker = new LinkSelectComponent(
        tui,
        theme,
        prds,
        specs,
        todos,
        async (selected) => {
          const targets = all.filter(
            (item) =>
              selected.prds.has(item.id) ||
              selected.specs.has(item.id) ||
              selected.todos.has(item.id),
          );
          const result = await attachLinks(todosDir, record, targets, ctx);
          if ("error" in result) {
            ctx.ui.notify(result.error, "error");
            return setActive(picker);
          }
          await refresh();
          const updated = await resolve(record);
          if (!updated) return setActive(selectors[source] ?? currentSelector());
          ctx.ui.notify(`Attached links across ${result.updated} items`, "info");
          showDetailView(updated, source);
        },
        () => showDetailView(record, source),
      );
      setActive(picker);
    };
    const showValidateInput = async (record: TodoRecord, source: TodoListMode) => {
      const cli = getCliPath();
      const file = getTodoPath(todosDir, record.id, record.kind);
      let result: { issues: Array<{ kind: "prd" | "spec" | "todo"; name: string; issue: string; file: string }>; recommendations: Array<{ target: string; kind: "prd" | "spec" | "todo"; name: string; reason: string }> };
      try {
        result = runValidateCli(cli, ctx.cwd, file);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Validate command failed.";
        ctx.ui.notify(message, "error");
        return showDetailView(record, source);
      }
      if (!result.recommendations.length) {
        const issueCount = result.issues.length;
        ctx.ui.notify(issueCount ? `No attach recommendations. Found ${issueCount} issue(s).` : "No issues found.", "info");
        return showDetailView(record, source);
      }
      const picker = new ValidateSelectComponent(
        tui,
        theme,
        result.recommendations.map((item) => ({ key: item.target, label: item.name, kind: item.kind, reason: item.reason })),
        async (selected) => {
          const targets = all.filter((item) => {
            const target = normalizePath(getTodoPath(todosDir, item.id, item.kind));
            return selected.prds.has(target) || selected.specs.has(target) || selected.todos.has(target);
          });
          const applied = await attachLinks(todosDir, record, targets, ctx);
          if ("error" in applied) {
            ctx.ui.notify(applied.error, "error");
            return setActive(picker);
          }
          await refresh();
          const updated = await resolve(record);
          if (!updated) return setActive(selectors[source] ?? currentSelector());
          ctx.ui.notify(`Applied ${targets.length} recommended attachment(s)`, "info");
          showDetailView(updated, source);
        },
        () => showDetailView(record, source),
      );
      setActive(picker);
    };
    const showAuditPrompt = (record: TodoRecord) => {
      const current = getTodoPath(todosDir, record.id, record.kind);
      const scope = all.map((item) => getTodoPath(todosDir, item.id, item.kind));
      setPrompt(buildValidateAuditPrompt(current, scope));
      done();
    };
    const normalizePath = (value: string) => value.replaceAll("\\", "/");
    const handleSelection = async (
      record: TodoRecord,
      action: TodoMenuAction,
      source: TodoListMode,
    ) => {
      if (action === "view") return showDetailView(record, source);
      if (action === "attach-links") return showAttachInput(record, source);
      if (action === "validate-links") return showValidateInput(record, source);
      if (action === "audit") return showAuditPrompt(record);
      const result = await applyTodoAction(todosDir, ctx, refresh, done, record, action, setPrompt);
      if (result === "stay") setActive(selectors[source] ?? currentSelector());
    };
    const openDetailFromTodo = async (todo: TodoFrontMatter | TodoRecord, source: TodoListMode) => {
      const record = "body" in todo ? todo : await resolve(todo);
      if (!record) return;
      showDetailView(record, source);
    };
    const showCreateInput = (mode: TodoListMode) => {
      if (mode === "tasks") {
        const picker = new TodoParentSelectComponent(
          tui,
          theme,
          listPrds(all),
          listSpecs(all),
          (selected) => {
            createInput = new TodoCreateInputComponent(
              tui,
              theme,
              (userPrompt) => {
                const cli = getCliPath();
                const prdPaths = listPrds(all)
                  .filter((item) => selected.prds.has(item.id))
                  .map((item) => getTodoPath(todosDir, item.id, "prd"));
                const specPaths = listSpecs(all)
                  .filter((item) => selected.specs.has(item.id))
                  .map((item) => getTodoPath(todosDir, item.id, "spec"));
                const standalone = selected.prds.has("__NONE__") || selected.specs.has("__NONE__");
                setPrompt(buildCreateTodoPrompt(userPrompt, cli, ctx.cwd, standalone ? [] : prdPaths, standalone ? [] : specPaths));
                done();
              },
              () => setActive(currentSelector()),
              {
                title: "Create New Todo",
                description: "Describe the task implementation plan. Selected PRDs/specs will be attached.",
              },
            );
            setActive(createInput);
          },
          () => setActive(currentSelector()),
        );
        setActive(picker);
        return;
      }
      if (mode === "specs") {
        const picker = new SpecPrdSelectComponent(
          tui,
          theme,
          listPrds(all),
          (selectedPrds) => {
            createInput = new TodoCreateInputComponent(
              tui,
              theme,
              (userPrompt) => {
                const cli = getCliPath();
                const prdPaths = selectedPrds.map((item) => getTodoPath(todosDir, item.id, "prd"));
                setPrompt(buildCreateSpecPrompt(userPrompt, cli, ctx.cwd, prdPaths));
                done();
              },
              () => setActive(currentSelector()),
              {
                title: "Create New Spec",
                description: "Describe the technical specification. Selected PRDs will be attached.",
              },
            );
            setActive(createInput);
          },
          () => setActive(currentSelector()),
        );
        setActive(picker);
        return;
      }
      createInput = new TodoCreateInputComponent(
        tui,
        theme,
        (userPrompt) => {
          const cli = getCliPath();
          const prompt =
            mode === "prds"
              ? buildCreatePrdPrompt(userPrompt, cli, ctx.cwd)
              : buildCreateTodoPrompt(userPrompt, cli, ctx.cwd, [], []);
          setPrompt(prompt);
          done();
        },
        () => setActive(currentSelector()),
        {
          title:
            mode === "prds" ? "Create New PRD" : "Create New Todo",
          description:
            mode === "prds"
              ? "Describe the product requirement. The AI SHOULD read linked files and ask clarifying questions first."
              : "Describe the task. The AI will read files and ask questions before creating.",
        },
      );
      setActive(createInput);
    };
    const showEditChecklistInput = (record: TodoRecord, source: TodoListMode) => {
      editInput = new TodoEditChecklistInputComponent(
        tui,
        theme,
        record,
        (userPrompt) => {
          const checklist = record.checklist || [];
          setPrompt(buildEditChecklistPrompt(record.title || "(untitled)", checklist, userPrompt));
          done();
        },
        () => showDetailView(record, source),
      );
      setActive(editInput);
    };
    const buildSelector = (mode: TodoListMode, items: TodoFrontMatter[], initial?: string) =>
      new TodoSelectorComponent(
        tui,
        theme,
        items,
        (todo) => void openDetailFromTodo(todo, mode),
        () => done(),
        initial,
        currentSessionId,
        (todo, action) =>
          action === "create"
            ? showCreateInput(mode)
            : void handleQuickAction(todo, action, () => showCreateInput(mode), done, setPrompt, ctx, resolve),
        () => {
          index = (index + 1) % modes.length;
          setActive(currentSelector());
        },
        (action) => void runListCommand(action),
        mode,
      );
    selectors.tasks = buildSelector("tasks", listTasks(todos), searchTerm || undefined);
    selectors.prds = buildSelector("prds", listPrds(todos));
    selectors.specs = buildSelector("specs", listSpecs(todos));
    selectors.closed = buildSelector("closed", listClosed(todos));
    setActive(currentSelector());
    return {
      get focused() {
        return focused;
      },
      set focused(value: boolean) {
        focused = value;
        if (active && "focused" in active) active.focused = value;
      },
      render(width: number) {
        return active ? active.render(width) : [];
      },
      invalidate() {
        active?.invalidate();
      },
      handleInput(data: string) {
        active?.handleInput?.(data);
      },
    };
  });
  return nextPrompt;
}
