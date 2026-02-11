export type Task = {
  id: string;
  title: string;
  template: string;
  skills: string[];
  mode: "local" | "gh-commit" | "gh-issue" | "gh-pr";
};

export type Model = {
  provider: string;
  id: string;
  name: string;
};

export type Config = {
  models: Record<string, string>;
  thinking: Record<string, string>;
};

export type Ui = {
  select: (title: string, options: string[], settings?: { timeout?: number }) => Promise<string | undefined>;
  input: (title: string, placeholder?: string) => Promise<string | undefined>;
  notify: (text: string, level: "info" | "warning" | "error") => void;
};

export type Repo = {
  path: string;
  slug: string;
};

