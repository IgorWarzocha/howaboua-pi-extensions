import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { Container, Key, matchesKey, SettingsList, Spacer, Text, type SettingItem } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import Database from "better-sqlite3";
import { EmbeddingModel, ExecutionProvider, FlagEmbedding } from "fastembed";

type MemoryRow = {
	id: number;
	content: string;
	timestamp: string;
	embedding: Buffer;
};

type Scope = "global" | "project" | "both";
type RememberConfig = {
	enabled: boolean;
	scope: Scope;
	inject: {
		count: number;
		highThreshold: number;
	};
};

type Store = { source: "global" | "project"; dbPath: string };

const DEFAULT_CONFIG: RememberConfig = {
	enabled: true,
	scope: "project",
	inject: {
		count: 5,
		highThreshold: 0.6,
	},
};

let embedder: FlagEmbedding | null = null;

function getGlobalRoot(): string {
	return path.join(os.homedir(), ".pi", "agent", "memory");
}

function getModelDir(): string {
	const dir = path.join(getGlobalRoot(), "models");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function getGlobalDbPath(): string {
	const dir = getGlobalRoot();
	fs.mkdirSync(dir, { recursive: true });
	return path.join(dir, "memories.sqlite");
}

function getProjectDbPath(cwd: string): string {
	const dir = path.join(cwd, ".agents", "memory");
	fs.mkdirSync(dir, { recursive: true });
	return path.join(dir, "memories.sqlite");
}

function getStores(cwd: string, scope: Scope): Store[] {
	if (scope === "global") return [{ source: "global", dbPath: getGlobalDbPath() }];
	if (scope === "project") return [{ source: "project", dbPath: getProjectDbPath(cwd) }];
	return [
		{ source: "project", dbPath: getProjectDbPath(cwd) },
		{ source: "global", dbPath: getGlobalDbPath() },
	];
}

function getDb(dbPath: string): Database.Database {
	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("synchronous = NORMAL");
	db.exec(`
		CREATE TABLE IF NOT EXISTS memories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			content TEXT NOT NULL,
			timestamp TEXT NOT NULL,
			embedding BLOB NOT NULL
		)
	`);
	return db;
}

function encodeEmbedding(vec: number[]): Buffer {
	return Buffer.from(new Float32Array(vec).buffer);
}

function decodeEmbedding(blob: Buffer): Float32Array {
	return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedder(): Promise<FlagEmbedding> {
	if (embedder) return embedder;
	embedder = await FlagEmbedding.init({
		model: EmbeddingModel.AllMiniLML6V2,
		executionProviders: [ExecutionProvider.CPU],
		cacheDir: getModelDir(),
		showDownloadProgress: true,
	});
	return embedder;
}

function parseScope(value: unknown): Scope | null {
	if (value === "global" || value === "project" || value === "both") return value;
	return null;
}

function loadConfig(cwd: string): RememberConfig {
	const globalPath = path.join(os.homedir(), ".pi", "agent", "remember.json");
	const projectPath = path.join(cwd, ".agents", "remember.json");

	const base: RememberConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
	for (const p of [globalPath, projectPath]) {
		if (!fs.existsSync(p)) continue;
		try {
			const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<RememberConfig>;
			if (typeof parsed.enabled === "boolean") base.enabled = parsed.enabled;
			const scope = parseScope(parsed.scope);
			if (scope) base.scope = scope;
			if (parsed.inject && typeof parsed.inject === "object") {
				if (typeof parsed.inject.count === "number") base.inject.count = parsed.inject.count;
				if (typeof parsed.inject.highThreshold === "number") base.inject.highThreshold = parsed.inject.highThreshold;
			}
		} catch {
			// Ignore invalid config and keep defaults
		}
	}
	return base;
}

async function embedPassage(text: string): Promise<number[]> {
	const model = await getEmbedder();
	for await (const batch of model.passageEmbed([text], 1)) {
		if (batch[0]) return batch[0];
	}
	throw new Error("Failed to generate embedding");
}

async function embedQuery(text: string): Promise<Float32Array> {
	const model = await getEmbedder();
	const vec = await model.queryEmbed(text);
	return new Float32Array(vec);
}

function readMemories(store: Store): MemoryRow[] {
	if (!fs.existsSync(store.dbPath)) return [];
	const db = getDb(store.dbPath);
	const rows = db.prepare("SELECT id, content, timestamp, embedding FROM memories").all() as MemoryRow[];
	db.close();
	return rows;
}

async function searchMemories(cwd: string, query: string, scope: Scope): Promise<Array<{ id: number; content: string; score: number; source: string }>> {
	const q = query.trim();
	if (!q) return [];
	const qvec = await embedQuery(q);
	const results: Array<{ id: number; content: string; score: number; source: string }> = [];

	for (const store of getStores(cwd, scope)) {
		for (const row of readMemories(store)) {
			const score = cosineSimilarity(qvec, decodeEmbedding(row.embedding));
			results.push({ id: row.id, content: row.content, score, source: store.source });
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results;
}

function listAllMemories(cwd: string, scope: Scope): Array<{ id: number; content: string; timestamp: string; source: string }> {
	const items: Array<{ id: number; content: string; timestamp: string; source: string }> = [];
	for (const store of getStores(cwd, scope)) {
		for (const row of readMemories(store)) {
			items.push({ id: row.id, content: row.content, timestamp: row.timestamp, source: store.source });
		}
	}
	items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
	return items;
}

type MemoryListItem = { id: number; content: string; timestamp: string; source: string };
type RememberManagerAction =
	| { type: "cancel" }
	| { type: "delete"; id: number; source: "global" | "project" }
	| { type: "search" }
	| { type: "add" }
	| { type: "status" }
	| { type: "refresh" };

function formatMemoryLabel(item: MemoryListItem, theme: Theme): string {
	const source = theme.fg("dim", `[${item.source}]`);
	const id = theme.fg("accent", `#${String(item.id)}`);
	const content = item.content.length > 90 ? `${item.content.slice(0, 87)}...` : item.content;
	return `${id} ${source} ${content}`;
}

function deleteMemoryInStore(cwd: string, id: number, source: "global" | "project"): boolean {
	const store = source === "global" ? ({ source: "global", dbPath: getGlobalDbPath() } as Store) : ({ source: "project", dbPath: getProjectDbPath(cwd) } as Store);
	if (!fs.existsSync(store.dbPath)) return false;
	const db = getDb(store.dbPath);
	const before = db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number };
	db.prepare("DELETE FROM memories WHERE id = ?").run(id);
	const after = db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number };
	db.close();
	return before.c !== after.c;
}

async function openRememberManager(ctx: ExtensionCommandContext): Promise<void> {
	while (true) {
		const config = loadConfig(ctx.cwd);
		const all = listAllMemories(ctx.cwd, config.scope);
		const items: SettingItem[] = all.slice(0, 200).map((m) => ({
			id: `${m.source}:${String(m.id)}`,
			label: m.content,
			currentValue: "keep",
			values: ["keep"],
		}));

		const result = await ctx.ui.custom<RememberManagerAction>((tui, theme, _keybindings, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
			container.addChild(new Text(theme.bold(theme.fg("accent", "Remember Manager")), 2, 0));
			container.addChild(new Text(theme.fg("dim", `${all.length} memorie(s) • d delete • s search • a add • r refresh • i status`), 2, 0));
			container.addChild(new Spacer(1));

			const visibleItems: SettingItem[] = items.map((it, idx) => {
				const raw = all[idx];
				if (!raw) return it;
				return { ...it, label: formatMemoryLabel(raw, theme) };
			});

			const list = new SettingsList(
				visibleItems.length > 0
					? visibleItems
					: [{ id: "none", label: theme.fg("dim", "No memories yet."), currentValue: "keep", values: ["keep"] }],
				Math.min(Math.max(visibleItems.length, 1) + 2, 16),
				getSettingsListTheme(),
				() => {},
				() => done({ type: "cancel" }),
				{ enableSearch: visibleItems.length > 8 },
			);
			container.addChild(list);
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("dim", "↑↓ Navigate | d Delete | s Search | a Add | r Refresh | i Status | Esc Cancel"), 2, 0));
			container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

			return {
				render(width) {
					return container.render(width);
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data) {
					const selectedIndex = (list as unknown as { selectedIndex: number }).selectedIndex ?? 0;
					const selected = all[selectedIndex];
					if (data === "d" || data === "D") {
						if (selected) done({ type: "delete", id: selected.id, source: selected.source as "global" | "project" });
						return;
					}
					if (data === "s" || data === "S") {
						done({ type: "search" });
						return;
					}
					if (data === "a" || data === "A") {
						done({ type: "add" });
						return;
					}
					if (data === "r" || data === "R") {
						done({ type: "refresh" });
						return;
					}
					if (data === "i" || data === "I") {
						done({ type: "status" });
						return;
					}
					if (matchesKey(data, Key.escape)) {
						done({ type: "cancel" });
						return;
					}
					list.handleInput?.(data);
					tui.requestRender();
				},
			};
		});

		if (result.type === "cancel") return;
		if (result.type === "refresh") continue;

		if (result.type === "status") {
			ctx.ui.notify(
				`enabled=${String(config.enabled)} scope=${config.scope} inject.count=${String(config.inject.count)} highThreshold=${String(config.inject.highThreshold)}\nprojectDB=${getProjectDbPath(ctx.cwd)}\nglobalDB=${getGlobalDbPath()}\nmodelDir=${getModelDir()}`,
				"info",
			);
			continue;
		}

		if (result.type === "search") {
			const q = await ctx.ui.input("Search memories", "Natural language query");
			if (!q?.trim()) continue;
			const results = await searchMemories(ctx.cwd, q, config.scope);
			const lines = results.slice(0, 15).map((r) => `id=${r.id} [${r.score.toFixed(3)}] [${r.source}] ${r.content}`);
			ctx.ui.notify(lines.length ? lines.join("\n") : "No matches.", "info");
			continue;
		}

		if (result.type === "add") {
			const text = await ctx.ui.input("Add memory", "One factual sentence");
			if (!text?.trim()) continue;
			const global = config.scope === "both" ? await ctx.ui.confirm("Store", "Store in global scope? (No = project)") : config.scope === "global";
			const store = global ? ({ source: "global", dbPath: getGlobalDbPath() } as Store) : ({ source: "project", dbPath: getProjectDbPath(ctx.cwd) } as Store);
			const db = getDb(store.dbPath);
			const emb = await embedPassage(text.trim());
			const inserted = db.prepare("INSERT INTO memories (content, timestamp, embedding) VALUES (?, ?, ?)").run(text.trim(), new Date().toISOString(), encodeEmbedding(emb));
			db.close();
			ctx.ui.notify(`Remembered id=${String(inserted.lastInsertRowid)} [${store.source}]`, "info");
			continue;
		}

		if (result.type === "delete") {
			const ok = await ctx.ui.confirm("Forget memory", `Delete id=${String(result.id)} from ${result.source}?`);
			if (!ok) continue;
			const deleted = deleteMemoryInStore(ctx.cwd, result.id, result.source);
			ctx.ui.notify(deleted ? `Forgot id=${String(result.id)} from ${result.source}.` : `Memory id=${String(result.id)} not found in ${result.source}.`, deleted ? "info" : "warning");
		}
	}
}

export default function piRememberExtension(pi: ExtensionAPI): void {
	pi.registerCommand("remember", {
		description: "Open memory manager UI. Arguments: list | search <query> | forget <id>",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				if (!ctx.hasUI) {
					ctx.ui.notify("Use /remember list | /remember search <query> | /remember forget <id>", "info");
					return;
				}
				await openRememberManager(ctx);
				return;
			}
			const [cmd, ...rest] = trimmed.split(/\s+/);
			const sub = (cmd ?? "").toLowerCase();
			const config = loadConfig(ctx.cwd);
			if (sub === "list") {
				const all = listAllMemories(ctx.cwd, config.scope);
				const lines = all.slice(0, 50).map((m) => `id=${m.id} [${m.source}] ${m.content}`);
				ctx.ui.notify(lines.length ? lines.join("\n") : "No memories stored.", "info");
				return;
			}
			if (sub === "search") {
				const q = rest.join(" ").trim();
				if (!q) {
					ctx.ui.notify("Usage: /remember search <query>", "warning");
					return;
				}
				const results = await searchMemories(ctx.cwd, q, config.scope);
				const lines = results.slice(0, 10).map((r) => `id=${r.id} [${r.score.toFixed(3)}] [${r.source}] ${r.content}`);
				ctx.ui.notify(lines.length ? lines.join("\n") : "No matches.", "info");
				return;
			}
			if (sub === "forget") {
				const id = Number(rest[0]);
				if (!Number.isFinite(id)) {
					ctx.ui.notify("Usage: /remember forget <id>", "warning");
					return;
				}
				const db = getDb(getProjectDbPath(ctx.cwd));
				db.prepare("DELETE FROM memories WHERE id = ?").run(id);
				db.close();
				ctx.ui.notify(`Deleted id=${id} from project store (if present).`, "info");
				return;
			}
			ctx.ui.notify("Unknown subcommand. Use: list | search | forget", "warning");
		},
	});

	pi.registerTool({
		name: "remember",
		label: "Remember",
		description: "Store one factual memory sentence for future semantic recall.",
		parameters: Type.Object({
			memory: Type.String({ description: "A short factual sentence to remember" }),
			global: Type.Optional(Type.Boolean({ description: "If true, force global store" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) return { content: [{ type: "text", text: "Remember plugin is disabled." }], details: {} };

			const text = params.memory.trim();
			if (!text) throw new Error("Memory cannot be empty");

			const store = params.global
				? ({ source: "global", dbPath: getGlobalDbPath() } as Store)
				: config.scope === "global"
					? ({ source: "global", dbPath: getGlobalDbPath() } as Store)
					: ({ source: "project", dbPath: getProjectDbPath(ctx.cwd) } as Store);

			const db = getDb(store.dbPath);
			const emb = await embedPassage(text);
			const stmt = db.prepare("INSERT INTO memories (content, timestamp, embedding) VALUES (?, ?, ?)");
			const result = stmt.run(text, new Date().toISOString(), encodeEmbedding(emb));
			db.close();

			return {
				content: [{ type: "text", text: `Remembered id=${String(result.lastInsertRowid)} [${store.source}] ${text}` }],
				details: { id: result.lastInsertRowid, source: store.source },
			};
		},
	});

	pi.registerTool({
		name: "recall",
		label: "Recall",
		description: "Search semantic long-term memories by natural language query.",
		parameters: Type.Object({
			query: Type.String({ description: "Natural language query" }),
			limit: Type.Optional(Type.Number({ description: "Max results (default 5, max 20)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const config = loadConfig(ctx.cwd);
			if (!config.enabled) return { content: [{ type: "text", text: "Remember plugin is disabled." }], details: {} };

			const results = await searchMemories(ctx.cwd, params.query, config.scope);
			if (!results.length) return { content: [{ type: "text", text: "No memories found." }], details: {} };
			const limit = Math.max(1, Math.min(params.limit ?? 5, 20));
			const lines = results.slice(0, limit).map((r, i) => `${i + 1}. id=${r.id} [${r.score.toFixed(3)}] [${r.source}] ${r.content}`);
			return { content: [{ type: "text", text: lines.join("\n") }], details: { count: lines.length } };
		},
	});

	pi.registerTool({
		name: "forget",
		label: "Forget",
		description: "Delete a memory by ID from project or global store.",
		parameters: Type.Object({
			id: Type.Number({ description: "Memory ID" }),
			global: Type.Optional(Type.Boolean({ description: "Delete from global store" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const store = params.global
				? ({ source: "global", dbPath: getGlobalDbPath() } as Store)
				: ({ source: "project", dbPath: getProjectDbPath(ctx.cwd) } as Store);
			if (!fs.existsSync(store.dbPath)) return { content: [{ type: "text", text: "No memory store found." }], details: {} };

			const db = getDb(store.dbPath);
			const before = db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number };
			db.prepare("DELETE FROM memories WHERE id = ?").run(params.id);
			const after = db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number };
			db.close();

			if (before.c === after.c) return { content: [{ type: "text", text: `Memory id=${params.id} not found in ${store.source}.` }], details: {} };
			return { content: [{ type: "text", text: `Forgot id=${params.id} from ${store.source}.` }], details: {} };
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const config = loadConfig(ctx.cwd);
		if (!config.enabled) return undefined;
		const query = event.prompt.slice(0, 500);
		const results = await searchMemories(ctx.cwd, query, config.scope);
		const picked = results.filter((r) => r.score >= 0.3).slice(0, config.inject.count);
		if (!picked.length) return undefined;
		const lines = picked.map((r) => {
			const tag = r.score >= config.inject.highThreshold ? "[important]" : "[related]";
			const sourceTag = config.scope === "both" ? ` [${r.source}]` : "";
			return `${tag}${sourceTag} ${r.content}`;
		});
		const block = `<user_memories>\n${lines.join("\n")}\n</user_memories>`;
		return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
	});
}
