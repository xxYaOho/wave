import type { DtcgValue, TypographyDefaults } from '../types/index.ts';

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
const TYPOGRAPHY_DIMENSION_PATTERN = /^(-?(?:0|[1-9]\d*)(?:\.\d+)?)(px|pt)$/;

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
	unit?: 'px' | 'pt';
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
	const scalar = parseTypographyNumber(value);
	if (scalar !== undefined) return { value: scalar };

	if (typeof value === 'string') {
		const match = value.trim().match(TYPOGRAPHY_DIMENSION_PATTERN);
		if (!match) return undefined;
		const parsed = Number(match[1]);
		if (!Number.isFinite(parsed)) return undefined;
		return { value: parsed, unit: match[2] as 'px' | 'pt' };
	}

	if (!isRecord(value)) return undefined;
	const keys = Object.keys(value);
	if (keys.some((key) => key !== 'value' && key !== 'unit')) return undefined;
	const parsedValue = parseTypographyNumber(value.value);
	if (parsedValue === undefined) return undefined;
	if (value.unit === undefined) return { value: parsedValue };
	if (value.unit !== 'px' && value.unit !== 'pt') return undefined;
	return { value: parsedValue, unit: value.unit };
}

export function parseTypographyLineHeight(
	value: unknown,
): ParsedTypographyDimension | undefined {
	const multiplier = parseTypographyNumber(value);
	if (multiplier !== undefined) return { value: multiplier };
	const dimension = parseTypographyDimension(value);
	return dimension?.unit ? dimension : undefined;
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
		if (typeof value === 'string') {
			return normalizeFontFamilyMember(value, false) === undefined
				? 'must be a non-empty string without control characters'
				: undefined;
		}
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			value.every((item) => normalizeFontFamilyMember(item) !== undefined)
		) {
			return undefined;
		}
		return 'must be a non-empty string or non-empty string array without control characters';
	}

	if (field === 'fontWeight') {
		const parsed = parseTypographyNumber(value);
		return parsed !== undefined && parsed > 0
			? undefined
			: 'must be a finite positive number or numeric string';
	}

	const parsed =
		field === 'lineHeight'
			? parseTypographyLineHeight(value)
			: parseTypographyDimension(value);
	if (parsed === undefined) {
		return 'must be a finite number or dimension using only px or pt';
	}
	if (field === 'letterSpacing') return undefined;
	return parsed.value > 0 ? undefined : 'must be greater than 0';
}

export function typographyDefaultsFromExtensions(
	extensions: Record<string, unknown> | undefined,
): TypographyDefaults | undefined {
	if (!extensions || !isRecord(extensions.typography)) return undefined;
	const defaults = extensions.typography.defaults;
	return isRecord(defaults) ? (defaults as TypographyDefaults) : undefined;
}

export function mergeTypographyDefaults(
	inherited: TypographyDefaults | undefined,
	local: TypographyDefaults | undefined,
): TypographyDefaults | undefined {
	if (!inherited && !local) return undefined;
	return { ...(inherited ?? {}), ...(local ?? {}) };
}

export function materializeTypographyValue(
	defaults: TypographyDefaults | undefined,
	value: unknown,
): Record<string, DtcgValue | string[] | undefined> | undefined {
	if (!isRecord(value)) return undefined;
	return {
		...(defaults ?? {}),
		...(value as Record<string, DtcgValue | string[] | undefined>),
	};
}

export function missingTypographyFields(
	value: Record<string, unknown> | undefined,
): TypographyField[] {
	if (!value) return [...TYPOGRAPHY_FIELDS];
	return TYPOGRAPHY_FIELDS.filter((field) => value[field] === undefined);
}
