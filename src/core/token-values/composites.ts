import { isDtcgColorSpaceValue } from '../../types/index.ts';
import { validateBorderStrokeStyle } from '../stroke-style.ts';
import { parseDimension } from './dimension.ts';
import { parseDuration } from './duration.ts';
import { normalizeFontWeight } from './font-weight.ts';

export type TokenValueSchemaPhase = 'raw' | 'resolved';

export interface TokenValueIssue {
	path: string;
	message: string;
}

const ALIAS_PATTERN = /^\{[^{}]+\}$/;
const COLOR_KEYS = new Set([
	'colorSpace',
	'components',
	'alpha',
	'hex',
	'_swatchName',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReference(value: unknown): boolean {
	return (
		(typeof value === 'string' && ALIAS_PATTERN.test(value.trim())) ||
		(isRecord(value) && typeof value.$ref === 'string')
	);
}

function issue(path: string, message: string): TokenValueIssue[] {
	return [{ path, message }];
}

function unknownFields(
	value: Record<string, unknown>,
	allowed: ReadonlySet<string>,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	return Object.keys(value)
		.filter(
			(key) =>
				!allowed.has(key) && !(phase === 'resolved' && key === '_swatchName'),
		)
		.map((key) => ({
			path: `${path}.${key}`,
			message: `Unknown field "${key}"`,
		}));
}

function missingFields(
	value: Record<string, unknown>,
	fields: readonly string[],
	path: string,
): TokenValueIssue[] {
	return fields
		.filter((field) => value[field] === undefined)
		.map((field) => ({
			path: `${path}.${field}`,
			message: `Missing field "${field}"`,
		}));
}

function validateColor(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (typeof value === 'string') return [];
	if (!isRecord(value) || !isDtcgColorSpaceValue(value)) {
		return issue(
			path,
			'color must be a legacy string or DTCG color object with colorSpace and components',
		);
	}
	const issues = unknownFields(value, COLOR_KEYS, path, phase);
	if (value.components.length !== 3) {
		issues.push({
			path: `${path}.components`,
			message: 'color components must have 3 elements',
		});
	}
	if (
		value.alpha !== undefined &&
		(typeof value.alpha !== 'number' ||
			!Number.isFinite(value.alpha) ||
			value.alpha < 0 ||
			value.alpha > 1)
	) {
		issues.push({
			path: `${path}.alpha`,
			message: 'color alpha must be between 0 and 1',
		});
	}
	if (value.hex !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(value.hex))) {
		issues.push({
			path: `${path}.hex`,
			message: 'color hex must be a 6 digit hex value',
		});
	}
	return issues;
}

function validateDimension(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (phase === 'raw' && isRecord(value) && '_swatchName' in value) {
		return issue(`${path}._swatchName`, 'Unknown field "_swatchName"');
	}
	const parsed = parseDimension(value);
	return parsed.ok ? [] : issue(path, parsed.message);
}

function validateDuration(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (phase === 'raw' && isRecord(value) && '_swatchName' in value) {
		return issue(`${path}._swatchName`, 'Unknown field "_swatchName"');
	}
	const parsed = parseDuration(value);
	return parsed.ok ? [] : issue(path, parsed.message);
}

function validateCubicBezier(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (
		!Array.isArray(value) ||
		value.length !== 4 ||
		!value.every(
			(member) => typeof member === 'number' && Number.isFinite(member),
		)
	) {
		return issue(path, 'cubicBezier must contain four finite numbers');
	}
	if (value[0]! < 0 || value[0]! > 1 || value[2]! < 0 || value[2]! > 1) {
		return issue(path, 'cubicBezier x coordinates must be between 0 and 1');
	}
	return [];
}

function validateBorder(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (!isRecord(value)) return issue(path, 'border must be an object');
	const issues = [
		...unknownFields(value, new Set(['color', 'width', 'style']), path, phase),
		...missingFields(value, ['color', 'width', 'style'], path),
	];
	if (value.color !== undefined)
		issues.push(...validateColor(value.color, `${path}.color`, phase));
	if (value.width !== undefined)
		issues.push(...validateDimension(value.width, `${path}.width`, phase));
	if (value.style !== undefined) {
		issues.push(
			...validateBorderStrokeStyle(value.style, `${path}.style`, phase).map(
				(entry) => ({
					path: entry.path,
					message: entry.message,
				}),
			),
		);
	}
	return issues;
}

function validateTransition(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (!isRecord(value)) return issue(path, 'transition must be an object');
	const issues = [
		...unknownFields(
			value,
			new Set(['duration', 'delay', 'timingFunction']),
			path,
			phase,
		),
		...missingFields(value, ['duration', 'delay', 'timingFunction'], path),
	];
	if (value.duration !== undefined)
		issues.push(...validateDuration(value.duration, `${path}.duration`, phase));
	if (value.delay !== undefined)
		issues.push(...validateDuration(value.delay, `${path}.delay`, phase));
	if (value.timingFunction !== undefined) {
		issues.push(
			...validateCubicBezier(
				value.timingFunction,
				`${path}.timingFunction`,
				phase,
			),
		);
	}
	return issues;
}

function validateShadowLayer(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (!isRecord(value)) return issue(path, 'shadow layer must be an object');
	const issues = [
		...unknownFields(
			value,
			new Set(['color', 'offsetX', 'offsetY', 'blur', 'spread', 'inset']),
			path,
			phase,
		),
		...missingFields(
			value,
			['color', 'offsetX', 'offsetY', 'blur', 'spread'],
			path,
		),
	];
	if (value.color !== undefined)
		issues.push(...validateColor(value.color, `${path}.color`, phase));
	for (const field of ['offsetX', 'offsetY', 'blur', 'spread'] as const) {
		if (value[field] !== undefined) {
			issues.push(
				...validateDimension(value[field], `${path}.${field}`, phase),
			);
		}
	}
	if (value.inset !== undefined && typeof value.inset !== 'boolean') {
		issues.push({
			path: `${path}.inset`,
			message: 'shadow inset must be a boolean',
		});
	}
	return issues;
}

function validateShadow(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (!Array.isArray(value)) return validateShadowLayer(value, path, phase);
	if (value.length === 0) return issue(path, 'shadow array must not be empty');
	return value.flatMap((layer, index) =>
		validateShadowLayer(layer, `${path}[${index}]`, phase),
	);
}

function validateGradient(
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	if (!Array.isArray(value) || value.length === 0) {
		return issue(path, 'gradient must be a non-empty array');
	}
	return value.flatMap((stop, index) => {
		const stopPath = `${path}[${index}]`;
		if (phase === 'raw' && isReference(stop)) return [];
		if (!isRecord(stop))
			return issue(stopPath, 'gradient stop must be an object');
		const issues = [
			...unknownFields(stop, new Set(['color', 'position']), stopPath, phase),
			...missingFields(stop, ['color', 'position'], stopPath),
		];
		if (stop.color !== undefined)
			issues.push(...validateColor(stop.color, `${stopPath}.color`, phase));
		if (
			stop.position !== undefined &&
			(typeof stop.position !== 'number' || !Number.isFinite(stop.position))
		) {
			issues.push({
				path: `${stopPath}.position`,
				message: 'gradient position must be a finite number',
			});
		}
		return issues;
	});
}

export function validateStandardTokenValue(
	type: string,
	value: unknown,
	path: string,
	phase: TokenValueSchemaPhase,
): TokenValueIssue[] {
	if (phase === 'raw' && isReference(value)) return [];
	switch (type) {
		case 'color':
			return validateColor(value, path, phase);
		case 'dimension':
			return validateDimension(value, path, phase);
		case 'fontFamily':
			return typeof value === 'string' ||
				(Array.isArray(value) &&
					value.every((member) => typeof member === 'string'))
				? []
				: issue(path, 'fontFamily must be a string or string array');
		case 'fontWeight': {
			const parsed = normalizeFontWeight(value);
			return parsed.ok ? [] : issue(path, parsed.message);
		}
		case 'duration':
			return validateDuration(value, path, phase);
		case 'cubicBezier':
			return validateCubicBezier(value, path, phase);
		case 'number':
			return typeof value === 'number' && Number.isFinite(value)
				? []
				: issue(path, 'number must be finite');
		case 'strokeStyle':
			return validateBorderStrokeStyle(value, path, phase).map((entry) => ({
				path: entry.path,
				message: entry.message,
			}));
		case 'border':
			return validateBorder(value, path, phase);
		case 'transition':
			return validateTransition(value, path, phase);
		case 'shadow':
			return validateShadow(value, path, phase);
		case 'gradient':
			return validateGradient(value, path, phase);
		default:
			return [];
	}
}
