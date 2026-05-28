#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOGO = "\u{1F33A} opentoken-mcp";
const BUN_PATHS = [
	"/home/linuxbrew/.linuxbrew/bin/bun",
	process.env.BUN_EXECUTABLE,
	"bun",
].filter(Boolean);
const ALT_RUNNERS = ["tsx", "ts-node"];

function which(cmd) {
	try {
		return realpathSync(
			execSync(`which ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
				.toString()
				.trim(),
		);
	} catch {
		return null;
	}
}

function findBun() {
	for (const c of BUN_PATHS) {
		if (!c) continue;
		try {
			if (existsSync(c) && statSync(c).isFile()) return realpathSync(c);
		} catch {}
	}
	return which("bun");
}

function findAltRunner() {
	for (const r of ALT_RUNNERS) {
		const found = which(r);
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
			`${LOGO}  ERROR: bun is required. Install: curl -fsSL https://bun.sh/install | bash\n`,
		);
		setTimeout(() => process.exit(1), 3000);
	}
}
