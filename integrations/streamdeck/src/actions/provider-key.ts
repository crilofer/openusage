import {
	action,
	type KeyAction,
	type KeyDownEvent,
	type DidReceiveSettingsEvent,
	type JsonValue,
	type PropertyInspectorDidAppearEvent,
	SingletonAction,
	type SendToPluginEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { PROVIDER_ICON_DATA } from "../generated/provider-icons";
import { ALL_BARS, colorForPct, formatResetIn, resolveMetric, selectableLines, viewTokens } from "../metrics";
import { poller } from "../poller";
import { handlePropertyInspectorMessage, pushMetrics, pushProvidersAndMetrics } from "../property-inspector";
import { buildBars, renderKeyImage } from "../render/tiles";

type KeySettings = {
	providerId?: string;
	lineIndex?: number | string;
};

@action({ UUID: "ai.openusage.streamdeck.key" })
export class ProviderKeyAction extends SingletonAction<KeySettings> {
	private readonly unsubscribers = new Map<string, () => void>();

	override onWillAppear(ev: WillAppearEvent<KeySettings>): void {
		if (!ev.action.isKey()) return;
		const key = ev.action;
		const unsubscribe = poller.subscribe(() => void this.render(key));
		this.unsubscribers.set(key.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent<KeySettings>): void {
		this.unsubscribers.get(ev.action.id)?.();
		this.unsubscribers.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): Promise<void> {
		// Use the settings from the event — never call getSettings() here, or the
		// reply (a didReceiveSettings event) would re-enter this handler forever.
		if (ev.action.isKey()) await this.render(ev.action, ev.payload.settings);
		await pushMetrics(ev.payload.settings.providerId);
	}

	override async onPropertyInspectorDidAppear(
		ev: PropertyInspectorDidAppearEvent<KeySettings>,
	): Promise<void> {
		await pushProvidersAndMetrics(ev.action);
	}

	/** Press cycles to the next metric of the same provider. */
	override async onKeyDown(ev: KeyDownEvent<KeySettings>): Promise<void> {
		const provider = ev.payload.settings.providerId
			? poller.get(ev.payload.settings.providerId)
			: undefined;
		if (!provider) {
			await poller.refreshNow();
			return;
		}

		const tokens = viewTokens(provider);
		let updated = ev.payload.settings;
		if (tokens.length > 1) {
			const current = String(ev.payload.settings.lineIndex ?? tokens[0]);
			const idx = Math.max(0, tokens.indexOf(current));
			const next = tokens[(idx + 1) % tokens.length];
			updated = { ...ev.payload.settings, lineIndex: next };
			await ev.action.setSettings(updated);
		}
		await this.render(ev.action, updated);
	}

	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, KeySettings>): Promise<void> {
		return handlePropertyInspectorMessage(ev);
	}

	private async render(key: KeyAction<KeySettings>, knownSettings?: KeySettings): Promise<void> {
		// Prefer event-provided settings; only fall back to getSettings() when called
		// outside a settings event (e.g. the periodic poller tick).
		const settings: KeySettings = knownSettings ?? (await key.getSettings());

		if (!settings.providerId) {
			await key.setImage(
				renderKeyImage({ title: "OpenUsage", metric: "", valueText: "Setup", color: "#2563eb" }),
			);
			return;
		}

		const provider = poller.get(settings.providerId);
		const offline = poller.status === "offline";

		if (!provider) {
			await key.setImage(
				renderKeyImage({
					title: settings.providerId,
					metric: offline ? "open app" : "no data",
					valueText: "—",
					color: "#71717a",
					offline,
				}),
			);
			return;
		}

		const logo = PROVIDER_ICON_DATA[provider.providerId];

		if (settings.lineIndex === ALL_BARS) {
			await key.setImage(
				renderKeyImage({
					title: provider.displayName,
					metric: "",
					valueText: "",
					color: "#3b82f6",
					offline,
					logo,
					bars: buildBars(provider),
				}),
			);
			return;
		}

		const lines = selectableLines(provider);
		const index = lines.length > 0 ? Math.min(Number(settings.lineIndex ?? 0), lines.length - 1) : 0;
		const metric = lines.length > 0 ? resolveMetric(lines[index]) : undefined;
		const color =
			metric?.pct !== undefined ? colorForPct(metric.pct, metric.color) : metric?.color || "#3b82f6";

		await key.setImage(
			renderKeyImage({
				title: provider.displayName,
				metric: metric?.label ?? "",
				valueText: metric?.valueText ?? "—",
				pct: metric?.pct,
				color,
				offline,
				reset: formatResetIn(metric?.resetsAt),
				logo,
			}),
		);
	}
}
