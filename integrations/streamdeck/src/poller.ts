import streamDeck from "@elgato/streamdeck";

import { DEFAULT_BASE_URL, fetchUsage, type ApiStatus } from "./client/openusage";
import type { ProviderSnapshot } from "./types";

type Listener = () => void;

/**
 * A single shared poller for the whole plugin. Every action subscribes to it,
 * so we make exactly one HTTP request per interval regardless of how many
 * dials/keys are on the device. Stops polling when nobody is listening.
 */
class UsagePoller {
	status: ApiStatus = "offline";
	baseUrl = DEFAULT_BASE_URL;
	intervalMs = 15_000;

	private timer?: ReturnType<typeof setInterval>;
	private readonly listeners = new Set<Listener>();
	private readonly snapshots = new Map<string, ProviderSnapshot>();
	private orderedIds: string[] = [];
	private inFlight = false;

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		this.ensureRunning();
		void this.refreshNow();
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.stop();
			}
		};
	}

	configure(opts: { baseUrl?: string; intervalMs?: number }): void {
		let changed = false;
		if (opts.baseUrl && opts.baseUrl !== this.baseUrl) {
			this.baseUrl = opts.baseUrl;
			changed = true;
		}
		if (opts.intervalMs && opts.intervalMs !== this.intervalMs) {
			this.intervalMs = opts.intervalMs;
			changed = true;
		}
		if (changed && this.timer) {
			this.stop();
			this.ensureRunning();
			void this.refreshNow();
		}
	}

	get(providerId: string): ProviderSnapshot | undefined {
		return this.snapshots.get(providerId);
	}

	/** Providers in the order OpenUsage returned them (respects user's plugin ordering). */
	get providers(): ProviderSnapshot[] {
		return this.orderedIds
			.map((id) => this.snapshots.get(id))
			.filter((p): p is ProviderSnapshot => p !== undefined);
	}

	async refreshNow(): Promise<void> {
		if (this.inFlight) return;
		this.inFlight = true;
		try {
			const result = await fetchUsage(this.baseUrl);

			// On `busy`, keep the previous data and status untouched (transient 503).
			if (result.status === "busy") return;

			this.status = result.status;

			// Only replace cached data when we actually got a fresh successful read.
			// On `offline` we keep the last-known values so dials can render them dimmed.
			if (result.status === "online" || result.status === "empty") {
				this.snapshots.clear();
				this.orderedIds = [];
				for (const p of result.providers) {
					this.snapshots.set(p.providerId, p);
					this.orderedIds.push(p.providerId);
				}
			}

			this.notify();
		} finally {
			this.inFlight = false;
		}
	}

	private ensureRunning(): void {
		if (this.timer) return;
		this.timer = setInterval(() => void this.refreshNow(), this.intervalMs);
	}

	private stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (err) {
				streamDeck.logger.error("Usage listener failed", err);
			}
		}
	}
}

export const poller = new UsagePoller();
