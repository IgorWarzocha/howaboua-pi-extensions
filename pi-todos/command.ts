import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoMenuAction, TodoOverlayAction, TodoQuickAction, TodoRecord } from "./types.js";
import { getTodosDir, listTodos, listTodosSync, ensureTodoExists, updateTodoStatus, deleteTodo, releaseTodoAssignment, reopenTodoForUser } from "./file-io.js";
import { getTodoPath } from "./file-io.js";
import { filterTodos } from "./filter.js";
import { formatTodoId, formatTodoList, buildRefinePrompt, buildCreatePrompt, buildEditChecklistPrompt, getTodoTitle, isTodoClosed } from "./format.js";
import { TodoSelectorComponent, TodoActionMenuComponent, TodoDetailOverlayComponent, TodoCreateInputComponent, TodoEditChecklistInputComponent } from "./tui/index.js";

export function registerTodoCommand(pi: ExtensionAPI) {
    pi.registerCommand("todo", {
        description: "List todos from .pi/todos",
        getArgumentCompletions: (argumentPrefix: string) => {
            const todos = listTodosSync(getTodosDir(process.cwd()));
            if (!todos.length) return null;
            const matches = filterTodos(todos, argumentPrefix);
            if (!matches.length) return null;
            return matches.map((todo) => {
                const title = todo.title || "(untitled)";
                const tags = todo.tags.length ? ` • ${todo.tags.join(", ")}` : "";
                return {
                    value: title,
                    label: `${formatTodoId(todo.id)} ${title}`,
                    description: `${todo.status || "open"}${tags}`,
                };
            });
        },
        handler: async (args: string, ctx: ExtensionCommandContext) => {
            const todosDir = getTodosDir(ctx.cwd);
            const todos = await listTodos(todosDir);
            const currentSessionId = ctx.sessionManager.getSessionId();
            const searchTerm = (args ?? "").trim();

            if (!ctx.hasUI) {
                const text = formatTodoList(todos);
                console.log(text);
                return;
            }

            let nextPrompt: string | null = null;
            await ctx.ui.custom<void>((tui, theme, _kb, done) => {
                let openSelector: TodoSelectorComponent | null = null;
                let closedSelector: TodoSelectorComponent | null = null;
                let actionMenu: TodoActionMenuComponent | null = null;
                let createInput: TodoCreateInputComponent | null = null;
                let editChecklistInput: TodoEditChecklistInputComponent | null = null;
                let activeComponent:
                    | {
                        render: (width: number) => string[];
                        invalidate: () => void;
                        handleInput?: (data: string) => void;
                        focused?: boolean;
                    }
                    | null = null;
                let wrapperFocused = false;

                const listOpenTodos = (all: TodoFrontMatter[]) => all.filter(todo => !isTodoClosed(todo.status));
                const listClosedTodos = (all: TodoFrontMatter[]) => all.filter(todo => isTodoClosed(todo.status));

                const refreshSelectors = async () => {
                    const updated = await listTodos(todosDir);
                    openSelector?.setTodos(listOpenTodos(updated));
                    closedSelector?.setTodos(listClosedTodos(updated));
                };

                const runListCommand = async (action: "sweep-abandoned" | "sweep-completed") => {
                    const updated = await listTodos(todosDir);
                    const target = action === "sweep-abandoned" ? "abandoned" : "done";
                    const ids = updated.filter(todo => todo.status === target).map(todo => todo.id);
                    for (const id of ids) {
                        await deleteTodo(todosDir, id, ctx);
                    }
                    await refreshSelectors();
                    ctx.ui.notify(
                        action === "sweep-abandoned"
                            ? `Deleted ${ids.length} abandoned todos`
                            : `Deleted ${ids.length} completed todos`,
                        "info",
                    );
                };

                const setActiveComponent = (
                    component:
                        | {
                            render: (width: number) => string[];
                            invalidate: () => void;
                            handleInput?: (data: string) => void;
                            focused?: boolean;
                        }
                        | null,
                ) => {
                    if (activeComponent && "focused" in activeComponent) activeComponent.focused = false;
                    activeComponent = component;
                    if (activeComponent && "focused" in activeComponent) activeComponent.focused = wrapperFocused;
                    tui.requestRender();
                };

                const resolveTodoRecord = async (todo: TodoFrontMatter): Promise<TodoRecord | null> => {
                    const filePath = getTodoPath(todosDir, todo.id);
                    const record = await ensureTodoExists(filePath, todo.id);
                    if (record) return record;
                    ctx.ui.notify(`Todo ${formatTodoId(todo.id)} not found`, "error");
                    return null;
                };

                const openTodoOverlay = async (record: TodoRecord): Promise<TodoOverlayAction> => {
                    const action = await ctx.ui.custom<TodoOverlayAction>(
                        (overlayTui, overlayTheme, _overlayKb, overlayDone) =>
                            new TodoDetailOverlayComponent(overlayTui, overlayTheme, record, overlayDone),
                        {
                            overlay: true,
                            overlayOptions: { width: "80%", maxHeight: "80%", anchor: "center" },
                        },
                    );
                    return action ?? "back";
                };

                const applyTodoAction = async (record: TodoRecord, action: TodoMenuAction): Promise<"stay" | "exit"> => {
                    if (action === "refine") {
                        const title = record.title || "(untitled)";
                        nextPrompt = buildRefinePrompt(record.id, title);
                        done();
                        return "exit";
                    }
                    if (action === "work") {
                        const title = record.title || "(untitled)";
                        nextPrompt = `work on todo ${formatTodoId(record.id)} "${title}"`;
                        done();
                        return "exit";
                    }
                    if (action === "view") return "stay";
                    if (action === "release") {
                        const result = await releaseTodoAssignment(todosDir, record.id, ctx, true);
                        if ("error" in result) {
                            ctx.ui.notify(result.error, "error");
                            return "stay";
                        }
                        await refreshSelectors();
                        ctx.ui.notify(`Released todo ${formatTodoId(record.id)}`, "info");
                        return "stay";
                    }
                    if (action === "delete") {
                        const removed = await deleteTodo(todosDir, record.id, ctx);
                        if ("error" in removed) {
                            ctx.ui.notify(removed.error, "error");
                            return "stay";
                        }
                        await refreshSelectors();
                        ctx.ui.notify(`Deleted todo ${formatTodoId(record.id)}`, "info");
                        return "stay";
                    }
                    if (action === "reopen") {
                        const reopened = await reopenTodoForUser(todosDir, record.id, ctx);
                        if ("error" in reopened) {
                            ctx.ui.notify(reopened.error, "error");
                            return "stay";
                        }
                        await refreshSelectors();
                        ctx.ui.notify(`Reopened todo ${formatTodoId(record.id)} and reset checklist`, "info");
                        return "stay";
                    }
                    const nextStatus = action === "complete" ? "done" : "abandoned";
                    const result = await updateTodoStatus(todosDir, record.id, nextStatus, ctx);
                    if ("error" in result) {
                        ctx.ui.notify(result.error, "error");
                        return "stay";
                    }
                    await refreshSelectors();
                    ctx.ui.notify(`${action === "complete" ? "Completed" : "Abandoned"} todo ${formatTodoId(record.id)}`, "info");
                    return "stay";
                };

                const handleActionSelection = async (record: TodoRecord, action: TodoMenuAction, source: "open" | "closed") => {
                    if (action === "view") {
                        const overlayAction = await openTodoOverlay(record);
                        if (overlayAction === "work") {
                            await applyTodoAction(record, "work");
                            return;
                        }
                        if (overlayAction === "edit-checklist") {
                            editChecklistInput = new TodoEditChecklistInputComponent(
                                tui,
                                theme,
                                record,
                                (userIntent) => {
                                    nextPrompt = buildEditChecklistPrompt(record.id, record.title || "(untitled)", record.checklist || [], userIntent);
                                    done();
                                },
                                () => {
                                    setActiveComponent(actionMenu);
                                },
                            );
                            setActiveComponent(editChecklistInput);
                            return;
                        }
                        setActiveComponent(source === "closed" ? closedSelector : openSelector);
                        return;
                    }
                    const result = await applyTodoAction(record, action);
                    if (result === "stay") setActiveComponent(source === "closed" ? closedSelector : openSelector);
                };

                const showActionMenu = async (todo: TodoFrontMatter | TodoRecord, source: "open" | "closed") => {
                    const record = "body" in todo ? todo : await resolveTodoRecord(todo);
                    if (!record) return;
                    actionMenu = new TodoActionMenuComponent(
                        theme,
                        record,
                        (action) => {
                            void handleActionSelection(record, action, source);
                        },
                        () => {
                            setActiveComponent(source === "closed" ? closedSelector : openSelector);
                        },
                    );
                    setActiveComponent(actionMenu);
                };

                const showCreateInput = () => {
                    createInput = new TodoCreateInputComponent(
                        tui,
                        theme,
                        (userPrompt) => {
                            nextPrompt = buildCreatePrompt(userPrompt);
                            done();
                        },
                        () => {
                            setActiveComponent(openSelector);
                        },
                    );
                    setActiveComponent(createInput);
                };

                const handleQuickAction = (todo: TodoFrontMatter | null, action: TodoQuickAction) => {
                    if (action === "create") {
                        showCreateInput();
                        return;
                    }
                    if (!todo) return;
                    const title = getTodoTitle(todo);
                    if (action === "refine") {
                        nextPrompt = buildRefinePrompt(todo.id, title);
                    } else if (action === "work") {
                        nextPrompt = `work on todo ${formatTodoId(todo.id)} "${title}"`;
                    }
                    done();
                };

                openSelector = new TodoSelectorComponent(
                    tui,
                    theme,
                    listOpenTodos(todos),
                    (todo) => {
                        void showActionMenu(todo, "open");
                    },
                    () => done(),
                    searchTerm || undefined,
                    currentSessionId,
                    handleQuickAction,
                    () => setActiveComponent(closedSelector),
                    (action) => {
                        void runListCommand(action);
                    },
                );

                closedSelector = new TodoSelectorComponent(
                    tui,
                    theme,
                    listClosedTodos(todos),
                    (todo) => {
                        void showActionMenu(todo, "closed");
                    },
                    () => done(),
                    undefined,
                    currentSessionId,
                    handleQuickAction,
                    () => setActiveComponent(openSelector),
                    (action) => {
                        void runListCommand(action);
                    },
                );

                setActiveComponent(openSelector);

                const rootComponent = {
                    get focused() {
                        return wrapperFocused;
                    },
                    set focused(value: boolean) {
                        wrapperFocused = value;
                        if (activeComponent && "focused" in activeComponent) activeComponent.focused = value;
                    },
                    render(width: number) {
                        return activeComponent ? activeComponent.render(width) : [];
                    },
                    invalidate() {
                        activeComponent?.invalidate();
                    },
                    handleInput(data: string) {
                        activeComponent?.handleInput?.(data);
                    },
                };

                return rootComponent;
            });

            if (nextPrompt) pi.sendUserMessage(nextPrompt);
        },
    });
}
