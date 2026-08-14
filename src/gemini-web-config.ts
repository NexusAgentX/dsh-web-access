import { existsSync, readFileSync } from "node:fs";
import { getWebSearchConfigPath } from "./utils.ts";
import { providerConfigEpoch } from "./provider-config-epoch.ts";

function configPath(): string { return getWebSearchConfigPath(); }

interface GeminiWebConfig {
	chromeProfile?: string;
	allowBrowserCookies?: boolean;
}

let cachedConfigEpoch = -1;
let cachedConfig: GeminiWebConfig | null = null;

export function normalizeChromeProfile(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
}

function loadConfig(): GeminiWebConfig {
	if (cachedConfig && cachedConfigEpoch === providerConfigEpoch()) return cachedConfig;
	cachedConfigEpoch = providerConfigEpoch();
	if (!existsSync(configPath())) {
		cachedConfig = {};
		return cachedConfig;
	}

	const rawText = readFileSync(configPath(), "utf-8");
	let raw: { chromeProfile?: unknown; allowBrowserCookies?: unknown };
	try {
		raw = JSON.parse(rawText) as { chromeProfile?: unknown; allowBrowserCookies?: unknown };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${configPath()}: ${message}`);
	}

	cachedConfig = {
		chromeProfile: normalizeChromeProfile(raw.chromeProfile),
		allowBrowserCookies: raw.allowBrowserCookies === true,
	};
	return cachedConfig;
}

export function getChromeProfileFromConfig(): string | undefined {
	return loadConfig().chromeProfile;
}

export function isBrowserCookieAccessAllowed(): boolean {
	if (process.env.PI_ALLOW_BROWSER_COOKIES === "1" || process.env.FEYNMAN_ALLOW_BROWSER_COOKIES === "1") {
		return true;
	}
	return loadConfig().allowBrowserCookies === true;
}
