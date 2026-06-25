import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { ProviderDialAction } from "./actions/provider-dial";
import { ProviderKeyAction } from "./actions/provider-key";
import { DEFAULT_BASE_URL } from "./client/openusage";
import { poller } from "./poller";

type GlobalSettings = {
	baseUrl?: string;
	intervalSeconds?: number;
};

streamDeck.logger.setLevel(LogLevel.INFO);

function applyGlobalSettings(settings: GlobalSettings): void {
	poller.configure({
		baseUrl: settings.baseUrl?.trim() || DEFAULT_BASE_URL,
		intervalMs: Math.max(5, settings.intervalSeconds ?? 15) * 1000,
	});
}

// Use the settings from the event — never call getGlobalSettings() here, or the
// reply (a didReceiveGlobalSettings event) would re-enter this handler forever.
streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	applyGlobalSettings(ev.settings);
});

streamDeck.actions.registerAction(new ProviderDialAction());
streamDeck.actions.registerAction(new ProviderKeyAction());

await streamDeck.connect();
// One-time fetch at startup (outside the handler, so it can't loop).
applyGlobalSettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
