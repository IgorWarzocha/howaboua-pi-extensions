export interface ChecklistItem {
  id: string;
  title: string;
  status: "unchecked" | "checked";
  done?: boolean;
}

export interface TodoLinks {
  root_abs?: string;
  prds?: string[];
  specs?: string[];
  todos?: string[];
  reads?: string[];
}

export interface TodoWorktree {
  enabled?: boolean;
  branch?: string;
}

export interface TodoFrontMatter {
  id: string;
  title: string;
  tags: string[];
  status: string;
  created_at: string;
  modified_at?: string;
  assigned_to_session?: string;
  checklist?: ChecklistItem[];
  kind?: string;
  template?: boolean;
  links?: TodoLinks;
  agent_rules?: string;
  worktree?: TodoWorktree;
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
  | "claim"
  | "release"
  | "tick";

export type TodoOverlayAction = "back" | "work" | "edit-checklist";

export type TodoMenuAction =
  | "work"
  | "review"
  | "refine"
  | "complete"
  | "abandon"
  | "reopen"
  | "delete"
  | "release"
  | "copyPath"
  | "copyText"
  | "view";

export type TodoToolDetails =
  | {
      action: "list" | "list-all";
      todos: TodoFrontMatter[];
      currentSessionId?: string;
      error?: string;
    }
  | {
      action: "get" | "create" | "update" | "append" | "claim" | "release";
      todo: TodoRecord;
      error?: string;
    }
  | {
      action: "tick";
      todo: TodoRecord;
      tickedItem?: ChecklistItem;
      remaining: ChecklistItem[];
      allComplete: boolean;
      error?: string;
    };

export type TodoCreateCallback = (prompt: string) => void;

export type TodoQuickAction = "work" | "refine" | "create";

