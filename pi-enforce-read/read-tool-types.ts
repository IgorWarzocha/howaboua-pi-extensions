import { Type, type Static } from "@sinclair/typebox";

export const FileSchema = Type.Object({
  path: Type.String({
    description:
      "REQUIRED. File path to read. You SHOULD provide a project-relative path. An optional leading '@' MAY be provided and will be ignored.",
  }),
  offset: Type.Optional(
    Type.Number({
      description:
        "OPTIONAL. 1-indexed start line for text reads. You SHOULD set this when reading large files or when only a specific section is needed.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description:
        "OPTIONAL. Maximum number of lines for text reads. You SHOULD set this to minimize output size and token usage.",
    }),
  ),
});

export type FileInput = Static<typeof FileSchema>;

export type ReadFileDetail = {
  path: string;
  offset?: number;
  limit?: number;
  mimeType?: string;
  details?: unknown;
  error?: string;
};
