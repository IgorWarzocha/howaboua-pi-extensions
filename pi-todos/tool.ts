import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { TodoAction, TodoRecord, TodoToolDetails } from "./types.js";
import { getTodosDir, getTodosDirLabel, ensureTodosDir, listTodos, getTodoPath, ensureTodoExists, generateTodoId, writeTodoFile, appendTodoBody, claimTodoAssignment, releaseTodoAssignment, deleteTodo } from "./file-io.js";
import { validateTodoId, normalizeTodoId } from "./parser.js";
import { formatTodoId, splitTodosByAssignment, serializeTodoForAgent, serializeTodoListForAgent, renderTodoList, renderTodoDetail, appendExpandHint } from "./format.js";

const TodoParams = Type.Object({
    action: StringEnum([
        "list",
        "list-all",
        "get",
        "create",
        "update",
        "append",
        "delete",
        "claim",
        "release",
    ] as const),
    id: Type.Optional(
        Type.String({ description: "Todo id (TODO-<hex> or raw hex filename)" }),
    ),
    title: Type.Optional(Type.String({ description: "Short summary shown in lists" })),
    status: Type.Optional(Type.String({ description: "Todo status" })),
    tags: Type.Optional(Type.Array(Type.String({ description: "Todo tag" }))),
    body: Type.Optional(
        Type.String({ description: "Long-form details (markdown). Update replaces; append adds." }),
    ),
    force: Type.Optional(Type.Boolean({ description: "Override another session's assignment" })),
});

export function registerTodoTool(pi: ExtensionAPI) {
    const todosDirLabel = getTodosDirLabel(process.cwd());

    pi.registerTool({
        name: "todo",
        label: "Todo",
        description:
            `Manage file-based todos in ${todosDirLabel}. ` +
            "Actions: list, list-all, get, create, update, append, delete, claim, release. " +
            "Title is the short summary; body is long-form markdown notes. " +
            "Use 'update' to replace body content, 'append' to add to it. " +
            "Todo ids are TODO-<hex>; id parameters MUST accept TODO-<hex> or raw hex. " +
            "You MUST claim tasks before working on them to avoid conflicts. " +
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
                    await ensureTodosDir(todosDir);
                    const id = await generateTodoId(todosDir);
                    const filePath = getTodoPath(todosDir, id);
                    const todo: TodoRecord = {
                        id,
                        title: params.title,
                        tags: params.tags ?? [],
                        status: params.status ?? "open",
                        created_at: new Date().toISOString(),
                        body: params.body ?? "",
                    };

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
                    if (params.status !== undefined) existing.status = params.status;
                    if (params.tags !== undefined) existing.tags = params.tags;
                    if (params.body !== undefined) existing.body = params.body;
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

                case "delete": {
                    if (!params.id) {
                        return {
                            content: [{ type: "text", text: "Error: id required" }],
                            details: { action: "delete", error: "id required" },
                        };
                    }

                    const validated = validateTodoId(params.id);
                    if ("error" in validated) {
                        return {
                            content: [{ type: "text", text: validated.error }],
                            details: { action: "delete", error: validated.error },
                        };
                    }
                    const result = await deleteTodo(todosDir, validated.id, ctx);
                    if (typeof result === "object" && "error" in result) {
                        return {
                            content: [{ type: "text", text: result.error }],
                            details: { action: "delete", error: result.error },
                        };
                    }

                    return {
                        content: [{ type: "text", text: serializeTodoForAgent(result as TodoRecord) }],
                        details: { action: "delete", todo: result as TodoRecord },
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
                            : details.action === "delete"
                                ? "Deleted"
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
