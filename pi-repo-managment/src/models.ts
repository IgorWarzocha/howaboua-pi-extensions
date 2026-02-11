import type { Model, Ui } from "./types.js";
import { pick } from "./ui.js";

export function detect(ctx: unknown): Model[] {
  if (!ctx || typeof ctx !== "object") {
    return [];
  }
  if (!("modelRegistry" in ctx)) {
    return [];
  }
  const reg = ctx.modelRegistry;
  if (!reg || typeof reg !== "object") {
    return [];
  }
  if (!("getAvailable" in reg)) {
    return [];
  }
  const get = reg.getAvailable;
  if (typeof get !== "function") {
    return [];
  }
  const list = get.call(reg) as unknown;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as { provider?: string; id?: string; name?: string };
      if (!row.provider || !row.id || !row.name) {
        throw new Error("Detected model entries MUST include provider, id, and name.");
      }
      return { provider: row.provider, id: row.id, name: row.name };
    });
}

export function label(model: Model): string {
  return `${model.provider}/${model.id} - ${model.name}`;
}

export async function choose(list: Model[], title: string, ui: Ui): Promise<string | undefined> {
  while (true) {
    const query = await ui.input(`${title} filter`, "Type provider/id/name substring; leave empty for all");
    if (query === undefined) {
      return undefined;
    }
    const q = query.trim().toLowerCase();
    const rows = q.length === 0 ? list : list.filter((item) => `${item.provider}/${item.id} ${item.name}`.toLowerCase().includes(q));
    if (rows.length === 0) {
      const again = await pick(["Try again", "Cancel"], `${title}\nNo models matched`, ui);
      if (again === "Try again") {
        continue;
      }
      return undefined;
    }
    const top = rows.slice(0, 20).map((item) => label(item));
    const opts = ["Default (inherit current)", ...top];
    const refine = `Refine filter (${String(rows.length)} matches)`;
    if (rows.length > 20) {
      opts.push(refine);
    }
    const picked = await pick(opts, title, ui);
    if (!picked) {
      return undefined;
    }
    if (picked === refine) {
      continue;
    }
    if (picked === "Default (inherit current)") {
      return "";
    }
    const at = picked.indexOf(" - ");
    if (at === -1) {
      throw new Error("Model selection MUST include provider/id.");
    }
    return picked.slice(0, at);
  }
}

