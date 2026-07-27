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

async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function decodeJsonPointerSegment(segment: string): string {
	if (/~(?:[^01]|$)/.test(segment)) {
		throw new Error(`Invalid JSON Pointer escape in segment "${segment}"`);
	}
	return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function collectSketchReferences(
	value: unknown,
	result: string[] = [],
): string[] {
	if (typeof value === 'string') {
		if (value.startsWith('@')) result.push(value);
		return result;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectSketchReferences(item, result);
		return result;
	}
	if (typeof value === 'object' && value !== null) {
		for (const item of Object.values(value)) {
			collectSketchReferences(item, result);
		}
	}
	return result;
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
	if (!pointer.startsWith('/')) return undefined;
	return pointer
		.slice(1)
		.split('/')
		.map(decodeJsonPointerSegment)
		.reduce<unknown>((current, segment) => {
			if (typeof current !== 'object' || current === null) return undefined;
			if (!Object.hasOwn(current, segment)) return undefined;
			return (current as Record<string, unknown>)[segment];
		}, root);
}

function isolatedResourceEnv(tempDir: string): Record<string, string> {
	return {
		WAVE_RESOURCE_CACHE_DIR: path.join(tempDir, '.wave-cache'),
		WAVE_RESOURCE_STATE_PATH: path.join(tempDir, '.wave-state.json'),
		WAVE_RESOURCE_CONFIG_DIR: path.join(tempDir, '.wave-config'),
	};
}

function applyResourceEnv(
	env: Record<string, string>,
): Record<string, string | undefined> {
	const previous = {
		WAVE_RESOURCE_CACHE_DIR: process.env.WAVE_RESOURCE_CACHE_DIR,
		WAVE_RESOURCE_STATE_PATH: process.env.WAVE_RESOURCE_STATE_PATH,
		WAVE_RESOURCE_CONFIG_DIR: process.env.WAVE_RESOURCE_CONFIG_DIR,
	};
	Object.assign(process.env, env);
	return previous;
}

function restoreResourceEnv(
	previous: Record<string, string | undefined>,
): void {
	for (const [key, value] of Object.entries(previous)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

async function copyFixtureWorkspace(
	relativePath: string,
): Promise<{ dir: string; env: Record<string, string> }> {
	const sourceDir = path.join(import.meta.dir, '..', relativePath);
	const workspaceDir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'wave-fixture-'),
	);
	await fs.cp(sourceDir, workspaceDir, {
		recursive: true,
		filter: (source) => {
			const name = path.basename(source);
			return !['.DS_Store', '.tmp', 'theme', 'dist', 'build'].includes(name);
		},
	});
	return { dir: workspaceDir, env: isolatedResourceEnv(workspaceDir) };
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
let previousResourceEnv: Record<string, string | undefined>;

describe('Theme Service Integration', () => {
	afterAll(async () => {
		restoreResourceEnv(previousResourceEnv);
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	beforeAll(() => {
		tempDir = createTempOutputDir();
		previousResourceEnv = applyResourceEnv(isolatedResourceEnv(tempDir));
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
				expect(css).not.toContain('--theme-style-shadow-sm');
				expect(css).not.toContain('--theme-dimension-alpha-sm');
			}
		});
	});

	describe('typography rem baseline', () => {
		async function writeTypographyTheme(
			themeDir: string,
			baseFontSize?: number,
		): Promise<void> {
			await fs.writeFile(
				path.join(themeDir, 'main.yaml'),
				`$config:
  theme: typography-rem
  resource:
    palette: [tailwindcss]
    dimension: [wave]
  parameter:
    platform: [json, jsonc, css, sketch]
    filterLayer: 1
theme:
  color:
    $type: color
    primary:
      $value: "#2563eb"
  font:
    $type: typography
    $extensions:
      typography:
${baseFontSize === undefined ? '' : `        baseFontSize: ${baseFontSize}\n`}        defaults:
          fontFamily: Inter
          fontWeight: 400
    body:
      $value:
        fontSize: { value: 0.875, unit: rem }
        lineHeight: { value: 1.5, unit: rem }
        letterSpacing: { value: 0.1, unit: rem }
`,
				'utf-8',
			);
		}

		test('preserves rem in CSS and flat output while Sketch uses the shared base', async () => {
			const themeDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-typography-rem-'),
			);
			const outputDir = path.join(themeDir, 'out');

			try {
				await writeTypographyTheme(themeDir, 14);
				const result = await generateTheme({
					themeName: 'typography-rem',
					themePath: path.join(themeDir, 'main.yaml'),
					cliOutput: outputDir,
					generateOptions: { night: false },
				});

				expect(result.ok, result.ok ? undefined : result.message).toBe(true);
				if (!result.ok) return;
				expect(result.generatedFiles).toEqual(
					expect.arrayContaining([
						'typography-rem.json',
						'typography-rem.jsonc',
						'typography-rem.css',
						'typography-rem2sketch.json',
					]),
				);

				const css = await fs.readFile(
					path.join(outputDir, 'typography-rem.css'),
					'utf-8',
				);
				const sketch = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'typography-rem2sketch.json'),
						'utf-8',
					),
				);
				const json = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'typography-rem.json'),
						'utf-8',
					),
				);
				const jsonc = await fs.readFile(
					path.join(outputDir, 'typography-rem.jsonc'),
					'utf-8',
				);

				expect(css).toContain(':root {\n  font-size: 14px;');
				expect(css).toContain('--font-body-size: 0.875rem;');
				expect(css).toContain('--font-body-line-height: 1.5rem;');
				expect(css).toContain('--font-body-letter-spacing: 0.1rem;');
				expect(sketch['font-body'].textStyle).toMatchObject({
					fontSize: 12.25,
					lineHeight: 21,
					kerning: 1.4,
				});
				expect(json['font-body']).toMatchObject({
					fontSize: { value: 0.875, unit: 'rem' },
					lineHeight: { value: 1.5, unit: 'rem' },
					letterSpacing: { value: 0.1, unit: 'rem' },
				});
				expect(JSON.stringify(json)).not.toContain('baseFontSize');
				expect(jsonc).not.toContain('baseFontSize');
			} finally {
				await fs.rm(themeDir, { recursive: true, force: true });
			}
		});

		test('uses a standalone profile base and carries it into its night build', async () => {
			const themeDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-typography-rem-profile-'),
			);
			const outputDir = path.join(themeDir, 'out');

			try {
				await writeTypographyTheme(themeDir, 14);
				await fs.mkdir(path.join(themeDir, 'profiles'), { recursive: true });
				await fs.writeFile(
					path.join(themeDir, 'profiles', 'compact.yaml'),
					`theme:
  color:
    $type: color
    primary:
      $value: "#0f766e"
  font:
    $type: typography
    $extensions:
      typography:
        baseFontSize: 16
        defaults:
          fontFamily: Inter
          fontWeight: 400
    body:
      $value:
        fontSize: { value: 0.875, unit: rem }
        lineHeight: { value: 1.5, unit: rem }
        letterSpacing: { value: 0.1, unit: rem }
`,
					'utf-8',
				);
				await fs.writeFile(
					path.join(themeDir, 'profiles', 'compact@night.yaml'),
					`theme:
  color:
    primary:
      $value: "#5eead4"
`,
					'utf-8',
				);

				const result = await generateTheme({
					themeName: 'typography-rem',
					themePath: path.join(themeDir, 'main.yaml'),
					cliOutput: outputDir,
					generateOptions: { night: true, profile: 'compact' },
				});

				expect(result.ok, result.ok ? undefined : result.message).toBe(true);
				if (!result.ok) return;
				expect(result.generatedFiles).toEqual(
					expect.arrayContaining([
						'typography-rem-compact.css',
						'typography-rem-compact2sketch.json',
						'typography-rem-compact-night.css',
						'typography-rem-compact-night2sketch.json',
					]),
				);

				for (const suffix of ['', '-night']) {
					const css = await fs.readFile(
						path.join(outputDir, `typography-rem-compact${suffix}.css`),
						'utf-8',
					);
					const sketch = JSON.parse(
						await fs.readFile(
							path.join(
								outputDir,
								`typography-rem-compact${suffix}2sketch.json`,
							),
							'utf-8',
						),
					);

					expect(css).toContain(':root {\n  font-size: 16px;');
					expect(sketch['font-body'].textStyle).toMatchObject({
						fontSize: 14,
						lineHeight: 24,
						kerning: 1.6,
					});
				}
			} finally {
				await fs.rm(themeDir, { recursive: true, force: true });
			}
		});

		test('uses the default 16px base when rem typography omits an override', async () => {
			const themeDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-typography-rem-default-'),
			);
			const outputDir = path.join(themeDir, 'out');

			try {
				await writeTypographyTheme(themeDir);
				const result = await generateTheme({
					themeName: 'typography-rem',
					themePath: path.join(themeDir, 'main.yaml'),
					cliOutput: outputDir,
					generateOptions: { night: false },
				});
				expect(result.ok, result.ok ? undefined : result.message).toBe(true);
				if (!result.ok) return;

				const css = await fs.readFile(
					path.join(outputDir, 'typography-rem.css'),
					'utf-8',
				);
				const sketch = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'typography-rem2sketch.json'),
						'utf-8',
					),
				);
				expect(css).toContain(':root {\n  font-size: 16px;');
				expect(sketch['font-body'].textStyle).toMatchObject({
					fontSize: 14,
					lineHeight: 24,
					kerning: 1.6,
				});
			} finally {
				await fs.rm(themeDir, { recursive: true, force: true });
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
				expect(result.generatedFiles).toContain('profile-model2sketch.json');
				expect(result.generatedFiles).not.toContain(
					'profile-model-mobile.json',
				);

				const css = await fs.readFile(
					path.join(outputDir, 'profile-model.css'),
					'utf-8',
				);
				const sketch = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'profile-model2sketch.json'),
						'utf-8',
					),
				);

				expect(css).toContain('--color-primary:');
				expect(css).toContain('--state-hover:');
				expect(css).toContain('--shadow-elevation-low: 0 1px 2px 0');
				expect(css).toContain('--border-outline-focus:');
				expect(css).toContain('--border-outline-focus-offset: 2px;');
				expect(css).toContain('--font-heading-h1:');
				expect(css).not.toContain('--dimension-');
				expect(JSON.stringify(sketch)).toContain('textStyle');
				expect(JSON.stringify(sketch)).toContain('"spread":3');
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

		test('profiles all uses one cli output directory across profile files', async () => {
			const fixture = await copyFixtureWorkspace(
				'fixtures/themes/profile-model',
			);
			const outputDir = 'temp-output-profile-model-all';
			const absoluteOutputDir = path.join(process.cwd(), outputDir);
			const themePath = path.join(fixture.dir, 'main.yaml');
			const previousEnv = applyResourceEnv(fixture.env);

			try {
				await fs.rm(absoluteOutputDir, { recursive: true, force: true });

				const result = await generateTheme({
					themeName: 'profile-model',
					themePath,
					cliOutput: outputDir,
					generateOptions: { night: true, profiles: 'all' },
				});

				expect(result.ok).toBe(true);
				if (result.ok) {
					expect(result.outputDir).toBe(absoluteOutputDir);
					expect(result.generatedFiles).toContain('profile-model.json');
					expect(result.generatedFiles).toContain('profile-model-mobile.json');
					expect(
						await exists(path.join(absoluteOutputDir, 'profile-model.json')),
					).toBe(true);
					expect(
						await exists(
							path.join(absoluteOutputDir, 'profile-model-mobile.json'),
						),
					).toBe(true);
					expect(
						await exists(
							path.join(
								path.dirname(themePath),
								'profiles',
								outputDir,
								'profile-model-mobile.json',
							),
						),
					).toBe(false);
				}
			} finally {
				restoreResourceEnv(previousEnv);
				await fs.rm(absoluteOutputDir, { recursive: true, force: true });
				await fs.rm(fixture.dir, { recursive: true, force: true });
			}
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
				expect(sketch.foundation.interaction).toBeUndefined();
				expect(sketch.foundation.radius).toBeUndefined();
				expect(sketch.aaa.bbb['shadow-1'].shadow).toHaveLength(4);
				expect(sketch['aaa/bbb']).toBeUndefined();
				expect(sketch.color).toBeUndefined();
				expect(sketch.dimension).toBeUndefined();
				expect(sketch.component).toBeUndefined();
				expect(json['color-primary-main']).toBe('#1872f0');
				expect(JSON.stringify(json)).not.toContain('_sketch');
			}
		});
	});

	test('orca-realistic materializes typography and preserves platform output contracts', async () => {
		const fixture = await copyFixtureWorkspace(
			'fixtures/themes/orca-realistic',
		);
		const fixtureDir = fixture.dir;
		const outputDir = path.join(fixtureDir, 'theme');
		const previousEnv = applyResourceEnv(fixture.env);

		try {
			const result = await generateTheme({
				themeName: 'orca-realistic',
				themePath: path.join(fixtureDir, 'main.yaml'),
				generateOptions: { night: false },
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toEqual(
					expect.arrayContaining([
						'orca-realistic.json',
						'orca-realistic.jsonc',
						'orca-realistic.css',
						'orca-realistic2sketch.json',
					]),
				);
			}
			const json = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'json', 'orca-realistic.json'),
					'utf-8',
				),
			);
			const jsonc = await fs.readFile(
				path.join(outputDir, 'json', 'orca-realistic.jsonc'),
				'utf-8',
			);
			const css = await fs.readFile(
				path.join(outputDir, 'css', 'orca-realistic.css'),
				'utf-8',
			);
			expect(css).toContain('--orcaFallback-main: #0052f5;');
			expect(css).toContain('rgb(0 82 245 / 0.25)');
			expect(css).toContain('linear-gradient(to right');
			expect(css).toContain(
				'--body-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";',
			);
			expect(css).toContain('--body-line-height: 1.5;');
			expect(css).toContain('--body-color: var(--text-default);');
			expect(css).toContain('--display-alias-color: var(--direct-alias);');
			expect(css).toContain('--label-line-height: 20px;');
			expect(css).toContain('--antline: 1px dashed #0052f5;');
			expect(css).toContain('--antline-dash-array: 4px 8px;');
			expect(css).not.toContain('[object Object]');

			expect(json['font-body']).toEqual({
				fontFamily: [
					'system-ui',
					'-apple-system',
					'BlinkMacSystemFont',
					'Segoe UI',
					'Roboto',
					'Helvetica Neue',
					'Arial',
					'PingFang SC',
					'Hiragino Sans GB',
					'Microsoft YaHei',
					'Noto Sans',
					'sans-serif',
					'Apple Color Emoji',
					'Segoe UI Emoji',
					'Segoe UI Symbol',
					'Noto Color Emoji',
				],
				fontSize: { value: 14, unit: 'pt' },
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
				color: {
					colorSpace: 'oklch',
					components: [0.208, 0.042, 265.755],
				},
			});

			const sketch = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'sketch', 'orca-realistic2sketch.json'),
					'utf-8',
				),
			);
			expect(sketch.foundation.color['orcaFallback-main']).toEqual({
				color: '#0052f5ff',
			});
			expect(sketch.foundation.shadow.raised.shadow).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ color: '#0052f580' }),
				]),
			);
			expect(sketch.foundation.gradient.fallback.gradient[0].color).toBe(
				'#0052f540',
			);
			expect(sketch.foundation.color['outline-default']).toEqual({
				color: '#ff00ffff',
				opacity: 0.36,
			});
			expect(sketch.foundation.font.body.textStyle).toEqual({
				fontFamily: 'PingFang SC',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 21,
				kerning: 0,
				textColor: '@/foundation/color/text-default',
			});
			expect(sketch.v2.heading['heading-h1'].textStyle.textColor).toBe(
				'@/foundation/color/text-emphasis',
			);
			expect(sketch.v2.heading['heading-escaped'].textStyle.textColor).toBe(
				'@/foundation/color/text-escaped.key~1~0color',
			);
			expect(sketch.v2.heading['heading-external'].textStyle.textColor).toBe(
				'#3695fbff',
			);
			expect(sketch.v2.heading['heading-literal'].textStyle.textColor).toBe(
				'#d12f6aff',
			);
			expect(sketch.v2.heading['heading-alpha'].textStyle.textColor).toBe(
				'#0f172b80',
			);
			expect(sketch.v2.display['display-body'].textStyle.textColor).toBe(
				'@/foundation/color/text-default',
			);
			expect(sketch.v2.display['display-footnote'].textStyle.textColor).toBe(
				'@/foundation/color/text-subtlest',
			);
			expect(sketch.v2.display['display-alias'].textStyle.textColor).toBe(
				'@/foundation/color/direct-alias',
			);
			expect(sketch.foundation.font.label.textStyle.lineHeight).toBe(20);
			expect(sketch.foundation.font.internal).toBeUndefined();
			expect(json['font-internal']).toBeDefined();
			const fontBodyJsoncLine = jsonc
				.split('\n')
				.find((line) => line.includes('"font-body"'));
			expect(fontBodyJsoncLine).toContain(
				`"font-body": ${JSON.stringify(json['font-body'])}`,
			);
			expect(jsonc).toContain('"font-internal"');
			expect(css).toContain('--internal-line-height: 1.25;');
			expect(sketch.foundation.border.antline).toEqual({
				value: {
					color: '@/foundation/color/primary-main',
					width: '1px',
					style: {
						dashArray: [
							{ value: 4, unit: 'px' },
							{ value: 8, unit: 'px' },
						],
					},
				},
			});
			expect(sketch.foundation.border.outline.shadow).toEqual([
				{
					x: 0,
					y: 0,
					blur: 0,
					spread: 3,
					color: '@/foundation/color/outline-ring',
				},
				{ x: 0, y: 0, blur: 0, spread: 2, color: '#ffffffff' },
			]);

			const references = collectSketchReferences(sketch);
			expect(references.length).toBeGreaterThan(0);
			for (const reference of references) {
				expect(reference.startsWith('@/')).toBe(true);
				const target = resolveJsonPointer(sketch, reference.slice(1));
				expect(target).toEqual(
					expect.objectContaining({
						color: expect.stringMatching(/^#[0-9a-f]{8}$/i),
					}),
				);
			}
		} finally {
			restoreResourceEnv(previousEnv);
			await fs.rm(fixtureDir, { recursive: true, force: true });
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
				expect(sketch.foundation.space).toBeUndefined();
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

	describe('theme root output matrix', () => {
		test('normalizes shadow lengths and outline border color references', async () => {
			const tempThemeDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-root-matrix-'),
			);
			const outputDir = path.join(tempThemeDir, 'out');
			const themePath = path.join(tempThemeDir, 'main.yaml');
			await fs.writeFile(
				themePath,
				`$schema: "https://www.designtokens.org/tr/2025.10/format/"
$config:
  theme: root-matrix
  resource:
    palette: [tailwindcss]
    dimension: [wave]
  parameter:
    outputDir: ./out
    filterLayer: 1
theme:
  color:
    base:
      $type: color
      $value: "#2563eb"
    alias:
      $type: color
      $value: "{theme.color.base}"
    external:
      $type: color
      $value: "{tailwindcss.color.slate.800}"
  shadow:
    ref-length:
      $type: shadow
      $value:
        color: "{theme.color.base}"
        offsetX: 0
        offsetY: "{wave.dimension.px.2}"
        blur: "{wave.dimension.px.4}"
        spread: 0
  border:
    outline:
      direct-hex:
        $type: border
        $value: { color: "#2563eb", width: 1, style: solid }
        $extensions: { outline: { offset: 2 } }
      token-curly-base:
        $type: border
        $value: { color: "{theme.color.base}", width: 1, style: solid }
        $extensions: { outline: { offset: 2 } }
      token-curly-alias:
        $type: border
        $value: { color: "{theme.color.alias}", width: 1, style: solid }
        $extensions: { outline: { offset: 2 } }
      token-curly-external:
        $type: border
        $value: { color: "{theme.color.external}", width: 1, style: solid }
        $extensions: { outline: { offset: 2 } }
      pointer-token:
        $type: border
        $value:
          color: { $ref: "#/theme/color/base" }
          width: 1
          style: solid
        $extensions: { outline: { offset: 2 } }
      pointer-value:
        $type: border
        $value:
          color: { $ref: "#/theme/color/base/$value" }
          width: 1
          style: solid
        $extensions: { outline: { offset: 2 } }
      pointer-alias-value:
        $type: border
        $value:
          color: { $ref: "#/theme/color/alias/$value" }
          width: 1
          style: solid
        $extensions: { outline: { offset: 2 } }
      ref-width:
        $type: border
        $value:
          color: "{theme.color.base}"
          width: "{wave.dimension.px.2}"
          style: solid
        $extensions: { outline: { offset: 2 } }
`,
			);

			try {
				const result = await generateTheme({
					themeName: 'root-matrix',
					themePath,
					cliOutput: outputDir,
					cliPlatform: 'css,sketch',
					generateOptions: { night: false },
				});

				expect(result.ok).toBe(true);
				const css = await fs.readFile(
					path.join(outputDir, 'root-matrix.css'),
					'utf-8',
				);
				const sketch = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'root-matrix2sketch.json'),
						'utf-8',
					),
				);

				expect(css).toContain(
					'--shadow-ref-length: 0 4px 8px 0 rgb(37 99 235 / 1);',
				);
				expect(css).toContain(
					'--border-outline-direct-hex: 1px solid #2563eb;',
				);
				expect(css).toContain(
					'--border-outline-token-curly-base: 1px solid #2563eb;',
				);
				expect(css).toContain(
					'--border-outline-token-curly-alias: 1px solid #2563eb;',
				);
				expect(css).toContain(
					'--border-outline-token-curly-external: 1px solid #1d293d;',
				);
				expect(css).toContain(
					'--border-outline-pointer-token: 1px solid #2563eb;',
				);
				expect(css).toContain(
					'--border-outline-pointer-value: 1px solid #2563eb;',
				);
				expect(css).toContain(
					'--border-outline-pointer-alias-value: 1px solid #2563eb;',
				);
				expect(css).toContain('--border-outline-ref-width: 4px solid #2563eb;');
				expect(css).not.toContain('[object Object]');
				expect(css).not.toContain('1px solid currentColor');

				expect(sketch['border-outline-direct-hex'].shadow[0].color).toBe(
					'#2563ebff',
				);
				expect(sketch['border-outline-token-curly-base'].shadow[0].color).toBe(
					'@/color-base',
				);
				expect(sketch['border-outline-token-curly-alias'].shadow[0].color).toBe(
					'@/color-alias',
				);
				expect(
					sketch['border-outline-token-curly-external'].shadow[0].color,
				).toBe('@/color-external');
				expect(sketch['border-outline-pointer-token'].shadow[0].color).toBe(
					'@/color-base',
				);
				expect(sketch['border-outline-pointer-value'].shadow[0].color).toBe(
					'@/color-base',
				);
				expect(
					sketch['border-outline-pointer-alias-value'].shadow[0].color,
				).toBe('@/color-alias');
				expect(sketch['border-outline-ref-width'].shadow[0]).toMatchObject({
					spread: 6,
					color: '@/color-base',
				});
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

		test('build rejects typography values that become invalid after resolution', async () => {
			const theme = await createTempTheme({
				name: 'typography-resolved-invalid',
				tokens: {},
			});
			await fs.writeFile(
				theme.mainYaml,
				`theme:
  dimension:
    invalid:
      $value: -1
  font:
    $type: typography
    $extensions:
      typography:
        defaults:
          fontFamily: Inter
          fontSize: "{theme.dimension.invalid}"
          fontWeight: 400
          lineHeight: 1.5
          letterSpacing: 0
    body:
      $value: {}
`,
				'utf8',
			);

			const result = await generateTheme(
				makeInput({
					themeName: 'typography-resolved-invalid',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.message).toContain(
					'Theme schema validation failed after reference resolution',
				);
				expect(result.message).toContain(
					'theme.font.$extensions.typography.defaults.fontSize',
				);
			}
			await cleanupTempTheme(theme);
		});

		test('build rejects border dash values that become invalid after resolution', async () => {
			const theme = await createTempTheme({
				name: 'border-dash-resolved-invalid',
				tokens: {},
			});
			await fs.writeFile(
				theme.mainYaml,
				`theme:
  dimension:
    invalid:
      $value: -1
  border:
    $type: border
    antline:
      $value:
        color: "#000000"
        width: 1
        style:
          dashArray:
            - "{theme.dimension.invalid}"
            - 8
`,
				'utf8',
			);

			const result = await generateTheme(
				makeInput({
					themeName: 'border-dash-resolved-invalid',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.message).toContain(
					'Theme schema validation failed after reference resolution',
				);
				expect(result.message).toContain(
					'theme.border.antline.$value.style.dashArray[0]',
				);
			}
			await cleanupTempTheme(theme);
		});

		test('build accepts border dash $ref dimensions with resolved swatch metadata', async () => {
			const theme = await createTempTheme({
				name: 'border-dash-ref-valid',
				platform: ['css'],
				tokens: {},
			});
			await fs.writeFile(
				theme.mainYaml,
				`theme:
  dimension:
    dash:
      $type: dimension
      $value:
        value: 4
        unit: px
  border:
    $type: border
    antline:
      $value:
        color: "#000000"
        width: 1
        style:
          dashArray:
            - $ref: "#/theme/dimension/dash/$value"
            - 8
`,
				'utf8',
			);

			const result = await generateTheme(
				makeInput({
					themeName: 'border-dash-ref-valid',
					themePath: theme.themefile,
				}),
			);

			expect(result.ok).toBe(true);
			const css = await fs.readFile(
				path.join(tempDir, 'border-dash-ref-valid.css'),
				'utf8',
			);
			expect(css).toContain('--theme-border-antline-dash-array: 4px 8px;');
			expect(css).not.toContain('_swatchName');
			await cleanupTempTheme(theme);
		});
	});
});
