import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoListMode, TodoMenuAction, TodoRecord } from "../types.js";
import {
  buildCreatePrdPrompt,
  buildCreateSpecPrompt,
  buildCreateTodoPrompt,
  buildEditChecklistPrompt,
  buildPrdReviewPrompt,
  buildSpecReviewPrompt,
  buildTodoReviewPrompt,
  buildValidateAuditPrompt,
  deriveTodoStatus,
} from "../format.js";
import {
  attachLinks,
  deleteTodo,
  ensureTodoExists,
  getTodoPath,
  getTodosDir,
  listTodos,
} from "../file-io.js";
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
import { Key, matchesKey, type TUI } from "@mariozechner/pi-tui";
import { applyTodoAction, handleQuickAction } from "./actions.js";
import { getCliPath } from "../cli-path.js";
import { runValidateCli } from "./validate.js";
import { footer, leader } from "../gui/detail.js";
import { runRepairFrontmatter } from "./repair.js";

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
    const uiTui = tui as unknown as TUI;
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
    const status = (todo: TodoFrontMatter) => deriveTodoStatus(todo as TodoRecord).toLowerCase();
    const isDeprecated = (todo: TodoFrontMatter) => {
      const value = status(todo);
      return value === "abandoned" || value === "deprecated";
    };
    const isDone = (todo: TodoFrontMatter) => {
      const value = status(todo);
      return value === "done" || value === "closed";
    };
    const modified = (todo: TodoFrontMatter) =>
      Date.parse(todo.modified_at || todo.created_at || "") || 0;
    const listTasks = (all: TodoFrontMatter[]) =>
      all.filter(
        (todo) =>
          (todo.type || todo.kind || "todo") === "todo" && !isDone(todo) && !isDeprecated(todo),
      );
    const listPrds = (all: TodoFrontMatter[]) =>
      all.filter(
        (todo) => (todo.type || todo.kind) === "prd" && !isDone(todo) && !isDeprecated(todo),
      );
    const listSpecs = (all: TodoFrontMatter[]) =>
      all.filter(
        (todo) => (todo.type || todo.kind) === "spec" && !isDone(todo) && !isDeprecated(todo),
      );
    const listClosed = (all: TodoFrontMatter[]) => {
      const prds = all
        .filter(
          (todo) => (todo.type || todo.kind) === "prd" && (isDone(todo) || isDeprecated(todo)),
        )
        .sort((a, b) => modified(b) - modified(a));
      const specs = all
        .filter(
          (todo) => (todo.type || todo.kind) === "spec" && (isDone(todo) || isDeprecated(todo)),
        )
        .sort((a, b) => modified(b) - modified(a));
      const tasks = all
        .filter(
          (todo) =>
            (todo.type || todo.kind || "todo") === "todo" && (isDone(todo) || isDeprecated(todo)),
        )
        .sort((a, b) => modified(b) - modified(a));
      return [...prds, ...specs, ...tasks];
    };
    const setPrompt = (value: string) => {
      nextPrompt = value;
    };
    const currentMode = (): TodoListMode => modes[index] || "tasks";
    const currentSelector = () => selectors[currentMode()] ?? null;
    type Viewport = "list" | "detail" | "panel";
    let viewport: Viewport = "list";
    const calcRows = (kind: Viewport): number => {
      if (kind === "detail") return 24;
      if (kind === "panel") return 18;
      return 14;
    };
    const setActive = (
      component: {
        render: (width: number) => string[];
        invalidate: () => void;
        handleInput?: (data: string) => void;
        focused?: boolean;
      } | null,
      next: Viewport = "list",
    ) => {
      if (active && "focused" in active) active.focused = false;
      active = component;
      viewport = next;
      if (active && "focused" in active) active.focused = focused;
      tui.requestRender();
    };
    const fill = (lines: string[]): string[] => {
      const rows = Math.max(1, (tui.terminal.rows || 24) - 1);
      const minimum = calcRows(viewport);
      const target = Math.min(rows, Math.max(lines.length, minimum));
      if (lines.length >= target) return lines.slice(lines.length - target);
      return [...Array.from({ length: target - lines.length }, () => ""), ...lines];
    };
    const refresh = async () => {
      const updated = await listTodos(todosDir);
      all = updated;
      selectors.tasks?.setTodos(listTasks(updated));
      selectors.prds?.setTodos(listPrds(updated));
      selectors.specs?.setTodos(listSpecs(updated));
      selectors.closed?.setTodos(listClosed(updated));
    };
    const sync = async (): Promise<TodoFrontMatter[]> => {
      await refresh();
      return all;
    };
    const setRepairing = (value: boolean) => {
      selectors.tasks?.setRepairing(value);
      selectors.prds?.setRepairing(value);
      selectors.specs?.setRepairing(value);
      selectors.closed?.setRepairing(value);
    };
    const runListCommand = async (
      action: "sweep-abandoned" | "sweep-completed" | "review-all" | "repair-frontmatter",
    ) => {
      try {
        if (action === "repair-frontmatter") {
          setRepairing(true);
          const repaired = await runRepairFrontmatter(ctx);
          setRepairing(false);
          if ("error" in repaired) {
            ctx.ui.notify(repaired.error, "error");
            return;
          }
          await refresh();
          if (!repaired.broken) {
            ctx.ui.notify(
              `Frontmatter validation complete. ${repaired.scanned} file(s) scanned, no issues found.`,
              "info",
            );
            return;
          }
          ctx.ui.notify(
            `Frontmatter repair complete. ${repaired.repaired} repaired, ${repaired.failed} failed, ${repaired.broken} broken of ${repaired.scanned} scanned.`,
            repaired.failed ? "warning" : "info",
          );
          return;
        }
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
          const lines = scoped
            .map((todo) => {
              const filePath = getTodoPath(todosDir, todo.id, todo.type || todo.kind);
              const title = todo.title || "(untitled)";
              const type = todo.type || todo.kind || "todo";
              if (type === "prd") return `- ${buildPrdReviewPrompt(title, filePath, todo.links)}`;
              if (type === "spec") return `- ${buildSpecReviewPrompt(title, filePath, todo.links)}`;
              return `- ${buildTodoReviewPrompt(title, filePath, todo.links)}`;
            })
            .join("\n\n");
          setPrompt(`Review all items in ${mode} list:\n\n${lines}`);
          done();
          return;
        }
        const updated = await listTodos(todosDir);
        const ids = updated
          .filter((todo) => {
            const value = status(todo);
            if (action === "sweep-abandoned") return value === "abandoned";
            return value === "done" || value === "closed";
          })
          .map((todo) => todo.id);
        for (const id of ids) await deleteTodo(todosDir, id, ctx);
        await refresh();
        ctx.ui.notify(
          action === "sweep-abandoned"
            ? `Deleted ${ids.length} abandoned todos`
            : `Deleted ${ids.length} completed/closed todos`,
          "info",
        );
      } catch (error) {
        setRepairing(false);
        const message = error instanceof Error ? error.message : "List command failed.";
        ctx.ui.notify(message, "error");
      }
    };
    const resolve = async (todo: TodoFrontMatter): Promise<TodoRecord | null> => {
      const record = await ensureTodoExists(getTodoPath(todosDir, todo.id), todo.id);
      if (record) return record;
      ctx.ui.notify("Todo not found", "error");
      return null;
    };
    const showDetailView = (record: TodoRecord, source: TodoListMode, onBack?: () => void) => {
      const preview = new TodoDetailPreviewComponent(uiTui, theme, record);
      const detailFooter = onBack ? `${footer(record)} • b back` : footer(record);
      const leaderFooter = leader(record);
      let previewVisible = true;
      let leaderActive = false;
      let leaderTimer: ReturnType<typeof setTimeout> | null = null;
      const back = onBack || (() => setActive(selectors[source] ?? currentSelector(), "list"));
      const openRelated = () => {
        const related = preview.getSelectedRelated();
        if (!related) {
          ctx.ui.notify("Related item not found", "error");
          return;
        }
        showDetailView(related, source, () => showDetailView(record, source, onBack));
      };
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
        () => setActive(selectors[source] ?? currentSelector(), "list"),
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
            if ((data === "e" || data === "E") && record.checklist?.length) {
              clearLeader();
              return showEditChecklistInput(record, source);
            }
            return clearLeader();
          }
          if (data === "\u0018" || matchesKey(data, Key.ctrl("x"))) return startLeader();
          if (data === "b" && onBack) return back();
          if (data === "v") {
            previewVisible = !previewVisible;
            tui.requestRender();
            return;
          }
          if (data === "/") {
            if (!previewVisible || !preview.hasRelated()) return;
            preview.moveRelated(1);
            return;
          }
          if (data === "?") {
            if (!previewVisible || !preview.hasRelated()) return;
            preview.moveRelated(-1);
            return;
          }
          if (data === "[") {
            if (!previewVisible || !preview.hasRelated()) return;
            preview.moveRelated(-1);
            return;
          }
          if (data === "]") {
            if (!previewVisible || !preview.hasRelated()) return;
            preview.moveRelated(1);
            return;
          }
          if (data === "o" || data === "O") {
            if (previewVisible && preview.hasRelated()) return openRelated();
            return;
          }
          if (data === "\r") return detailMenu.handleInput(data);
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
      setActive(detailView, "detail");
    };
    const showAttachInput = async (record: TodoRecord, source: TodoListMode) => {
      const current = await sync();
      const prds = current.filter(
        (item) => item.id !== record.id && (item.type || item.kind) === "prd",
      );
      const specs = current.filter(
        (item) => item.id !== record.id && (item.type || item.kind) === "spec",
      );
      const todos = current.filter(
        (item) => item.id !== record.id && (item.type || item.kind || "todo") === "todo",
      );
      const picker = new LinkSelectComponent(
        uiTui,
        theme,
        prds,
        specs,
        todos,
        async (selected) => {
          const latest = await sync();
          const targets = latest.filter(
            (item) =>
              selected.prds.has(item.id) ||
              selected.specs.has(item.id) ||
              selected.todos.has(item.id),
          );
          const result = await attachLinks(todosDir, record, targets, ctx);
          if ("error" in result) {
            ctx.ui.notify(result.error, "error");
            return setActive(picker, "panel");
          }
          await refresh();
          const updated = await resolve(record);
          if (!updated) return setActive(selectors[source] ?? currentSelector(), "list");
          ctx.ui.notify(`Attached links across ${result.updated} items`, "info");
          showDetailView(updated, source);
        },
        () => showDetailView(record, source),
      );
      setActive(picker, "panel");
    };
    const showValidateInput = async (record: TodoRecord, source: TodoListMode) => {
      const cli = getCliPath();
      const file = getTodoPath(todosDir, record.id, record.type || record.kind);
      let result: {
        issues: Array<{
          kind: "prd" | "spec" | "todo";
          name: string;
          issue: string;
          file: string;
        }>;
        recommendations: Array<{
          target: string;
          kind: "prd" | "spec" | "todo";
          name: string;
          reason: string;
        }>;
      };
      try {
        result = runValidateCli(cli, ctx.cwd, file);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Validate command failed.";
        ctx.ui.notify(message, "error");
        return showDetailView(record, source);
      }
      if (!result.recommendations.length) {
        const issueCount = result.issues.length;
        ctx.ui.notify(
          issueCount
            ? `No attach recommendations. Found ${issueCount} issue(s).`
            : "No issues found.",
          "info",
        );
        return showDetailView(record, source);
      }
      const picker = new ValidateSelectComponent(
        uiTui,
        theme,
        result.recommendations.map((item) => ({
          key: item.target,
          label: item.name,
          kind: item.kind,
          reason: item.reason,
        })),
        async (selected) => {
          const latest = await sync();
          const targets = latest.filter((item) => {
            const target = normalizePath(getTodoPath(todosDir, item.id, item.type || item.kind));
            return (
              selected.prds.has(target) || selected.specs.has(target) || selected.todos.has(target)
            );
          });
          const applied = await attachLinks(todosDir, record, targets, ctx);
          if ("error" in applied) {
            ctx.ui.notify(applied.error, "error");
            return setActive(picker, "panel");
          }
          await refresh();
          const updated = await resolve(record);
          if (!updated) return setActive(selectors[source] ?? currentSelector(), "list");
          ctx.ui.notify(`Applied ${targets.length} recommended attachment(s)`, "info");
          showDetailView(updated, source);
        },
        () => showDetailView(record, source),
      );
      setActive(picker, "panel");
    };
    const showAuditPrompt = async (record: TodoRecord) => {
      const latest = await sync();
      const current = getTodoPath(todosDir, record.id, record.type || record.kind);
      const scope = latest.map((item) => getTodoPath(todosDir, item.id, item.type || item.kind));
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
      if (action === "edit-checklist") return showEditChecklistInput(record, source);
      if (action === "attach-links") return void showAttachInput(record, source);
      if (action === "validate-links") return void showValidateInput(record, source);
      if (action === "audit") return void showAuditPrompt(record);
      const result = await applyTodoAction(todosDir, ctx, refresh, done, record, action, setPrompt);
      if (result === "stay") setActive(selectors[source] ?? currentSelector(), "list");
    };
    const openDetailFromTodo = async (todo: TodoFrontMatter | TodoRecord, source: TodoListMode) => {
      const record = "body" in todo ? todo : await resolve(todo);
      if (!record) return;
      showDetailView(record, source);
    };
    const showCreateInput = async (mode: TodoListMode) => {
      const current = await sync();
      if (mode === "tasks") {
        const picker = new TodoParentSelectComponent(
          uiTui,
          theme,
          listPrds(current),
          listSpecs(current),
          (selected) => {
            createInput = new TodoCreateInputComponent(
              uiTui,
              theme,
              (userPrompt) => {
                void (async () => {
                  const cli = getCliPath();
                  const latest = await sync();
                  const prdPaths = listPrds(latest)
                    .filter((item) => selected.prds.has(item.id))
                    .map((item) => getTodoPath(todosDir, item.id, "prd"));
                  const specPaths = listSpecs(latest)
                    .filter((item) => selected.specs.has(item.id))
                    .map((item) => getTodoPath(todosDir, item.id, "spec"));
                  const standalone =
                    selected.prds.has("__NONE__") || selected.specs.has("__NONE__");
                  setPrompt(
                    buildCreateTodoPrompt(
                      userPrompt,
                      cli,
                      ctx.cwd,
                      standalone ? [] : prdPaths,
                      standalone ? [] : specPaths,
                    ),
                  );
                  done();
                })();
              },
              () => setActive(currentSelector(), "list"),
              {
                title: "Create New Todo",
                description:
                  "Describe the task implementation plan. Selected PRDs/specs will be attached.",
              },
            );
            setActive(createInput, "panel");
          },
          () => setActive(currentSelector(), "list"),
        );
        setActive(picker, "panel");
        return;
      }
      if (mode === "specs") {
        const picker = new SpecPrdSelectComponent(
          uiTui,
          theme,
          listPrds(current),
          (selectedPrds) => {
            createInput = new TodoCreateInputComponent(
              uiTui,
              theme,
              (userPrompt) => {
                const cli = getCliPath();
                const prdPaths = selectedPrds.map((item) => getTodoPath(todosDir, item.id, "prd"));
                setPrompt(buildCreateSpecPrompt(userPrompt, cli, ctx.cwd, prdPaths));
                done();
              },
              () => setActive(currentSelector(), "list"),
              {
                title: "Create New Spec",
                description:
                  "Describe the technical specification. Selected PRDs will be attached.",
              },
            );
            setActive(createInput, "panel");
          },
          () => setActive(currentSelector(), "list"),
        );
        setActive(picker, "panel");
        return;
      }
      createInput = new TodoCreateInputComponent(
        uiTui,
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
        () => setActive(currentSelector(), "list"),
        {
          title: mode === "prds" ? "Create New PRD" : "Create New Todo",
          description:
            mode === "prds"
              ? "Describe the product requirement. The AI SHOULD read linked files and ask clarifying questions first."
              : "Describe the task. The AI will read files and ask questions before creating.",
        },
      );
      setActive(createInput, "panel");
    };
    const showEditChecklistInput = (record: TodoRecord, source: TodoListMode) => {
      editInput = new TodoEditChecklistInputComponent(
        uiTui,
        theme,
        record,
        (userPrompt) => {
          const checklist = record.checklist || [];
          const filePath = getTodoPath(todosDir, record.id, record.type || record.kind);
          setPrompt(
            buildEditChecklistPrompt(record.title || "(untitled)", filePath, checklist, userPrompt),
          );
          done();
        },
        () => showDetailView(record, source),
      );
      setActive(editInput, "panel");
    };
    const buildSelector = (mode: TodoListMode, items: TodoFrontMatter[], initial?: string) =>
      new TodoSelectorComponent(
        uiTui,
        theme,
        items,
        (todo) => void openDetailFromTodo(todo, mode),
        () => done(),
        initial,
        currentSessionId,
        (todo, action) =>
          action === "create"
            ? void showCreateInput(mode)
            : void handleQuickAction(
                todosDir,
                todo,
                action,
                () => void showCreateInput(mode),
                done,
                setPrompt,
                ctx,
                resolve,
              ),
        () => {
          index = (index + 1) % modes.length;
          setActive(currentSelector(), "list");
        },
        (action) => void runListCommand(action),
        mode,
      );
    selectors.tasks = buildSelector("tasks", listTasks(todos), searchTerm || undefined);
    selectors.prds = buildSelector("prds", listPrds(todos));
    selectors.specs = buildSelector("specs", listSpecs(todos));
    selectors.closed = buildSelector("closed", listClosed(todos));
    setActive(currentSelector(), "list");
    return {
      get focused() {
        return focused;
      },
      set focused(value: boolean) {
        focused = value;
        if (active && "focused" in active) active.focused = value;
      },
      render(width: number) {
        if (!active) return fill([]);
        return fill(active.render(width));
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
