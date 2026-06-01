import { Command } from 'commander';
import pc from 'picocolors';
import {
	buildWorkspacePlan,
	createWorkspace,
	formatFriendlyPath,
	loadWorkspaceConfig,
	sanitizeCustomType,
	type WorkspaceAnswers,
	WorkspaceError,
	type WorkspacePlan,
} from '../../core/workspace/index.ts';
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
	multiValueLines,
} from '../../utils/receipt.ts';

const CUSTOM_TYPE_VALUE = '__custom__';
let plainInputQueue: Promise<string[]> | undefined;

const WORKSPACE_HELP = `Wave Workspace
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave workspace
    wave workspace create

  Commands:
    create          Create a local design project workspace

  Config:
    ~/.config/wave/workspace.yaml
    WAVE_WORKSPACE_CONFIG=/tmp/workspace.yaml

  Options:
    -h, --help      Show help

  For more help on a command:
    wave workspace create --help`;

export function createWorkspaceCommand(name = 'workspace'): Command {
	const command = new Command(name)
		.description('Create local design project workspaces')
		.helpOption('-h, --help', 'Show help')
		.configureHelp({ formatHelp: () => WORKSPACE_HELP })
		.addHelpCommand(false)
		.action(async () => {
			await runWorkspaceCreate();
		});

	command
		.command('create')
		.description('Create a local design project workspace')
		.action(async () => {
			await runWorkspaceCreate();
		});

	command.command('help', { hidden: true }).action(() => {
		console.log(WORKSPACE_HELP);
	});

	return command;
}

async function runWorkspaceCreate(): Promise<void> {
	try {
		const config = await loadWorkspaceConfig();
		const answers = await promptWorkspaceAnswers(config);
		const plan = buildWorkspacePlan(config, answers);
		if (!(await confirmWorkspacePlan(plan))) {
			process.exitCode = ExitCode.SUCCESS;
			return;
		}
		const result = await createWorkspace(plan);
		console.log(renderWorkspaceReceipt(result));
		if (result.openWarning) {
			console.warn(`Warning: ${result.openWarning}`);
		}
		process.exitCode = ExitCode.SUCCESS;
	} catch (error) {
		if (error instanceof WorkspaceError) {
			console.error(error.message);
		} else {
			console.error(error instanceof Error ? error.message : String(error));
		}
		process.exitCode = ExitCode.GENERAL_ERROR;
	}
}

async function promptWorkspaceAnswers(
	config: Awaited<ReturnType<typeof loadWorkspaceConfig>>,
): Promise<WorkspaceAnswers> {
	if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
		return promptWorkspaceAnswersTty(config);
	}
	return promptWorkspaceAnswersPlain(config);
}

async function promptWorkspaceAnswersTty(
	config: Awaited<ReturnType<typeof loadWorkspaceConfig>>,
): Promise<WorkspaceAnswers> {
	const { isCancel, select, text } = await import('@clack/prompts');
	const answers: WorkspaceAnswers = { title: '' };

	for (const part of config.name.parts) {
		if (part === 'type' && config.type.enabled) {
			const selected = await select({
				message: 'Type',
				initialValue: config.type.default,
				options: [
					...config.type.content.map((entry) => ({
						value: entry.code,
						label: `${entry.code} ${entry.label}`,
					})),
					{ value: CUSTOM_TYPE_VALUE, label: 'Custom...' },
				],
			});
			if (isCancel(selected)) throw new Error('Workspace creation cancelled.');
			if (selected === CUSTOM_TYPE_VALUE) {
				const custom = await text({ message: 'Custom type' });
				if (isCancel(custom)) throw new Error('Workspace creation cancelled.');
				answers.type = sanitizeCustomType(String(custom));
			} else {
				answers.type = String(selected);
			}
		}
		if (part === 'title' && config.title.enabled) {
			const title = await text({
				message: 'Project title',
				validate: (value) => (value?.trim() ? undefined : 'Title is required'),
			});
			if (isCancel(title)) throw new Error('Workspace creation cancelled.');
			answers.title = String(title);
		}
		if (part === 'version' && config.version.enabled) {
			const version = await text({
				message: 'Version',
				placeholder: config.version.default,
			});
			if (isCancel(version)) throw new Error('Workspace creation cancelled.');
			answers.version = String(version);
		}
		if (part === 'tags' && config.tags.enabled) {
			const tags = await text({ message: 'Tags', placeholder: 'UI,前端' });
			if (isCancel(tags)) throw new Error('Workspace creation cancelled.');
			answers.tags = String(tags);
		}
	}

	return answers;
}

async function promptWorkspaceAnswersPlain(
	config: Awaited<ReturnType<typeof loadWorkspaceConfig>>,
): Promise<WorkspaceAnswers> {
	const answers: WorkspaceAnswers = { title: '' };
	for (const part of config.name.parts) {
		if (part === 'type' && config.type.enabled) {
			const choices = config.type.content.map((entry) => entry.code).join('/');
			const defaultType =
				config.type.default ?? config.type.content[0]?.code ?? '';
			const input = await nextPlainAnswer(
				`Type (${choices}/Custom) [${defaultType}]: `,
			);
			const trimmed = input.trim();
			answers.type = trimmed ? sanitizeCustomType(trimmed) : defaultType;
		}
		if (part === 'title' && config.title.enabled) {
			answers.title = (await nextPlainAnswer('Project title: ')).trim();
		}
		if (part === 'version' && config.version.enabled) {
			const input = await nextPlainAnswer(
				`Version [${config.version.default ?? ''}]: `,
			);
			answers.version = input.trim();
		}
		if (part === 'tags' && config.tags.enabled) {
			answers.tags = (await nextPlainAnswer('Tags: ')).trim();
		}
	}
	return answers;
}

async function confirmWorkspacePlan(plan: WorkspacePlan): Promise<boolean> {
	const message = [
		`Workspace: ${plan.workspaceName}`,
		`Target: ${plan.displayPath}`,
		`Folders: ${plan.folders.length}`,
	].join('\n');

	if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
		const { confirm, isCancel } = await import('@clack/prompts');
		const confirmed = await confirm({
			message,
			initialValue: true,
		});
		if (isCancel(confirmed)) return false;
		return confirmed;
	}

	console.log(message);
	const answer = await nextPlainAnswer('Create workspace? [y/N] ');
	return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

export function renderWorkspaceReceipt(result: WorkspacePlan): string {
	const width = Math.max(boxWidth() - 4, 76);
	const lines: string[] = [];
	lines.push(borderTop(width));
	lines.push(line('', width));
	lines.push(centerLine(pc.yellow('✦  WORKSPACE  ✦'), width));
	lines.push(line('', width));
	lines.push(centerLine(result.workspaceName, width));
	lines.push(line('', width));
	lines.push(midSolid(width));
	if (result.type) lines.push(kvLine('Type', result.type, undefined, width));
	lines.push(kvLine('Project', result.title, undefined, width));
	if (result.version) {
		lines.push(kvLine('Version', result.version, undefined, width));
	}
	lines.push(
		kvLine('Workspace', formatFriendlyPath(result.targetDir), undefined, width),
	);
	lines.push(midDashed(width));
	lines.push(
		...multiValueLines(
			'FOLDERS',
			result.folders.map((folder) => folder.path),
			width,
		),
	);
	lines.push(midSolid(width));
	lines.push(line('', width));
	lines.push(centerLine(pc.green('Workspace created'), width));
	lines.push(line('', width));
	lines.push(borderBottom(width));
	return lines.join('\n');
}

export const workspaceCommand = createWorkspaceCommand('workspace');

async function nextPlainAnswer(prompt: string): Promise<string> {
	process.stdout.write(prompt);
	const queue = await getPlainInputQueue();
	return queue.shift() ?? '';
}

async function getPlainInputQueue(): Promise<string[]> {
	plainInputQueue ??= readAllStdinLines();
	return plainInputQueue;
}

async function readAllStdinLines(): Promise<string[]> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf-8').split(/\r?\n/);
}
