import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoMenuAction, TodoRecord } from "../types.js";
import { buildCreatePrompt, isTodoClosed } from "../format.js";
import { deleteTodo, ensureTodoExists, getTodoPath, getTodosDir, listTodos } from "../file-io.js";
import {
  TodoActionMenuComponent,
  TodoCreateInputComponent,
  TodoDetailPreviewComponent,
  TodoSelectorComponent,
} from "../tui/index.js";
import { applyTodoAction, handleQuickAction } from "./actions.js";

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
    let openSelector: TodoSelectorComponent | null = null;
    let closedSelector: TodoSelectorComponent | null = null;
    let createInput: TodoCreateInputComponent | null = null;
    let active: {
      render: (width: number) => string[];
      invalidate: () => void;
      handleInput?: (data: string) => void;
      focused?: boolean;
    } | null = null;
    let focused = false;
    const listOpen = (all: TodoFrontMatter[]) => all.filter((todo) => !isTodoClosed(todo.status));
    const listClosed = (all: TodoFrontMatter[]) => all.filter((todo) => isTodoClosed(todo.status));
    const setPrompt = (value: string) => {
      nextPrompt = value;
    };
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
      openSelector?.setTodos(listOpen(updated));
      closedSelector?.setTodos(listClosed(updated));
    };
    const runListCommand = async (action: "sweep-abandoned" | "sweep-completed") => {
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
    const showDetailView = (record: TodoRecord, source: "open" | "closed") => {
      const preview = new TodoDetailPreviewComponent(tui, theme, record);
      let previewVisible = true;
      const detailMenu = new TodoActionMenuComponent(
        theme,
        record,
        (action) => {
          void handleSelection(record, action, source);
        },
        () => setActive(source === "closed" ? closedSelector : openSelector),
        {
          showView: false,
          footer: "Enter confirm • Esc back • v toggle preview • Shift+↑↓ scroll preview",
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
          if (data === "v") {
            previewVisible = !previewVisible;
            tui.requestRender();
            return;
          }
          if (data === "\u001b[1;2A" || data === "\u001b[1;2P" || data === "\u001b[1;3A") {
            if (!previewVisible) return detailMenu.handleInput(data);
            preview.scrollBy(-1);
            tui.requestRender();
            return;
          }
          if (data === "\u001b[1;2B" || data === "\u001b[1;2Q" || data === "\u001b[1;3B") {
            if (!previewVisible) return detailMenu.handleInput(data);
            preview.scrollBy(1);
            tui.requestRender();
            return;
          }
          // TODO: Support mouse wheel scrolling for the preview panel.
          detailMenu.handleInput(data);
        },
        focused,
      };
      setActive(detailView);
    };
    const handleSelection = async (
      record: TodoRecord,
      action: TodoMenuAction,
      source: "open" | "closed",
    ) => {
      if (action === "view") {
        showDetailView(record, source);
        return;
      }
      const result = await applyTodoAction(todosDir, ctx, refresh, done, record, action, setPrompt);
      if (result === "stay") setActive(source === "closed" ? closedSelector : openSelector);
    };
    const openDetailFromTodo = async (
      todo: TodoFrontMatter | TodoRecord,
      source: "open" | "closed",
    ) => {
      const record = "body" in todo ? todo : await resolve(todo);
      if (!record) return;
      showDetailView(record, source);
    };
    const showCreateInput = () => {
      createInput = new TodoCreateInputComponent(
        tui,
        theme,
        (userPrompt) => {
          setPrompt(buildCreatePrompt(userPrompt));
          done();
        },
        () => setActive(openSelector),
      );
      setActive(createInput);
    };
    openSelector = new TodoSelectorComponent(
      tui,
      theme,
      listOpen(todos),
      (todo) => void openDetailFromTodo(todo, "open"),
      () => done(),
      searchTerm || undefined,
      currentSessionId,
      (todo, action) => handleQuickAction(todo, action, showCreateInput, done, setPrompt),
      () => setActive(closedSelector),
      (action) => void runListCommand(action),
      "open",
    );
    closedSelector = new TodoSelectorComponent(
      tui,
      theme,
      listClosed(todos),
      (todo) => void openDetailFromTodo(todo, "closed"),
      () => done(),
      undefined,
      currentSessionId,
      (todo, action) => handleQuickAction(todo, action, showCreateInput, done, setPrompt),
      () => setActive(openSelector),
      (action) => void runListCommand(action),
      "closed",
    );
    setActive(openSelector);
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
