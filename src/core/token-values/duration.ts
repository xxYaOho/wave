import type { ParseResult } from './dimension.ts';

export type DurationUnit = 'ms' | 's';

export interface NormalizedDuration {
	value: number;
	unit: DurationUnit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDuration(input: unknown): ParseResult<NormalizedDuration> {
	if (!isRecord(input)) {
		return { ok: false, message: 'duration must be an object' };
	}
	const keys = Object.keys(input);
	if (
		!keys.includes('value') ||
		!keys.includes('unit') ||
		keys.some(
			(key) => key !== 'value' && key !== 'unit' && key !== '_swatchName',
		)
	) {
		return {
			ok: false,
			message: 'duration must contain only value and unit',
		};
	}
	if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
		return { ok: false, message: 'duration value must be a finite number' };
	}
	if (input.unit !== 'ms' && input.unit !== 's') {
		return { ok: false, message: 'duration unit must be ms or s' };
	}
	return {
		ok: true,
		value: { value: input.value, unit: input.unit },
	};
}
