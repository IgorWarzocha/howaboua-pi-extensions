export type Parsed = {
  mode: "menu" | "issue" | "pr" | "select";
  number?: number;
  extra?: string;
};

export function parse(input: string): Parsed {
  const text = input.trim();
  if (!text) {
    return { mode: "menu" };
  }
  if (/^select$/i.test(text) || /^repo$/i.test(text) || /^switch$/i.test(text)) {
    return { mode: "select" };
  }
  const issue = text.match(/^issue\s+(\d+)(?:\s+([\s\S]+))?$/i);
  if (issue && issue[1]) {
    return { mode: "issue", number: Number(issue[1]), extra: issue[2]?.trim() };
  }
  const pr = text.match(/^pr\s+(\d+)(?:\s+([\s\S]+))?$/i);
  if (pr && pr[1]) {
    return { mode: "pr", number: Number(pr[1]), extra: pr[2]?.trim() };
  }
  return { mode: "menu" };
}
