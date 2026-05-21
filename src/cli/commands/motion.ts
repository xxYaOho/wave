import { Command } from 'commander';
import {
	createMotionPlan,
	encodeMotionPlan,
	hasBlockingMotionIssues,
	runMotionDoctor,
	type MotionFormat,
	type MotionIssue,
	type MotionPlan,
} from '../../core/motion/index.ts';
import { BunCommandRunner } from '../../core/tools/command-runner.ts';
import { LocalToolResolver } from '../../core/tools/tool-resolver.ts';
import { ExitCode } from '../../types/index.ts';

interface MotionCommandOptions {
	fps?: string;
	quality?: string;
	loop?: 'forever' | 'once';
	out?: string;
	overwrite?: boolean;
	dryRun?: boolean;
}

interface MotionDoctorOptions {
	json?: boolean;
	verbose?: boolean;
}

export function createMotionCommand(name = 'motion'): Command {
	const command = new Command(name).description(
		'Create animated assets from PNG frames',
	);

	command.addCommand(createEncodeCommand('gif'));
	command.addCommand(createEncodeCommand('apng'));
	command.addCommand(createMotionDoctorCommand());
	command.addCommand(createMotionInstallCommand());

	return command;
}

function createEncodeCommand(format: MotionFormat): Command {
	return new Command(format)
		.description(`Create ${format.toUpperCase()} from a PNG frame directory`)
		.argument('<framesDir>', 'Directory containing PNG frames')
		.option('--fps <number>', 'Frames per second', '24')
		.option('--quality <number>', 'Encoder quality from 1 to 100', '80')
		.option('--loop <mode>', 'Loop mode: forever or once', 'forever')
		.option('-o, --out <path>', 'Output file path')
		.option('--overwrite', 'Overwrite existing output')
		.option('--dry-run', 'Show the encode plan without writing output')
		.action(async (framesDir: string, options: MotionCommandOptions) => {
			const runner = new BunCommandRunner();
			const resolver = new LocalToolResolver(runner);
			const loop = options.loop === 'once' ? 'once' : 'forever';
			const plan = await createMotionPlan(
				{
					format,
					framesDir,
					fps: Number(options.fps),
					quality: Number(options.quality),
					loop,
					out: options.out,
					overwrite: options.overwrite,
					dryRun: options.dryRun,
				},
				resolver,
			);

			renderMotionPlan(plan);
			renderIssues(plan.issues);

			if (hasBlockingMotionIssues(plan.issues)) {
				process.exitCode = ExitCode.GENERAL_ERROR;
				return;
			}

			if (options.dryRun) {
				process.exitCode = ExitCode.SUCCESS;
				return;
			}

			try {
				const result = await encodeMotionPlan(plan, runner);
				if (result.outputSize !== undefined) {
					console.log(`Output Size ${formatBytes(result.outputSize)}`);
				}
				process.exitCode = ExitCode.SUCCESS;
			} catch (error) {
				console.log(`ERROR  WMG_ENCODE_FAILED`);
				console.log(error instanceof Error ? error.message : String(error));
				process.exitCode = ExitCode.GENERAL_ERROR;
			}
		});
}

function createMotionDoctorCommand(): Command {
	return new Command('doctor')
		.description('Check motion tools and optional PNG frame directory')
		.argument('[framesDir]', 'Directory containing PNG frames')
		.option('--json', 'Output structured JSON')
		.option('--verbose', 'Show details even when there are no issues')
		.action(
			async (framesDir: string | undefined, options: MotionDoctorOptions) => {
				const runner = new BunCommandRunner();
				const resolver = new LocalToolResolver(runner);
				const result = await runMotionDoctor(framesDir, resolver);

				if (options.json) {
					console.log(JSON.stringify(result, null, 2));
				} else {
					console.log('Motion Doctor');
					renderToolResolutions(result.toolResolutions);
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

				process.exitCode = hasBlockingMotionIssues(result.issues)
					? ExitCode.GENERAL_ERROR
					: ExitCode.SUCCESS;
			},
		);
}

function createMotionInstallCommand(): Command {
	return new Command('install')
		.description('Show motion tool installation plan')
		.option('--check', 'Show planned tools without installing')
		.action(() => {
			console.log('Motion tools');
			console.log('- gifski   encode GIF from PNG frames');
			console.log('- apngasm  encode APNG from PNG frames');
			console.log('');
			console.log('Run mise install to install configured tools.');
			process.exitCode = ExitCode.SUCCESS;
		});
}

function renderMotionPlan(plan: MotionPlan): void {
	console.log('Motion Plan');
	console.log(`Format      ${plan.format.toUpperCase()}`);
	console.log(`Frames      ${plan.frames.length}`);
	console.log(`FPS         ${plan.fps}`);
	console.log(`Duration    ${plan.durationSeconds.toFixed(2)}s`);
	console.log(`Size        ${plan.width} x ${plan.height}`);
	console.log(`Output      ${plan.outputPath}`);
	console.log(`Tool        ${plan.tool}`);
}

function renderToolResolutions(
	resolutions: Awaited<ReturnType<typeof runMotionDoctor>>['toolResolutions'],
): void {
	for (const resolution of resolutions) {
		const capability = resolution.requirement.capability;
		if (resolution.selected) {
			console.log(
				`${capability} available (${resolution.selected.name}${resolution.selected.version ? ` ${resolution.selected.version}` : ''})`,
			);
		} else {
			console.log(`${capability} missing`);
		}
	}
}

function renderIssues(issues: MotionIssue[]): void {
	for (const issue of issues) {
		console.log(`${issue.severity.toUpperCase()} ${issue.code}`);
		console.log(issue.message);
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

export const motionCommand = createMotionCommand('motion');
export const mgCommand = createMotionCommand('mg');
