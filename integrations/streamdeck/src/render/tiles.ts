import { clampPct, colorForPct, formatResetIn, progressLines, resolveMetric } from "../metrics";
import type { ProviderSnapshot } from "../types";

export interface BarSpec {
	label: string; // "Daily", "Weekly"
	pct: number; // 0..100
	valueText: string; // "72%"
	color: string;
	reset?: string; // "2h 14m"
}

export interface TileData {
	title: string; // provider name
	metric: string; // line label, e.g. "Auto usage"
	valueText: string; // "72%" or "$5.17 · 9.2M tokens"
	pct?: number; // 0..100 when a single progress metric
	color: string; // accent color (threshold or brand)
	offline?: boolean;
	reset?: string; // e.g. "2h 14m"
	logo?: string; // provider logo as an SVG data URI
	bars?: BarSpec[]; // when set, render the stacked multi-bar view
}

const BG = "#18181b";
const FG = "#fafafa";
const MUTED = "#a1a1aa";
const FAINT = "#71717a";
const TRACK = "#3f3f46";
const FONT = "Helvetica, Arial, sans-serif";

/** Key face — 144×144. */
export function renderKeyImage(t: TileData): string {
	const W = 144;
	const dim = t.offline ? 0.45 : 1;
	const nameX = t.logo ? 44 : 12;

	const parts: string[] = [rect(0, 0, W, W, BG)];
	if (t.offline) parts.push(text(W - 10, 20, "offline", 11, FAINT, "end"));

	parts.push(`<g opacity="${dim}">`);
	if (t.logo && !t.offline) parts.push(image(t.logo, 12, 8, 26));
	parts.push(text(nameX, 27, truncate(t.title, 11), 17, FG, "start", 700));

	if (t.bars && t.bars.length > 0) {
		// Narrow face: value (just %) and label share a line; reset goes below the bar.
		const bars = t.bars.slice(0, 3);
		const withReset = bars.length <= 2;
		let y = 54;
		const gap = bars.length >= 3 ? 30 : 42;
		for (const b of bars) {
			parts.push(text(12, y, truncate(b.label, 11), 13, MUTED));
			parts.push(text(132, y, b.valueText, 14, b.color, "end", 700));
			parts.push(bar(12, y + 7, 120, 10, b.pct, b.color));
			if (withReset && b.reset) parts.push(text(12, y + 30, `resets ${b.reset}`, 11, FAINT));
			y += gap;
		}
	} else if (t.pct !== undefined) {
		parts.push(text(12, 78, t.valueText, 32, t.color, "start", 700));
		parts.push(text(12, 100, truncate(t.metric, 16), 14, MUTED));
		parts.push(bar(12, 112, 120, 12, t.pct, t.color));
		if (t.reset) parts.push(text(12, 136, `resets ${t.reset}`, 12, FAINT));
	} else {
		// Text/badge metric — split "$5.17 · 9.2M tokens" onto separate lines.
		parts.push(text(12, 54, truncate(t.metric, 16), 14, MUTED));
		const lines = splitValue(t.valueText);
		let y = 86;
		for (const line of lines.slice(0, 3)) {
			parts.push(text(12, y, truncate(line, 15), 22, FG, "start", 700));
			y += 28;
		}
	}
	parts.push(`</g>`);

	return dataUri(svg(W, W, parts.join("")));
}

/** Dial touchscreen — 200×100. */
export function renderDialImage(t: TileData): string {
	const W = 200;
	const H = 100;
	const dim = t.offline ? 0.45 : 1;
	const nameX = t.logo ? 44 : 10;

	const parts: string[] = [rect(0, 0, W, H, BG)];
	if (t.offline) parts.push(text(W - 8, 18, "offline", 12, FAINT, "end"));

	parts.push(`<g opacity="${dim}">`);
	if (t.logo && !t.offline) parts.push(image(t.logo, 8, 6, 28));
	parts.push(text(nameX, 28, truncate(t.title, 16), 18, FG, "start", 700));

	if (t.bars && t.bars.length > 0) {
		// Evenly distribute rows across the height; bar sits at the bottom of each
		// row so it never collides with the next row's label.
		const bars = t.bars.slice(0, 3);
		const n = bars.length;
		const headerH = 32;
		const rowH = (H - headerH - 2) / n;
		const barH = n >= 3 ? 6 : 9;
		bars.forEach((b, i) => {
			const top = headerH + i * rowH;
			const right = b.reset ? `${b.valueText} · ${b.reset}` : b.valueText;
			parts.push(text(10, top + 13, truncate(b.label, 14), 13, MUTED));
			parts.push(text(W - 8, top + 13, right, 13, b.color, "end", 700));
			parts.push(bar(10, top + rowH - barH - 2, W - 20, barH, b.pct, b.color));
		});
	} else if (t.pct !== undefined) {
		parts.push(text(10, 72, t.valueText, 36, t.color, "start", 700));
		parts.push(text(W - 8, 52, truncate(t.metric, 16), 13, MUTED, "end"));
		if (t.reset) parts.push(text(W - 8, 70, `resets ${t.reset}`, 13, FAINT, "end"));
		parts.push(bar(10, 82, W - 20, 12, t.pct, t.color));
	} else {
		// Text/badge metric — label on top, value split across lines below.
		parts.push(text(10, 46, truncate(t.metric, 24), 13, MUTED));
		const lines = splitValue(t.valueText);
		let y = 70;
		for (const line of lines.slice(0, 2)) {
			parts.push(text(10, y, truncate(line, 22), 22, FG, "start", 700));
			y += 23;
		}
	}
	parts.push(`</g>`);

	return dataUri(svg(W, H, parts.join("")));
}

/** Build stacked bars from all of a provider's progress lines. */
export function buildBars(provider: ProviderSnapshot): BarSpec[] {
	return progressLines(provider).map((line) => {
		const m = resolveMetric(line);
		const pct = m.pct ?? 0;
		return {
			label: line.label,
			pct,
			valueText: m.valueText,
			color: colorForPct(pct, m.color),
			reset: formatResetIn(m.resetsAt),
		};
	});
}

// --- primitives ---------------------------------------------------------

/** Split a composite value like "$5.17 · 9.2M tokens" into separate display lines. */
function splitValue(value: string): string[] {
	return value
		.split(/\s*·\s*/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function svg(w: number, h: number, body: string): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
		`width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
	);
}

function rect(x: number, y: number, w: number, h: number, fill: string, rx = 0): string {
	return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
}

function bar(x: number, y: number, w: number, h: number, pct: number, fill: string): string {
	const fillW = Math.round((clampPct(pct) / 100) * w);
	const r = h / 2;
	return rect(x, y, w, h, TRACK, r) + rect(x, y, fillW, h, fill, r);
}

function text(
	x: number,
	y: number,
	value: string,
	size: number,
	fill: string,
	anchor: "start" | "end" | "middle" = "start",
	weight = 400,
): string {
	return (
		`<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT}" font-size="${size}" ` +
		`font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`
	);
}

function image(href: string, x: number, y: number, size: number): string {
	return `<image href="${href}" xlink:href="${href}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
}

function dataUri(markup: string): string {
	return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

function escapeXml(value: string): string {
	return value.replace(
		/[<>&'"]/g,
		(c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c,
	);
}

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
