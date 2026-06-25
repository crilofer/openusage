import streamDeck, {
	action,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	type DidReceiveSettingsEvent,
	type JsonValue,
	type PropertyInspectorDidAppearEvent,
	SingletonAction,
	type SendToPluginEvent,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { PROVIDER_ICON_DATA } from "../generated/provider-icons";
import { ALL_BARS, colorForPct, formatResetIn, resolveMetric, selectableLines, viewTokens } from "../metrics";
import { poller } from "../poller";
import { handlePropertyInspectorMessage, pushMetrics, pushProvidersAndMetrics } from "../property-inspector";
import { buildBars, renderDialImage } from "../render/tiles";

type DialSettings = {
	providerId?: string;
	/** Index into selectableLines(provider). Stored as string by the PI select. */
	lineIndex?: number | string;
};

@action({ UUID: "ai.openusage.streamdeck.dial" })
export class ProviderDialAction extends SingletonAction<DialSettings> {
	private readonly unsubscribers = new Map<string, () => void>();

	override onWillAppear(ev: WillAppearEvent<DialSettings>): void {
		if (!ev.action.isDial()) return;
		const dial = ev.action;
		void dial.setFeedbackLayout("layouts/full.json");
		const unsubscribe = poller.subscribe(() => void this.render(dial));
		this.unsubscribers.set(dial.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent<DialSettings>): void {
		this.unsubscribers.get(ev.action.id)?.();
		this.unsubscribers.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<DialSettings>): Promise<void> {
		// Use the settings from the event — never call getSettings() here, or the
		// reply (a didReceiveSettings event) would re-enter this handler forever.
		if (ev.action.isDial()) await this.render(ev.action, ev.payload.settings);
		await pushMetrics(ev.payload.settings.providerId);
	}

	override async onPropertyInspectorDidAppear(
		ev: PropertyInspectorDidAppearEvent<DialSettings>,
	): Promise<void> {
		await pushProvidersAndMetrics(ev.action);
	}

	override async onDialRotate(ev: DialRotateEvent<DialSettings>): Promise<void> {
		const provider = ev.payload.settings.providerId
			? poller.get(ev.payload.settings.providerId)
			: undefined;
		if (!provider) return;

		const tokens = viewTokens(provider);
		if (tokens.length === 0) return;

		const current = String(ev.payload.settings.lineIndex ?? tokens[0]);
		const idx = Math.max(0, tokens.indexOf(current));
		const step = ev.payload.ticks >= 0 ? 1 : -1;
		const next = tokens[(idx + step + tokens.length) % tokens.length];

		const updated = { ...ev.payload.settings, lineIndex: next };
		await ev.action.setSettings(updated);
		await this.render(ev.action, updated);
	}

	override async onDialDown(ev: DialDownEvent<DialSettings>): Promise<void> {
		await poller.refreshNow();
		await this.render(ev.action, ev.payload.settings);
	}

	override async onTouchTap(_ev: TouchTapEvent<DialSettings>): Promise<void> {
		await streamDeck.system.openUrl("https://openusage.ai");
	}

	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, DialSettings>): Promise<void> {
		return handlePropertyInspectorMessage(ev);
	}

	private async render(dial: DialAction<DialSettings>, knownSettings?: DialSettings): Promise<void> {
		// Prefer event-provided settings; only fall back to getSettings() when called
		// outside a settings event (e.g. the periodic poller tick).
		const settings: DialSettings = knownSettings ?? (await dial.getSettings());

		if (!settings.providerId) {
			await dial.setFeedback({
				canvas: renderDialImage({ title: "OpenUsage", metric: "Pick a provider", valueText: "Setup", color: "#2563eb" }),
			});
			return;
		}

		const provider = poller.get(settings.providerId);
		const offline = poller.status === "offline";

		if (!provider) {
			await dial.setFeedback({
				canvas: renderDialImage({
					title: settings.providerId,
					metric: offline ? "open app" : "no data",
					valueText: "—",
					color: "#71717a",
					offline,
				}),
			});
			return;
		}

		const logo = PROVIDER_ICON_DATA[provider.providerId];

		if (settings.lineIndex === ALL_BARS) {
			await dial.setFeedback({
				canvas: renderDialImage({
					title: provider.displayName,
					metric: "",
					valueText: "",
					color: "#3b82f6",
					offline,
					logo,
					bars: buildBars(provider),
				}),
			});
			return;
		}

		const lines = selectableLines(provider);
		const metric = lines.length > 0
			? resolveMetric(lines[Math.min(Number(settings.lineIndex ?? 0), lines.length - 1)])
			: undefined;
		const color =
			metric?.pct !== undefined ? colorForPct(metric.pct, metric.color) : metric?.color || "#3b82f6";

		await dial.setFeedback({
			canvas: renderDialImage({
				title: provider.displayName,
				metric: metric?.label ?? "",
				valueText: metric?.valueText ?? "—",
				pct: metric?.pct,
				color,
				offline,
				reset: formatResetIn(metric?.resetsAt),
				logo,
			}),
		});
	}
}
