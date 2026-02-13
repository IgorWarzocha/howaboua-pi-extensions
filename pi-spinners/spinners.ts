import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { quotes } from "./data/quotes.js";

function pickRandom(): string {
  return quotes[Math.floor(Math.random() * quotes.length)].text;
}

export default function (pi: ExtensionAPI) {
  pi.on("turn_start", async (_event, ctx) => {
    ctx.ui.setWorkingMessage(pickRandom());
  });

  pi.on("turn_end", async (_event, ctx) => {
    ctx.ui.setWorkingMessage();
  });
}
