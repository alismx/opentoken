import os from "node:os";
import path from "node:path";

export function getConfigDir(): string {
	if (process.platform === "win32") {
		return path.join(
			process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
			"opentoken",
		);
	}
	const xdg = process.env.XDG_CONFIG_HOME;
	if (xdg) return path.join(xdg, "opentoken");
	return path.join(os.homedir(), ".config", "opentoken");
}

export function getDataDir(): string {
	if (process.platform === "win32") {
		return path.join(
			process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
			"opentoken",
		);
	}
	const xdg = process.env.XDG_DATA_HOME;
	if (xdg) return path.join(xdg, "opentoken");
	return path.join(os.homedir(), ".local", "share", "opentoken");
}
