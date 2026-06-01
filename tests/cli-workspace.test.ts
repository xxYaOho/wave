import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	buildWorkspacePlan,
	createWorkspace,
	DEFAULT_WORKSPACE_CONFIG,
	loadWorkspaceConfig,
	sanitizeCustomType,
	validateWorkspaceConfig,
	WorkspaceError,
} from '../src/core/workspace/index.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');

async function runWave(
	args: string[],
	options: { cwd?: string; env?: Record<string, string>; input?: string } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd: options.cwd ?? rootDir,
		env: { ...process.env, ...options.env },
		stdin: 'pipe',
		stdout: 'pipe',
		stderr: 'pipe',
	});

	proc.stdin.write(options.input ?? '');
	proc.stdin.end();

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { exitCode, stdout, stderr };
}

describe('wave workspace', () => {
	test('top-level help includes workspace command', async () => {
		const { exitCode, stdout } = await runWave(['--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain(
			'workspace      Create local design project workspaces',
		);
	});

	test('module help is actionable', async () => {
		const { exitCode, stdout } = await runWave(['workspace', '--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Wave Workspace');
		expect(stdout).toContain('wave workspace');
		expect(stdout).toContain('wave workspace create');
		expect(stdout).toContain('WAVE_WORKSPACE_CONFIG');
	});

	test('built-in config creates foldify-p equivalent structure', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-workspace-'));
		try {
			const config = {
				...DEFAULT_WORKSPACE_CONFIG,
				baseDir: tempDir,
				openAfterCreate: false,
			};
			const plan = buildWorkspacePlan(
				config,
				{
					type: 'FEAT',
					title: '项目名',
					tags: 'UI,前端',
					date: new Date(2026, 5, 1),
				},
				{ cwd: tempDir },
			);
			const result = await createWorkspace(plan);

			expect(result.workspaceName).toBe('FEAT_项目名_20260601_[UI][前端]');
			for (const folder of [
				'1.Docs',
				'2.Public',
				'3.Reference',
				'4.Output',
				'9.Archive',
			]) {
				expect(
					(await fs.stat(path.join(result.targetDir, folder))).isDirectory(),
				).toBe(true);
			}
			expect(
				await Bun.file(
					path.join(result.targetDir, '1.Docs', '_需求文档或其他资料'),
				).exists(),
			).toBe(true);
			const readme = await fs.readFile(
				path.join(result.targetDir, 'README.md'),
				'utf-8',
			);
			expect(readme).toContain('# 项目名');
			expect(readme).not.toContain('Version:');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('custom config controls prompt and workspace name order', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-workspace-'));
		try {
			const configPath = path.join(tempDir, 'workspace.yaml');
			const baseDir = path.join(tempDir, 'work');
			await fs.writeFile(
				configPath,
				[
					`baseDir: ${JSON.stringify(baseDir)}`,
					'openAfterCreate: false',
					'name:',
					'  separator: "-"',
					'  parts: [title, type, version, tags]',
					'type:',
					'  enabled: true',
					'  default: VIZ',
					'  content:',
					'    - code: VIZ',
					'      label: 可视化项目',
					'    - code: CRIP',
					'      label: CRIP 项目',
					'title:',
					'  enabled: true',
					'  required: true',
					'version:',
					'  enabled: true',
					'  default: v1.0.0',
					'  prefix: v',
					'date:',
					'  enabled: false',
					'  format: YYYYMMDD',
					'tags:',
					'  enabled: true',
					'  style: bracket',
					'folders:',
					'  - path: Docs',
					'    placeholder: _brief',
					'  - path: Output',
				].join('\n'),
				'utf-8',
			);

			const result = await runWave(['workspace'], {
				env: {
					HOME: tempDir,
					WAVE_WORKSPACE_CONFIG: configPath,
				},
				input: '项目名\nCRIP\n1.2.3\nUI,前端\ny\n',
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('WORKSPACE');
			expect(result.stdout).toContain('项目名-CRIP-v1.2.3-[UI][前端]');
			expect(result.stdout).toContain('Version             v1.2.3');
			expect(result.stdout).toContain('FOLDERS             Docs');
			expect(result.stdout).not.toContain('_brief');
			expect(
				await Bun.file(
					path.join(baseDir, '项目名-CRIP-v1.2.3-[UI][前端]', 'Docs', '_brief'),
				).exists(),
			).toBe(true);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('custom type is normalized and does not mutate config', async () => {
		const config = structuredClone(DEFAULT_WORKSPACE_CONFIG);
		config.type.default = 'FEAT';

		expect(sanitizeCustomType(' new 类型! ')).toBe('NEW_类型');
		const plan = buildWorkspacePlan(config, {
			type: ' new 类型! ',
			title: '项目',
			tags: '',
			date: new Date(2026, 5, 1),
		});

		expect(plan.workspaceName).toBe('NEW_类型_项目_20260601');
		expect(config.type.content.map((entry) => entry.code)).not.toContain(
			'NEW_类型',
		);
	});

	test('target directory exists fails without overwrite', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-workspace-'));
		try {
			const config = {
				...DEFAULT_WORKSPACE_CONFIG,
				baseDir: tempDir,
				openAfterCreate: false,
			};
			const plan = buildWorkspacePlan(config, {
				type: 'FEAT',
				title: '已存在',
				tags: '',
			});
			await fs.mkdir(plan.targetDir, { recursive: true });

			await expect(createWorkspace(plan)).rejects.toMatchObject({
				code: 'WWK_WORKSPACE_EXISTS',
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('invalid configs return expected WWK codes', async () => {
		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				name: { separator: '_', parts: ['unknown'] },
			}),
		).toThrow('WWK_NAME_PART_UNKNOWN');

		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				type: { enabled: true, default: 'FEAT', content: [] },
			}),
		).toThrow('WWK_TYPE_EMPTY');

		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				type: {
					enabled: true,
					default: 'MISS',
					content: [{ code: 'FEAT', label: '新功能开发' }],
				},
			}),
		).toThrow('WWK_TYPE_DEFAULT_INVALID');

		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				folders: [{ path: '../escape' }],
			}),
		).toThrow('WWK_FOLDER_PATH_INVALID');

		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				openAfterCreate: 'flase',
			}),
		).toThrow('WWK_CONFIG_INVALID');

		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				name: { separator: '/', parts: ['type', 'title'] },
			}),
		).toThrow('WWK_FOLDER_PATH_INVALID');

		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				type: {
					enabled: true,
					default: '../FEAT',
					content: [{ code: '../FEAT', label: 'Bad type' }],
				},
			}),
		).toThrow('WWK_FOLDER_PATH_INVALID');

		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				version: { enabled: true, default: 'v1.0.0', prefix: '../v' },
			}),
		).toThrow('WWK_FOLDER_PATH_INVALID');

		expect(() =>
			validateWorkspaceConfig({
				...DEFAULT_WORKSPACE_CONFIG,
				folders: [{ path: 'Docs', placeholder: '../../escape' }],
			}),
		).toThrow('WWK_FOLDER_PATH_INVALID');
	});

	test('workspace name parts cannot escape baseDir', () => {
		const config = structuredClone(DEFAULT_WORKSPACE_CONFIG);
		config.name.parts = ['title'];
		config.type.enabled = false;
		config.date.enabled = false;
		config.tags.enabled = false;

		expect(() =>
			buildWorkspacePlan(config, { title: '../../escaped' }),
		).toThrow('WWK_FOLDER_PATH_INVALID');

		expect(() => buildWorkspacePlan(config, { title: '/escaped' })).toThrow(
			'WWK_FOLDER_PATH_INVALID',
		);
	});

	test('tags cannot introduce path traversal into workspace name', () => {
		const config = structuredClone(DEFAULT_WORKSPACE_CONFIG);
		config.name.parts = ['title', 'tags'];
		config.type.enabled = false;
		config.date.enabled = false;

		expect(() =>
			buildWorkspacePlan(config, { title: '项目', tags: '../escape' }),
		).toThrow('WWK_FOLDER_PATH_INVALID');
	});

	test('config parse failure uses WWK_CONFIG_PARSE_FAILED', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-workspace-'));
		try {
			const configPath = path.join(tempDir, 'bad.yaml');
			await fs.writeFile(configPath, 'baseDir: [ : bad', 'utf-8');

			await expect(loadWorkspaceConfig(configPath)).rejects.toBeInstanceOf(
				WorkspaceError,
			);
			await expect(loadWorkspaceConfig(configPath)).rejects.toMatchObject({
				code: 'WWK_CONFIG_PARSE_FAILED',
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('version disabled skips prompt, name, receipt row, and README version', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-workspace-'));
		try {
			const configPath = path.join(tempDir, 'workspace.yaml');
			await fs.writeFile(
				configPath,
				[
					`baseDir: ${JSON.stringify(path.join(tempDir, 'work'))}`,
					'openAfterCreate: false',
					'name:',
					'  separator: "_"',
					'  parts: [type, title, version, date]',
					'type:',
					'  enabled: true',
					'  default: FEAT',
					'  content:',
					'    - code: FEAT',
					'      label: 新功能开发',
					'title:',
					'  enabled: true',
					'  required: true',
					'version:',
					'  enabled: false',
					'  default: v1.0.0',
					'  prefix: v',
					'date:',
					'  enabled: true',
					'  format: YYYYMMDD',
					'tags:',
					'  enabled: false',
					'  style: bracket',
					'folders: []',
				].join('\n'),
				'utf-8',
			);

			const result = await runWave(['workspace'], {
				env: { HOME: tempDir, WAVE_WORKSPACE_CONFIG: configPath },
				input: '\n项目\ny\n',
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('FEAT_项目_20260601');
			expect(result.stdout).not.toContain('Version');
			expect(result.stdout).not.toContain('v1.0.0');
			const readme = await fs.readFile(
				path.join(tempDir, 'work', 'FEAT_项目_20260601', 'README.md'),
				'utf-8',
			);
			expect(readme).not.toContain('Version:');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
