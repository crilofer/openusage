// Shared discovery of OpenUsage providers from the surrounding repo.
// Used by the icon bundler and the coverage test so they agree on the source.
//
// Auto-detects either edition's layout:
//   - Swift: Sources/OpenUsage/Providers/<Name>/<Name>Provider.swift  (Provider(id: "…"))
//            Sources/OpenUsage/Resources/ProviderIcons/<id>.svg
//   - Tauri: plugins/<id>/plugin.json + plugins/<id>/icon.svg

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const pluginRoot = resolve(here, ".."); // integrations/streamdeck
export const repoRoot = resolve(pluginRoot, "..", ".."); // repo root

const swiftIconsDir = join(repoRoot, "Sources", "OpenUsage", "Resources", "ProviderIcons");
const swiftProvidersDir = join(repoRoot, "Sources", "OpenUsage", "Providers");
const tauriPluginsDir = join(repoRoot, "plugins");

/** Provider icons available to bundle: `{ id, svg }[]`. */
export function collectProviders() {
	if (existsSync(swiftIconsDir)) {
		return readdirSync(swiftIconsDir)
			.filter((f) => f.endsWith(".svg") && f !== "openusage.svg") // openusage.svg is the app mark
			.map((f) => ({ id: f.replace(/\.svg$/, ""), svg: readFileSync(join(swiftIconsDir, f), "utf8") }));
	}

	if (existsSync(tauriPluginsDir)) {
		const out = [];
		for (const entry of readdirSync(tauriPluginsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const dir = join(tauriPluginsDir, entry.name);
			let manifest;
			try {
				manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8"));
			} catch {
				continue;
			}
			let svg;
			try {
				svg = readFileSync(join(dir, "icon.svg"), "utf8");
			} catch {
				continue;
			}
			out.push({ id: manifest.id ?? entry.name, svg });
		}
		return out;
	}

	return [];
}

/** Provider ids the OpenUsage app actually supports (independent of icons). */
export function supportedProviderIds() {
	if (existsSync(swiftProvidersDir)) {
		const ids = new Set();
		for (const entry of readdirSync(swiftProvidersDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const dir = join(swiftProvidersDir, entry.name);
			for (const f of readdirSync(dir)) {
				if (!f.endsWith("Provider.swift")) continue;
				const match = readFileSync(join(dir, f), "utf8").match(/Provider\(\s*id:\s*"([^"]+)"/);
				if (match) ids.add(match[1]);
			}
		}
		return [...ids];
	}

	if (existsSync(tauriPluginsDir)) {
		const ids = [];
		for (const entry of readdirSync(tauriPluginsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			try {
				const manifest = JSON.parse(readFileSync(join(tauriPluginsDir, entry.name, "plugin.json"), "utf8"));
				ids.push(manifest.id ?? entry.name);
			} catch {
				// not a provider plugin
			}
		}
		return ids;
	}

	return [];
}
