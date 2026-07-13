export type StrokeStyleSchemaPhase = 'raw' | 'resolved';

export interface StrokeStyleIssue {
	path: string;
	message: string;
}

interface ParsedDashLength {
	value: number;
	unit?: string;
}

const DASH_NUMBER_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const DASH_LENGTH_PATTERN = /^((?:0|[1-9]\d*)(?:\.\d+)?)(px|pt|rem|em|%)$/;
const DASH_UNITS = new Set(['px', 'pt', 'rem', 'em', '%']);
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

function parseNumericValue(value: unknown): number | undefined {
	if (typeof value === 'number') {
		return Number.isFinite(value) && value >= 0 ? value : undefined;
	}
	if (typeof value !== 'string' || !DASH_NUMBER_PATTERN.test(value.trim())) {
		return undefined;
	}
	const parsed = Number(value.trim());
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDashLength(
	value: unknown,
	phase: StrokeStyleSchemaPhase,
): ParsedDashLength | 'alias' | undefined {
	if (phase === 'raw' && isAlias(value)) return 'alias';

	const numeric = parseNumericValue(value);
	if (numeric !== undefined) return { value: numeric };

	if (typeof value === 'string') {
		const match = value.trim().match(DASH_LENGTH_PATTERN);
		if (!match?.[1] || !match[2]) return undefined;
		return { value: Number(match[1]), unit: match[2] };
	}

	if (!isRecord(value)) return undefined;
	const keys = Object.keys(value);
	const allowedKeys =
		phase === 'resolved'
			? new Set(['value', 'unit', '_swatchName'])
			: new Set(['value', 'unit']);
	if (!keys.includes('value') || keys.some((key) => !allowedKeys.has(key))) {
		return undefined;
	}
	if (phase === 'raw' && isAlias(value.value)) return 'alias';
	const objectValue = parseNumericValue(value.value);
	if (objectValue === undefined) return undefined;
	if (value.unit === undefined) return { value: objectValue };
	if (typeof value.unit !== 'string' || !DASH_UNITS.has(value.unit)) {
		return undefined;
	}
	return { value: objectValue, unit: value.unit };
}

export function validateBorderStrokeStyle(
	style: unknown,
	stylePath: string,
	phase: StrokeStyleSchemaPhase,
): StrokeStyleIssue[] {
	if (typeof style === 'string') return [];
	if (!isRecord(style)) {
		return [
			{
				path: stylePath,
				message:
					'border style must be a string or an object containing dashArray',
			},
		];
	}

	const issues: StrokeStyleIssue[] = [];
	for (const key of Object.keys(style)) {
		if (key !== 'dashArray') {
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
	if (!Array.isArray(style.dashArray) || style.dashArray.length === 0) {
		issues.push({
			path: `${stylePath}.dashArray`,
			message: 'border style dashArray must be a non-empty array',
		});
		return issues;
	}

	let hasPositive = false;
	let hasAlias = false;
	for (const [index, member] of style.dashArray.entries()) {
		const parsed = parseDashLength(member, phase);
		if (parsed === 'alias') {
			hasAlias = true;
			continue;
		}
		if (parsed === undefined) {
			issues.push({
				path: `${stylePath}.dashArray[${index}]`,
				message:
					'border style dashArray members must be finite non-negative lengths using px, pt, rem, em, or %',
			});
			continue;
		}
		if (parsed.value > 0) hasPositive = true;
	}

	if (!hasPositive && !(phase === 'raw' && hasAlias)) {
		issues.push({
			path: `${stylePath}.dashArray`,
			message:
				'border style dashArray must contain at least one positive member',
		});
	}
	return issues;
}

export function formatDashArray(value: unknown): string {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error('CSS border dashArray must be a non-empty array');
	}
	let hasPositive = false;
	const members = value.map((member, index) => {
		const parsed = parseDashLength(member, 'resolved');
		if (parsed === undefined || parsed === 'alias') {
			throw new Error(
				`CSS border dashArray has an invalid member at index ${index}`,
			);
		}
		if (parsed.value > 0) hasPositive = true;
		if (parsed.value === 0) return '0';
		return `${parsed.value}${parsed.unit ?? 'px'}`;
	});
	if (!hasPositive) {
		throw new Error(
			'CSS border dashArray must contain at least one positive member',
		);
	}
	return members.join(' ');
}
