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

export function parseSketchExtension(
	extensions: Record<string, unknown> | undefined,
): SketchExtension | undefined {
	if (!extensions) return undefined;

	const sketch = isRecord(extensions.sketch) ? extensions.sketch : undefined;
	const normalized: SketchExtension = {};

	if (sketch && typeof sketch.path === 'string' && sketch.path.trim() !== '') {
		normalized.path = sketch.path;
	}

	const explicitProperty = sketch ? parseProperty(sketch.property) : undefined;
	if (explicitProperty) {
		normalized.property = explicitProperty;
	}

	return normalized.path || normalized.property ? normalized : undefined;
}
