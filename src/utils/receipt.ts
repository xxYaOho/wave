import * as path from 'node:path';
import pc from 'picocolors';

// biome-ignore lint/complexity/useRegexLiterals: 字面量含 \x1b 被 noControlCharactersInRegex 禁止
const ANSI_RE = new RegExp('\\x1b\\[[0-9;]*m', 'g');

function vlen(text: string): number {
	return text.replace(ANSI_RE, '').length;
}

function vpad(text: string, width: number): string {
	const len = vlen(text);
	if (len >= width) return text;
	return text + ' '.repeat(width - len);
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(Math.max(n, min), max);
}

function boxWidth(): number {
	const cols = process.stdout.columns ?? 60;
	return clamp(Math.floor(cols * 0.6), 60, 80);
}

function borderTop(w: number): string {
	return `┌${'─'.repeat(w + 2)}┐`;
}
function borderBottom(w: number): string {
	return `└${'─'.repeat(w + 2)}┘`;
}
function midSolid(w: number): string {
	return `├${'─'.repeat(w + 2)}┤`;
}
function midDashed(w: number): string {
	return `├ ${'╌'.repeat(w)} ┤`;
}

function line(content: string, w: number): string {
	return `│ ${vpad(content, w)} │`;
}

function centerLine(content: string, w: number): string {
	const visual = vlen(content);
	const leftPad = Math.floor((w - visual) / 2);
	const rightPad = w - visual - leftPad;
	const padded = ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
	return `│ ${padded} │`;
}

const KEY_COL = 20;

function kvLine(
	key: string,
	value: string,
	suffix: string | undefined,
	w: number,
): string {
	const suffixStr = suffix ? `  ${suffix}` : '';
	const keyPart = `  ${key.padEnd(KEY_COL, ' ')}`;
	const available = w - vlen(keyPart) - vlen(suffixStr);
	const v =
		vlen(value) > available
			? `${value.slice(0, Math.max(0, available - 3))}...`
			: value;
	const vPadded = v.padEnd(available, ' ');
	return `│ ${vpad(`${keyPart}${vPadded}${suffixStr}`, w)} │`;
}

function multiValueLines(
	key: string,
	values: string[],
	w: number,
	keyCol = KEY_COL,
): string[] {
	const keyPart = `  ${key.padEnd(keyCol, ' ')}`;
	const indent = ' '.repeat(vlen(keyPart));
	const lines: string[] = [];
	for (let i = 0; i < values.length; i++) {
		const prefix = i === 0 ? keyPart : indent;
		const maxValue = w - vlen(prefix);
		const value =
			vlen(values[i]) > maxValue
				? `${values[i].slice(0, Math.max(0, maxValue - 3))}...`
				: values[i];
		lines.push(`│ ${vpad(`${prefix}${value}`, w)} │`);
	}
	return lines;
}

export type ResourceSource = 'builtin' | 'user';
export type OutputScope = 'main' | 'night' | 'variant';
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
	detail?: string;
	line?: number;
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
	variants: {
		state: 'enabled' | 'disabled' | 'none';
		count: number;
		names: string[];
	} = {
		state: 'none',
		count: 0,
		names: [],
	};
	errors: BuildError[] = [];
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

	setVariants(
		state: 'enabled' | 'disabled' | 'none',
		count: number,
		names: string[],
	): void {
		this.variants = { state, count, names };
	}

	markFailed(
		category: ErrorCategory,
		message: string,
		opts?: { detail?: string; phase?: string; line?: number },
	): void {
		this.errors.push({
			category,
			message,
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

	if (ctx.outputs.length > 0) {
		lines.push(dashed);
		lines.push(line('  OUTPUTS', w));
		lines.push(line('', w));

		const mainNight = ctx.outputs.filter((o) => o.scope !== 'variant');
		const variants = ctx.outputs.filter((o) => o.scope === 'variant');

		for (const out of mainNight) {
			const scopeLabel = out.label ? `${out.scope} [${out.label}]` : out.scope;
			lines.push(...multiValueLines(scopeLabel, out.files, w));
			lines.push(line('', w));
		}

		if (variants.length > 0) {
			lines.push(line('  variant', w));
			lines.push(line('', w));
			const maxLabelLen = Math.max(
				...variants.map((o) => vlen(`❖ ${o.label ?? 'unknown'}`)),
			);
			const variantKeyCol = Math.max(KEY_COL, maxLabelLen) + 4;
			for (const out of variants) {
				const label = out.label ?? 'unknown';
				lines.push(
					...multiValueLines(`❖ ${label}`, out.files, w, variantKeyCol),
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

	const variantsText =
		ctx.variants.state === 'none'
			? 'none'
			: ctx.variants.state === 'disabled'
				? 'disabled'
				: `${ctx.variants.count} found`;
	lines.push(kvLine('Variants', variantsText, undefined, w));
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
	lines.push(dashed);
	lines.push(line(pc.red('  ERRORS'), w));
	lines.push(line('', w));
	for (const err of ctx.errors) {
		const detail = err.line ? `at line ${err.line}` : err.detail;
		lines.push(kvLine(err.category, pc.red(err.message), undefined, w));
		if (detail) {
			const indent = ' '.repeat(KEY_COL + 2);
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
