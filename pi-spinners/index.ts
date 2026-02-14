 import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
 import { quotes } from "./data/categories/index.js";
 
 function pickRandom(): string {
   if (quotes.length === 0) {
     throw new Error("No quotes available to display.");
   }
   return quotes[Math.floor(Math.random() * quotes.length)].text;
 }
 
 export default function (pi: ExtensionAPI) {
   pi.on("turn_start", async (_event, ctx) => {
     ctx.ui.setWorkingMessage(pickRandom());
   });
 
   pi.on("tool_call", async (_event, ctx) => {
     ctx.ui.setWorkingMessage(pickRandom());
   });
 
   pi.on("turn_end", async (_event, ctx) => {
     ctx.ui.setWorkingMessage();
   });
 }
