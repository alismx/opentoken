// Docker filter — build/pull/push output compression
// Strips progress bars, layer hashes, extraction status
// Guard: only applies to docker build/pull/push subcommands to avoid
// eating app log output from docker logs / docker run

const PROGRESS_PATTERNS = [
	/^#\d+/,
	/Downloading/,
	/Extracting/,
	/Waiting/,
	/^\s*$/,
];

export function filterDockerOutput(command: string, output: string): string {
	// docker ps — strip verbose columns, keep NAMES + IMAGE + STATUS
	if (/^\s*docker\s+ps\b/.test(command)) {
		const lines = output.split("\n");
		if (lines.length <= 1) return output;
		// Find header line to determine column positions
		const header = lines[0];
		const nameCol = header.indexOf("NAMES");
		const imageCol = header.indexOf("IMAGE");
		const statusCol = header.indexOf("STATUS");
		if (nameCol === -1) return output;
		const result = ["IMAGE | STATUS | NAMES"];
		for (let i = 1; i < lines.length; i++) {
			const l = lines[i];
			if (!l.trim()) continue;
			const image =
				imageCol >= 0 ? l.substring(imageCol, imageCol + 24).trim() : "";
			const status =
				statusCol >= 0 ? l.substring(statusCol, statusCol + 20).trim() : "";
			const name = nameCol >= 0 ? l.substring(nameCol).trim() : l.trim();
			result.push(`${image} | ${status} | ${name}`);
		}
		return result.join("\n");
	}

	// docker images — strip IMAGE ID, keep REPOSITORY + TAG + SIZE
	if (/^\s*docker\s+images\b/.test(command)) {
		const lines = output.split("\n");
		if (lines.length <= 1) return output;
		const header = lines[0];
		const repoCol = header.indexOf("REPOSITORY");
		const sizeCol = header.indexOf("SIZE");
		if (repoCol === -1) return output;
		const result = ["REPOSITORY | TAG | SIZE"];
		for (let i = 1; i < lines.length; i++) {
			const l = lines[i];
			if (!l.trim()) continue;
			const repo = l.substring(repoCol, repoCol + 30).trim();
			const size = sizeCol >= 0 ? l.substring(sizeCol).trim() : "";
			result.push(`${repo} | ${size}`);
		}
		return result.join("\n");
	}

	// Guard: only compress build/pull/push subcommands
	// This prevents erasing app log output from docker logs / docker run / docker exec
	if (!/^\s*docker\s+(build|pull|push)\b/.test(command)) return output;

	const lines = output.split("\n");
	const result: string[] = [];

	for (const line of lines) {
		// Keep error/fatal lines
		if (/error|fatal|failed|Error|FAILED/i.test(line)) {
			result.push(line);
			continue;
		}
		// Keep final tagged image line
		if (/Successfully\s+(built|tagged)/i.test(line)) {
			result.push(line);
			continue;
		}
		// Strip progress lines
		if (PROGRESS_PATTERNS.some((p) => p.test(line))) continue;
		// Keep anything left (safety net — err on the side of keeping)
		if (line.trim()) {
			result.push(line);
		}
	}

	if (result.length === 0) {
		return "(docker output compressed — all layers cached, no errors)";
	}
	return result.join("\n");
}
