import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateTheme } from '../src/core/pipeline/theme-service.ts';
import type { SketchPayloadV2 } from '../src/types/index.ts';

/**
 * sketch payload v2 合同集成测试（Milestone-4）：
 * - meta.themeId / baseId 管道全链路（当前文档身份 / named profile 的 main 身份；main 的 baseId = themeId）
 * - 未入账记录省略 uuid；main 未登记 `$id` 时 themeId/baseId 回退 `$config.theme` stem（决策 5 / 6 修订）
 * - orca-test 缺口内化：扁平 name 前缀共存（hermetic fixture）
 * - outline ring 颜色位置输出 HEX8 快照（不绑定同清单 color uuid）
 * - fontWeight 刻度仅 sketch pass 报错的平台合同（对照测试）
 */

const THEME_ID = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const PROFILE_ID = '102132435465768798a9bacbdcedfe0f';
const COLOR_SHADOW_UUID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

async function copyFixtureWorkspace(relativePath: string): Promise<string> {
	const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-v2-'));
	await fs.cp(
		path.join(import.meta.dir, 'fixtures', relativePath),
		workspaceDir,
		{
			recursive: true,
			filter: (source) =>
				!['.DS_Store', 'dist', 'theme'].includes(path.basename(source)),
		},
	);
	return workspaceDir;
}

async function readSketch(
	workspaceDir: string,
	relativePath: string,
): Promise<SketchPayloadV2> {
	return JSON.parse(
		await fs.readFile(path.join(workspaceDir, relativePath), 'utf-8'),
	) as SketchPayloadV2;
}

function assetByName(payload: SketchPayloadV2, name: string) {
	return payload.assets.find((asset) => asset.name === name);
}

describe('sketch payload v2 contract', () => {
	test('main build carries document $id into meta and snapshots ring color', async () => {
		const workspaceDir = await copyFixtureWorkspace('themes/sketch-payload-v2');
		try {
			const result = await generateTheme({
				workspacePath: path.join(workspaceDir, 'main.yaml'),
				generateOptions: { night: false },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);

			const payload = await readSketch(
				workspaceDir,
				path.join('dist', 'sketch-payload-v22sketch.json'),
			);
			expect(payload.meta).toEqual({
				themeId: THEME_ID,
				baseId: THEME_ID,
				mode: 'day',
				version: 2,
			});

			// 名字前缀共存：color "shadow" 与 layer "shadow/elevation-high"。
			expect(assetByName(payload, 'shadow')).toEqual({
				uuid: COLOR_SHADOW_UUID,
				name: 'shadow',
				kind: 'color',
				color: '#0f172bff',
			});
			expect(assetByName(payload, 'shadow/elevation-high')).toMatchObject({
				kind: 'layer',
			});

			// Fixture migration registers the former empty identity slot.
			expect(assetByName(payload, 'unregistered')).toEqual({
				uuid: '86a008b300853b1a92937666082377e3',
				name: 'unregistered',
				kind: 'color',
				color: '#1872f0ff',
			});

			// outline ring 的颜色位置是可直接读取的 HEX8 快照。
			const ring = assetByName(payload, 'outline-focus');
			expect(ring).toMatchObject({ kind: 'layer' });
			expect(
				ring && 'shadows' in ring ? ring.shadows?.[0]?.color : undefined,
			).toBe('#2563ebff');
		} finally {
			await fs.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	test('profile build has its own nullable identity and links to main', async () => {
		const workspaceDir = await copyFixtureWorkspace('themes/sketch-payload-v2');
		try {
			const result = await generateTheme({
				workspacePath: path.join(workspaceDir, 'main.yaml'),
				generateOptions: { night: false, profile: 'dark' },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);

			const payload = await readSketch(
				workspaceDir,
				path.join('dist', 'sketch-payload-v2-dark2sketch.json'),
			);
			expect(payload.meta).toEqual({
				themeId: null,
				baseId: THEME_ID,
				mode: 'day',
				version: 2,
			});
			expect(assetByName(payload, 'shadow')).toMatchObject({
				uuid: COLOR_SHADOW_UUID,
				color: '#e2e8f0ff',
			});
			expect(assetByName(payload, 'shadow/elevation-high')).toMatchObject({
				kind: 'layer',
			});
		} finally {
			await fs.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	test('named profile carries its own document identity', async () => {
		const workspaceDir = await copyFixtureWorkspace('themes/sketch-payload-v2');
		try {
			const profilePath = path.join(workspaceDir, 'profiles', 'dark.yaml');
			const profileContent = await fs.readFile(profilePath, 'utf-8');
			await fs.writeFile(
				profilePath,
				`$id: ${PROFILE_ID}\n${profileContent.replace(/^\$id:.*\n/, '')}`,
			);
			await fs.writeFile(
				path.join(workspaceDir, 'profiles', 'dark@night.yaml'),
				'theme:\n  color:\n    shadow:\n      $value: "#ffffff"\n',
			);
			const result = await generateTheme({
				workspacePath: path.join(workspaceDir, 'main.yaml'),
				generateOptions: { night: true, profile: 'dark' },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			const payload = await readSketch(
				workspaceDir,
				path.join('dist', 'sketch-payload-v2-dark2sketch.json'),
			);
			expect(payload.meta).toEqual({
				themeId: PROFILE_ID,
				baseId: THEME_ID,
				mode: 'day',
				version: 2,
			});
			const nightPayload = await readSketch(
				workspaceDir,
				path.join('dist', 'sketch-payload-v2-dark-night2sketch.json'),
			);
			// Night keeps Day themeId/baseId; mode distinguishes appearance.
			expect(nightPayload.meta).toEqual({
				themeId: PROFILE_ID,
				baseId: THEME_ID,
				mode: 'night',
				version: 2,
			});
			expect(assetByName(nightPayload, 'shadow')).toMatchObject({
				color: '#ffffffff',
			});
		} finally {
			await fs.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	test('unregistered theme derives themeId/baseId from $config.theme stem', async () => {
		const workspaceDir = await copyFixtureWorkspace('themes/sketch-extensions');
		try {
			const result = await generateTheme({
				workspacePath: path.join(workspaceDir, 'main.yaml'),
				generateOptions: { night: false },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);

			const payload = await readSketch(
				workspaceDir,
				path.join('theme', 'sketch', 'sketch-extensions2sketch.json'),
			);
			// Unregistered main: derive concrete series id from `$config.theme` stem.
			expect(payload.meta).toEqual({
				themeId: 'sketch-extensions',
				baseId: 'sketch-extensions',
				mode: 'day',
				version: 2,
			});
			expect(
				assetByName(payload, 'foundation/color/color-primary-main'),
			).toEqual({
				name: 'foundation/color/color-primary-main',
				kind: 'color',
				color: '#1872f0ff',
			});
		} finally {
			await fs.rm(workspaceDir, { recursive: true, force: true });
		}
	});

	test('registered identity coexists with value-level $ref materialization', async () => {
		const tempThemeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-id-ref-'),
		);
		const outputDir = path.join(tempThemeDir, 'out');
		try {
			await fs.writeFile(
				path.join(tempThemeDir, 'main.yaml'),
				[
					'$id: 0f1e2d3c4b5a69788796a5b4c3d2e1f0',
					'$config:',
					'  theme: identity-value-ref',
					'  parameter:',
					'    outputDir: ./out',
					'    platform: [json, sketch]',
					'    filterLayer: 2',
					'theme:',
					'  color:',
					'    $type: color',
					'    base:',
					'      $id: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
					'      $value: "#0f172b"',
					'  shadow:',
					'    $type: shadow',
					'    soft:',
					'      $value:',
					'        color:',
					'          $ref: "#/theme/color/base"',
					'          alpha: 0.06',
					'        offsetX: 0',
					'        offsetY: 2',
					'        blur: 4',
					'        spread: 0',
					'',
				].join('\n'),
				'utf-8',
			);

			// 回归目标：ids 登记后，值级 $ref（不带 /$value）物化不得把目标
			// 节点的 $id 带入值层（schema 值层校验曾以 Unknown field "$id" 拒绝）。
			const result = await generateTheme({
				workspacePath: path.join(tempThemeDir, 'main.yaml'),
				generateOptions: { night: false },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);

			const payload = await readSketch(
				tempThemeDir,
				path.join('out', 'identity-value-ref2sketch.json'),
			);
			const layer = assetByName(payload, 'soft');
			expect(layer).toMatchObject({ kind: 'layer' });
			expect(
				layer && 'shadows' in layer ? layer.shadows?.[0]?.color : undefined,
			).toBe('#0f172b0f');

			// 决策 8：其余格式不携带任何 id。
			const json = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'identity-value-ref.json'),
					'utf-8',
				),
			) as Record<string, unknown>;
			expect(JSON.stringify(json)).not.toContain('$id');
		} finally {
			await fs.rm(tempThemeDir, { recursive: true, force: true });
		}
	});

	test('fontWeight scale fails only the sketch pass, not css/json', async () => {
		const tempThemeDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-weight-'),
		);
		const outputDir = path.join(tempThemeDir, 'out');
		try {
			await fs.writeFile(
				path.join(tempThemeDir, 'main.yaml'),
				[
					'$config:',
					'  theme: weight-scale',
					'  parameter:',
					'    outputDir: ./out',
					'    platform: [json, css, sketch]',
					'theme:',
					'  font:',
					'    body:',
					'      $type: typography',
					'      $value:',
					'        fontFamily: Inter',
					'        fontSize: 14',
					'        fontWeight: 250',
					'        lineHeight: 1.5',
					'        letterSpacing: 0',
					'',
				].join('\n'),
				'utf-8',
			);

			// CSS / JSON 平台不受 sketch 平台合同约束。
			const permissive = await generateTheme({
				workspacePath: path.join(tempThemeDir, 'main.yaml'),
				cliPlatform: 'json,css',
				generateOptions: { night: false },
			});
			expect(
				permissive.ok,
				permissive.ok ? undefined : permissive.message,
			).toBe(true);
			const json = JSON.parse(
				await fs.readFile(path.join(outputDir, 'weight-scale.json'), 'utf-8'),
			);
			expect(json['theme-font-body'].fontWeight).toBe(250);
			const css = await fs.readFile(
				path.join(outputDir, 'weight-scale.css'),
				'utf-8',
			);
			expect(css).toContain('--theme-font-body-weight: 250;');

			// sketch pass fail-fast。
			const sketchPass = await generateTheme({
				workspacePath: path.join(tempThemeDir, 'main.yaml'),
				generateOptions: { night: false },
			});
			expect(sketchPass.ok).toBe(false);
			if (!sketchPass.ok) {
				expect(sketchPass.message).toContain(
					'fontWeight 250 is off the Sketch 100-900 integer-hundred scale',
				);
			}
		} finally {
			await fs.rm(tempThemeDir, { recursive: true, force: true });
		}
	});
});
