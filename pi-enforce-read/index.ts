import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupGuard } from "./guard.js";
import { registerReadTool } from "./read-tool.js";

export default function (pi: ExtensionAPI) {
  setupGuard(pi);
  registerReadTool(pi);
}
