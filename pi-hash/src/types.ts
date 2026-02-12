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
  oldAnchors: UpdateLineAnchor[];
  newLines: string[];
  isEndOfFile: boolean;
};

export type UpdateLineAnchor = {
  line: number;
  hash: string;
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
  failed: ApplyFailure[];
  live: ApplyLive[];
  fileDiffs: ApplyFileDiff[];
};

export type ApplyFailure = {
  path: string;
  error: string;
  expected?: string[];
  actual?: string[];
  suggest?: string;
};

export type ApplyLive = {
  path: string;
  anchors: string[];
};
