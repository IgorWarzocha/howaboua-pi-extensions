import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoMenuAction, TodoOverlayAction, TodoRecord } from "../types.js";
import { buildCreatePrompt, buildEditChecklistPrompt, isTodoClosed } from "../format.js";
import { deleteTodo, ensureTodoExists, getTodoPath, getTodosDir, listTodos } from "../file-io.js";
import { TodoActionMenuComponent, TodoCreateInputComponent, TodoDetailOverlayComponent, TodoEditChecklistInputComponent, TodoSelectorComponent } from "../tui/index.js";
import { applyTodoAction, handleQuickAction } from "./actions.js";

export async function runTodoUi(args: string, ctx: ExtensionCommandContext): Promise<string | null> {
    const todosDir = getTodosDir(ctx.cwd);
    const todos = await listTodos(todosDir);
    const currentSessionId = ctx.sessionManager.getSessionId();
    const searchTerm = (args ?? "").trim();
    let nextPrompt: string | null = null;
    await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        let openSelector: TodoSelectorComponent | null = null;
        let closedSelector: TodoSelectorComponent | null = null;
        let actionMenu: TodoActionMenuComponent | null = null;
        let createInput: TodoCreateInputComponent | null = null;
        let editInput: TodoEditChecklistInputComponent | null = null;
        let active: { render: (width: number) => string[]; invalidate: () => void; handleInput?: (data: string) => void; focused?: boolean } | null = null;
        let focused = false;
        const listOpen = (all: TodoFrontMatter[]) => all.filter(todo => !isTodoClosed(todo.status));
        const listClosed = (all: TodoFrontMatter[]) => all.filter(todo => isTodoClosed(todo.status));
        const setPrompt = (value: string) => {
            nextPrompt = value;
        };
        const setActive = (component: { render: (width: number) => string[]; invalidate: () => void; handleInput?: (data: string) => void; focused?: boolean } | null) => {
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
                .filter(todo => action === "sweep-abandoned" ? todo.status === "abandoned" : (todo.status === "done" || todo.status === "closed"))
                .map(todo => todo.id);
            for (const id of ids) await deleteTodo(todosDir, id, ctx);
            await refresh();
            ctx.ui.notify(action === "sweep-abandoned" ? `Deleted ${ids.length} abandoned todos` : `Deleted ${ids.length} completed/closed todos`, "info");
        };
        const resolve = async (todo: TodoFrontMatter): Promise<TodoRecord | null> => {
            const record = await ensureTodoExists(getTodoPath(todosDir, todo.id), todo.id);
            if (record) return record;
            ctx.ui.notify("Todo not found", "error");
            return null;
        };
        const openOverlay = async (record: TodoRecord): Promise<TodoOverlayAction> => {
            const action = await ctx.ui.custom<TodoOverlayAction>((overlayTui, overlayTheme, _overlayKb, overlayDone) => new TodoDetailOverlayComponent(overlayTui, overlayTheme, record, overlayDone), { overlay: true, overlayOptions: { width: "80%", maxHeight: "80%", anchor: "center" } });
            return action ?? "back";
        };
        const handleSelection = async (record: TodoRecord, action: TodoMenuAction, source: "open" | "closed") => {
            if (action === "view") {
                const overlayAction = await openOverlay(record);
                if (overlayAction === "work") return void (await applyTodoAction(todosDir, ctx, refresh, done, record, "work", setPrompt));
                if (overlayAction === "edit-checklist") {
                    editInput = new TodoEditChecklistInputComponent(tui, theme, record, (userIntent) => {
                        setPrompt(buildEditChecklistPrompt(record.title || "(untitled)", record.checklist || [], userIntent));
                        done();
                    }, () => setActive(actionMenu));
                    return setActive(editInput);
                }
                return setActive(source === "closed" ? closedSelector : openSelector);
            }
            const result = await applyTodoAction(todosDir, ctx, refresh, done, record, action, setPrompt);
            if (result === "stay") setActive(source === "closed" ? closedSelector : openSelector);
        };
        const showActionMenu = async (todo: TodoFrontMatter | TodoRecord, source: "open" | "closed") => {
            const record = "body" in todo ? todo : await resolve(todo);
            if (!record) return;
            actionMenu = new TodoActionMenuComponent(theme, record, (action) => {
                void handleSelection(record, action, source);
            }, () => setActive(source === "closed" ? closedSelector : openSelector));
            setActive(actionMenu);
        };
        const showCreateInput = () => {
            createInput = new TodoCreateInputComponent(tui, theme, (userPrompt) => {
                setPrompt(buildCreatePrompt(userPrompt));
                done();
            }, () => setActive(openSelector));
            setActive(createInput);
        };
        openSelector = new TodoSelectorComponent(tui, theme, listOpen(todos), (todo) => void showActionMenu(todo, "open"), () => done(), searchTerm || undefined, currentSessionId, (todo, action) => handleQuickAction(todo, action, showCreateInput, done, setPrompt), () => setActive(closedSelector), (action) => void runListCommand(action), "open");
        closedSelector = new TodoSelectorComponent(tui, theme, listClosed(todos), (todo) => void showActionMenu(todo, "closed"), () => done(), undefined, currentSessionId, (todo, action) => handleQuickAction(todo, action, showCreateInput, done, setPrompt), () => setActive(openSelector), (action) => void runListCommand(action), "closed");
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
