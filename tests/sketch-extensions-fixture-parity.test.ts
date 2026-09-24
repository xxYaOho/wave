import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { load as jsYamlLoad } from 'js-yaml';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../src/core/pipeline/theme-service.ts';

/**
 * M2 Task-4 行为快照：迁移前固化，迁移后必须逐字段不变。
 *
 * 快照对象 = 真实构建（generateTheme）产出的 sketch payload（按键排序的
 * 确定性序列化）。sketch 扩展的全部行为面都落在 payload 形状里：
 * group 级 path/skip 继承、outline 模拟（shadow 记录）、property 白名单
 * （opacity / cornerRadius）。
 *
 * 附：形态计数测试锁定迁移后的 `$extensions.platform.sketch` 节点数
 * （131 sketch + 7 outline）且旧形态清零。
 */

const WORKSPACES: Array<{
	theme: string;
	profiles: 'all' | 'main' | 'per-profile';
}> = [
	{ theme: 'sketch-extensions', profiles: 'main' },
	{ theme: 'profile-model', profiles: 'main' },
	{ theme: 'orca-realistic', profiles: 'all' },
	// orca-test 的 --profiles all 组合构建在基线即报 Duplicate Sketch output
	// path（与本里程碑无关的生成器命名问题，见 M2 报告 ESCALATE），
	// 快照采用 main + 逐 profile 构建，覆盖面等价。
	{ theme: 'orca-test', profiles: 'per-profile' },
];

const CLEANUP_DIRS: string[] = [];
const ENV_KEYS = [
	'WAVE_RESOURCE_CACHE_DIR',
	'WAVE_RESOURCE_STATE_PATH',
	'WAVE_RESOURCE_CONFIG_DIR',
] as const;

function applyResourceEnv(dir: string): Record<string, string | undefined> {
	const previous: Record<string, string | undefined> = {};
	for (const key of ENV_KEYS) previous[key] = process.env[key];
	process.env.WAVE_RESOURCE_CACHE_DIR = path.join(dir, '.wave-cache');
	process.env.WAVE_RESOURCE_STATE_PATH = path.join(dir, '.wave-state.json');
	process.env.WAVE_RESOURCE_CONFIG_DIR = path.join(dir, '.wave-config');
	return previous;
}

function restoreResourceEnv(
	previous: Record<string, string | undefined>,
): void {
	for (const key of ENV_KEYS) {
		const value = previous[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

/** 递归按键排序的确定性序列化（数组保序：记录顺序是合同）。 */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		const keys = Object.keys(value as Record<string, unknown>).sort();
		return `{${keys
			.map(
				(k) =>
					`${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
			)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

async function collectSketchDigests(
	dir: string,
): Promise<Record<string, string>> {
	const digests: Record<string, string> = {};
	async function walk(current: string): Promise<void> {
		for (const entry of (
			await fs.readdir(current, { withFileTypes: true })
		).sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				if (
					[
						'.wave-cache',
						'.wave-state.json',
						'.wave-config',
						'node_modules',
					].includes(entry.name)
				)
					continue;
				await walk(full);
			} else if (entry.name.endsWith('2sketch.json')) {
				const json = JSON.parse(await fs.readFile(full, 'utf8'));
				digests[path.relative(dir, full)] = stableStringify(json);
			}
		}
	}
	await walk(dir);
	return digests;
}

async function buildWorkspace(
	theme: string,
	profiles: 'all' | 'main' | 'per-profile',
): Promise<Record<string, string>> {
	const sourceDir = path.resolve(import.meta.dir, 'fixtures/themes', theme);
	const workspaceDir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'wave-m2-parity-'),
	);
	CLEANUP_DIRS.push(workspaceDir);
	await fs.cp(sourceDir, workspaceDir, {
		recursive: true,
		filter: (source) =>
			!['.DS_Store', '.tmp', 'theme', 'dist', 'build'].includes(
				path.basename(source),
			),
	});
	const previousEnv = applyResourceEnv(workspaceDir);
	try {
		const digests: Record<string, string> = {};
		const builds: ThemeGenerationInput[] =
			profiles === 'all'
				? [
						{
							workspacePath: path.join(workspaceDir, 'main.yaml'),
							generateOptions: { night: false, profiles: 'all' },
						},
					]
				: profiles === 'main'
					? [
							{
								workspacePath: path.join(workspaceDir, 'main.yaml'),
								generateOptions: { night: false },
							},
						]
					: [
							{
								workspacePath: path.join(workspaceDir, 'main.yaml'),
								generateOptions: { night: false },
							},
							...(await fs.readdir(path.join(workspaceDir, 'profiles')))
								.filter((name) => name.endsWith('.yaml'))
								.sort()
								.map((name) => ({
									workspacePath: path.join(workspaceDir, 'main.yaml'),
									generateOptions: {
										night: false,
										profile: name.replace(/\.yaml$/, ''),
									},
								})),
						];
		for (const input of builds) {
			const result = await generateTheme(input);
			if (!result.ok) {
				const known =
					typeof result.message === 'string' &&
					result.message.includes('Duplicate Sketch output path');
				if (!known) {
					throw new Error(
						`generateTheme failed for ${theme} (${JSON.stringify(input.generateOptions)}): ${result.message ?? 'unknown'}`,
					);
				}
				// 基线既有的组合/单 profile 构建失败：作为失败模式锁定进快照，
				// 迁移前后必须逐字一致（见报告 ESCALATE）。
				const profileName =
					'profile' in input.generateOptions && input.generateOptions.profile
						? `orca-${input.generateOptions.profile}`
						: theme;
				digests[`${profileName}2sketch.json`] =
					`__PRE_EXISTING_FAILURE__: ${result.message}`;
				continue;
			}
			Object.assign(digests, await collectSketchDigests(workspaceDir));
		}
		return digests;
	} finally {
		restoreResourceEnv(previousEnv);
	}
}

/** 统计 theme 树中 $extensions 下 sketch/legacy 形态节点数（数据层真值）。 */
function countSketchForms(node: unknown): { legacy: number; platform: number } {
	let legacy = 0;
	let platform = 0;
	const visit = (value: unknown): void => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return;
		const obj = value as Record<string, unknown>;
		const ext = obj.$extensions;
		if (ext && typeof ext === 'object' && !Array.isArray(ext)) {
			const e = ext as Record<string, unknown>;
			if ('sketch' in e || 'outline' in e) legacy++;
			if ('platform' in e) platform++;
		}
		for (const child of Object.values(obj)) visit(child);
	};
	visit(node);
	return { legacy, platform };
}

describe('sketch extensions fixture parity (M2 Task-4)', () => {
	for (const { theme, profiles } of WORKSPACES) {
		test(`${theme}: sketch payload behavior snapshot`, async () => {
			const digests = await buildWorkspace(theme, profiles);
			expect(Object.keys(digests).length).toBeGreaterThan(0);
			expect(stableStringify(digests)).toMatchSnapshot();
		});
	}

	test('post-migration form counts: legacy zero, platform.sketch 131+7', async () => {
		let legacyTotal = 0;
		let platformTotal = 0;
		const perWorkspace: Record<string, { legacy: number; platform: number }> =
			{};
		for (const { theme } of WORKSPACES) {
			const dir = path.resolve(import.meta.dir, 'fixtures/themes', theme);
			const files = ['main.yaml'];
			try {
				for (const name of (
					await fs.readdir(path.join(dir, 'profiles'))
				).sort()) {
					if (name.endsWith('.yaml')) files.push(path.join('profiles', name));
				}
			} catch {
				// 无 profiles 目录
			}
			const totals = { legacy: 0, platform: 0 };
			for (const rel of files) {
				const data = jsYamlLoad(
					await fs.readFile(path.join(dir, rel), 'utf8'),
				) as Record<string, unknown>;
				const counts = countSketchForms(data.theme ?? {});
				totals.legacy += counts.legacy;
				totals.platform += counts.platform;
			}
			perWorkspace[theme] = totals;
			legacyTotal += totals.legacy;
			platformTotal += totals.platform;
		}

		// 旧形态清零（Task-5 之后保持）
		expect(legacyTotal).toBe(0);
		// 平台形态节点数 = 清点基准的唯一节点数：138 处提及中 5 处为
		// outline+sketch 同节点（orca-test main/app-dsh/viz-global/viz-jzy/
		// viz-sdjy），合并后 133 个 platform.sketch 节点
		expect(platformTotal).toBe(133);
		expect(perWorkspace).toEqual({
			'sketch-extensions': { legacy: 0, platform: 4 },
			'profile-model': { legacy: 0, platform: 2 },
			'orca-realistic': { legacy: 0, platform: 20 },
			'orca-test': { legacy: 0, platform: 107 },
		});
	});
});

afterAll(async () => {
	await Promise.all(
		CLEANUP_DIRS.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});
