#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOGO = "\u{1F33A} opentoken-mcp";
const isWin = process.platform === "win32";
const ALT_RUNNERS = ["tsx", "ts-node"];

function findInPath(cmd) {
	try {
		const sep = isWin ? ";" : ":";
		const pathDirs = (process.env.PATH || "").split(sep);
		for (const dir of pathDirs) {
			const exts = isWin ? [".exe", ".cmd", ".bat", ""] : [""];
			for (const ext of exts) {
				const candidate = join(dir, cmd + ext);
				try {
					if (existsSync(candidate) && statSync(candidate).isFile())
						return candidate;
				} catch {}
			}
		}
	} catch {}
	return null;
}

function findBun() {
	if (isWin) {
		const candidates = [
			join(process.env.APPDATA || "", "npm", "bun.exe"),
			join(process.env.LOCALAPPDATA || "", "bun", "bun.exe"),
			join("C:\\Users", process.env.USERNAME || "", ".bun", "bin", "bun.exe"),
		];
		for (const p of candidates) {
			try {
				if (existsSync(p) && statSync(p).isFile()) return p;
			} catch {}
		}
	} else {
		const candidates = [
			"/opt/homebrew/bin/bun",
			"/usr/local/bin/bun",
			join(process.env.HOME || "", ".bun", "bin", "bun"),
		];
		for (const p of candidates) {
			try {
				if (existsSync(p) && statSync(p).isFile()) return p;
			} catch {}
		}
	}
	if (process.env.BUN_EXECUTABLE) {
		try {
			const p = process.env.BUN_EXECUTABLE;
			if (existsSync(p)) return p;
		} catch {}
	}
	return findInPath("bun");
}

function findAltRunner() {
	for (const runner of ALT_RUNNERS) {
		const found = findInPath(runner);
		if (found) return found;
	}
	return null;
}

function findServerEntry(scriptDir) {
	const candidates = [
		resolve(scriptDir, "../src/server.ts"),
		resolve(scriptDir, "../../src/server.ts"),
	];
	for (const c of candidates) {
		try {
			if (existsSync(c)) return c;
		} catch {}
	}
	return null;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const entry = findServerEntry(scriptDir);

if (!entry) {
	process.stderr.write(
		`${LOGO}  ERROR: cannot locate src/server.ts from ${scriptDir}\n`,
	);
	process.exit(1);
}

const bunBin = findBun();
if (bunBin) {
	const child = spawn(bunBin, ["run", entry], {
		stdio: "inherit",
		env: process.env,
	});
	child.on("exit", (code) => process.exit(code ?? 1));
} else {
	const alt = findAltRunner();
	if (alt) {
		process.stderr.write(
			`${LOGO}  using ${alt} fallback (install bun for faster startup)\n`,
		);
		const child = spawn(alt, [entry], { stdio: "inherit", env: process.env });
		child.on("exit", (code) => process.exit(code ?? 1));
	} else {
		process.stderr.write(
			`${LOGO}  ERROR: bun is required. Install: https://bun.sh\n`,
		);
		setTimeout(() => process.exit(1), 3000);
	}
}
