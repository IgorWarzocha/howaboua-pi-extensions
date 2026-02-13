import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoMenuAction, TodoRecord } from "../types.js";
import { buildCreatePrompt, buildEditChecklistPrompt, isTodoClosed } from "../format.js";
import { deleteTodo, ensureTodoExists, getTodoPath, getTodosDir, listTodos } from "../file-io.js";
import {
  TodoActionMenuComponent,
  TodoCreateInputComponent,
  TodoEditChecklistInputComponent,
  TodoDetailPreviewComponent,
  TodoSelectorComponent,
} from "../tui/index.js";
import { Key, matchesKey } from "@mariozechner/pi-tui";
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
    let editInput: TodoEditChecklistInputComponent | null = null;
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
      const detailFooter = record.checklist?.length
        ? "Enter confirm • Esc back • v toggle preview • j/k scroll preview • Ctrl+X leader (then e edit checklist)"
        : "Enter confirm • Esc back • v toggle preview • j/k scroll preview • Ctrl+X leader";
      const leaderFooter = record.checklist?.length
        ? "Leader: w work • r refine • c complete • a abandon • v toggle preview • e edit checklist • x cancel"
        : "Leader: w work • r refine • c complete • a abandon • v toggle preview • x cancel";
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
        () => setActive(source === "closed" ? closedSelector : openSelector),
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
    const handleSelection = async (
      record: TodoRecord,
      action: TodoMenuAction,
      source: "open" | "closed",
    ) => {
      if (action === "view") return showDetailView(record, source);
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
    const showEditChecklistInput = (record: TodoRecord, source: "open" | "closed") => {
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
