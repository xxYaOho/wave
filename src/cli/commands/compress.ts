import * as readline from 'node:readline/promises';
import { Command } from 'commander';
import pc from 'picocolors';
import {
	type CompressFileType,
	type CompressResult,
	runCompress,
} from '../../core/compress/index.ts';
import { ExitCode } from '../../types/index.ts';
import {
	borderBottom,
	borderTop,
	boxWidth,
	centerLine,
	kvLine,
	line,
	midDashed,
	midSolid,
	vpad,
	vtruncate,
} from '../../utils/receipt.ts';
import { createInstallCommand } from './install.ts';
import { createToolDoctorCommand } from './tool-module.ts';

interface CompressCommandOptions {
	file?: string;
	recursive?: boolean;
	type?: string[];
	quality?: string;
	out?: string;
	dryRun?: boolean;
	yes?: boolean;
	force?: boolean;
	json?: boolean;
}

const COMPRESS_HELP = `Wave Compress
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave compress [file-or-dir] [options]
    wave compress -f <file-or-dir> [options]

  Examples:
    wave compress ./assets
    wave compress -f ./assets --dry-run
    wave compress -f ./assets --yes
    wave compress -f ./assets --type png --type jpg

  Options:
    -f, --file <path>    File or directory to compress
    --type <type>        Limit file type: png, jpg, svg, gif. Repeatable
    --recursive          Scan nested folders
    -q, --quality <n>    Use lossy quality mode, 1-100
    -o, --out <path>     Output directory
    --dry-run            Preview only, no prompt, no write
    --yes                Write without confirmation
    --force              Allow overwriting existing output files
    --json               Output JSON only, no prompt
    -h, --help           Show help

  Default behavior:
    Preview first, then ask whether to write output: [y/N]`;

function parseQuality(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const quality = Number(value);
	if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
		throw new Error('--quality must be an integer from 1 to 100');
	}
	return quality;
}

function parseTypes(
	values: string[] | undefined,
): CompressFileType[] | undefined {
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

function renderCompressResult(
	result: CompressResult,
	options: { prompt?: boolean } = {},
): string {
	const label = result.written ? 'COMPRESS RECEIPT' : 'COMPRESS PREVIEW';
	const lines: string[] = [];
	const hasError = result.issues.some((issue) => issue.severity === 'error');
	const width = Math.max(boxWidth() - 4, 76);
	const top = borderTop(width);
	const bottom = borderBottom(width);
	const solid = midSolid(width);
	const dashed = midDashed(width);

	lines.push(top);
	lines.push(line('', width));
	lines.push(centerLine(pc.yellow(`✦  ${label}  ✦`), width));
	lines.push(line('', width));
	lines.push(solid);
	lines.push(kvLine('Mode', result.mode, undefined, width));
	lines.push(kvLine('Input', result.input, undefined, width));
	lines.push(kvLine('Output', result.outDir, undefined, width));
	lines.push(kvLine('Files', String(result.items.length), undefined, width));
	lines.push(dashed);
	lines.push(line('  FILES', width));
	lines.push(line('', width));
	if (result.items.length === 0) {
		lines.push(line('  No supported files found.', width));
	} else {
		for (const item of result.items) {
			const saved =
				item.status === 'unchanged'
					? 'unchanged'
					: `saved ${formatPercent(item.savedPercent)}`;
			lines.push(
				fileLine(
					item.relativePath,
					`${formatBytes(item.beforeBytes)} -> ${formatBytes(item.afterBytes)}`,
					item.tool,
					saved,
					width,
				),
			);
		}
	}

	if (result.issues.length > 0) {
		lines.push(dashed);
		lines.push(line('  ISSUES', width));
		lines.push(line('', width));
		for (const issue of result.issues) {
			lines.push(kvLine(issue.code, issue.message, undefined, width));
			if (issue.fix) {
				lines.push(kvLine('Fix', issue.fix, undefined, width));
			}
		}
	}

	lines.push(solid);
	lines.push(line('', width));
	if (options.prompt) {
		lines.push(centerLine('Write compressed output? [y/N]', width));
	} else {
		const summary = hasError
			? 'Compression blocked'
			: result.written
				? 'Compressed output written'
				: 'Preview only, no files written';
		lines.push(centerLine(summary, width));
	}
	lines.push(line('', width));
	lines.push(bottom);
	return lines.join('\n');
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatPercent(value: number): string {
	return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function truncate(text: string, width: number): string {
	return vtruncate(text, width);
}

function fileLine(
	fileName: string,
	sizeText: string,
	tool: string,
	savedText: string,
	width: number,
): string {
	const prefix = '  ';
	const sizeWidth = 22;
	const toolWidth = 10;
	const savedWidth = 14;
	const nameWidth = width - prefix.length - sizeWidth - toolWidth - savedWidth;
	const content = `${prefix}${vpad(truncate(fileName, nameWidth), nameWidth)}${vpad(
		sizeText,
		sizeWidth,
	)}${vpad(truncate(tool, toolWidth), toolWidth)}${truncate(savedText, savedWidth)}`;
	return line(content, width);
}

async function shouldWriteCompressedOutput(): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	try {
		const answer = await rl.question('');
		return ['y', 'yes'].includes(answer.trim().toLowerCase());
	} finally {
		rl.close();
	}
}

function createCompressRunCommand(name = 'run'): Command {
	return new Command(name)
		.description('Preview and optionally write compressed assets')
		.argument('[input]', 'File or directory to compress')
		.option('-f, --file <path>', 'File or directory to compress')
		.option('--recursive', 'Scan directories recursively')
		.option('--type <type>', 'Limit file type: png, jpg, svg, gif', ((
			value: string,
			previous: string[] | undefined,
		) => [...(previous ?? []), value]) as (
			value: string,
			previous?: string[],
		) => string[])
		.option(
			'-q, --quality <value>',
			'Enable quality mode with lossy quality 1-100',
		)
		.option('-o, --out <path>', 'Output directory')
		.option('--dry-run', 'Preview compression without writing output')
		.option('--yes', 'Write previewed output without prompting')
		.option('--force', 'Allow overwriting existing output files')
		.option('--json', 'Output JSON and do not prompt')
		.action(async (input: string, options: CompressCommandOptions) => {
			try {
				const resolvedInput = options.file ?? input ?? '.';
				const result = await runCompress({
					input: resolvedInput,
					outDir: options.out,
					recursive: options.recursive,
					types: parseTypes(options.type),
					quality: parseQuality(options.quality),
					dryRun: options.dryRun || (options.json && !options.yes),
					yes: options.yes,
					force: options.force,
				});
				let outputResult = result;
				const hasError = result.issues.some(
					(issue) => issue.severity === 'error',
				);
				const shouldPrompt =
					!hasError && !options.dryRun && !options.yes && !options.json;
				if (options.json) {
					console.log(JSON.stringify(result, null, 2));
				} else {
					console.log(renderCompressResult(result, { prompt: shouldPrompt }));
					if (shouldPrompt && (await shouldWriteCompressedOutput())) {
						outputResult = await runCompress({
							input: resolvedInput,
							outDir: options.out,
							recursive: options.recursive,
							types: parseTypes(options.type),
							quality: parseQuality(options.quality),
							yes: true,
							force: options.force,
						});
						console.log(renderCompressResult(outputResult));
					}
				}
				process.exitCode = outputResult.issues.some(
					(issue) => issue.severity === 'error',
				)
					? ExitCode.GENERAL_ERROR
					: ExitCode.SUCCESS;
			} catch (err) {
				if (options.json) {
					console.log(
						JSON.stringify(
							{
								ok: false,
								error: err instanceof Error ? err.message : String(err),
							},
							null,
							2,
						),
					);
				} else {
					console.error(err instanceof Error ? err.message : String(err));
				}
				process.exitCode = ExitCode.GENERAL_ERROR;
			}
		});
}

export const compressCommand = new Command('compress')
	.description('Compress and optimize design assets')
	.helpOption('-h, --help', 'Show help')
	.configureHelp({ formatHelp: () => COMPRESS_HELP })
	.addHelpCommand(false)
	.addCommand(createCompressRunCommand('run'))
	.addCommand(createToolDoctorCommand('compress'))
	.addCommand(createInstallCommand('install', 'compress'));

compressCommand.command('help', { hidden: true }).action(() => {
	console.log(COMPRESS_HELP);
});
