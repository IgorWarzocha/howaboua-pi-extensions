import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

export const TodoParams = Type.Object({
    action: StringEnum(["list", "list-all", "get", "create", "update", "append", "claim", "release", "tick"] as const),
    id: Type.Optional(Type.String({ description: "Todo id (TODO-<hex> or raw hex filename)" })),
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
    body: Type.Optional(Type.String({ description: "Long-form details (markdown). Update replaces; append adds." })),
    force: Type.Optional(Type.Boolean({ description: "Override another session's assignment" })),
    item: Type.Optional(Type.String({ description: "Checklist item id to tick (required for tick action)" })),
});
