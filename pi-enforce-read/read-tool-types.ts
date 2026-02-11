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
  search: Type.Optional(
    Type.String({
      description:
        "OPTIONAL. In-file search query. You MAY use this to find matching lines without calling grep for a file you are already reading.",
    }),
  ),
  regex: Type.Optional(
    Type.Boolean({
      description:
        "OPTIONAL. If true, 'search' is treated as a regular expression. Invalid regex patterns MUST fail with a descriptive error.",
    }),
  ),
  caseSensitive: Type.Optional(
    Type.Boolean({
      description: "OPTIONAL. If true, search matching is case-sensitive. Default is case-insensitive.",
    }),
  ),
  contextBefore: Type.Optional(
    Type.Number({
      description: "OPTIONAL. Number of leading context lines to include before each search match.",
    }),
  ),
  contextAfter: Type.Optional(
    Type.Number({
      description: "OPTIONAL. Number of trailing context lines to include after each search match.",
    }),
  ),
  maxMatches: Type.Optional(
    Type.Number({
      description: "OPTIONAL. Maximum number of matched lines to return for search mode.",
    }),
  ),
});

export type FileInput = Static<typeof FileSchema>;

export type ReadFileDetail = {
  path: string;
  offset?: number;
  limit?: number;
  mimeType?: string;
  search?: string;
  regex?: boolean;
  matches?: number;
  details?: unknown;
  error?: string;
};
