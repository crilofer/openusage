/**
 * Types mirroring the OpenUsage local HTTP API response shape.
 * See docs/local-http-api.md in the OpenUsage repo.
 */

export interface ProgressLine {
	type: "progress";
	label: string;
	used: number;
	limit: number;
	format?: { kind: string } | null;
	resetsAt?: string | null;
	periodDurationMs?: number | null;
	color?: string | null;
}

export interface TextLine {
	type: "text";
	label: string;
	value: string;
	color?: string | null;
	subtitle?: string | null;
}

export interface BadgeLine {
	type: "badge";
	label: string;
	text?: string | null; // Swift edition
	value?: string | null; // Tauri edition
	color?: string | null;
}

export interface BarChartPoint {
	label: string;
	value: number;
	valueLabel?: string;
}

export interface BarChartLine {
	type: "barChart";
	label: string;
	points: BarChartPoint[];
	note?: string | null;
	color?: string | null;
}

export type UsageLine = ProgressLine | TextLine | BadgeLine | BarChartLine;

export interface ProviderSnapshot {
	providerId: string;
	displayName: string;
	plan?: string | null;
	lines: UsageLine[];
	fetchedAt: string;
}
