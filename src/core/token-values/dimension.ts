export type ParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; message: string };

export type DimensionUnit = 'px' | 'rem' | 'pt' | 'em' | '%';

export interface NormalizedDimension {
	value: number;
	unit?: DimensionUnit;
}

export interface ParseDimensionOptions {
	defaultUnit?: DimensionUnit;
}

const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const DIMENSION_PATTERN = /^(-?(?:0|[1-9]\d*)(?:\.\d+)?)(px|rem|pt|em|%)$/;
const DIMENSION_UNITS = new Set<DimensionUnit>(['px', 'rem', 'pt', 'em', '%']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown): number | undefined {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!NUMBER_PATTERN.test(trimmed)) return undefined;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseDimension(
	input: unknown,
	options: ParseDimensionOptions = {},
): ParseResult<NormalizedDimension> {
	const scalar = parseFiniteNumber(input);
	if (scalar !== undefined) {
		return {
			ok: true,
			value: {
				value: scalar,
				...(options.defaultUnit ? { unit: options.defaultUnit } : {}),
			},
		};
	}

	if (typeof input === 'string') {
		const match = input.trim().match(DIMENSION_PATTERN);
		if (match?.[1] && match[2]) {
			return {
				ok: true,
				value: {
					value: Number(match[1]),
					unit: match[2] as DimensionUnit,
				},
			};
		}
	}

	if (isRecord(input)) {
		const keys = Object.keys(input);
		if (
			!keys.includes('value') ||
			keys.some(
				(key) => key !== 'value' && key !== 'unit' && key !== '_swatchName',
			)
		) {
			return {
				ok: false,
				message: 'dimension must contain only value and unit',
			};
		}
		const value = parseFiniteNumber(input.value);
		if (value === undefined) {
			return { ok: false, message: 'dimension value must be a finite number' };
		}
		if (input.unit === undefined) {
			return {
				ok: true,
				value: {
					value,
					...(options.defaultUnit ? { unit: options.defaultUnit } : {}),
				},
			};
		}
		if (
			typeof input.unit !== 'string' ||
			!DIMENSION_UNITS.has(input.unit as DimensionUnit)
		) {
			return {
				ok: false,
				message: 'dimension unit must be px, rem, pt, em, or %',
			};
		}
		return {
			ok: true,
			value: { value, unit: input.unit as DimensionUnit },
		};
	}

	return {
		ok: false,
		message: 'dimension must be a finite number, numeric string, or dimension',
	};
}
