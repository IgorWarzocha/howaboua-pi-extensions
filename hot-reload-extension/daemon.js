#!/usr/bin/env node
/*
 * pi-hot-reloadd
 * User-space daemon for Pi hot reload by full process restart in a new terminal.
 */

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const UID = typeof process.getuid === "function" ? process.getuid() : 0;
const RUNTIME_DIR = process.env.XDG_RUNTIME_DIR || `/run/user/${UID}`;
const BASE_DIR = fs.existsSync(RUNTIME_DIR) ? RUNTIME_DIR : os.tmpdir();
const SOCK_PATH = path.join(BASE_DIR, `pi-hot-reloadd-${UID}.sock`);
const STATE_PATH = path.join(BASE_DIR, `pi-hot-reloadd-${UID}.json`);
const LOG_PATH = path.join(BASE_DIR, `pi-hot-reloadd-${UID}.log`);
const LOG_ENABLED = /^(1|true|yes|on)$/i.test(process.env.PI_HOT_RELOAD_LOG ?? "");
const CLOSE_OLD_TERMINAL_RAW = (process.env.PI_HOT_RELOAD_CLOSE_OLD_TERMINAL ?? "force").trim();
const CLOSE_OLD_TERMINAL_MODE = /^(0|false|no|off)$/i.test(CLOSE_OLD_TERMINAL_RAW)
	? "off"
	: /^(force|aggressive)$/i.test(CLOSE_OLD_TERMINAL_RAW)
		? "force"
		: "safe";
const RESUME_PROMPT =
	process.env.PI_HOT_RELOAD_RESUME_PROMPT ||
	"Hot-reload completed. AUTO-CONTINUE: You MUST continue implementation/testing for non-user-facing extension logic (tools, hooks, flags, provider/model wiring, resources_discover, internal command logic) and iterate until correct. USER FEEDBACK REQUIRED: For user-facing behavior (/commands, shortcuts, UI widgets/overlays/header/footer/editor, message rendering, UX), you MUST ask the user to verify and SHOULD keep troubleshooting until confirmed.";

const SHARED_TERMINAL_COMMS = new Set([
	"ghostty",
	"kitty",
	"wezterm-gui",
	"gnome-terminal-server",
	"konsole",
	"tilix",
	"xfce4-terminal",
]);

function log(message, fields = {}) {
	if (!LOG_ENABLED) {
		return;
	}
	const timestamp = new Date().toISOString();
	const extra = Object.entries(fields)
		.map(([k, v]) => `${k}=${v}`)
		.join(" ");
	fs.appendFileSync(LOG_PATH, `${timestamp} ${message}${extra ? ` ${extra}` : ""}\n`, "utf8");
}

function readState() {
	if (!fs.existsSync(STATE_PATH)) {
		return { instances: {} };
	}
	try {
		const raw = fs.readFileSync(STATE_PATH, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return { instances: {} };
		if (!parsed.instances || typeof parsed.instances !== "object") parsed.instances = {};
		return parsed;
	} catch {
		return { instances: {} };
	}
}

function writeState(state) {
	fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function cleanupDeadInstances(state) {
	const instances = state.instances || {};
	let removed = 0;
	for (const [key, instance] of Object.entries(instances)) {
		const pid = Number(instance.pid);
		if (!Number.isFinite(pid) || pid <= 1 || !isAlive(pid)) {
			delete instances[key];
			removed += 1;
		}
	}
	state.instances = instances;
	if (removed > 0) {
		writeState(state);
		log("cleanup-dead-instances", { removed, remaining: Object.keys(instances).length });
	}
}

function shellQuote(value) {
	return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function isAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function readParentPid(pid) {
	try {
		const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
		const match = status.match(/^PPid:\s+(\d+)$/m);
		if (!match) return 0;
		return Number(match[1]);
	} catch {
		return 0;
	}
}

function readComm(pid) {
	try {
		return fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
	} catch {
		return "";
	}
}

function findTerminalAncestor(pid, termProgram) {
	const normalizedTermProgram = String(termProgram || "").trim().toLowerCase();
	const known = new Set([
		normalizedTermProgram,
		"ghostty",
		"kitty",
		"wezterm-gui",
		"gnome-terminal-server",
		"alacritty",
		"konsole",
		"xfce4-terminal",
		"tilix",
		"foot",
		"xterm",
	]);

	let current = Number(pid);
	for (let depth = 0; depth < 20 && Number.isFinite(current) && current > 1; depth++) {
		const comm = readComm(current).toLowerCase();
		if (comm && known.has(comm)) {
			return { pid: current, comm };
		}
		current = readParentPid(current);
	}
    return null;
}

function findTerminalWindowTarget(pid, termProgram) {
    const normalizedTermProgram = String(termProgram || "").trim().toLowerCase();
    const sharedTerminals = new Set([
        normalizedTermProgram,
        "ghostty",
        "kitty",
        "wezterm-gui",
        "gnome-terminal-server",
        "konsole",
        "xfce4-terminal",
        "tilix",
    ]);

    const known = new Set([
        normalizedTermProgram,
        "ghostty",
        "kitty",
        "wezterm-gui",
        "gnome-terminal-server",
        "alacritty",
        "konsole",
        "xfce4-terminal",
        "tilix",
        "foot",
        "xterm",
    ]);

    let current = Number(pid);
    let lastBeforeTerminal = null;
    for (let depth = 0; depth < 20 && Number.isFinite(current) && current > 1; depth++) {
        const comm = readComm(current).toLowerCase();
        if (comm && known.has(comm)) {
            const isShared = sharedTerminals.has(comm);
            if (isShared && lastBeforeTerminal !== null) {
                return { pid: lastBeforeTerminal, comm: readComm(lastBeforeTerminal).toLowerCase(), terminalPid: current, terminalComm: comm };
            }
            return { pid: current, comm, terminalPid: current, terminalComm: comm };
        }
        lastBeforeTerminal = current;
        current = readParentPid(current);
    }
    return null;
}
function shouldCloseTerminal(terminalAncestor) {
	if (!terminalAncestor || !Number.isFinite(terminalAncestor.pid) || terminalAncestor.pid <= 1) {
		return false;
	}

	if (CLOSE_OLD_TERMINAL_MODE === "off") {
		return false;
	}

	if (CLOSE_OLD_TERMINAL_MODE === "force") {
		return true;
	}

	return !SHARED_TERMINAL_COMMS.has(String(terminalAncestor.comm || "").toLowerCase());
}

function detectTerminal(termProgram) {
	const preferred = process.env.PI_HOT_RELOAD_TERMINAL || termProgram || "";
	const candidates = [preferred, "ghostty", "xdg-terminal-exec", "kitty", "wezterm", "alacritty", "xterm"].filter(
		Boolean,
	);
	for (const cmd of candidates) {
		const check = spawnSync("bash", ["-lc", `command -v ${cmd}`], { stdio: "ignore" });
		if (check.status === 0) {
			return cmd;
		}
	}
	return "xdg-terminal-exec";
}

function launchInNewTerminal({
    cwd,
    sessionFile,
	termProgram,
	modelProvider,
	modelId,
	thinking,
  display,
  waylandDisplay,
  dbusSessionBusAddress,
  xdgRuntimeDir,
    workspace,
}) {
    const terminal = detectTerminal(termProgram);
    const piBinary = process.env.PI_HOT_RELOAD_PI_BIN || "pi";
	const providerArg = modelProvider ? ` --provider ${shellQuote(modelProvider)}` : "";
	const modelArg = modelId ? ` --model ${shellQuote(modelId)}` : "";
	const thinkingArg = thinking ? ` --thinking ${shellQuote(thinking)}` : "";
	const command =
		`cd ${shellQuote(cwd)} && exec ${shellQuote(piBinary)} --session ${shellQuote(sessionFile)}` +
		`${providerArg}${modelArg}${thinkingArg} ${shellQuote(RESUME_PROMPT)}`;

	const launchEnv = {
		...process.env,
		DISPLAY: display || process.env.DISPLAY,
		WAYLAND_DISPLAY: waylandDisplay || process.env.WAYLAND_DISPLAY,
		DBUS_SESSION_BUS_ADDRESS: dbusSessionBusAddress || process.env.DBUS_SESSION_BUS_ADDRESS,
		XDG_RUNTIME_DIR: xdgRuntimeDir || process.env.XDG_RUNTIME_DIR,
	};

	let cmd;
	let args;
	if (terminal === "ghostty") {
		cmd = "ghostty";
		args = ["-e", "bash", "-lc", command];
	} else if (terminal === "kitty") {
		cmd = "kitty";
		args = ["bash", "-lc", command];
	} else if (terminal === "wezterm") {
		cmd = "wezterm";
		args = ["start", "--", "bash", "-lc", command];
	} else if (terminal === "alacritty") {
		cmd = "alacritty";
		args = ["-e", "bash", "-lc", command];
	} else if (terminal === "xterm") {
		cmd = "xterm";
		args = ["-e", "bash", "-lc", command];
    } else {
        cmd = "xdg-terminal-exec";
        args = ["bash", "-lc", command];
    }

    if (workspace) {
        const launch = `${cmd} ${args.map((value) => shellQuote(value)).join(" ")}`;
        const exec = spawnSync("hyprctl", ["dispatch", "exec", `[workspace ${String(workspace)} silent] ${launch}`], {
            env: launchEnv,
            stdio: "ignore",
            timeout: 2000,
        });
        if (exec.status === 0) {
            log("launched", { terminal: "hyprctl-exec", workspace: String(workspace), cwd, sessionFile, resumePrompt: RESUME_PROMPT });
            return;
        }
    }

    const child = spawn(cmd, args, {
        detached: true,
		stdio: "ignore",
		env: launchEnv,
	});
	child.unref();
	log("launched", { terminal: cmd, cwd, sessionFile, childPid: child.pid ?? "unknown", resumePrompt: RESUME_PROMPT });
}

function performRestart(instance) {
	const pid = Number(instance.pid);
    const target = findTerminalWindowTarget(pid, instance.termProgram);

	if (Number.isFinite(pid) && isAlive(pid)) {
		try {
			process.kill(pid, "SIGTERM");
			log("sent-sigterm", { pid });
		} catch (error) {
			log("sigterm-failed", { pid, error: error instanceof Error ? error.message : String(error) });
		}
	}

	let attempts = 0;
	const interval = setInterval(() => {
		attempts += 1;
		if (!Number.isFinite(pid) || !isAlive(pid) || attempts > 30) {
			clearInterval(interval);
			if (attempts > 30 && Number.isFinite(pid) && isAlive(pid)) {
				try {
					process.kill(pid, "SIGKILL");
					log("sent-sigkill", { pid });
				} catch {
					// ignore
				}
			}

            if (shouldCloseTerminal(target)) {
                try {
                    process.kill(target.pid, "SIGTERM");
                    log("closed-old-terminal", { targetPid: target.pid, targetComm: target.comm, terminalPid: target.terminalPid, terminalComm: target.terminalComm });
				} catch (error) {
					log("close-old-terminal-failed", {
                        targetPid: target.pid,
                        targetComm: target.comm,
						error: error instanceof Error ? error.message : String(error),
					});
				}
            } else if (target) {
				log("skip-close-old-terminal", {
                    targetPid: target.pid,
                    targetComm: target.comm,
					mode: CLOSE_OLD_TERMINAL_MODE,
				});
			}

			launchInNewTerminal(instance);
		}
	}, 250);
}

function handleRequest(message) {
	const state = readState();
	cleanupDeadInstances(state);
	if (message.type === "register") {
		const key = String(message.pid);
		state.instances[key] = {
			pid: Number(message.pid),
			cwd: String(message.cwd || process.cwd()),
			sessionFile: String(message.sessionFile || ""),
			termProgram: String(message.termProgram || ""),
			modelProvider: String(message.modelProvider || ""),
			modelId: String(message.modelId || ""),
			thinking: String(message.thinking || ""),
			display: String(message.display || ""),
			waylandDisplay: String(message.waylandDisplay || ""),
			dbusSessionBusAddress: String(message.dbusSessionBusAddress || ""),
      xdgRuntimeDir: String(message.xdgRuntimeDir || ""),
      workspace: String(message.workspace || ""),
      updatedAt: new Date().toISOString(),
		};
		writeState(state);
		log("register", state.instances[key]);
		return { ok: true, socketPath: SOCK_PATH };
	}

    if (message.type === "restart") {
        const key = String(message.pid);
        const instance = state.instances[key];
		if (!instance) {
			return { ok: false, error: `instance ${key} not registered` };
		}
        if (!instance.sessionFile) {
            return { ok: false, error: `instance ${key} has no sessionFile` };
        }
        if (message.workspace) {
            instance.workspace = String(message.workspace);
        }
        instance.updatedAt = new Date().toISOString();
        state.instances[key] = instance;
        writeState(state);
        performRestart(instance);
        log("restart-request", { pid: instance.pid, sessionFile: instance.sessionFile });
        return { ok: true, queued: true };
	}

	if (message.type === "status") {
		return {
			ok: true,
			socketPath: SOCK_PATH,
			state,
			logPath: LOG_PATH,
			logEnabled: LOG_ENABLED,
			closeOldTerminalMode: CLOSE_OLD_TERMINAL_MODE,
			resumePrompt: RESUME_PROMPT,
		};
	}

	if (message.type === "list") {
		const instances = Object.values(state.instances || {});
		return { ok: true, count: instances.length, instances };
	}

	return { ok: false, error: `unknown message type: ${message.type}` };
}

function runDaemon() {
	if (fs.existsSync(SOCK_PATH)) {
		try {
			fs.unlinkSync(SOCK_PATH);
		} catch {
			// ignore
		}
	}

	const server = net.createServer((socket) => {
		let buf = "";
		socket.on("data", (chunk) => {
			buf += chunk.toString("utf8");
			if (!buf.includes("\n")) return;
			const [line] = buf.split("\n");
			buf = "";
			let message;
			try {
				message = JSON.parse(line);
			} catch {
				socket.write(`${JSON.stringify({ ok: false, error: "invalid json" })}\n`);
				socket.end();
				return;
			}
			const result = handleRequest(message);
			socket.write(`${JSON.stringify(result)}\n`);
			socket.end();
		});
	});

	server.listen(SOCK_PATH, () => {
		log("daemon-start", { socket: SOCK_PATH, pid: process.pid });
	});

	for (const sig of ["SIGINT", "SIGTERM"]) {
		process.on(sig, () => {
			log("daemon-stop", { signal: sig });
			server.close(() => {
				try {
					if (fs.existsSync(SOCK_PATH)) fs.unlinkSync(SOCK_PATH);
				} catch {
					// ignore
				}
				process.exit(0);
			});
		});
	}
}

function sendMessage(message) {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(SOCK_PATH);
		let buf = "";
		socket.on("connect", () => {
			socket.write(`${JSON.stringify(message)}\n`);
		});
		socket.on("data", (chunk) => {
			buf += chunk.toString("utf8");
			if (!buf.includes("\n")) return;
			const [line] = buf.split("\n");
			try {
				resolve(JSON.parse(line));
			} catch (error) {
				reject(error);
			}
			socket.end();
		});
		socket.on("error", (err) => reject(err));
	});
}

async function ensureDaemon() {
	if (fs.existsSync(SOCK_PATH)) {
		try {
			await sendMessage({ type: "status" });
			return;
		} catch {
			try {
				fs.unlinkSync(SOCK_PATH);
			} catch {
				// ignore
			}
		}
	}

	const child = spawn(process.execPath, [__filename, "daemon"], {
		detached: true,
		stdio: "ignore",
		env: process.env,
	});
	child.unref();

	for (let i = 0; i < 30; i++) {
		await new Promise((r) => setTimeout(r, 100));
		if (!fs.existsSync(SOCK_PATH)) continue;
		try {
			await sendMessage({ type: "status" });
			return;
		} catch {
			// retry
		}
	}
	throw new Error("failed to start pi-hot-reloadd");
}

function parseFlags(argv) {
	const result = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) continue;
		const key = arg.slice(2);
		result[key] = argv[i + 1];
		i += 1;
	}
	return result;
}

async function main() {
	const cmd = process.argv[2];
	const flags = parseFlags(process.argv.slice(3));

	if (cmd === "daemon") {
		runDaemon();
		return;
	}

	if (cmd === "ensure-daemon") {
		await ensureDaemon();
		console.log(
			JSON.stringify({
				ok: true,
				socketPath: SOCK_PATH,
				statePath: STATE_PATH,
			logPath: LOG_PATH,
			logEnabled: LOG_ENABLED,
			closeOldTerminalMode: CLOSE_OLD_TERMINAL_MODE,
			resumePrompt: RESUME_PROMPT,
		}),
		);
		return;
	}

	if (cmd === "register") {
		await ensureDaemon();
		const response = await sendMessage({
			type: "register",
			pid: Number(flags.pid),
			cwd: flags.cwd,
			sessionFile: flags["session-file"],
			termProgram: flags["term-program"],
			modelProvider: flags["model-provider"],
			modelId: flags["model-id"],
			thinking: flags.thinking,
			display: flags.display,
			waylandDisplay: flags["wayland-display"],
			dbusSessionBusAddress: flags["dbus-session-bus-address"],
      xdgRuntimeDir: flags["xdg-runtime-dir"],
      workspace: flags.workspace,
    });
		console.log(JSON.stringify(response));
		process.exit(response.ok ? 0 : 1);
		return;
	}

    if (cmd === "restart") {
        await ensureDaemon();
        const response = await sendMessage({ type: "restart", pid: Number(flags.pid), workspace: flags.workspace });
        console.log(JSON.stringify(response));
        process.exit(response.ok ? 0 : 1);
        return;
	}

	if (cmd === "status") {
		await ensureDaemon();
		const response = await sendMessage({ type: "status" });
		console.log(JSON.stringify(response, null, 2));
		process.exit(response.ok ? 0 : 1);
		return;
	}

	if (cmd === "list") {
		await ensureDaemon();
		const response = await sendMessage({ type: "list" });
		console.log(JSON.stringify(response, null, 2));
		process.exit(response.ok ? 0 : 1);
		return;
	}

	console.error("Usage: daemon.js <daemon|ensure-daemon|register|restart|status|list> [flags]");
	process.exit(1);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
