export type Hunk =
  | { type: "add"; filePath: string; contents: string }
  | { type: "delete"; filePath: string }
  | {
      type: "update";
      filePath: string;
      moveToPath?: string;
      chunks: UpdateFileChunk[];
    };

export type UpdateFileChunk = {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
};

export class InvalidPatchError extends Error {}
export class InvalidHunkError extends Error {
  constructor(
    message: string,
    readonly lineNumber: number,
  ) {
    super(message);
  }
}

export type ApplyFileDiff = {
  status: "A" | "M" | "D";
  path: string;
  moveFrom?: string;
  diff: string;
};

export type ApplySummary = {
  added: string[];
  modified: string[];
  deleted: string[];
  fileDiffs: ApplyFileDiff[];
};
