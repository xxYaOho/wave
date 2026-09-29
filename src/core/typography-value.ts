import type { DtcgValue, TypographyDefaults } from '../types/index.ts';
import {
	type DimensionUnit,
	parseDimension,
} from './token-values/dimension.ts';
import { normalizeFontWeight } from './token-values/font-weight.ts';

export const TYPOGRAPHY_FIELDS = [
	'fontFamily',
	'fontSize',
	'fontWeight',
	'lineHeight',
	'letterSpacing',
] as const;

export type TypographyField = (typeof TYPOGRAPHY_FIELDS)[number];
export type TypographySchemaPhase = 'raw' | 'resolved';

export const TYPOGRAPHY_NUMERIC_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (
			codePoint !== undefined &&
			(codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
		) {
			return true;
		}
	}
	return false;
}

export interface ParsedTypographyDimension {
	value: number;
	unit?: DimensionUnit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTypographyReference(value: unknown): boolean {
	if (typeof value === 'string') {
		return /^\{[^{}]+\}$/.test(value.trim());
	}
	return isRecord(value) && typeof value.$ref === 'string';
}

export function parseTypographyNumber(value: unknown): number | undefined {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!TYPOGRAPHY_NUMERIC_PATTERN.test(trimmed)) return undefined;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseTypographyDimension(
	value: unknown,
): ParsedTypographyDimension | undefined {
	const parsed = parseDimension(value);
	if (!parsed.ok) return undefined;
	return parsed.value;
}

export function parseTypographyLineHeight(
	value: unknown,
): ParsedTypographyDimension | undefined {
	const multiplier = parseTypographyNumber(value);
	if (multiplier !== undefined) return { value: multiplier };
	const dimension = parseTypographyDimension(value);
	return dimension?.unit === 'px' ||
		dimension?.unit === 'pt' ||
		dimension?.unit === 'rem'
		? dimension
		: undefined;
}

export function normalizeFontFamilyMember(
	value: unknown,
	stripPairedQuotes: boolean = true,
): string | undefined {
	if (typeof value !== 'string') return undefined;
	if (hasControlCharacter(value)) return undefined;
	let family = value.trim();
	if (family.length === 0) return undefined;
	const first = family[0];
	const last = family[family.length - 1];
	if (
		stripPairedQuotes &&
		family.length >= 2 &&
		((first === '"' && last === '"') || (first === "'" && last === "'"))
	) {
		family = family.slice(1, -1).trim();
	}
	return family.length > 0 ? family : undefined;
}

export function validateTypographyField(
	field: TypographyField,
	value: unknown,
	phase: TypographySchemaPhase,
): string | undefined {
	if (phase === 'raw' && isTypographyReference(value)) return undefined;

	if (field === 'fontFamily') {
		if (typeof value === 'string') return undefined;
		if (
			Array.isArray(value) &&
			value.every((item) => typeof item === 'string')
		) {
			return undefined;
		}
		return 'must be a string or string array';
	}

	if (field === 'fontWeight') {
		const parsed = normalizeFontWeight(value);
		return parsed.ok
			? undefined
			: 'must be a finite number from 1 to 1000 or a standard name';
	}

	const parsed =
		field === 'lineHeight'
			? parseTypographyLineHeight(value)
			: parseTypographyDimension(value);
	if (parsed === undefined) {
		return field === 'lineHeight'
			? 'must be a finite number or dimension using only px, pt, or rem'
			: 'must be a finite number or dimension using px, rem, pt, em, or %';
	}
	return undefined;
}

export function parseTypographyBaseFontSize(
	extensions: Record<string, unknown> | undefined,
): number | undefined {
	if (!extensions || !isRecord(extensions.typography)) return undefined;
	const baseFontSize = extensions.typography.baseFontSize;
	return typeof baseFontSize === 'number' &&
		Number.isFinite(baseFontSize) &&
		baseFontSize > 0
		? baseFontSize
		: undefined;
}

export function hasTypographyRemDimension(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return ['fontSize', 'lineHeight', 'letterSpacing'].some(
		(field) => parseTypographyDimension(value[field])?.unit === 'rem',
	);
}

export function typographyDefaultsFromExtensions(
	extensions: Record<string, unknown> | undefined,
): TypographyDefaults | undefined {
	if (!extensions || !isRecord(extensions.typography)) return undefined;
	const typography = extensions.typography;
	const defaults = Object.fromEntries(
		TYPOGRAPHY_FIELDS.filter((field) => Object.hasOwn(typography, field)).map(
			(field) => [field, typography[field]],
		),
	);
	return Object.keys(defaults).length > 0
		? (defaults as TypographyDefaults)
		: undefined;
}

export function mergeTypographyDefaults(
	inherited: TypographyDefaults | undefined,
	local: TypographyDefaults | undefined,
): TypographyDefaults | undefined {
	if (!inherited && !local) return undefined;
	return { ...(inherited ?? {}), ...(local ?? {}) };
}

export function materializeTypographyValue(
	fallbacks: TypographyDefaults | undefined,
	value: unknown,
): Record<string, DtcgValue | string[] | undefined> | undefined {
	if (!isRecord(value)) return undefined;
	return {
		...(fallbacks ?? {}),
		...(value as Record<string, DtcgValue | string[] | undefined>),
	};
}

export function missingTypographyFields(
	value: Record<string, unknown> | undefined,
): TypographyField[] {
	if (!value) return [...TYPOGRAPHY_FIELDS];
	return TYPOGRAPHY_FIELDS.filter((field) => value[field] === undefined);
}
