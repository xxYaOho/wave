/**
 * Theme Service 集成测试
 *
 * 测试主题生成的完整流程
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../src/core/pipeline/theme-service.ts';
import { BuildContext } from '../../src/utils/receipt.ts';
import {
	cleanupTempTheme,
	createTempTheme,
	loadTestTheme,
	type TestTheme,
} from '../utils/fixture-loader.ts';

function createTempOutputDir(): string {
	const dir = path.join(
		os.tmpdir(),
		`wave-test-output-${Math.random().toString(36).slice(2, 8)}`,
	);
	fs.mkdir(dir, { recursive: true });
	return dir;
}

function makeInput(
	overrides: Partial<ThemeGenerationInput> & {
		themeName: string;
		themePath: string;
	},
): ThemeGenerationInput {
	return {
		cliOutput: tempDir,
		generateOptions: { night: false },
		...overrides,
	};
}

let tempDir: string;

describe('Theme Service Integration', () => {
	afterAll(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	beforeAll(() => {
		tempDir = createTempOutputDir();
	});

	describe('标准主题生成', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('standard');
		});

		test('应成功生成主题', async () => {
			const result = await generateTheme(
				makeInput({ themeName: 'test-standard', themePath: theme.themefile }),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles.length).toBeGreaterThan(0);
			}
		});

		test('应生成 JSON 和 CSS 文件', async () => {
			const result = await generateTheme(
				makeInput({ themeName: 'test-standard', themePath: theme.themefile }),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const hasJson = result.generatedFiles.some((f) => f.endsWith('.json'));
				const hasCss = result.generatedFiles.some((f) => f.endsWith('.css'));
				expect(hasJson).toBe(true);
				expect(hasCss).toBe(true);
			}
		});

		test('锁定标准 DTCG 输出内容', async () => {
			const result = await generateTheme(
				makeInput({ themeName: 'test-standard', themePath: theme.themefile }),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const json = JSON.parse(
					await fs.readFile(path.join(tempDir, 'test-standard.json'), 'utf-8'),
				);
				const css = await fs.readFile(
					path.join(tempDir, 'test-standard.css'),
					'utf-8',
				);

				expect(json['theme-color-primary']).toMatch(/^#[0-9a-f]{6}$/i);
				expect(json['theme-color-text-muted']).toMatch(/^#[0-9a-f]{8}$/i);
				expect(json['theme-style-shadow-sm']).toEqual([
					{
						color: '#000000',
						alpha: 0.1,
						offsetX: 0,
						offsetY: 1,
						blur: 2,
						spread: 0,
					},
				]);
				expect(typeof json['theme-dimension-alpha-sm']).toBe('number');
				expect(css).toMatch(/--theme-color-primary: #[0-9a-f]{6};/i);
				expect(css).toContain(
					'--theme-style-shadow-sm: 0 1 2 0 rgb(0 0 0 / 1);',
				);
				expect(css).not.toContain('--theme-dimension-alpha-sm');
			}
		});
	});

	describe('profile model generation', () => {
		test('default build generates only main profile', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/profile-model/main.yaml',
			);

			const result = await generateTheme({
				themeName: 'profile-model',
				themePath,
				cliOutput: outputDir,
				generateOptions: { night: false },
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('profile-model.json');
				expect(result.generatedFiles).toContain('profile-model.css');
				expect(result.generatedFiles).not.toContain(
					'profile-model-mobile.json',
				);
			}
			await fs.rm(outputDir, { recursive: true, force: true });
		});

		test('profile build generates selected profile only', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/profile-model/main.yaml',
			);

			const result = await generateTheme({
				themeName: 'profile-model',
				themePath,
				cliOutput: outputDir,
				generateOptions: { night: false, profile: 'mobile' },
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('profile-model-mobile.json');
				expect(result.generatedFiles).not.toContain('profile-model.json');
			}
			await fs.rm(outputDir, { recursive: true, force: true });
		});

		test('profiles all generates main and named profiles', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/profile-model/main.yaml',
			);

			const result = await generateTheme({
				themeName: 'profile-model',
				themePath,
				cliOutput: outputDir,
				generateOptions: { night: false, profiles: 'all' },
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('profile-model.json');
				expect(result.generatedFiles).toContain('profile-model.css');
				expect(result.generatedFiles).toContain('profile-model-mobile.json');
			}
			await fs.rm(outputDir, { recursive: true, force: true });
		});

		test('legacy themefile without main yaml still uses fallback when no profile is requested', async () => {
			const outputDir = createTempOutputDir();
			const legacyThemefile = path.join(
				process.cwd(),
				'tests/fixtures/themes/legacy-no-main/themefile',
			);

			const result = await generateTheme({
				themeName: 'legacy-fallback',
				themePath: legacyThemefile,
				cliOutput: outputDir,
				generateOptions: { night: false },
			});

			expect(result.ok).toBe(true);
			await fs.rm(outputDir, { recursive: true, force: true });
		});

		test('legacy themefile config is kept when main yaml has no config', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/standard/themefile',
			);

			const result = await generateTheme({
				themeName: 'test-standard',
				themePath,
				cliOutput: outputDir,
				generateOptions: { night: false },
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('test-standard.json');
				expect(result.generatedFiles).toContain('test-standard.css');
			}
			await fs.rm(outputDir, { recursive: true, force: true });
		});

		test('invalid night mode is skipped without failing day profile build', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/profile-model/main.yaml',
			);
			const ctx = new BuildContext();

			const result = await generateTheme(
				{
					themeName: 'profile-model',
					themePath,
					cliOutput: outputDir,
					generateOptions: { night: true, profile: 'mobile' },
				},
				ctx,
			);

			expect(result.ok).toBe(true);
			expect(
				ctx.warnings.some(
					(warning) =>
						warning.message === 'Night Mode unavailable/invalid and skipped',
				),
			).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('profile-model-mobile.json');
				expect(result.generatedFiles).not.toContain(
					'profile-model-mobile-night.json',
				);
			}
			await fs.rm(outputDir, { recursive: true, force: true });
		});

		test('missing night mode is skipped without failing explicit night build', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/profile-model-missing-night/main.yaml',
			);
			const ctx = new BuildContext();

			const result = await generateTheme(
				{
					themeName: 'profile-model',
					themePath,
					cliOutput: outputDir,
					generateOptions: { night: true, profile: 'missing-night' },
				},
				ctx,
			);

			expect(result.ok).toBe(true);
			expect(
				ctx.warnings.some(
					(warning) =>
						warning.message === 'Night Mode unavailable/invalid and skipped',
				),
			).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain(
					'profile-model-missing-night.json',
				);
				expect(result.generatedFiles).not.toContain(
					'profile-model-missing-night-night.json',
				);
			}
			await fs.rm(outputDir, { recursive: true, force: true });
		});

		test('night overlay generation errors are skipped without failing day profile build', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/profile-model/main.yaml',
			);
			const ctx = new BuildContext();

			const result = await generateTheme(
				{
					themeName: 'profile-model',
					themePath,
					cliOutput: outputDir,
					generateOptions: { night: true, profile: 'bad-ref' },
				},
				ctx,
			);

			expect(result.ok).toBe(true);
			expect(
				ctx.warnings.some(
					(warning) =>
						warning.message === 'Night Mode unavailable/invalid and skipped',
				),
			).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('profile-model-bad-ref.json');
				expect(result.generatedFiles).not.toContain(
					'profile-model-bad-ref-night.json',
				);
			}
			await fs.rm(outputDir, { recursive: true, force: true });
		});

		test('profiles all keeps valid night output when another profile night is invalid', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/profile-model/main.yaml',
			);
			const ctx = new BuildContext();

			const result = await generateTheme(
				{
					themeName: 'profile-model',
					themePath,
					cliOutput: outputDir,
					generateOptions: { night: true, profiles: 'all' },
				},
				ctx,
			);

			expect(result.ok).toBe(true);
			expect(ctx.nightMode.state).toBe('enabled');
			expect(
				ctx.warnings.some(
					(warning) =>
						warning.message === 'Night Mode unavailable/invalid and skipped',
				),
			).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('profile-model-night.json');
				expect(result.generatedFiles).toContain('profile-model-mobile.json');
				expect(result.generatedFiles).not.toContain(
					'profile-model-mobile-night.json',
				);
			}
			await fs.rm(outputDir, { recursive: true, force: true });
		});
	});

	describe('$ref 引用解析', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('ref-test');
		});

		test('应正确解析内部引用', async () => {
			const result = await generateTheme(
				makeInput({ themeName: 'test-ref', themePath: theme.themefile }),
			);

			expect(result.ok).toBe(true);
		});

		test('应正确解析外部引用', async () => {
			const result = await generateTheme(
				makeInput({ themeName: 'test-ref', themePath: theme.themefile }),
			);

			expect(result.ok).toBe(true);
		});
	});

	describe('inheritColor 继承色', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('inherit-color');
		});

		test('应正确生成继承色主题的所有平台文件', async () => {
			const result = await generateTheme(
				makeInput({
					themeName: 'test-inherit-color',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const hasJson = result.generatedFiles.some((f) => f.endsWith('.json'));
				const hasCss = result.generatedFiles.some((f) => f.endsWith('.css'));
				const hasSketch = result.generatedFiles.some(
					(f) => f.endsWith('.json') && f.includes('sketch'),
				);
				expect(hasJson).toBe(true);
				expect(hasCss).toBe(true);
				expect(hasSketch).toBe(true);
			}
		});

		test('CSS 输出应包含 currentColor 或 color-mix', async () => {
			const result = await generateTheme(
				makeInput({
					themeName: 'test-inherit-color',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const cssFile = result.generatedFiles.find(
					(f) => f.endsWith('.css') && !f.includes('night'),
				);
				expect(cssFile).toBeDefined();
			}
		});

		test('JSON 输出应包含 $COLOR_FOREGROUND 哨兵值', async () => {
			const result = await generateTheme(
				makeInput({
					themeName: 'test-inherit-color',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const jsonFile = result.generatedFiles.find(
					(f) =>
						f.endsWith('.json') &&
						!f.includes('sketch') &&
						!f.includes('night'),
				);
				expect(jsonFile).toBeDefined();
			}
		});
	});

	describe('临时主题', () => {
		let theme: TestTheme;

		afterAll(async () => {
			await cleanupTempTheme(theme);
		});

		test('应能从配置创建并生成主题', async () => {
			theme = await createTempTheme({
				name: 'temp-test',
				palette: 'tailwindcss',
				dimension: 'wave',
				platform: ['json'],
				tokens: {
					color: {
						$type: 'color',
						primary: {
							$value: '{tailwindcss.color.indigo.600}',
						},
					},
				},
			});

			const result = await generateTheme(
				makeInput({
					themeName: 'temp-test',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles.length).toBeGreaterThan(0);
			}
		});
	});

	describe('$extends Group 继承', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('extends-test');
		});

		test('应成功生成包含 $extends 继承的主题', async () => {
			const result = await generateTheme(
				makeInput({
					themeName: 'test-extends',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles.length).toBeGreaterThan(0);
			}
		});

		test('应生成 JSON、CSS 和 Sketch 文件', async () => {
			const result = await generateTheme(
				makeInput({
					themeName: 'test-extends',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const hasJson = result.generatedFiles.some(
					(f) => f.endsWith('.json') && !f.includes('sketch'),
				);
				const hasCss = result.generatedFiles.some((f) => f.endsWith('.css'));
				const hasSketch = result.generatedFiles.some((f) =>
					f.includes('sketch'),
				);
				expect(hasJson).toBe(true);
				expect(hasCss).toBe(true);
				expect(hasSketch).toBe(true);
			}
		});

		test('继承后的 token 应在 JSON 输出中包含正确值', async () => {
			const result = await generateTheme(
				makeInput({
					themeName: 'test-extends',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const jsonFile = result.generatedFiles.find(
					(f) => f.endsWith('.json') && !f.includes('sketch'),
				);
				expect(jsonFile).toBeDefined();
			}
		});
	});

	describe('Sketch extensions 集成输出', () => {
		const themeDir = path.join(
			import.meta.dir,
			'..',
			'fixtures',
			'themes',
			'sketch-extensions',
		);

		afterAll(async () => {
			await fs.rm(path.join(themeDir, 'theme'), {
				recursive: true,
				force: true,
			});
		});

		test('应在真实生成链路中锁定 sketch.path、property 和 filterLayer 合同', async () => {
			const outputDir = path.join(themeDir, 'theme');
			await fs.rm(outputDir, { recursive: true, force: true });

			const result = await generateTheme({
				themeName: 'sketch-extensions',
				themePath: path.join(themeDir, 'main.yaml'),
				generateOptions: { night: true },
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('sketch-extensions.json');
				expect(result.generatedFiles).toContain('sketch-extensions.css');
				expect(result.generatedFiles).toContain(
					'sketch-extensions2sketch.json',
				);

				const sketch = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'sketch', 'sketch-extensions2sketch.json'),
						'utf-8',
					),
				);
				const json = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'json', 'sketch-extensions.json'),
						'utf-8',
					),
				);

				expect(sketch.foundation.color['color-primary-main']).toEqual({
					color: '#1872f0ff',
				});
				expect(
					sketch.foundation.interaction['dimension-interaction-hover'],
				).toEqual({
					opacity: 0.16,
				});
				expect(sketch.foundation.radius['dimension-radius-card']).toEqual({
					corners: { radii: 8 },
				});
				expect(sketch.aaa.bbb['style-shadow-1'].shadow).toHaveLength(4);
				expect(sketch['aaa/bbb']).toBeUndefined();
				expect(sketch.color).toBeUndefined();
				expect(sketch.dimension).toBeUndefined();
				expect(sketch.component).toBeUndefined();
				expect(json['color-primary-main']).toBe('#1872f0');
				expect(JSON.stringify(json)).not.toContain('_sketch');
			}
		});
	});

	test('orca-realistic DTCG fallback color builds css and sketch', async () => {
		const fixtureDir = path.join(
			import.meta.dir,
			'..',
			'fixtures',
			'themes',
			'orca-realistic',
		);
		const outputDir = path.join(fixtureDir, 'theme');
		await fs.rm(outputDir, { recursive: true, force: true });

		try {
			const result = await generateTheme({
				themeName: 'orca-realistic',
				themePath: path.join(fixtureDir, 'main.yaml'),
				generateOptions: { night: false },
			});

			expect(result.ok).toBe(true);
			const css = await fs.readFile(
				path.join(outputDir, 'css', 'orca-realistic.css'),
				'utf-8',
			);
			expect(css).toContain('--orcaFallback-main: #0052f5;');
			expect(css).toContain('rgb(0 82 245 / 0.5)');
			expect(css).not.toContain('linear-gradient(to right');
			expect(css).not.toContain('[object Object]');

			const sketch = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'sketch', 'orca-realistic2sketch.json'),
					'utf-8',
				),
			);
			expect(sketch.foundation.color['orcaFallback-main']).toEqual({
				color: '#0052f5ff',
			});
			expect(
				JSON.stringify(sketch.foundation.shadow['shadow-raised'].shadow),
			).toContain('#0052f5');
			expect(sketch.foundation.gradient.fallback.gradient[0].color).toBe(
				'#0052f540',
			);
		} finally {
			await fs.rm(outputDir, { recursive: true, force: true });
		}
	});

	describe('DTCG colorSpace mixed platform', () => {
		test('no-main fallback renders sketch from hex tokens in mixed colorSpace pass', async () => {
			const tempThemeDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-no-main-'),
			);
			const outputDir = path.join(tempThemeDir, 'out');
			try {
				await fs.writeFile(
					path.join(tempThemeDir, 'palette.yaml'),
					[
						'custom:',
						'  color:',
						'    $type: color',
						'    primary:',
						'      $value:',
						'        colorSpace: oklch',
						'        components: [0.637, 0.237, 25.331]',
						'        hex: "#fb2c36"',
						'',
					].join('\n'),
					'utf-8',
				);
				await fs.writeFile(
					path.join(tempThemeDir, 'dimension.yaml'),
					[
						'scale:',
						'  dimension:',
						'    spacing:',
						'      $type: dimension',
						'      sm:',
						'        $value: 4',
						'',
					].join('\n'),
					'utf-8',
				);
				await fs.writeFile(
					path.join(tempThemeDir, 'themefile'),
					[
						'THEME no-main-mixed',
						'RESOURCE palette ./palette.yaml',
						'RESOURCE dimension ./dimension.yaml',
						'PARAMETER output ./out',
						'PARAMETER platform css,sketch',
						'PARAMETER colorSpace oklch',
						'',
					].join('\n'),
					'utf-8',
				);

				const result = await generateTheme({
					themeName: 'no-main-mixed',
					themePath: path.join(tempThemeDir, 'themefile'),
					generateOptions: { night: true },
				});

				if (!result.ok) throw new Error(result.message);
				const css = await fs.readFile(
					path.join(outputDir, 'no-main-mixed.css'),
					'utf-8',
				);
				const sketch = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'no-main-mixed2sketch.json'),
						'utf-8',
					),
				);
				expect(css).toContain('oklch(');
				expect(sketch['color-primary']).toEqual({ color: '#fb2c36ff' });
			} finally {
				await fs.rm(tempThemeDir, { recursive: true, force: true });
			}
		});

		test('no-main fallback records a deprecation warning in receipt context', async () => {
			const tempThemeDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-no-main-warning-'),
			);
			try {
				await fs.writeFile(
					path.join(tempThemeDir, 'palette.yaml'),
					[
						'custom:',
						'  color:',
						'    $type: color',
						'    primary:',
						'      $value: "#fb2c36"',
						'',
					].join('\n'),
					'utf-8',
				);
				await fs.writeFile(
					path.join(tempThemeDir, 'dimension.yaml'),
					[
						'scale:',
						'  dimension:',
						'    spacing:',
						'      $type: dimension',
						'      sm:',
						'        $value: 4',
						'',
					].join('\n'),
					'utf-8',
				);
				await fs.writeFile(
					path.join(tempThemeDir, 'themefile'),
					[
						'THEME no-main-warning',
						'RESOURCE palette ./palette.yaml',
						'RESOURCE dimension ./dimension.yaml',
						'PARAMETER output ./out',
						'PARAMETER platform json',
						'',
					].join('\n'),
					'utf-8',
				);

				const ctx = new BuildContext();
				const result = await generateTheme(
					{
						themeName: 'no-main-warning',
						themePath: path.join(tempThemeDir, 'themefile'),
						generateOptions: { night: false },
					},
					ctx,
				);

				expect(result.ok).toBe(true);
				expect(ctx.warnings).toEqual([
					{
						phase: 'main',
						message:
							'No main.yaml found. Direct RESOURCE token generation is deprecated and will be removed; create main.yaml with wave dt init.',
					},
				]);
			} finally {
				await fs.rm(tempThemeDir, { recursive: true, force: true });
			}
		});

		test('no-main fallback warns once across multiple group passes', async () => {
			const tempThemeDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-no-main-groups-'),
			);
			try {
				await fs.writeFile(
					path.join(tempThemeDir, 'palette.yaml'),
					[
						'custom:',
						'  color:',
						'    $type: color',
						'    primary:',
						'      $value: "#fb2c36"',
						'',
					].join('\n'),
					'utf-8',
				);
				await fs.writeFile(
					path.join(tempThemeDir, 'dimension.yaml'),
					[
						'scale:',
						'  dimension:',
						'    spacing:',
						'      $type: dimension',
						'      sm:',
						'        $value: 4',
						'',
					].join('\n'),
					'utf-8',
				);
				await fs.writeFile(
					path.join(tempThemeDir, 'themefile'),
					[
						'THEME no-main-groups',
						'RESOURCE palette ./palette.yaml',
						'RESOURCE dimension ./dimension.yaml',
						'GROUP "json" {',
						'  PARAMETER output ./json',
						'  PARAMETER platform json',
						'}',
						'GROUP "css" {',
						'  PARAMETER output ./css',
						'  PARAMETER platform css',
						'}',
						'',
					].join('\n'),
					'utf-8',
				);

				const ctx = new BuildContext();
				const result = await generateTheme(
					{
						themeName: 'no-main-groups',
						themePath: path.join(tempThemeDir, 'themefile'),
						generateOptions: { night: false },
					},
					ctx,
				);

				expect(result.ok).toBe(true);
				expect(ctx.warnings).toHaveLength(1);
				expect(ctx.warnings[0]?.phase).toBe('main');
			} finally {
				await fs.rm(tempThemeDir, { recursive: true, force: true });
			}
		});

		test('main mixed passes render sketch from hex tokens without legacy night output', async () => {
			const tempThemeDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-mixed-branches-'),
			);
			const outputDir = path.join(tempThemeDir, 'out');

			async function writeThemeYaml(
				filePath: string,
				hex: string,
			): Promise<void> {
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(
					filePath,
					[
						'theme:',
						'  color:',
						'    $type: color',
						'    $extensions:',
						'      sketch:',
						'        path: foundation/color',
						'    primary:',
						'      $value:',
						'        colorSpace: oklch',
						'        components: [0.637, 0.237, 25.331]',
						`        hex: "${hex}"`,
						'    secondary:',
						'      $value:',
						'        colorSpace: oklch',
						'        components: [0.518, 0.251, 262.6]',
						'        hex: "#0052f5"',
						'  dimension:',
						'    $type: dimension',
						'    $extensions:',
						'      sketch:',
						'        path: foundation/space',
						'    spacing:',
						'      sm:',
						'        $value: 4',
						'',
					].join('\n'),
					'utf-8',
				);
			}

			try {
				await fs.writeFile(
					path.join(tempThemeDir, 'themefile'),
					[
						'THEME mixed-branches',
						'RESOURCE palette tailwindcss',
						'RESOURCE dimension wave',
						'PARAMETER output ./out',
						'PARAMETER platform css,sketch',
						'PARAMETER colorSpace oklch',
						'',
					].join('\n'),
					'utf-8',
				);
				await writeThemeYaml(path.join(tempThemeDir, 'main.yaml'), '#fb2c36');
				await writeThemeYaml(
					path.join(tempThemeDir, 'main@night.yaml'),
					'#0052f5',
				);
				for (const run of [1, 2]) {
					const result = await generateTheme({
						themeName: 'mixed-branches',
						themePath: path.join(tempThemeDir, 'themefile'),
						generateOptions: { night: true },
					});
					expect(result.ok).toBe(true);
					if (run === 1) {
						await fs.cp(outputDir, path.join(tempThemeDir, 'first-run'), {
							recursive: true,
						});
					}
				}

				const css = await fs.readFile(
					path.join(outputDir, 'mixed-branches.css'),
					'utf-8',
				);
				const firstCss = await fs.readFile(
					path.join(tempThemeDir, 'first-run', 'mixed-branches.css'),
					'utf-8',
				);
				const sketch = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'mixed-branches2sketch.json'),
						'utf-8',
					),
				);
				const firstSketch = await fs.readFile(
					path.join(tempThemeDir, 'first-run', 'mixed-branches2sketch.json'),
					'utf-8',
				);
				const currentSketch = await fs.readFile(
					path.join(outputDir, 'mixed-branches2sketch.json'),
					'utf-8',
				);
				expect(css).toContain('oklch(');
				expect(css.indexOf('--theme-color-primary')).toBeLessThan(
					css.indexOf('--theme-color-secondary'),
				);
				expect(css).toBe(firstCss);
				expect(currentSketch).toBe(firstSketch);
				expect(sketch.foundation.color['theme-color-primary']).toEqual({
					color: expect.stringMatching(/^#[0-9a-f]{8}$/i),
				});
				expect(sketch.foundation.color['theme-color-secondary']).toEqual({
					color: '#0052f5ff',
				});
				expect(sketch.foundation.space['theme-dimension-spacing-sm']).toEqual({
					value: 4,
				});
				expect(
					await Bun.file(
						path.join(outputDir, 'mixed-branches-night.css'),
					).exists(),
				).toBe(false);
			} finally {
				await fs.rm(tempThemeDir, { recursive: true, force: true });
			}
		});
	});

	describe('错误处理', () => {
		test('应在 themefile 不存在时返回错误', async () => {
			const result = await generateTheme({
				themeName: 'nonexistent',
				themePath: '/nonexistent/themefile',
				generateOptions: { night: false },
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.exitCode).toBe(10); // FILE_NOT_FOUND
			}
		});

		test('应在循环引用时返回错误', async () => {
			const theme = await createTempTheme({
				name: 'circular-test',
				tokens: {
					color: {
						$type: 'color',
						a: {
							$value: '{theme.color.b}',
						},
						b: {
							$value: '{theme.color.a}',
						},
					},
				},
			});

			const result = await generateTheme(
				makeInput({
					themeName: 'circular-test',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(false);

			await cleanupTempTheme(theme);
		});
	});
});
