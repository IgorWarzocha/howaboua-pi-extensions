export interface TodoFrontMatter {
    id: string;
    title: string;
    tags: string[];
    status: string;
    created_at: string;
    assigned_to_session?: string;
}

export interface TodoRecord extends TodoFrontMatter {
    body: string;
}

export interface LockInfo {
    id: string;
    pid: number;
    session?: string | null;
    created_at: string;
}

export interface TodoSettings {
    gc: boolean;
    gcDays: number;
}

export type TodoAction =
    | "list"
    | "list-all"
    | "get"
    | "create"
    | "update"
    | "append"
    | "delete"
    | "claim"
    | "release";

export type TodoOverlayAction = "back" | "work";

export type TodoMenuAction =
    | "work"
    | "refine"
    | "close"
    | "reopen"
    | "release"
    | "delete"
    | "copyPath"
    | "copyText"
    | "view";

export type TodoToolDetails =
    | { action: "list" | "list-all"; todos: TodoFrontMatter[]; currentSessionId?: string; error?: string }
    | {
            action: "get" | "create" | "update" | "append" | "delete" | "claim" | "release";
            todo: TodoRecord;
            error?: string;
      };

export type TodoCreateCallback = (prompt: string) => void;

export type TodoQuickAction = "work" | "refine" | "create";
