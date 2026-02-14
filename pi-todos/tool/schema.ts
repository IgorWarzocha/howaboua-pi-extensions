import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

export const TodoParams = Type.Object({
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
  internal: Type.Optional(Type.Boolean({ description: "MUST be true for extension-internal invocation; external callers MUST NOT set this." })),
  id: Type.Optional(Type.String({ description: "Internal todo reference. Caller SHOULD provide id for deterministic targeting." })),
  title: Type.Optional(
    Type.String({ description: "Todo title; used for lookup when id is omitted. Caller MUST keep title unique." }),
  ),
  status: Type.Optional(Type.String({ description: "Todo status. External caller MUST NOT update lifecycle through tool calls." })),
  tags: Type.Optional(Type.Array(Type.String({ description: "Todo tag. Caller MAY provide multiple tags." }))),
  checklist: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String({ description: "Short item id (e.g., '1', '2', '3')." }),
        title: Type.String({ description: "Item description. Caller MUST keep text concrete and actionable." }),
        status: Type.Optional(
          StringEnum(["unchecked", "checked"] as const, {
            description: "Item status, defaults to unchecked. Caller SHOULD use tick for progress updates.",
          }),
        ),
      }),
      {
        description:
          "Checklist items for this todo. When present, status is derived from checklist completion and caller MUST NOT force lifecycle closure.",
      },
    ),
  ),
  body: Type.Optional(
    Type.String({ description: "Long-form details (markdown). Update replaces; append adds. Caller SHOULD preserve existing context unless replacing intentionally." }),
  ),
  force: Type.Optional(Type.Boolean({ description: "Override another session's assignment. Caller MUST use only when explicit user intent exists." })),
  item: Type.Optional(
    Type.String({ description: "Checklist item id to tick (required for tick action)." }),
  ),
});
