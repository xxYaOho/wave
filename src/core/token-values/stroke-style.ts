import {
	type NormalizedDimension,
	type ParseResult,
	parseDimension,
} from './dimension.ts';

export type StrokeLineCap = 'round' | 'butt' | 'square';
export type StrokeStyleName =
	| 'solid'
	| 'dashed'
	| 'dotted'
	| 'double'
	| 'groove'
	| 'ridge'
	| 'outset'
	| 'inset';

export interface NormalizedCustomStrokeStyle {
	dashArray: NormalizedDimension[];
	lineCap: StrokeLineCap;
}

export type NormalizedStrokeStyle =
	| StrokeStyleName
	| NormalizedCustomStrokeStyle;

const STROKE_STYLE_NAMES = new Set<StrokeStyleName>([
	'solid',
	'dashed',
	'dotted',
	'double',
	'groove',
	'ridge',
	'outset',
	'inset',
]);

const LINE_CAPS = new Set<StrokeLineCap>(['round', 'butt', 'square']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeStrokeStyle(
	input: unknown,
): ParseResult<NormalizedStrokeStyle> {
	if (typeof input === 'string') {
		return STROKE_STYLE_NAMES.has(input as StrokeStyleName)
			? { ok: true, value: input as StrokeStyleName }
			: { ok: false, message: 'strokeStyle name is not supported' };
	}
	if (!isRecord(input)) {
		return { ok: false, message: 'strokeStyle must be a string or object' };
	}
	const keys = Object.keys(input);
	if (
		keys.length !== 2 ||
		!keys.includes('dashArray') ||
		!keys.includes('lineCap')
	) {
		return {
			ok: false,
			message: 'strokeStyle object must contain only dashArray and lineCap',
		};
	}
	if (!Array.isArray(input.dashArray) || input.dashArray.length === 0) {
		return {
			ok: false,
			message: 'strokeStyle dashArray must be a non-empty array',
		};
	}
	if (
		typeof input.lineCap !== 'string' ||
		!LINE_CAPS.has(input.lineCap as StrokeLineCap)
	) {
		return {
			ok: false,
			message: 'strokeStyle lineCap must be round, butt, or square',
		};
	}

	const dashArray: NormalizedDimension[] = [];
	for (const [index, member] of input.dashArray.entries()) {
		const parsed = parseDimension(member);
		if (!parsed.ok) {
			return {
				ok: false,
				message: `strokeStyle dashArray[${index}]: ${parsed.message}`,
			};
		}
		dashArray.push(parsed.value);
	}
	if (dashArray.length % 2 === 1) dashArray.push(...dashArray);

	return {
		ok: true,
		value: {
			dashArray,
			lineCap: input.lineCap as StrokeLineCap,
		},
	};
}
