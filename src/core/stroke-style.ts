import { parseDimension } from './token-values/dimension.ts';
import { normalizeStrokeStyle } from './token-values/stroke-style.ts';

export type StrokeStyleSchemaPhase = 'raw' | 'resolved';

export interface StrokeStyleIssue {
	path: string;
	message: string;
}

const ALIAS_PATTERN = /^\{[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*\}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAlias(value: unknown): boolean {
	if (typeof value === 'string') return ALIAS_PATTERN.test(value);
	return (
		isRecord(value) &&
		Object.keys(value).length === 1 &&
		typeof value.$ref === 'string'
	);
}

export function validateBorderStrokeStyle(
	style: unknown,
	stylePath: string,
	phase: StrokeStyleSchemaPhase,
): StrokeStyleIssue[] {
	if (phase === 'raw' && isAlias(style)) return [];
	if (typeof style === 'string') {
		const parsed = normalizeStrokeStyle(style);
		return parsed.ok ? [] : [{ path: stylePath, message: parsed.message }];
	}
	if (!isRecord(style)) {
		return [
			{
				path: stylePath,
				message:
					'border style must be a string or an object containing dashArray and lineCap',
			},
		];
	}

	const issues: StrokeStyleIssue[] = [];
	for (const key of Object.keys(style)) {
		if (key !== 'dashArray' && key !== 'lineCap') {
			issues.push({
				path: `${stylePath}.${key}`,
				message: `Unknown border style field "${key}"`,
			});
		}
	}
	if (!('dashArray' in style)) {
		issues.push({
			path: stylePath,
			message: 'border style object must contain dashArray',
		});
		return issues;
	}
	if (!('lineCap' in style)) {
		issues.push({
			path: stylePath,
			message: 'border style object must contain lineCap',
		});
		return issues;
	}
	if (!Array.isArray(style.dashArray) || style.dashArray.length === 0) {
		issues.push({
			path: `${stylePath}.dashArray`,
			message: 'border style dashArray must be a non-empty array',
		});
		return issues;
	}

	for (const [index, member] of style.dashArray.entries()) {
		if (phase === 'raw' && isAlias(member)) continue;
		if (phase === 'raw' && isRecord(member) && '_swatchName' in member) {
			issues.push({
				path: `${stylePath}.dashArray[${index}]._swatchName`,
				message: 'Unknown dimension field "_swatchName"',
			});
			continue;
		}
		const parsed = parseDimension(member);
		if (!parsed.ok) {
			issues.push({
				path: `${stylePath}.dashArray[${index}]`,
				message: parsed.message,
			});
		}
	}
	if (!(phase === 'raw' && isAlias(style.lineCap))) {
		if (
			style.lineCap !== 'round' &&
			style.lineCap !== 'butt' &&
			style.lineCap !== 'square'
		) {
			issues.push({
				path: `${stylePath}.lineCap`,
				message: 'border style lineCap must be round, butt, or square',
			});
		}
	}
	if (issues.length === 0 && phase === 'resolved') {
		const parsed = normalizeStrokeStyle(style);
		if (!parsed.ok) {
			issues.push({
				path: stylePath,
				message: parsed.message,
			});
		}
	}
	return issues;
}

export function formatDashArray(value: unknown): string {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error('CSS border dashArray must be a non-empty array');
	}
	let hasPositive = false;
	const members = value.map((member, index) => {
		const parsed = parseDimension(member);
		if (!parsed.ok || parsed.value.value < 0) {
			throw new Error(
				`CSS border dashArray has an invalid member at index ${index}`,
			);
		}
		if (parsed.value.value > 0) hasPositive = true;
		if (parsed.value.value === 0) return '0';
		return `${parsed.value.value}${parsed.value.unit ?? 'px'}`;
	});
	if (!hasPositive) {
		throw new Error(
			'CSS border dashArray must contain at least one positive member',
		);
	}
	return members.join(' ');
}
