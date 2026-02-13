import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { TodoAction, TodoRecord, TodoToolDetails, ChecklistItem } from "./types.js";
import { getTodosDir, getTodosDirLabel, ensureTodosDir, listTodos, getTodoPath, ensureTodoExists, generateTodoId, writeTodoFile, appendTodoBody, claimTodoAssignment, releaseTodoAssignment } from "./file-io.js";
import { validateTodoId, normalizeTodoId } from "./parser.js";
import { formatTodoId, splitTodosByAssignment, serializeTodoForAgent, serializeTodoListForAgent, renderTodoList, renderTodoDetail, appendExpandHint, deriveTodoStatus, formatTickResult } from "./format.js";

const TodoParams = Type.Object({
    action: StringEnum([
        "list",
        "list-all",
        "get",
        "create",
        "update",
        "append",
        "claim",
        "release",
        "tick",
    ] as const),
    id: Type.Optional(
        Type.String({ description: "Todo id (TODO-<hex> or raw hex filename)" }),
    ),
    title: Type.Optional(Type.String({ description: "Short summary shown in lists" })),
    status: Type.Optional(Type.String({ description: "Todo status" })),
    tags: Type.Optional(Type.Array(Type.String({ description: "Todo tag" }))),
    checklist: Type.Optional(
        Type.Array(
            Type.Object({
                id: Type.String({ description: "Short item id (e.g., '1', '2', '3')" }),
                title: Type.String({ description: "Item description" }),
                status: Type.Optional(StringEnum(["unchecked", "checked"] as const, { description: "Item status, defaults to unchecked" })),
            }),
            { description: "Checklist items for this todo. When present, status is derived from checklist completion." },
        ),
    ),
    body: Type.Optional(
        Type.String({ description: "Long-form details (markdown). Update replaces; append adds." }),
    ),
    force: Type.Optional(Type.Boolean({ description: "Override another session's assignment" })),
    item: Type.Optional(Type.String({ description: "Checklist item id to tick (required for tick action)" })),
});

export function registerTodoTool(pi: ExtensionAPI) {
    const todosDirLabel = getTodosDirLabel(process.cwd());

    pi.registerTool({
        name: "todo",
        label: "Todo",
        description:
            `Manage file-based todos in ${todosDirLabel}. ` +
            "Actions: list, list-all, get, create, update, append, claim, release, tick. " +
            "Title is the short summary; body is long-form markdown notes. " +
            "Use 'create' with a non-empty checklist, 'update' to replace body content, 'append' to add to it, and 'tick' to check off checklist items. " +
            "Todo ids are TODO-<hex>; id parameters MUST accept TODO-<hex> or raw hex. " +
            "You MUST claim tasks before working on them to avoid conflicts. " +
            "When a todo has a checklist, use 'tick' to check off items. Status is derived from checklist completion. " +
            "You SHOULD close todos when complete.",
        parameters: TodoParams,

        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const todosDir = getTodosDir(ctx.cwd);
            const action: TodoAction = params.action;

            switch (action) {
                case "list": {
                    const todos = await listTodos(todosDir);
                    const { assignedTodos, openTodos } = splitTodosByAssignment(todos);
                    const listedTodos = [...assignedTodos, ...openTodos];
                    const currentSessionId = ctx.sessionManager.getSessionId();
                    return {
                        content: [{ type: "text", text: serializeTodoListForAgent(listedTodos) }],
                        details: { action: "list", todos: listedTodos, currentSessionId },
                    };
                }

                case "list-all": {
                    const todos = await listTodos(todosDir);
                    const currentSessionId = ctx.sessionManager.getSessionId();
                    return {
                        content: [{ type: "text", text: serializeTodoListForAgent(todos) }],
                        details: { action: "list-all", todos, currentSessionId },
                    };
                }

                case "get": {
                    if (!params.id) {
                        return {
                            content: [{ type: "text", text: "Error: id required" }],
                            details: { action: "get", error: "id required" },
                        };
                    }
                    const validated = validateTodoId(params.id);
                    if ("error" in validated) {
                        return {
                            content: [{ type: "text", text: validated.error }],
                            details: { action: "get", error: validated.error },
                        };
                    }
                    const normalizedId = validated.id;
                    const displayId = formatTodoId(normalizedId);
                    const filePath = getTodoPath(todosDir, normalizedId);
                    const todo = await ensureTodoExists(filePath, normalizedId);
                    if (!todo) {
                        return {
                            content: [{ type: "text", text: `Todo ${displayId} not found` }],
                            details: { action: "get", error: "not found" },
                        };
                    }
                    return {
                        content: [{ type: "text", text: serializeTodoForAgent(todo) }],
                        details: { action: "get", todo },
                    };
                }

                case "create": {
                    if (!params.title) {
                        return {
                            content: [{ type: "text", text: "Error: title required" }],
                            details: { action: "create", error: "title required" },
                        };
                    }
                    if (!params.checklist?.length) {
                        return {
                            content: [{ type: "text", text: "Error: checklist required for create action" }],
                            details: { action: "create", error: "checklist required" },
                        };
                    }
                    await ensureTodosDir(todosDir);
                    const id = await generateTodoId(todosDir);
                    const filePath = getTodoPath(todosDir, id);
                    const todo: TodoRecord = {
                        id,
                        title: params.title,
                        tags: params.tags ?? [],
                        status: "open",
                        created_at: new Date().toISOString(),
                        body: params.body ?? "",
                        checklist: params.checklist?.map(item => ({
                            id: item.id,
                            title: item.title,
                            status: item.status ?? "unchecked",
                        })) as ChecklistItem[] | undefined,
                    };
                    todo.status = deriveTodoStatus(todo);

                    await writeTodoFile(filePath, todo);

                    return {
                        content: [{ type: "text", text: serializeTodoForAgent(todo) }],
                        details: { action: "create", todo },
                    };
                }

                case "update": {
                    if (!params.id) {
                        return {
                            content: [{ type: "text", text: "Error: id required" }],
                            details: { action: "update", error: "id required" },
                        };
                    }
                    const validated = validateTodoId(params.id);
                    if ("error" in validated) {
                        return {
                            content: [{ type: "text", text: validated.error }],
                            details: { action: "update", error: validated.error },
                        };
                    }
                    const normalizedId = validated.id;
                    const displayId = formatTodoId(normalizedId);
                    const filePath = getTodoPath(todosDir, normalizedId);
                    if (!existsSync(filePath)) {
                        return {
                            content: [{ type: "text", text: `Todo ${displayId} not found` }],
                            details: { action: "update", error: "not found" },
                        };
                    }
                    const existing = await ensureTodoExists(filePath, normalizedId);
                    if (!existing) {
                        return {
                            content: [{ type: "text", text: `Todo ${displayId} not found` }],
                            details: { action: "update", error: "not found" },
                        };
                    }

                    existing.id = normalizedId;
                    if (params.title !== undefined) existing.title = params.title;
                    if (params.status !== undefined) {
                        return {
                            content: [{ type: "text", text: "Error: status updates are user-only. Use tick for checklist progress." }],
                            details: { action: "update", error: "status is user-only" },
                        };
                    }
                    if (params.tags !== undefined) existing.tags = params.tags;
                    if (params.body !== undefined) existing.body = params.body;
                    if (params.checklist !== undefined) {
                        if (!params.checklist.length) {
                            return {
                                content: [{ type: "text", text: "Error: checklist MUST NOT be empty" }],
                                details: { action: "update", error: "empty checklist" },
                            };
                        }
                        existing.checklist = params.checklist.map(item => ({
                            id: item.id,
                            title: item.title,
                            status: item.status ?? "unchecked",
                        })) as ChecklistItem[];
                        existing.status = deriveTodoStatus(existing);
                    }
                    if (!existing.created_at) existing.created_at = new Date().toISOString();

                    await writeTodoFile(filePath, existing);

                    return {
                        content: [{ type: "text", text: serializeTodoForAgent(existing) }],
                        details: { action: "update", todo: existing },
                    };
                }

                case "append": {
                    if (!params.id) {
                        return {
                            content: [{ type: "text", text: "Error: id required" }],
                            details: { action: "append", error: "id required" },
                        };
                    }
                    const validated = validateTodoId(params.id);
                    if ("error" in validated) {
                        return {
                            content: [{ type: "text", text: validated.error }],
                            details: { action: "append", error: validated.error },
                        };
                    }
                    const normalizedId = validated.id;
                    const displayId = formatTodoId(normalizedId);
                    const filePath = getTodoPath(todosDir, normalizedId);
                    if (!existsSync(filePath)) {
                        return {
                            content: [{ type: "text", text: `Todo ${displayId} not found` }],
                            details: { action: "append", error: "not found" },
                        };
                    }
                    const existing = await ensureTodoExists(filePath, normalizedId);
                    if (!existing) {
                        return {
                            content: [{ type: "text", text: `Todo ${displayId} not found` }],
                            details: { action: "append", error: "not found" },
                        };
                    }
                    if (!params.body || !params.body.trim()) {
                        return {
                            content: [{ type: "text", text: serializeTodoForAgent(existing) }],
                            details: { action: "append", todo: existing },
                        };
                    }
                    const updated = await appendTodoBody(filePath, existing, params.body);
                    return {
                        content: [{ type: "text", text: serializeTodoForAgent(updated) }],
                        details: { action: "append", todo: updated },
                    };
                }

                case "claim": {
                    if (!params.id) {
                        return {
                            content: [{ type: "text", text: "Error: id required" }],
                            details: { action: "claim", error: "id required" },
                        };
                    }
                    const result = await claimTodoAssignment(
                        todosDir,
                        params.id,
                        ctx,
                        Boolean(params.force),
                    );
                    if (typeof result === "object" && "error" in result) {
                        return {
                            content: [{ type: "text", text: result.error }],
                            details: { action: "claim", error: result.error },
                        };
                    }
                    const updatedTodo = result as TodoRecord;
                    return {
                        content: [{ type: "text", text: serializeTodoForAgent(updatedTodo) }],
                        details: { action: "claim", todo: updatedTodo },
                    };
                }

                case "release": {
                    if (!params.id) {
                        return {
                            content: [{ type: "text", text: "Error: id required" }],
                            details: { action: "release", error: "id required" },
                        };
                    }
                    const result = await releaseTodoAssignment(
                        todosDir,
                        params.id,
                        ctx,
                        Boolean(params.force),
                    );
                    if (typeof result === "object" && "error" in result) {
                        return {
                            content: [{ type: "text", text: result.error }],
                            details: { action: "release", error: result.error },
                        };
                    }
                    const updatedTodo = result as TodoRecord;
                    return {
                        content: [{ type: "text", text: serializeTodoForAgent(updatedTodo) }],
                        details: { action: "release", todo: updatedTodo },
                    };
                }

                case "tick": {
                    if (!params.id) {
                        return {
                            content: [{ type: "text", text: "Error: id required" }],
                            details: { action: "tick", todo: undefined as never, remaining: [], allComplete: false, error: "id required" },
                        };
                    }
                    if (!params.item) {
                        return {
                            content: [{ type: "text", text: "Error: item required for tick action" }],
                            details: { action: "tick", todo: undefined as never, remaining: [], allComplete: false, error: "item required" },
                        };
                    }
                    const validated = validateTodoId(params.id);
                    if ("error" in validated) {
                        return {
                            content: [{ type: "text", text: validated.error }],
                            details: { action: "tick", todo: undefined as never, remaining: [], allComplete: false, error: validated.error },
                        };
                    }
                    const normalizedId = validated.id;
                    const displayId = formatTodoId(normalizedId);
                    const filePath = getTodoPath(todosDir, normalizedId);
                    if (!existsSync(filePath)) {
                        return {
                            content: [{ type: "text", text: `Todo ${displayId} not found` }],
                            details: { action: "tick", todo: undefined as never, remaining: [], allComplete: false, error: "not found" },
                        };
                    }
                    const existing = await ensureTodoExists(filePath, normalizedId);
                    if (!existing) {
                        return {
                            content: [{ type: "text", text: `Todo ${displayId} not found` }],
                            details: { action: "tick", todo: undefined as never, remaining: [], allComplete: false, error: "not found" },
                        };
                    }
                    if (!existing.checklist?.length) {
                        return {
                            content: [{ type: "text", text: `Error: Todo ${displayId} has no checklist. Use update action to add one.` }],
                            details: { action: "tick", todo: existing, remaining: [], allComplete: false, error: "no checklist" },
                        };
                    }
                    const itemIndex = existing.checklist.findIndex(i => i.id === params.item);
                    if (itemIndex === -1) {
                        return {
                            content: [{ type: "text", text: `Error: Checklist item "${params.item}" not found in todo ${displayId}` }],
                            details: { action: "tick", todo: existing, remaining: [], allComplete: false, error: "item not found" },
                        };
                    }
                    const item = existing.checklist[itemIndex];
                    item.status = item.status === "checked" ? "unchecked" : "checked";
                    existing.status = deriveTodoStatus(existing);
                    await writeTodoFile(filePath, existing);
                    const remaining = existing.checklist.filter(i => i.status === "unchecked");
                    const allComplete = remaining.length === 0;
                    const tickedItem = item.status === "checked" ? item : undefined;
                    return {
                        content: [{ type: "text", text: formatTickResult(existing, tickedItem, remaining, allComplete) }],
                        details: { action: "tick", todo: existing, tickedItem, remaining, allComplete },
                    };
                }
            }
        },

        renderCall(args, theme) {
            const action = typeof args.action === "string" ? args.action : "";
            const id = typeof args.id === "string" ? args.id : "";
            const normalizedId = id ? normalizeTodoId(id) : "";
            const title = typeof args.title === "string" ? args.title : "";
            let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", action);
            if (normalizedId) {
                text += " " + theme.fg("accent", formatTodoId(normalizedId));
            }
            if (title) {
                text += " " + theme.fg("dim", `"${title}"`);
            }
            return new Text(text, 0, 0);
        },

        renderResult(result, { expanded, isPartial }, theme) {
            const details = result.details as TodoToolDetails | undefined;
            if (isPartial) {
                return new Text(theme.fg("warning", "Processing..."), 0, 0);
            }
            if (!details) {
                const text = result.content[0];
                return new Text(text?.type === "text" ? text.text : "", 0, 0);
            }

            if (details.error) {
                return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
            }

            if (details.action === "list" || details.action === "list-all") {
                let text = renderTodoList(theme, details.todos, expanded, details.currentSessionId);
                if (!expanded) {
                    const { closedTodos } = splitTodosByAssignment(details.todos);
                    if (closedTodos.length) {
                        text = appendExpandHint(theme, text);
                    }
                }
                return new Text(text, 0, 0);
            }

            if (!("todo" in details)) {
                const text = result.content[0];
                return new Text(text?.type === "text" ? text.text : "", 0, 0);
            }

            let text = renderTodoDetail(theme, details.todo, expanded);
            const actionLabel =
                details.action === "create"
                    ? "Created"
                    : details.action === "update"
                        ? "Updated"
                        : details.action === "append"
                            ? "Appended to"
                            : details.action === "claim"
                                    ? "Claimed"
                                    : details.action === "release"
                                        ? "Released"
                                        : null;
            if (actionLabel) {
                const lines = text.split("\n");
                lines[0] = theme.fg("success", "✓ ") + theme.fg("muted", `${actionLabel} `) + lines[0];
                text = lines.join("\n");
            }
            if (!expanded) {
                text = appendExpandHint(theme, text);
            }
            return new Text(text, 0, 0);
        },
    });
}
