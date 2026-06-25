import type { ProviderSnapshot } from "../types";

export const DEFAULT_BASE_URL = "http://127.0.0.1:6736";

/**
 * - `online`  app reachable, returned at least one provider
 * - `empty`   app reachable, but no cached snapshots yet
 * - `busy`    app returned 503 (server_busy) — transient, keep previous data
 * - `offline` app not reachable or returned an error
 */
export type ApiStatus = "online" | "empty" | "busy" | "offline";

export interface UsageResult {
	status: ApiStatus;
	providers: ProviderSnapshot[];
}

/** Fetch the full usage collection. Never throws — failures map to a status. */
export async function fetchUsage(baseUrl: string, signal?: AbortSignal): Promise<UsageResult> {
	try {
		const res = await fetch(`${baseUrl}/v1/usage`, {
			signal,
			headers: { Accept: "application/json" },
		});

		if (res.status === 503) {
			return { status: "busy", providers: [] };
		}
		if (!res.ok) {
			return { status: "offline", providers: [] };
		}

		const data = (await res.json()) as ProviderSnapshot[];
		const providers = Array.isArray(data) ? data : [];
		return { status: providers.length > 0 ? "online" : "empty", providers };
	} catch {
		// Connection refused (app closed), DNS, abort, JSON parse — all map to offline.
		return { status: "offline", providers: [] };
	}
}
