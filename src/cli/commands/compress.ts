import { Command } from 'commander';
import {
	runCompress,
	type CompressFileType,
	type CompressResult,
} from '../../core/compress/index.ts';
import { ExitCode } from '../../types/index.ts';
import { createInstallCommand } from './install.ts';
import { createToolDoctorCommand } from './tool-module.ts';

interface CompressCommandOptions {
	recursive?: boolean;
	type?: string[];
	quality?: string;
	out?: string;
	dryRun?: boolean;
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
				item.status === 'unchanged'
					? 'unchanged'
					: `${formatBytes(item.savedBytes)} saved, ${item.savedPercent}%`;
			lines.push(
				`- ${item.type} ${item.source} -> ${item.output} (${item.tool}, ${saved})`,
			);
		}
	}
	if (!result.written && !dryRun) {
		lines.push('Preview only. Re-run with --yes to write files.');
	}
	return lines.join('\n');
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

function createCompressRunCommand(name = 'run'): Command {
	return new Command(name)
		.description('Preview and optionally write compressed assets')
	.argument('[input]', 'File or directory to compress', '.')
	.option('--recursive', 'Scan directories recursively')
	.option('--type <type>', 'Limit file type: png, jpg, svg, gif', ((
		value: string,
		previous: string[] | undefined,
	) => [...(previous ?? []), value]) as (
		value: string,
		previous?: string[],
	) => string[])
	.option('-q, --quality <value>', 'Enable quality mode with lossy quality 1-100')
	.option('-o, --out <path>', 'Output directory')
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
	});
}

export const compressCommand = new Command('compress')
	.description('Compress and optimize design assets')
	.addCommand(createCompressRunCommand('run'))
	.addCommand(createToolDoctorCommand('compress'))
	.addCommand(createInstallCommand('install', 'compress'));
