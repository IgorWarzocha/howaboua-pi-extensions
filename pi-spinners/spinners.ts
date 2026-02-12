import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { quotes, QuoteCategory } from "./data/quotes.js";

const weights: Record<string, number> = {
  [QuoteCategory.Tech]: 20,
  [QuoteCategory.PopCulture]: 15,
  [QuoteCategory.SciFi]: 15,
  [QuoteCategory.Fantasy]: 15,
  [QuoteCategory.Philosophy]: 10,
  [QuoteCategory.Nonsense]: 10,
  [QuoteCategory.Corporate]: 10,
  [QuoteCategory.Niche]: 5
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
