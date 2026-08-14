import { existsSync, readFileSync } from "node:fs";
import { getWebSearchConfigPath } from "./utils.ts";

function configPath(): string { return getWebSearchConfigPath(); }

type FeatureConfig = { image?: { enabled?: unknown } };

function loadFeatureConfig(): FeatureConfig {
	if (!existsSync(configPath())) return {};
	try {
		const raw: unknown = JSON.parse(readFileSync(configPath(), "utf-8"));
		return raw && typeof raw === "object" ? raw as FeatureConfig : {};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${configPath()}: ${message}`);
	}
}

export function isImageEnabled(): boolean {
	return loadFeatureConfig().image?.enabled !== false;
}

export function canAttachImages(): boolean {
	try {
		return isImageEnabled();
	} catch {
		return false;
	}
}
