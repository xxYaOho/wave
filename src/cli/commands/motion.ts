import { Command } from 'commander';
import {
	runToolchainDoctor,
	type ToolchainDoctorResult,
} from '../../core/doctor/toolchain.ts';
import {
	createMotionPlan,
	encodeMotionPlan,
	hasBlockingMotionIssues,
	type MotionFormat,
	type MotionIssue,
	type MotionPlan,
	runMotionDoctor,
} from '../../core/motion/index.ts';
import {
	BunCommandRunner,
	DefaultToolResolver,
} from '../../core/tools/index.ts';
import { ExitCode } from '../../types/index.ts';
import { createInstallCommand } from './install.ts';

interface MotionCommandOptions {
	file?: string;
	fps?: string;
	quality?: string;
	loop?: string;
	out?: string;
	force?: boolean;
	overwrite?: boolean;
	dryRun?: boolean;
}

interface MotionDoctorOptions {
	json?: boolean;
	verbose?: boolean;
	status?: boolean;
}

export function createMotionCommand(name = 'motion'): Command {
	const command = new Command(name).description(
		'Create animated assets from PNG frames',
	);

	command.addCommand(createEncodeCommand('gif'));
	command.addCommand(createEncodeCommand('apng'));
	command.addCommand(createMotionDoctorCommand());
	command.addCommand(createInstallCommand('install', 'motion'));

	return command;
}

function createEncodeCommand(format: MotionFormat): Command {
	const formatName = format.toUpperCase();
	const extension = format === 'gif' ? '.gif' : '.png';
	return new Command(format)
		.description(`Create ${format.toUpperCase()} from a PNG frame directory`)
		.argument('[framesDir]', 'Directory containing PNG frames')
		.option('-f, --file <path>', 'PNG frame directory')
		.option('--fps <n>', 'Frames per second. Default: 24', '24')
		.option('--quality <n>', 'Encoder quality, 1-100. Default: 80', '80')
		.option('--loop <mode>', 'forever or once. Default: forever', 'forever')
		.option('-o, --out <path>', 'Output file path')
		.option('--dry-run', 'Show plan only, no write')
		.option('--force', 'Allow overwriting existing output file')
		.option('--overwrite', 'Allow overwriting existing output file')
		.addHelpText('beforeAll', formatHelp(formatName, extension))
		.action(
			async (
				framesDir: string | undefined,
				_options: MotionCommandOptions,
				command: Command,
			) => {
				const parsedOptions = command.opts<MotionCommandOptions>();
				const inputFramesDir = framesDir ?? parsedOptions.file;
				if (!inputFramesDir) {
					console.error('Missing required PNG frame directory.');
					process.exitCode = ExitCode.GENERAL_ERROR;
					return;
				}
				const runner = new BunCommandRunner();
				const resolver = new DefaultToolResolver({ runner });
				const plan = await createMotionPlan(
					{
						format,
						framesDir: inputFramesDir,
						fps: Number(parsedOptions.fps),
						quality: Number(parsedOptions.quality),
						loop: parsedOptions.loop,
						out: parsedOptions.out,
						overwrite: parsedOptions.force || parsedOptions.overwrite,
						dryRun: parsedOptions.dryRun,
					},
					resolver,
				);

				const phase = parsedOptions.dryRun ? 'plan' : 'receipt';

				if (hasBlockingMotionIssues(plan.issues)) {
					console.log(renderMotionReceipt(plan, phase));
					process.exitCode = ExitCode.GENERAL_ERROR;
					return;
				}

				if (parsedOptions.dryRun) {
					console.log(renderMotionReceipt(plan, 'plan'));
					process.exitCode = ExitCode.SUCCESS;
					return;
				}

				try {
					const result = await encodeMotionPlan(plan, runner);
					console.log(renderMotionReceipt(plan, 'receipt', result.outputSize));
					process.exitCode = ExitCode.SUCCESS;
				} catch (error) {
					console.log(`ERROR  WMG_ENCODE_FAILED`);
					console.log(error instanceof Error ? error.message : String(error));
					process.exitCode = ExitCode.GENERAL_ERROR;
				}
			},
		);
}

function formatHelp(formatName: string, extension: string): string {
	return `
Wave Motion ${formatName}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave motion ${formatName.toLowerCase()} [frames-dir] [options]
    wave motion ${formatName.toLowerCase()} -f <frames-dir> [options]

  Options:
    -f, --file <path>    PNG frame directory
    --fps <n>            Frames per second. Default: 24
    --quality <n>        Encoder quality, 1-100. Default: 80
    --loop <mode>        forever or once. Default: forever
    -o, --out <path>     Output file path
    --dry-run            Show plan only, no write
    --force              Allow overwriting existing output file
    -h, --help           Show help

  Default output:
    <frames-dir>/wave-mg/<frames-dir-name>@<fps>fps${extension}
`;
}

function createMotionDoctorCommand(): Command {
	return new Command('doctor')
		.description('Check motion tools and optional PNG frame directory')
		.argument('[framesDir]', 'Directory containing PNG frames')
		.option('--json', 'Output structured JSON')
		.option('--verbose', 'Show details even when there are no issues')
		.option('--status', 'Show compact health status')
		.action(
			async (framesDir: string | undefined, options: MotionDoctorOptions) => {
				const runner = new BunCommandRunner();
				const resolver = new DefaultToolResolver({ runner });
				const toolchain = await runToolchainDoctor({
					module: 'motion',
					resolver,
				});
				const result = await runMotionDoctor(framesDir, resolver);

				if (options.json) {
					console.log(
						JSON.stringify(
							{
								...toolchain,
								frames: result.frames,
								frameDetails: result.details,
								frameIssues: result.issues,
							},
							null,
							2,
						),
					);
				} else if (options.status) {
					renderToolchainStatus(toolchain);
				} else {
					console.log('Motion Doctor');
					renderToolchainVerbose(toolchain);
					renderIssues(result.issues);
					if (options.verbose || result.issues.length === 0) {
						for (const detail of result.details) {
							console.log(`DETAIL ${detail}`);
						}
					}
					if (result.issues.length === 0) {
						console.log('OK motion checks passed');
					}
				}

				process.exitCode =
					!toolchain.ok || hasBlockingMotionIssues(result.issues)
						? ExitCode.GENERAL_ERROR
						: ExitCode.SUCCESS;
			},
		);
}

function renderMotionReceipt(
	plan: MotionPlan,
	phase: 'plan' | 'receipt',
	outputSize?: number,
): string {
	const title = phase === 'plan' ? 'MOTION PLAN' : 'MOTION RECEIPT';
	const footer =
		phase === 'plan' ? 'Dry run. No file written.' : 'Motion export complete.';
	const rows: Array<[string, string]> = [
		['Format', plan.format.toUpperCase()],
		['Frames', String(plan.frames.length)],
		['FPS', String(plan.fps)],
		['Duration', `${plan.durationSeconds.toFixed(2)}s`],
		['Size', `${plan.width} x ${plan.height}`],
		['Output', plan.outputPath],
		['Tool', plan.tool],
	];
	if (outputSize !== undefined) {
		rows.push(['Output Size', formatBytes(outputSize)]);
	}

	const w = 58;
	const lines: string[] = [];
	lines.push(`┌${'─'.repeat(w)}┐`);
	lines.push(centerBox(`✦  ${title}  ✦`, w));
	lines.push(`├${'─'.repeat(w)}┤`);
	for (const [key, value] of rows) {
		lines.push(kvBox(key, value, w));
	}
	if (plan.issues.length > 0) {
		const warnings = plan.issues.filter(
			(issue) => issue.severity === 'warning',
		);
		const errors = plan.issues.filter((issue) => issue.severity === 'error');
		if (warnings.length > 0) {
			lines.push(`├ ${'╌'.repeat(w - 2)} ┤`);
			lines.push(boxLine('  WARNINGS', w));
			for (const issue of warnings) {
				lines.push(boxLine(`  ${issue.code} ${issue.message}`, w));
			}
		}
		if (errors.length > 0) {
			lines.push(`├ ${'╌'.repeat(w - 2)} ┤`);
			lines.push(boxLine('  ERRORS', w));
			for (const issue of errors) {
				lines.push(boxLine(`  ${issue.code} ${issue.message}`, w));
			}
		}
	}
	lines.push(`├${'─'.repeat(w)}┤`);
	lines.push(centerBox(footer, w));
	lines.push(`└${'─'.repeat(w)}┘`);
	return lines.join('\n');
}

function renderToolchainStatus(result: ToolchainDoctorResult): void {
	const failed = result.checks.filter(
		(check) => check.status === 'fail',
	).length;
	const warned = result.checks.filter(
		(check) => check.status === 'warn',
	).length;
	const passed = result.checks.filter(
		(check) => check.status === 'pass',
	).length;
	console.log(
		`${result.module}: ${result.ok ? 'ok' : 'needs attention'} (${passed} pass, ${warned} warn, ${failed} fail)`,
	);
}

function renderToolchainVerbose(result: ToolchainDoctorResult): void {
	for (const check of result.checks) {
		console.log(`${check.status.toUpperCase()} ${check.name}`);
		console.log(check.message);
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

function renderIssues(issues: MotionIssue[]): void {
	for (const issue of issues) {
		console.log(`${issue.severity.toUpperCase()} ${issue.code}`);
		console.log(issue.message);
	}
}

function centerBox(content: string, width: number): string {
	const visible = content.length;
	const left = Math.max(0, Math.floor((width - visible) / 2));
	const right = Math.max(0, width - visible - left);
	return `│${' '.repeat(left)}${content}${' '.repeat(right)}│`;
}

function boxLine(content: string, width: number): string {
	return `│ ${fit(content, width - 2).padEnd(width - 2, ' ')} │`;
}

function kvBox(key: string, value: string, width: number): string {
	const keyPart = `  ${key.padEnd(20, ' ')}`;
	const valueWidth = width - 2 - keyPart.length;
	return boxLine(`${keyPart}${fit(value, valueWidth)}`, width);
}

function fit(value: string, width: number): string {
	if (value.length <= width) return value;
	if (value.startsWith('/') || value.startsWith('~/')) {
		const parts = value.split('/');
		const basename = parts.at(-1) ?? value;
		const parent = parts.at(-2);
		const suffix = parent ? `.../${parent}/${basename}` : `.../${basename}`;
		if (suffix.length <= width) return suffix;
		const basenameSuffix = `.../${basename}`;
		if (basenameSuffix.length <= width) return basenameSuffix;
	}
	return `${value.slice(0, Math.max(0, width - 3))}...`;
}

export const motionCommand = createMotionCommand('motion');
export const mgCommand = createMotionCommand('mg');
