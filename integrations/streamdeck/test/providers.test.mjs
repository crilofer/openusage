import assert from "node:assert/strict";
import { test } from "node:test";

import { collectProviders, supportedProviderIds } from "../scripts/providers-source.mjs";

test("at least one provider icon is bundled", () => {
	assert.ok(collectProviders().length > 0, "no provider icons found in the surrounding OpenUsage repo");
});

test("every supported provider has a bundled icon", () => {
	const iconIds = new Set(collectProviders().map((p) => p.id));
	const missing = supportedProviderIds().filter((id) => !iconIds.has(id));
	assert.deepEqual(
		missing,
		[],
		`OpenUsage supports these providers but the plugin has no icon for them: ${missing.join(", ")}`,
	);
});

test("each bundled icon is a tintable SVG", () => {
	for (const { id, svg } of collectProviders()) {
		assert.match(svg, /<svg[\s>]/i, `${id}: source is not an SVG`);
	}
});
