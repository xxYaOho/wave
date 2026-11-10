import type { SketchExtension, SketchPropertyMap } from '../../types/index.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProperty(value: unknown): SketchPropertyMap | undefined {
	if (!isRecord(value)) return undefined;

	const property: SketchPropertyMap = {};
	if (value.opacity === true) property.opacity = true;
	if (value.cornerRadius === true) property.cornerRadius = true;
	return Object.keys(property).length > 0 ? property : undefined;
}

/**
 * New-form sketch family: `$extensions.platform.sketch`.
 * Legacy `$extensions.sketch` / `$extensions.outline` keys are not read —
 * the schema layer rejects them with a `wave token migrate extensions` hint.
 */
export function getPlatformSketch(
	extensions: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	const platform = isRecord(extensions?.platform)
		? extensions.platform
		: undefined;
	return isRecord(platform?.sketch) ? platform.sketch : undefined;
}

export function parseSketchExtension(
	extensions: Record<string, unknown> | undefined,
): SketchExtension | undefined {
	if (!extensions) return undefined;

	const sketch = getPlatformSketch(extensions);
	const normalized: SketchExtension = {};

	if (sketch && typeof sketch.path === 'string' && sketch.path.trim() !== '') {
		normalized.path = sketch.path;
	}

	const explicitProperty = sketch ? parseProperty(sketch.property) : undefined;
	if (explicitProperty) {
		normalized.property = explicitProperty;
	}
	if (sketch && typeof sketch.skip === 'boolean') {
		normalized.skip = sketch.skip;
	}

	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * Outline extension lookup for border tokens: `$extensions.platform.sketch.outline`.
 */
export function getOutlineExtension(
	extensions: Record<string, unknown> | undefined,
): unknown {
	if (!extensions) return undefined;
	return getPlatformSketch(extensions)?.outline;
}
