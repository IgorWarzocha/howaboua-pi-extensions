import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const PENDING_PROMPT_PATH = join(process.cwd(), ".pi", "hot-reload-v2-pending-prompt.json");
const DEFAULT_RESUME_PROMPT =
	"hot-reload worked correctly - you were implementing an extension - test it and continue troubleshooting if issues arise";

type PendingPrompt = {
	prompt: string;
	createdAt: string;
};

type ReloadCapableContext = ExtensionContext & {
	reload?: () => Promise<void>;
};

function writePendingPrompt(prompt: string): void {
	const payload: PendingPrompt = { prompt, createdAt: new Date().toISOString() };
	writeFileSync(PENDING_PROMPT_PATH, JSON.stringify(payload), "utf-8");
}

function popPendingPrompt(): PendingPrompt | undefined {
	if (!existsSync(PENDING_PROMPT_PATH)) {
		return undefined;
	}
	try {
		const raw = readFileSync(PENDING_PROMPT_PATH, "utf-8");
		rmSync(PENDING_PROMPT_PATH, { force: true });
		const parsed = JSON.parse(raw) as PendingPrompt;
		if (!parsed?.prompt) {
			return undefined;
		}
		return parsed;
	} catch {
		rmSync(PENDING_PROMPT_PATH, { force: true });
		return undefined;
	}
}

function maybeSendPendingPrompt(pi: ExtensionAPI, ctx: ExtensionContext): void {
	const pending = popPendingPrompt();
	if (!pending) {
		return;
	}

	if (ctx.isIdle()) {
		pi.sendUserMessage(pending.prompt);
	} else {
		pi.sendUserMessage(pending.prompt, { deliverAs: "followUp" });
	}

	pi.sendMessage({
		customType: "hot-reload-v2",
		display: "Hot reload v2",
		content: "Runtime reloaded. Queued continuation prompt.",
		details: pending,
	});
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		maybeSendPendingPrompt(pi, ctx);
	});

	pi.registerTool({
		name: "hot_reload_v2",
		label: "Hot Reload V2",
		description:
			"Reload runtime in-place via ctx.reload() and queue continuation prompt. Terminal operation: call this tool alone and wait for resumption before issuing more commands.",
		parameters: Type.Object({
			prompt: Type.Optional(Type.String({ description: "Optional continuation prompt sent after reload" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const prompt = (params.prompt ?? "").trim() || process.env.PI_HOT_RELOAD_V2_RESUME_PROMPT || DEFAULT_RESUME_PROMPT;
			writePendingPrompt(prompt);

			const maybeReload = (ctx as ReloadCapableContext).reload;
			if (typeof maybeReload !== "function") {
				return {
					content: [
						{
							type: "text",
							text: "hot_reload_v2 could not call ctx.reload() from tool context. Runtime does not expose reload() here.",
						},
					],
					details: { pendingPromptPath: PENDING_PROMPT_PATH, prompt },
				};
			}

			await maybeReload();
			return {
				content: [
					{
						type: "text",
						text:
							"hot_reload_v2 requested runtime reload. Do NOT batch this tool with other calls; wait for resumed session.",
					},
				],
				details: { pendingPromptPath: PENDING_PROMPT_PATH, prompt },
			};
		},
	});

	pi.registerCommand("hot-reload-v2-status", {
		description: "Show hot-reload-v2 pending state",
		handler: async () => {
			const hasPending = existsSync(PENDING_PROMPT_PATH);
			let pending: PendingPrompt | undefined;
			if (hasPending) {
				try {
					pending = JSON.parse(readFileSync(PENDING_PROMPT_PATH, "utf-8")) as PendingPrompt;
				} catch {
					pending = undefined;
				}
			}

			pi.sendMessage({
				customType: "hot-reload-v2-status",
				display: "Hot reload v2 status",
				content:
					`pending_file=${PENDING_PROMPT_PATH}\n` +
					`has_pending=${hasPending}\n` +
					`pending_prompt=${pending?.prompt ?? ""}\n` +
					`pending_created_at=${pending?.createdAt ?? ""}`,
				details: { pendingPath: PENDING_PROMPT_PATH, hasPending, pending },
			});
		},
	});
}
