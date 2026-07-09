import * as path from 'node:path';
import pc from 'picocolors';

// biome-ignore lint/complexity/useRegexLiterals: 字面量含 \x1b 被 noControlCharactersInRegex 禁止
const ANSI_RE = new RegExp('\\x1b\\[[0-9;]*m', 'g');

export function vlen(text: string): number {
	let width = 0;
	for (const char of text.replace(ANSI_RE, '')) {
		width += isWideChar(char) ? 2 : 1;
	}
	return width;
}

function isWideChar(char: string): boolean {
	const code = char.codePointAt(0) ?? 0;
	return (
		(code >= 0x1100 && code <= 0x115f) ||
		(code >= 0x2e80 && code <= 0xa4cf) ||
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0xf900 && code <= 0xfaff) ||
		(code >= 0xfe10 && code <= 0xfe19) ||
		(code >= 0xfe30 && code <= 0xfe6f) ||
		(code >= 0xff00 && code <= 0xff60) ||
		(code >= 0xffe0 && code <= 0xffe6)
	);
}

export function vpad(text: string, width: number): string {
	const len = vlen(text);
	if (len >= width) return text;
	return text + ' '.repeat(width - len);
}

export function vtruncate(text: string, width: number): string {
	if (vlen(text) <= width) return text;
	if (width <= 3) return '.'.repeat(Math.max(0, width));

	let output = '';
	let currentWidth = 0;
	for (const char of text.replace(ANSI_RE, '')) {
		const charWidth = isWideChar(char) ? 2 : 1;
		if (currentWidth + charWidth > width - 3) break;
		output += char;
		currentWidth += charWidth;
	}
	return `${output}...`;
}

export function clamp(n: number, min: number, max: number): number {
	return Math.min(Math.max(n, min), max);
}

export function boxWidth(): number {
	const cols = process.stdout.columns ?? 60;
	return clamp(Math.floor(cols * 0.6), 60, 80);
}

export function borderTop(w: number): string {
	return `┌${'─'.repeat(w + 2)}┐`;
}
export function borderBottom(w: number): string {
	return `└${'─'.repeat(w + 2)}┘`;
}
export function midSolid(w: number): string {
	return `├${'─'.repeat(w + 2)}┤`;
}
export function midDashed(w: number): string {
	return `├ ${'╌'.repeat(w)} ┤`;
}

export function line(content: string, w: number): string {
	return `│ ${vpad(content, w)} │`;
}

export function centerLine(content: string, w: number): string {
	const visual = vlen(content);
	const leftPad = Math.floor((w - visual) / 2);
	const rightPad = w - visual - leftPad;
	const padded = ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
	return `│ ${padded} │`;
}

export const RECEIPT_KEY_COL = 20;

export function kvLine(
	key: string,
	value: string,
	suffix: string | undefined,
	w: number,
): string {
	const suffixStr = suffix ? `  ${suffix}` : '';
	const keyPart = `  ${key.padEnd(RECEIPT_KEY_COL, ' ')}`;
	const available = w - vlen(keyPart) - vlen(suffixStr);
	const v = vtruncate(value, available);
	const vPadded = vpad(v, available);
	return `│ ${vpad(`${keyPart}${vPadded}${suffixStr}`, w)} │`;
}

export function multiValueLines(
	key: string,
	values: string[],
	w: number,
	keyCol = RECEIPT_KEY_COL,
): string[] {
	const keyPart = `  ${key.padEnd(keyCol, ' ')}`;
	const indent = ' '.repeat(vlen(keyPart));
	const lines: string[] = [];
	for (let i = 0; i < values.length; i++) {
		const prefix = i === 0 ? keyPart : indent;
		const maxValue = w - vlen(prefix);
		const current = values[i] ?? '';
		const value = vtruncate(current, maxValue);
		lines.push(`│ ${vpad(`${prefix}${value}`, w)} │`);
	}
	return lines;
}

export type ResourceSource = 'builtin' | 'cache' | 'user';
export type OutputScope = 'main' | 'night' | 'profile';
export type ErrorCategory =
	| 'resource'
	| 'parse'
	| 'generate'
	| 'load'
	| 'config';

export interface ResourceEntry {
	kind: string;
	ref: string;
	source: ResourceSource;
}

export interface OutputEntry {
	scope: OutputScope;
	label?: string;
	files: string[];
}

export interface BuildError {
	category: ErrorCategory;
	message: string;
	phase?: string;
	detail?: string;
	line?: number;
}

export interface BuildWarning {
	phase: string;
	message: string;
}

export class BuildContext {
	themeName = '';
	version = '';
	resources: ResourceEntry[] = [];
	outputs: OutputEntry[] = [];
	outputDir = '';
	nightMode: { state: 'enabled' | 'skipped' | 'disabled'; reason?: string } = {
		state: 'disabled',
		reason: undefined,
	};
	profiles: {
		state: 'default' | 'all' | 'single';
		count: number;
		names: string[];
	} = {
		state: 'default',
		count: 1,
		names: ['main'],
	};
	errors: BuildError[] = [];
	warnings: BuildWarning[] = [];
	failedAt?: string;

	addResource(kind: string, ref: string, source: ResourceSource): void {
		this.resources.push({ kind, ref, source });
	}

	addOutput(scope: OutputScope, files: string[], label?: string): void {
		this.outputs.push({
			scope,
			label,
			files: files.map((f) => path.basename(f)),
		});
	}

	setNight(state: 'enabled' | 'skipped' | 'disabled', reason?: string): void {
		this.nightMode = { state, reason };
	}

	setProfiles(
		state: 'default' | 'all' | 'single',
		count: number,
		names: string[],
	): void {
		this.profiles = { state, count, names };
	}

	addWarning(phase: string, message: string): void {
		this.warnings.push({ phase, message });
	}

	markFailed(
		category: ErrorCategory,
		message: string,
		opts?: { detail?: string; phase?: string; line?: number },
	): void {
		this.errors.push({
			category,
			message,
			phase: opts?.phase,
			detail: opts?.detail,
			line: opts?.line,
		});
		if (opts?.phase) this.failedAt = opts.phase;
	}

	get status(): 'success' | 'failed' {
		return this.errors.length > 0 ? 'failed' : 'success';
	}
}

export function renderReceipt(ctx: BuildContext): string {
	const w = boxWidth() - 4;
	return ctx.status === 'success'
		? renderSuccess(ctx, w)
		: renderFailed(ctx, w);
}

function renderSuccess(ctx: BuildContext, w: number): string {
	const lines: string[] = [];
	const top = borderTop(w);
	const bot = borderBottom(w);
	const solid = midSolid(w);
	const dashed = midDashed(w);

	lines.push(top);
	lines.push(line('', w));
	lines.push(centerLine(pc.yellow(`✦  ${ctx.themeName.toUpperCase()}  ✦`), w));
	lines.push(centerLine(pc.dim('Build Receipt'), w));
	lines.push(line('', w));
	lines.push(solid);
	lines.push(kvLine('Version', ctx.version, undefined, w));

	if (ctx.resources.length > 0) {
		lines.push(dashed);
		lines.push(line('  RESOURCES', w));
		lines.push(line('', w));
		for (const r of ctx.resources) {
			lines.push(kvLine(r.kind, r.ref, `(${r.source})`, w));
		}
	}

	if (ctx.warnings.length > 0) {
		lines.push(dashed);
		lines.push(line('  WARNINGS', w));
		lines.push(line('', w));
		for (const warning of ctx.warnings) {
			lines.push(kvLine(warning.phase, warning.message, undefined, w));
		}
	}

	if (ctx.outputs.length > 0) {
		lines.push(dashed);
		lines.push(line('  OUTPUTS', w));
		lines.push(line('', w));

		const mainNight = ctx.outputs.filter((o) => o.scope !== 'profile');
		const profileOutputs = ctx.outputs.filter((o) => o.scope === 'profile');

		for (const out of mainNight) {
			const scopeLabel = out.label ? `${out.scope} [${out.label}]` : out.scope;
			lines.push(...multiValueLines(scopeLabel, out.files, w));
			lines.push(line('', w));
		}

		if (profileOutputs.length > 0) {
			lines.push(line('  profile', w));
			lines.push(line('', w));
			const maxLabelLen = Math.max(
				...profileOutputs.map((o) => vlen(`❖ ${o.label ?? 'unknown'}`)),
			);
			const profileKeyCol = Math.max(RECEIPT_KEY_COL, maxLabelLen) + 4;
			for (const out of profileOutputs) {
				const label = out.label ?? 'unknown';
				lines.push(
					...multiValueLines(`❖ ${label}`, out.files, w, profileKeyCol),
				);
				lines.push(line('', w));
			}
		}
	}

	lines.push(dashed);
	const nightReason = ctx.nightMode.reason;
	lines.push(
		kvLine(
			'Night mode',
			ctx.nightMode.state,
			nightReason ? `(${nightReason})` : undefined,
			w,
		),
	);

	const profilesText =
		ctx.profiles.state === 'default'
			? 'main'
			: ctx.profiles.state === 'single'
				? ctx.profiles.names.join(', ')
				: `${ctx.profiles.count} profiles`;
	lines.push(kvLine('Profiles', profilesText, undefined, w));
	lines.push(kvLine('Output dir', ctx.outputDir, undefined, w));

	lines.push(solid);
	lines.push(line('', w));
	lines.push(centerLine(pc.green('Theme generation complete'), w));
	lines.push(line('', w));
	lines.push(centerLine(pc.yellow('★  Cheers >_<  ★'), w));
	lines.push(line('', w));
	lines.push(bot);

	return lines.join('\n');
}

function renderFailed(ctx: BuildContext, w: number): string {
	const lines: string[] = [];
	const top = pc.red(borderTop(w));
	const bot = pc.red(borderBottom(w));
	const solid = pc.red(midSolid(w));
	const dashed = pc.red(midDashed(w));

	lines.push(top);
	lines.push(pc.red(line('', w)));
	lines.push(centerLine(pc.red(pc.bold('✗  BUILD FAILED  ✗')), w));
	lines.push(centerLine(pc.red(pc.dim('Error Receipt')), w));
	lines.push(pc.red(line('', w)));
	lines.push(solid);
	lines.push(kvLine('Theme', ctx.themeName, undefined, w));
	lines.push(kvLine('Version', ctx.version, undefined, w));
	if (ctx.warnings.length > 0) {
		lines.push(dashed);
		lines.push(line(pc.yellow('  WARNINGS'), w));
		lines.push(line('', w));
		for (const warning of ctx.warnings) {
			lines.push(
				kvLine(warning.phase, pc.yellow(warning.message), undefined, w),
			);
		}
	}
	lines.push(dashed);
	lines.push(line(pc.red('  ERRORS'), w));
	lines.push(line('', w));
	const categoryLabels: Record<ErrorCategory, string> = {
		parse: 'parse error',
		resource: 'not found',
		generate: 'gen failed',
		load: 'load failed',
		config: 'config err',
	};
	for (const err of ctx.errors) {
		const phase = err.phase ?? err.category;
		const label = categoryLabels[err.category] ?? err.category;
		lines.push(kvLine(phase, pc.red(label), undefined, w));
		if (err.detail || err.line) {
			const detail = err.line
				? err.detail
					? `line ${err.line}: ${err.detail}`
					: `line ${err.line}`
				: err.detail;
			const indent = ' '.repeat(RECEIPT_KEY_COL + 2);
			lines.push(line(`${indent}${pc.red(detail)}`, w));
		}
	}
	lines.push(solid);
	lines.push(pc.red(line('', w)));
	lines.push(centerLine(pc.red(`Failed at: ${ctx.failedAt ?? 'unknown'}`), w));
	lines.push(pc.red(line('', w)));
	lines.push(bot);

	return lines.join('\n');
}
