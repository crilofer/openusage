import streamDeck, { type Action, type JsonObject, type JsonValue, type SendToPluginEvent } from "@elgato/streamdeck";

import { ALL_BARS, progressLines, resolveMetric, selectableLines } from "./metrics";
import { poller } from "./poller";
import type { ProviderSnapshot } from "./types";

type DataSourceItem = {
	label: string;
	value: string;
};

function providerItems(): DataSourceItem[] {
	return poller.providers.map((p) => ({ label: p.displayName, value: p.providerId }));
}

/** Builds the Metric dropdown items for a provider, incl. the stacked "All usage bars" option. */
function metricItems(provider: ProviderSnapshot | undefined): DataSourceItem[] {
	if (!provider) return [];

	const items: DataSourceItem[] = selectableLines(provider).map((line, index) => {
		const m = resolveMetric(line);
		return { label: m.valueText ? `${line.label} — ${m.valueText}` : line.label, value: String(index) };
	});

	if (progressLines(provider).length >= 2) {
		items.unshift({ label: "All usage bars (stacked)", value: ALL_BARS });
	}
	return items;
}

/** The only working channel to the PI in this SDK is `streamDeck.ui.current`. */
function sendItems(event: string, items: DataSourceItem[]): Promise<void> | undefined {
	return streamDeck.ui.current?.sendToPropertyInspector({ event, items });
}

/**
 * Responds to sdpi-components `datasource` refresh requests (the reload button).
 * The initial population is handled by {@link pushProvidersAndMetrics} on PI appear,
 * because a fast datasource reply can land before `streamDeck.ui.current` is set and
 * gets silently dropped — which left the Metric select spinning forever.
 */
export async function handlePropertyInspectorMessage<T extends JsonObject>(
	ev: SendToPluginEvent<JsonValue, T>,
): Promise<void> {
	const payload = ev.payload as { event?: string } | undefined;
	if (!payload?.event) return;

	if (payload.event === "getProviders") {
		await poller.refreshNow();
		await sendItems("getProviders", providerItems());
		return;
	}

	if (payload.event === "getMetrics") {
		const settings = (await ev.action.getSettings()) as { providerId?: string };
		const provider = settings.providerId ? poller.get(settings.providerId) : undefined;
		await sendItems("getMetrics", metricItems(provider));
	}
}

/**
 * Populate both dropdowns once the PI is open (ui.current is guaranteed set here).
 * Safe to call getSettings here — we are NOT inside onDidReceiveSettings.
 */
export async function pushProvidersAndMetrics<T extends JsonObject>(action: Action<T>): Promise<void> {
	await poller.refreshNow();
	await sendItems("getProviders", providerItems());
	const settings = (await action.getSettings()) as { providerId?: string };
	pushMetrics(settings.providerId);
}

/**
 * Refresh just the Metric dropdown — used when the selected provider changes.
 * Takes providerId directly (never calls getSettings) so it is safe to invoke
 * from onDidReceiveSettings without triggering a getSettings→didReceiveSettings loop.
 */
export function pushMetrics(providerId?: string): Promise<void> | undefined {
	const provider = providerId ? poller.get(providerId) : undefined;
	return sendItems("getMetrics", metricItems(provider));
}
