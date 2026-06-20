import type { DtcgValue, WaveToken } from '../../types/index.ts';

type InheritColorMetadata = Pick<
	WaveToken,
	| 'inheritColor'
	| 'inheritColorAlpha'
	| 'inheritColorOpacity'
	| 'inheritColorSiblingSlot'
>;

export interface InheritColorTransformResult {
	value: DtcgValue;
	metadata: InheritColorMetadata;
}

function extractPropertyValue(data: unknown): number | undefined {
	if (data === undefined) {
		return undefined;
	}

	if (typeof data === 'number') {
		return data >= 0 && data <= 1 ? data : undefined;
	}

	if (typeof data === 'object' && data !== null) {
		const obj = data as Record<string, unknown>;
		if ('$value' in obj) {
			const resolvedValue = obj.$value;
			if (typeof resolvedValue === 'number') {
				return resolvedValue >= 0 && resolvedValue <= 1
					? resolvedValue
					: undefined;
			}
			if (typeof resolvedValue === 'string') {
				const parsed = parseFloat(resolvedValue);
				return !Number.isNaN(parsed) && parsed >= 0 && parsed <= 1
					? parsed
					: undefined;
			}
		}
	}

	return undefined;
}

function extractSiblingSlot(inheritColor: unknown): string | undefined {
	if (typeof inheritColor === 'object' && inheritColor !== null) {
		const obj = inheritColor as Record<string, unknown>;
		if (typeof obj.siblingSlot === 'string') {
			return obj.siblingSlot;
		}
	}
	return undefined;
}

export function applyInheritColorExtension(
	inheritColorExt: unknown,
	processedValue: DtcgValue,
): InheritColorTransformResult {
	const metadata: InheritColorMetadata = {};
	let value = processedValue;

	if (typeof inheritColorExt === 'boolean') {
		metadata.inheritColor = inheritColorExt;
		return { value, metadata };
	}

	if (typeof inheritColorExt !== 'object' || inheritColorExt === null) {
		return { value, metadata };
	}

	metadata.inheritColor = true;
	const extObj = inheritColorExt as Record<string, unknown>;
	const propertyObj = extObj.property as Record<string, unknown> | undefined;
	if (propertyObj && typeof propertyObj === 'object') {
		if ('alpha' in propertyObj) {
			metadata.inheritColorAlpha = extractPropertyValue(propertyObj.alpha);
		}
		if ('opacity' in propertyObj) {
			metadata.inheritColorOpacity = extractPropertyValue(propertyObj.opacity);
		}
	}

	const siblingSlot = extractSiblingSlot(inheritColorExt);
	if (siblingSlot !== undefined) {
		metadata.inheritColorSiblingSlot = siblingSlot;
	}

	if (
		metadata.inheritColorAlpha !== undefined ||
		metadata.inheritColorOpacity !== undefined
	) {
		const originalColor = typeof value === 'string' ? value : undefined;
		value = {
			...(metadata.inheritColorAlpha !== undefined && {
				alpha: metadata.inheritColorAlpha,
			}),
			...(metadata.inheritColorOpacity !== undefined && {
				opacity: metadata.inheritColorOpacity,
			}),
			...(originalColor !== undefined && { _color: originalColor }),
		};
	}

	return { value, metadata };
}
