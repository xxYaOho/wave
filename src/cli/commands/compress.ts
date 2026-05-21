import { Command } from 'commander';
import * as path from 'node:path';
import {
	runCompress,
	runCompressDoctor,
	type CompressFileType,
	type CompressResult,
} from '../../core/compress/index.ts';
import { PathToolResolver } from '../../core/compress/tools.ts';
import { ExitCode } from '../../types/index.ts';

interface CompressCommandOptions {
	recursive?: boolean;
	type?: string[];
	quality?: string;
	out?: string;
	dryRun?: boolean;
	yes?: boolean;
	json?: boolean;
}

interface CompressInstallOptions {
	check?: boolean;
	yes?: boolean;
	json?: boolean;
}

function parseQuality(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const quality = Number(value);
	if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
		throw new Error('--quality must be an integer from 1 to 100');
	}
	return quality;
}

function parseTypes(values: string[] | undefined): CompressFileType[] | undefined {
	if (!values || values.length === 0) return undefined;
	const types: CompressFileType[] = [];
	for (const value of values) {
		if (!['png', 'jpg', 'svg', 'gif'].includes(value)) {
			throw new Error(`Unsupported compress type: ${value}`);
		}
		types.push(value as CompressFileType);
	}
	return types;
}

function renderCompressResult(result: CompressResult, dryRun: boolean): string {
	if (result.issues.length > 0) {
		return result.issues
			.map((issue) => {
				const fix = issue.fix ? `\n  Fix: ${issue.fix}` : '';
				return `✗ ${issue.code}: ${issue.message}${fix}`;
			})
			.join('\n');
	}

	const title = result.written ? 'Compress Receipt' : 'Compress Preview';
	const lines = [
		title,
		'~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
		`Mode:    ${result.mode}`,
		`Input:   ${result.input}`,
		`Output:  ${result.outDir}`,
		`Files:   ${result.items.length}`,
	];
	if (result.items.length === 0) {
		lines.push('No supported files found.');
	} else {
		for (const item of result.items) {
			const saved =
				item.savedBytes >= 0
					? `${formatBytes(item.savedBytes)} saved`
					: `${formatBytes(Math.abs(item.savedBytes))} larger`;
			lines.push(
				`- ${item.type} ${item.source} -> ${item.output} (${item.tool}, ${saved}, ${item.savedPercent}%)`,
			);
		}
	}
	if (!result.written && !dryRun) {
		lines.push('Preview only. Re-run with --yes to write files.');
	}
	return lines.join('\n');
}

function renderDoctor(
	result: Awaited<ReturnType<typeof runCompressDoctor>>,
): string {
	const lines = ['Compress Doctor', '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'];
	for (const status of result.toolStatuses) {
		const icon = status.available ? '✓' : '✗';
		lines.push(`${icon} ${status.name}: ${status.path ?? 'missing'}`);
	}
	if (result.issues.length === 0) {
		lines.push('OK: compress toolchain is available.');
	} else {
		for (const issue of result.issues) {
			lines.push(`✗ ${issue.code}: ${issue.message}`);
			if (issue.fix) lines.push(`  Fix: ${issue.fix}`);
		}
	}
	return lines.join('\n');
}

function renderInstallPlan(json = false): string {
	const plan = {
		module: 'compress',
		command: 'mise install',
		tools: ['oxipng', 'svgo', 'gifsicle', 'jpegtran or mozjpeg', 'pngquant'],
		executes: false,
	};
	if (json) return JSON.stringify(plan, null, 2);
	return [
		'Compress Install Plan',
		'~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
		'Command: mise install',
		'Tools:   oxipng, svgo, gifsicle, jpegtran or mozjpeg, pngquant',
		'No install was run. Add --yes to execute.',
	].join('\n');
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

async function resolveExecutable(name: string): Promise<string | null> {
	for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
		if (!dir) continue;
		const candidate = path.join(dir, name);
		if (await Bun.file(candidate).exists()) return candidate;
	}
	return null;
}

export const compressCommand = new Command('compress')
	.description('Compress and optimize design assets')
	.argument('[input]', 'File or directory to compress', '.')
	.option('--recursive', 'Scan directories recursively')
	.option('--type <type>', 'Limit file type: png, jpg, svg, gif', ((
		value: string,
		previous: string[] | undefined,
	) => [...(previous ?? []), value]) as (value: string, previous?: string[]) => string[])
	.option('-q, --quality <value>', 'Enable quality mode with lossy quality 1-100')
	.option('-o, --out <path>', 'Output directory', './compressed')
	.option('--dry-run', 'Preview compression without writing output')
	.option('--yes', 'Write previewed output without prompting')
	.option('--json', 'Output JSON and do not prompt')
	.action(async (input: string, options: CompressCommandOptions) => {
		try {
			const result = await runCompress({
				input,
				outDir: options.out,
				recursive: options.recursive,
				types: parseTypes(options.type),
				quality: parseQuality(options.quality),
				dryRun: options.dryRun || (options.json && !options.yes),
				yes: options.yes,
			});
			if (options.json) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				console.log(renderCompressResult(result, !!options.dryRun));
			}
			process.exitCode =
				result.issues.some((issue) => issue.severity === 'error')
					? ExitCode.GENERAL_ERROR
					: ExitCode.SUCCESS;
		} catch (err) {
			if (options.json) {
				console.log(
					JSON.stringify(
						{ ok: false, error: err instanceof Error ? err.message : String(err) },
						null,
						2,
					),
				);
			} else {
				console.error(err instanceof Error ? err.message : String(err));
			}
			process.exitCode = ExitCode.GENERAL_ERROR;
		}
	})
	.addCommand(
		new Command('doctor')
			.description('Check compress toolchain health')
			.option('--json', 'Output JSON')
			.action(async (options: { json?: boolean }) => {
				const result = await runCompressDoctor(new PathToolResolver());
				if (options.json) console.log(JSON.stringify(result, null, 2));
				else console.log(renderDoctor(result));
				process.exitCode = result.ok ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR;
			}),
	)
	.addCommand(
		new Command('install')
			.description('Show or run compress tool installation plan')
			.option('--check', 'Only show install plan')
			.option('--yes', 'Run mise install')
			.option('--json', 'Output JSON')
			.action(async (options: CompressInstallOptions) => {
				if (!options.yes || options.check || options.json) {
					console.log(renderInstallPlan(!!options.json));
					process.exitCode = ExitCode.SUCCESS;
					return;
				}
				const mise = await resolveExecutable('mise');
				if (!mise) {
					console.error('mise is required. Install mise, then run wave compress install --yes again.');
					process.exitCode = ExitCode.GENERAL_ERROR;
					return;
				}
				const proc = Bun.spawn([mise, 'install'], {
					stdout: 'inherit',
					stderr: 'inherit',
				});
				process.exitCode = await proc.exited;
			}),
	);
