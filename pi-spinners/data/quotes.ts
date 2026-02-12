import { allQuotes } from "./categories/index.js";
export * from "./types.js";
export const quotes = allQuotes;

*** Add File: pi-extensions-dev/pi-spinners/spinners.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { quotes, QuoteCategory } from "./data/quotes.js";

const weights: Record<string, number> = {
  [QuoteCategory.Tech]: 30,
  [QuoteCategory.Philosophy]: 15,
  [QuoteCategory.PopCulture]: 25,
  [QuoteCategory.Nonsense]: 10,
  [QuoteCategory.Corporate]: 10,
  [QuoteCategory.Niche]: 10
};

function pickRandom(): string {
  const categories = Object.keys(weights);
  const weightValues = Object.values(weights);
  const totalWeight = weightValues.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  let selectedCategory = categories[0];

  for (let i = 0; i < weightValues.length; i++) {
    if (random < weightValues[i]) {
      selectedCategory = categories[i];
      break;
    }
    random -= weightValues[i];
  }

  const filtered = quotes.filter(q => q.category === selectedCategory);
  const pool = filtered.length > 0 ? filtered : quotes;
  return pool[Math.floor(Math.random() * pool.length)].text;
}

export default function (pi: ExtensionAPI) {
  pi.on("turn_start", async (_event, ctx) => {
    ctx.ui.setWorkingMessage(pickRandom());
  });

  pi.on("turn_end", async (_event, ctx) => {
    ctx.ui.setWorkingMessage();
  });
}
