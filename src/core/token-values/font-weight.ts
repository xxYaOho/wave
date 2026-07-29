import type { ParseResult } from './dimension.ts';

const FONT_WEIGHT_ALIASES: Readonly<Record<string, number>> = {
	thin: 100,
	hairline: 100,
	'extra-light': 200,
	'ultra-light': 200,
	light: 300,
	normal: 400,
	regular: 400,
	book: 400,
	medium: 500,
	'semi-bold': 600,
	'demi-bold': 600,
	bold: 700,
	'extra-bold': 800,
	'ultra-bold': 800,
	black: 900,
	heavy: 900,
	'extra-black': 950,
	'ultra-black': 950,
};

export function normalizeFontWeight(input: unknown): ParseResult<number> {
	let weight: number | undefined;
	if (typeof input === 'number') {
		weight = input;
	} else if (typeof input === 'string') {
		if (Object.hasOwn(FONT_WEIGHT_ALIASES, input)) {
			weight = FONT_WEIGHT_ALIASES[input];
		}
	}

	if (
		weight === undefined ||
		!Number.isFinite(weight) ||
		weight < 1 ||
		weight > 1000
	) {
		return {
			ok: false,
			message:
				'fontWeight must be a finite number from 1 to 1000 or a standard name',
		};
	}
	return { ok: true, value: weight };
}
