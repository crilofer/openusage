import type { ProgressLine, ProviderSnapshot, UsageLine } from "./types";

export interface ResolvedMetric {
	label: string;
	/** Human-readable value, e.g. "42%", "$5.17 · 9.2M tokens". */
	valueText: string;
	/** 0..100 when the line is a progress bar; undefined otherwise. */
	pct?: number;
	color?: string | null;
	resetsAt?: string | null;
}

/** Lines a user can pin/cycle on a dial or key. barChart lines are not selectable as a value. */
export function selectableLines(provider: ProviderSnapshot): UsageLine[] {
	return provider.lines.filter(
		(l) => l.type === "progress" || l.type === "text" || l.type === "badge",
	);
}

/** Only the progress lines — used by the stacked "All usage bars" view. */
export function progressLines(provider: ProviderSnapshot): ProgressLine[] {
	return provider.lines.filter((l): l is ProgressLine => l.type === "progress");
}

/** Sentinel lineIndex value selecting the stacked multi-bar view. */
export const ALL_BARS = "all";

/**
 * Ordered list of view tokens for rotate/press cycling, matching the Metric
 * dropdown order: the stacked "all" view (when available) followed by each metric.
 * Tokens are the exact strings stored in `lineIndex` ("all", "0", "1", …).
 */
export function viewTokens(provider: ProviderSnapshot): string[] {
	const tokens = selectableLines(provider).map((_, i) => String(i));
	if (progressLines(provider).length >= 2) tokens.unshift(ALL_BARS);
	return tokens;
}

export function resolveMetric(line: UsageLine): ResolvedMetric {
	switch (line.type) {
		case "progress": {
			const pct = line.limit > 0 ? clampPct((line.used / line.limit) * 100) : 0;
			return {
				label: line.label,
				valueText: `${Math.round(pct)}%`,
				pct,
				color: line.color,
				resetsAt: line.resetsAt,
			};
		}
		case "text":
			return { label: line.label, valueText: line.value, color: line.color };
		case "badge":
			return { label: line.label, valueText: line.text ?? line.value ?? "", color: line.color };
		case "barChart": {
			const last = line.points.at(-1);
			return { label: line.label, valueText: last?.valueLabel ?? "", color: line.color };
		}
	}
}

export function clampPct(value: number): number {
	return Math.max(0, Math.min(100, value));
}

/** Color by usage threshold; falls back to provider/line color below the warning band. */
export function colorForPct(pct: number, fallback?: string | null): string {
	if (pct >= 90) return "#ef4444"; // red
	if (pct >= 70) return "#f59e0b"; // amber
	return fallback || "#22c55e"; // green
}

/** "2h 14m", "3d 4h", "12m", or "resetting" — undefined if no/invalid timestamp. */
export function formatResetIn(resetsAt?: string | null, now = Date.now()): string | undefined {
	if (!resetsAt) return undefined;
	const target = Date.parse(resetsAt);
	if (Number.isNaN(target)) return undefined;

	const diff = target - now;
	if (diff <= 0) return "resetting";

	const totalMinutes = Math.floor(diff / 60_000);
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = totalMinutes % 60;

	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}
