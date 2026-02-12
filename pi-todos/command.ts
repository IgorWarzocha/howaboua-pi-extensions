import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TodoFrontMatter, TodoMenuAction, TodoOverlayAction, TodoQuickAction, TodoRecord } from "./types.js";
import { getTodosDir, listTodos, listTodosSync, ensureTodoExists, updateTodoStatus, deleteTodo, releaseTodoAssignment } from "./file-io.js";
import { getTodoPath } from "./file-io.js";
import { filterTodos } from "./filter.js";
import { formatTodoId, formatTodoList, buildRefinePrompt, buildCreatePrompt, buildEditChecklistPrompt, getTodoTitle } from "./format.js";
import { copyTodoPathToClipboard, copyTodoTextToClipboard } from "./clipboard.js";
import {
    TodoSelectorComponent,
    TodoActionMenuComponent,
    TodoDeleteConfirmComponent,
    TodoDetailOverlayComponent,
    TodoCreateInputComponent,
    TodoEditChecklistInputComponent,
} from "./tui/index.js";

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
                let selector: TodoSelectorComponent | null = null;
                let actionMenu: TodoActionMenuComponent | null = null;
                let deleteConfirm: TodoDeleteConfirmComponent | null = null;
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
                    if (activeComponent && "focused" in activeComponent) {
                        activeComponent.focused = false;
                    }
                    activeComponent = component;
                    if (activeComponent && "focused" in activeComponent) {
                        activeComponent.focused = wrapperFocused;
                    }
                    tui.requestRender();
                };

                const resolveTodoRecord = async (todo: TodoFrontMatter): Promise<TodoRecord | null> => {
                    const filePath = getTodoPath(todosDir, todo.id);
                    const record = await ensureTodoExists(filePath, todo.id);
                    if (!record) {
                        ctx.ui.notify(`Todo ${formatTodoId(todo.id)} not found`, "error");
                        return null;
                    }
                    return record;
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

                const applyTodoAction = async (
                    record: TodoRecord,
                    action: TodoMenuAction,
                ): Promise<"stay" | "exit"> => {
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
                    if (action === "view") {
                        return "stay";
                    }
                    if (action === "copyPath") {
                        copyTodoPathToClipboard(todosDir, record.id, ctx.ui.notify);
                        return "stay";
                    }
                    if (action === "copyText") {
                        copyTodoTextToClipboard(record, ctx.ui.notify);
                        return "stay";
                    }
                    if (action === "release") {
                        const result = await releaseTodoAssignment(todosDir, record.id, ctx, true);
                        if ("error" in result) {
                            ctx.ui.notify(result.error, "error");
                            return "stay";
                        }
                        const updatedTodos = await listTodos(todosDir);
                        selector?.setTodos(updatedTodos);
                        ctx.ui.notify(`Released todo ${formatTodoId(record.id)}`, "info");
                        return "stay";
                    }
                    if (action === "delete") {
                        const result = await deleteTodo(todosDir, record.id, ctx);
                        if ("error" in result) {
                            ctx.ui.notify(result.error, "error");
                            return "stay";
                        }
                        const updatedTodos = await listTodos(todosDir);
                        selector?.setTodos(updatedTodos);
                        ctx.ui.notify(`Deleted todo ${formatTodoId(record.id)}`, "info");
                        return "stay";
                    }
                    const nextStatus = action === "close" ? "closed" : "open";
                    const result = await updateTodoStatus(todosDir, record.id, nextStatus, ctx);
                    if ("error" in result) {
                        ctx.ui.notify(result.error, "error");
                        return "stay";
                    }
                    const updatedTodos = await listTodos(todosDir);
                    selector?.setTodos(updatedTodos);
                    ctx.ui.notify(
                        `${action === "close" ? "Closed" : "Reopened"} todo ${formatTodoId(record.id)}`,
                        "info",
                    );
                    return "stay";
                };

                const handleActionSelection = async (record: TodoRecord, action: TodoMenuAction) => {
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
                        if (actionMenu) {
                            setActiveComponent(actionMenu);
                        }
                        return;
                    }
                    if (action === "delete") {
                        const message = `Delete todo ${formatTodoId(record.id)}? This cannot be undone.`;
                        deleteConfirm = new TodoDeleteConfirmComponent(theme, message, (confirmed) => {
                            if (!confirmed) {
                                setActiveComponent(actionMenu);
                                return;
                            }
                            void (async () => {
                                await applyTodoAction(record, "delete");
                                setActiveComponent(selector);
                            })();
                        });
                        setActiveComponent(deleteConfirm);
                        return;
                    }
                    const result = await applyTodoAction(record, action);
                    if (result === "stay") {
                        setActiveComponent(selector);
                    }
                };

                const showActionMenu = async (todo: TodoFrontMatter | TodoRecord) => {
                    const record = "body" in todo ? todo : await resolveTodoRecord(todo);
                    if (!record) return;
                    actionMenu = new TodoActionMenuComponent(
                        theme,
                        record,
                        (action) => {
                            void handleActionSelection(record, action);
                        },
                        () => {
                            setActiveComponent(selector);
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
                            setActiveComponent(selector);
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

                selector = new TodoSelectorComponent(
                    tui,
                    theme,
                    todos,
                    (todo) => {
                        void showActionMenu(todo);
                    },
                    () => done(),
                    searchTerm || undefined,
                    currentSessionId,
                    handleQuickAction,
                );

                setActiveComponent(selector);

                const rootComponent = {
                    get focused() {
                        return wrapperFocused;
                    },
                    set focused(value: boolean) {
                        wrapperFocused = value;
                        if (activeComponent && "focused" in activeComponent) {
                            activeComponent.focused = value;
                        }
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

            if (nextPrompt) {
                pi.sendUserMessage(nextPrompt);
            }
        },
    });
}
