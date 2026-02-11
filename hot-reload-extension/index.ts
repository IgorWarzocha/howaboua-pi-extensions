import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const EXT_LOG_PATH = "/tmp/pi-hot-reload-extension.log";
const EXT_LOG_ENABLED = /^(1|true|yes|on)$/i.test(process.env.PI_HOT_RELOAD_LOG ?? "");
const EXT_DIR = join(process.cwd(), ".pi", "extensions", "hot-reload-extension");
const DAEMON_SCRIPT = join(EXT_DIR, "daemon.js");
const SYSTEMD_SERVICE_SOURCE = join(EXT_DIR, "systemd", "pi-hot-reloadd.service");
const SYSTEMD_SERVICE_DEST = join(homedir(), ".config", "systemd", "user", "pi-hot-reloadd.service");

type HotReloadGlobal = {
	reloadGeneration?: number;
	processStartedAt?: string;
};

type EnsureDaemonResult = {
	ok: boolean;
	installed: boolean;
	running: boolean;
	method: "systemd" | "direct" | "none";
	message: string;
};

const hotReloadGlobal = globalThis as typeof globalThis & { __hotReloadExt?: HotReloadGlobal };
if (!hotReloadGlobal.__hotReloadExt) {
	hotReloadGlobal.__hotReloadExt = {
		reloadGeneration: 0,
		processStartedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
	};
}
hotReloadGlobal.__hotReloadExt.reloadGeneration = (hotReloadGlobal.__hotReloadExt.reloadGeneration ?? 0) + 1;

const bootId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bootAt = new Date().toISOString();
const reloadGeneration = hotReloadGlobal.__hotReloadExt.reloadGeneration;
const pid = process.pid;
const processStartedAt = hotReloadGlobal.__hotReloadExt.processStartedAt;

function safeLog(event: string, fields: Record<string, string | number | boolean | undefined>): void {
	if (!EXT_LOG_ENABLED) {
		return;
	}
	const timestamp = new Date().toISOString();
	const parts = Object.entries(fields)
		.map(([key, value]) => `${key}=${value ?? ""}`)
		.join(" ");
	try {
		appendFileSync(EXT_LOG_PATH, `${timestamp} event=${event} ${parts}\n`, "utf-8");
	} catch {
		// never throw from logging
	}
}

function readLogTail(maxLines: number): string {
	if (!EXT_LOG_ENABLED) {
		return "Logging disabled. Set PI_HOT_RELOAD_LOG=1 to enable extension diagnostics.";
	}
	if (!existsSync(EXT_LOG_PATH)) {
		return `No log file at ${EXT_LOG_PATH}`;
	}
	try {
		const content = readFileSync(EXT_LOG_PATH, "utf-8");
		return content
			.split(/\r?\n/)
			.filter((line) => line.length > 0)
			.slice(-maxLines)
			.join("\n");
	} catch (error) {
		return `Failed to read ${EXT_LOG_PATH}: ${error instanceof Error ? error.message : String(error)}`;
	}
}

function runDaemonCli(args: string[]): { ok: boolean; stdout: string; stderr: string } {
	const result = spawnSync(process.execPath, [DAEMON_SCRIPT, ...args], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		ok: result.status === 0,
		stdout: (result.stdout ?? "").trim(),
		stderr: (result.stderr ?? "").trim(),
	};
}

function runSystemctlUser(args: string[]): { ok: boolean; stdout: string; stderr: string } {
	const result = spawnSync("systemctl", ["--user", ...args], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		ok: result.status === 0,
		stdout: (result.stdout ?? "").trim(),
		stderr: (result.stderr ?? "").trim(),
	};
}

function ensureSystemdInstalledAndRunning(): EnsureDaemonResult {
	const systemctlCheck = spawnSync("systemctl", ["--user", "--version"], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (systemctlCheck.status !== 0) {
		return {
			ok: false,
			installed: false,
			running: false,
			method: "none",
			message: "systemctl --user unavailable",
		};
	}

	if (!existsSync(SYSTEMD_SERVICE_DEST)) {
		if (!existsSync(SYSTEMD_SERVICE_SOURCE)) {
			return {
				ok: false,
				installed: false,
				running: false,
				method: "none",
				message: `service source missing: ${SYSTEMD_SERVICE_SOURCE}`,
			};
		}
		mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
		copyFileSync(SYSTEMD_SERVICE_SOURCE, SYSTEMD_SERVICE_DEST);
	}

	const daemonReload = runSystemctlUser(["daemon-reload"]);
	if (!daemonReload.ok) {
		return {
			ok: false,
			installed: true,
			running: false,
			method: "systemd",
			message: `daemon-reload failed: ${daemonReload.stderr || daemonReload.stdout}`,
		};
	}

	const enableNow = runSystemctlUser(["enable", "--now", "pi-hot-reloadd.service"]);
	if (!enableNow.ok) {
		return {
			ok: false,
			installed: true,
			running: false,
			method: "systemd",
			message: `enable --now failed: ${enableNow.stderr || enableNow.stdout}`,
		};
	}

	const active = runSystemctlUser(["is-active", "pi-hot-reloadd.service"]);
	if (!active.ok || active.stdout !== "active") {
		return {
			ok: false,
			installed: true,
			running: false,
			method: "systemd",
			message: `service not active: ${active.stderr || active.stdout}`,
		};
	}

	return {
		ok: true,
		installed: true,
		running: true,
		method: "systemd",
		message: "systemd service installed and running",
	};
}

function ensureDaemonReady(): EnsureDaemonResult {
	const systemd = ensureSystemdInstalledAndRunning();
	if (systemd.ok) {
		return systemd;
	}

	const direct = runDaemonCli(["ensure-daemon"]);
	if (direct.ok) {
		return {
			ok: true,
			installed: systemd.installed,
			running: true,
			method: "direct",
			message: `direct ensure-daemon ok (systemd fallback reason: ${systemd.message})`,
		};
	}

	return {
		ok: false,
		installed: systemd.installed,
		running: false,
		method: "none",
		message: `failed to ensure daemon: systemd=${systemd.message}; direct=${direct.stderr || direct.stdout}`,
	};
}

function detectWorkspace(): string {
    try {
        const raw = execSync("hyprctl activeworkspace -j", { encoding: "utf-8", timeout: 2000 });
        return String(JSON.parse(raw).id ?? "");
    } catch {
        return "";
    }
}

function registerInstance(pi: ExtensionAPI, ctx: ExtensionContext): { ok: boolean; message: string; ensure: EnsureDaemonResult } {
    const ensure = ensureDaemonReady();
	if (!ensure.ok) {
		return { ok: false, message: ensure.message, ensure };
	}

	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) {
		return { ok: false, message: "session file not available; cannot register", ensure };
	}

	const termProgram = process.env.TERM_PROGRAM ?? "";
	const modelProvider = ctx.model?.provider ?? "";
	const modelId = ctx.model?.id ?? "";
	const thinking = pi.getThinkingLevel();
	const register = runDaemonCli([
		"register",
		"--pid",
		String(process.pid),
		"--cwd",
		ctx.cwd,
		"--session-file",
		sessionFile,
		"--term-program",
		termProgram,
		"--model-provider",
		modelProvider,
		"--model-id",
		modelId,
		"--thinking",
		thinking,
		"--display",
		process.env.DISPLAY ?? "",
		"--wayland-display",
		process.env.WAYLAND_DISPLAY ?? "",
        "--dbus-session-bus-address",
        process.env.DBUS_SESSION_BUS_ADDRESS ?? "",
        "--xdg-runtime-dir",
        process.env.XDG_RUNTIME_DIR ?? "",
        "--workspace",
        detectWorkspace(),
    ]);

	if (!register.ok) {
		return { ok: false, message: `register failed: ${register.stderr || register.stdout}`, ensure };
	}
	return { ok: true, message: register.stdout, ensure };
}

safeLog("extension_load", {
	bootId,
	bootAt,
	reloadGeneration,
	pid,
	processStartedAt,
	daemonScript: DAEMON_SCRIPT,
	systemdSource: SYSTEMD_SERVICE_SOURCE,
	systemdDest: SYSTEMD_SERVICE_DEST,
});

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		const result = registerInstance(pi, ctx);
		safeLog("session_start", {
			bootId,
			reloadGeneration,
			pid,
			registerOk: result.ok,
			registerMessage: result.message,
			ensureOk: result.ensure.ok,
			ensureInstalled: result.ensure.installed,
			ensureRunning: result.ensure.running,
			ensureMethod: result.ensure.method,
			ensureMessage: result.ensure.message,
		});
	});

	pi.on("session_shutdown", () => {
		safeLog("session_shutdown", { bootId, reloadGeneration, pid });
	});

	pi.registerTool({
		name: "hot_reload",
		label: "Hot Reload",
		description:
			"Restart pi in a new terminal window and resume current session. Terminal operation: do not batch with other tool calls. Call this tool alone and wait for session resumption before issuing more commands.",
		parameters: Type.Object({}),
        async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
            const workspace = detectWorkspace();
            const registration = registerInstance(pi, ctx);
            if (!registration.ok) {
				return {
					content: [{ type: "text", text: `Hot reload failed at registration: ${registration.message}` }],
					details: { registration },
				};
			}

            const restart = runDaemonCli(["restart", "--pid", String(process.pid), "--workspace", workspace]);
			if (!restart.ok) {
				return {
					content: [{ type: "text", text: `Hot reload failed at restart request: ${restart.stderr || restart.stdout}` }],
					details: { registration, restart },
				};
			}

			safeLog("tool_hot_reload", {
				bootId,
				reloadGeneration,
				pid,
				sessionFile: ctx.sessionManager.getSessionFile(),
				restartReply: restart.stdout,
			});

			ctx.shutdown();

			return {
				content: [
					{
						type: "text",
						text:
							"Hot reload requested. This instance will exit and daemon will launch a new terminal resuming this session. " +
							"Do NOT batch this tool with other calls; follow-up commands in the same turn will not run. Call hot_reload alone and wait until the resumed session is active.",
					},
				],
				details: { registration: registration.message, restart: restart.stdout },
			};
		},
	});

	const showStatus = async (ctx: ExtensionContext) => {
		const daemonStatus = runDaemonCli(["status"]);
		const ensure = ensureDaemonReady();
		const processUptimeSeconds = Number(process.uptime().toFixed(1));
		pi.sendMessage({
			customType: "hot-reload-status",
			display: "Hot reload status",
			content:
				`hot-reload-extension active\n` +
				`boot_id=${bootId}\n` +
				`boot_at=${bootAt}\n` +
				`generation=${reloadGeneration}\n` +
				`pid=${pid}\n` +
				`cwd=${ctx.cwd}\n` +
				`session_file=${ctx.sessionManager.getSessionFile() ?? ""}\n` +
				`process_started_at=${processStartedAt}\n` +
				`process_uptime_s=${processUptimeSeconds}\n` +
				`ext_log_enabled=${EXT_LOG_ENABLED}\n` +
				`ext_log_path=${EXT_LOG_PATH}\n` +
				`daemon_status_ok=${daemonStatus.ok}\n` +
				`daemon_reply=${daemonStatus.ok ? daemonStatus.stdout : daemonStatus.stderr}\n` +
				`ensure_ok=${ensure.ok} ensure_installed=${ensure.installed} ensure_running=${ensure.running} ensure_method=${ensure.method} ensure_message=${ensure.message}`,
			details: {
				bootId,
				bootAt,
				reloadGeneration,
				pid,
				processStartedAt,
				processUptimeSeconds,
				extLogEnabled: EXT_LOG_ENABLED,
				extLogPath: EXT_LOG_PATH,
				daemonStatus,
				ensure,
			},
		});
	};

	pi.registerCommand("reload:status", {
		description: "Show daemon + extension status in chat",
		handler: async (_args, ctx) => {
			await showStatus(ctx);
		},
	});

	const showLog = async (args: string) => {
		const parsed = Number.parseInt(args.trim(), 10);
		const maxLines = Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
		const tail = readLogTail(maxLines);
		pi.sendMessage({
			customType: "hot-reload-log",
			content: tail,
			display: `Hot reload extension log (last ${maxLines} lines)`,
			details: { logPath: EXT_LOG_PATH, maxLines },
		});
	};

	pi.registerCommand("reload:log", {
		description: "Show extension log tail. Usage: /reload:log [lines]",
		handler: async (args) => {
			await showLog(args);
		},
	});
}
