/**
 * Theme Service 集成测试
 *
 * 测试主题生成的完整流程
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../src/core/pipeline/theme-service.ts';
import type { SketchAsset, SketchPayloadV2 } from '../../src/types/index.ts';
import { ExitCode } from '../../src/types/index.ts';
import { BuildContext } from '../../src/utils/receipt.ts';
import {
	cleanupTempTheme,
	createTempTheme,
	loadTestTheme,
	type TestTheme,
} from '../utils/fixture-loader.ts';

function assetByName(
	payload: SketchPayloadV2,
	name: string,
): SketchAsset | undefined {
	return payload.assets.find((asset) => asset.name === name);
}

function layerAssetByName(
	payload: SketchPayloadV2,
	name: string,
): Extract<SketchAsset, { kind: 'layer' }> {
	const asset = assetByName(payload, name);
	expect(asset, `layer asset "${name}" should exist`).toBeDefined();
	return asset as Extract<SketchAsset, { kind: 'layer' }>;
}

function textAssetByName(
	payload: SketchPayloadV2,
	name: string,
): Extract<SketchAsset, { kind: 'text' }> {
	const asset = assetByName(payload, name);
	expect(asset, `text asset "${name}" should exist`).toBeDefined();
	return asset as Extract<SketchAsset, { kind: 'text' }>;
}

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
		workspacePath: string;
	},
): ThemeGenerationInput {
	return {
		cliOutput: tempDir,
		generateOptions: { night: false },
		...overrides,
	};
}

async function addMainConfig(
	theme: TestTheme,
	platforms: string[] = ['json', 'css', 'sketch'],
): Promise<void> {
	const tokenContent = await fs.readFile(theme.mainYaml, 'utf8');
	await fs.writeFile(
		theme.mainYaml,
		`$config:
  theme: ${theme.name}
  resource:
    palette: [tailwindcss]
    dimension: [wave]
  parameter:
    platform: [${platforms.join(', ')}]

${tokenContent}`,
		'utf8',
	);
}

let tempDir: string;
let previousResourceEnv: Record<string, string | undefined>;

describe('Theme Service Integration', () => {
	describe('global output planning', () => {
		const tokenYaml = `theme:
  color:
    primary:
      $type: color
      $value: "#336699"
`;

		test('rejects partial GROUP platform overlap before changing artifacts', async () => {
			const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-plan-group-'));
			const outputDir = path.join(dir, 'out');
			const markerPath = path.join(outputDir, 'group-collision.json');
			const marker = Buffer.from('existing-json\n');
			try {
				await fs.mkdir(outputDir);
				await fs.writeFile(markerPath, marker);
				await fs.writeFile(
					path.join(dir, 'main.yaml'),
					`$config:
  theme: group-collision
  parameterGroup:
    all: { outputDir: ./out, platform: [json, css] }
    json: { outputDir: ./out, platform: [json] }
${tokenYaml}`,
				);

				const result = await generateTheme({
					workspacePath: path.join(dir, 'main.yaml'),
					generateOptions: { night: false },
				});

				expect(result).toMatchObject({
					ok: false,
					exitCode: ExitCode.GENERAL_ERROR,
				});
				if (!result.ok) {
					expect(result.message).toContain('Output path collision:');
				}
				expect(await fs.readFile(markerPath)).toEqual(marker);
				expect(await fs.readdir(outputDir)).toEqual(['group-collision.json']);
			} finally {
				await fs.rm(dir, { recursive: true, force: true });
			}
		});

		test('rejects duplicate md-yml group paths before changing artifacts', async () => {
			const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-plan-md-yml-'));
			const outputDir = path.join(dir, 'out');
			const markerPath = path.join(outputDir, 'group-collision2md.yml');
			const marker = Buffer.from('existing-yaml\n');
			try {
				await fs.mkdir(outputDir);
				await fs.writeFile(markerPath, marker);
				await fs.writeFile(
					path.join(dir, 'main.yaml'),
					`$config:
  theme: group-collision
  parameterGroup:
    first: { outputDir: ./out, platform: [md-yml] }
    second: { outputDir: ./out, platform: [md-yml] }
${tokenYaml}`,
				);
				const result = await generateTheme({
					workspacePath: path.join(dir, 'main.yaml'),
					generateOptions: { night: false },
				});
				expect(result.ok).toBe(false);
				if (!result.ok)
					expect(result.message).toContain('Output path collision:');
				expect(await fs.readFile(markerPath)).toEqual(marker);
				expect(await fs.readdir(outputDir)).toEqual(['group-collision2md.yml']);
			} finally {
				await fs.rm(dir, { recursive: true, force: true });
			}
		});

		async function writeNightProfileWorkspace(
			dir: string,
			nightValue: string,
		): Promise<void> {
			await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				`$config:
  theme: demo
  parameter: { outputDir: ./out, platform: [json] }
${tokenYaml}`,
			);
			await fs.writeFile(
				path.join(dir, 'main@night.yaml'),
				`theme:
  color:
    primary:
      $type: color
      $value: ${nightValue}
`,
			);
			await fs.writeFile(path.join(dir, 'profiles', 'night.yaml'), tokenYaml);
		}

		test('rejects default night colliding with a profile named night day output', async () => {
			const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-plan-night-'));
			const outputDir = path.join(dir, 'out');
			const markerPath = path.join(outputDir, 'demo-night.json');
			const marker = Buffer.from('existing-night\n');
			try {
				await writeNightProfileWorkspace(dir, '"#111111"');
				await fs.mkdir(outputDir);
				await fs.writeFile(markerPath, marker);

				const result = await generateTheme({
					workspacePath: path.join(dir, 'main.yaml'),
					generateOptions: { night: true, profiles: 'all' },
				});

				expect(result).toMatchObject({
					ok: false,
					exitCode: ExitCode.GENERAL_ERROR,
				});
				expect(await fs.readFile(markerPath)).toEqual(marker);
				expect(await fs.readdir(outputDir)).toEqual(['demo-night.json']);
			} finally {
				await fs.rm(dir, { recursive: true, force: true });
			}
		});

		test('filters an invalid night before planning profile day outputs', async () => {
			const dir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-plan-invalid-night-'),
			);
			try {
				await writeNightProfileWorkspace(dir, '"{theme.color.missing}"');

				const result = await generateTheme({
					workspacePath: path.join(dir, 'main.yaml'),
					generateOptions: { night: true, profiles: 'all' },
				});

				expect(result.ok).toBe(true);
				if (result.ok) {
					expect(result.generatedFiles).toContain('demo.json');
					expect(result.generatedFiles).toContain('demo-night.json');
				}
			} finally {
				await fs.rm(dir, { recursive: true, force: true });
			}
		});
	});

	afterAll(async () => {
		restoreResourceEnv(previousResourceEnv);
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	beforeAll(() => {
		tempDir = createTempOutputDir();
		previousResourceEnv = applyResourceEnv(isolatedResourceEnv(tempDir));
	});

	test('builds a self-contained main.yaml without $config.resource', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-no-resource-'));
		try {
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				`$config:
  theme: no-resource
  parameter:
    outputDir: ./out
    platform: [json]
theme:
  color:
    $type: color
    base:
      $value: "#2563eb"
    alias:
      $value: "{theme.color.base}"
`,
			);

			const result = await generateTheme({
				workspacePath: path.join(dir, 'main.yaml'),
				generateOptions: { night: false },
			});

			expect(result.ok).toBe(true);
			expect(
				await Bun.file(path.join(dir, 'out', 'no-resource.json')).exists(),
			).toBe(true);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('generates the Orca-derived md-yml fixture contract', async () => {
		const fixture = await copyFixtureWorkspace('fixtures/themes/md-yml-orca');
		try {
			const result = await generateTheme({
				workspacePath: path.join(fixture.dir, 'main.yaml'),
				generateOptions: { night: false },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			if (!result.ok) return;
			expect(result.generatedFiles).toEqual(['orca-doc2md.yml']);
			const raw = await fs.readFile(
				path.join(fixture.dir, 'out', 'orca-doc2md.yml'),
				'utf8',
			);
			expect(raw.startsWith('---')).toBe(false);
			const payload = yaml.load(raw) as Record<string, unknown>;
			expect(payload).toEqual({
				color: {
					'primary-main': '#1a72f0',
					'primary-on-main': '#ffffff',
					'text-emphasis': '#112233',
					'text-muted': '#11223380',
				},
				radius: { md: '8px' },
				font: {
					'font-family': [
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
					'heading-h1': {
						color: '{color.text-emphasis}',
						fontFamily: '{font.font-family}',
						fontSize: '2.5rem',
						fontWeight: 700,
						letterSpacing: '0px',
						lineHeight: 1.2,
					},
				},
				shadow: {
					raised: expect.any(Array),
				},
			});
			const visit = (value: unknown): void => {
				if (typeof value === 'string') {
					const match = /^\{([^.{}]+)\.([^.{}]+)\}$/.exec(value);
					if (!match) return;
					const namespace = payload[match[1]!] as
						| Record<string, unknown>
						| undefined;
					expect(namespace).toBeDefined();
					expect(Object.hasOwn(namespace!, match[2]!)).toBe(true);
					return;
				}
				if (Array.isArray(value)) {
					for (const item of value) visit(item);
					return;
				}
				if (typeof value === 'object' && value !== null) {
					for (const item of Object.values(value)) visit(item);
				}
			};
			visit(payload);
			expect(raw).not.toMatch(/(?:^|\s)[&*]ref_/m);
		} finally {
			await fs.rm(fixture.dir, { recursive: true, force: true });
		}
	});

	test('rejects an unknown CLI platform before changing output artifacts', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-platform-'));
		const outputDir = path.join(dir, 'out');
		const jsonPath = path.join(outputDir, 'platform-check.json');
		const marker = Buffer.from('existing-json\n');
		try {
			await fs.mkdir(outputDir, { recursive: true });
			await fs.writeFile(jsonPath, marker);
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				`$config:
  theme: platform-check
  parameter:
    outputDir: ./out
    platform: [css]
  parameterGroup:
    css: { platform: [css] }
    sketch: { platform: [sketch] }
theme:
  color:
    primary:
      $type: color
      $value: "#2563eb"
`,
			);

			const result = await generateTheme({
				workspacePath: path.join(dir, 'main.yaml'),
				cliOutput: outputDir,
				cliPlatform: 'json,unknown',
				generateOptions: { night: false },
			});

			expect(result).toMatchObject({
				ok: false,
				exitCode: ExitCode.GENERAL_ERROR,
				message:
					'Unknown platform "unknown". Supported platforms: json, jsonc, css, sketch, md-yml',
			});
			expect(await fs.readFile(jsonPath)).toEqual(marker);
			expect(await fs.readdir(outputDir)).toEqual(['platform-check.json']);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('rejects an empty CLI platform before changing output artifacts', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-platform-'));
		const outputDir = path.join(dir, 'out');
		const jsonPath = path.join(outputDir, 'platform-check.json');
		const marker = Buffer.from('existing-json\n');
		try {
			await fs.mkdir(outputDir, { recursive: true });
			await fs.writeFile(jsonPath, marker);
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				`$config:
  theme: platform-check
  parameter:
    outputDir: ./out
    platform: [css]
  parameterGroup:
    css: { platform: [css] }
    sketch: { platform: [sketch] }
theme:
  color:
    primary:
      $type: color
      $value: "#2563eb"
`,
			);

			const result = await generateTheme({
				workspacePath: path.join(dir, 'main.yaml'),
				cliOutput: outputDir,
				cliPlatform: '',
				generateOptions: { night: false },
			});

			expect(result).toMatchObject({
				ok: false,
				exitCode: ExitCode.GENERAL_ERROR,
				message: 'At least one output platform is required',
			});
			expect(await fs.readFile(jsonPath)).toEqual(marker);
			expect(await fs.readdir(outputDir)).toEqual(['platform-check.json']);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('CLI platform uses one base pass for default, named, and all profiles', async () => {
		const dir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-md-yml-profile-'),
		);
		try {
			await fs.mkdir(path.join(dir, 'profiles'));
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				`$config:
  theme: profile-doc
  parameter: { filterLayer: 1 }
  parameterGroup:
    css: { platform: [css], filterLayer: 2 }
    sketch: { platform: [sketch], filterLayer: 2 }
theme:
  color:
    $type: color
    primary: { $value: "#1a72f0" }
`,
			);
			await fs.writeFile(
				path.join(dir, 'profiles', 'mobile.yaml'),
				`$config:
  parameter: { filterLayer: 1 }
  parameterGroup:
    css: { platform: [css], filterLayer: 2 }
    sketch: { platform: [sketch], filterLayer: 2 }
theme:
  color:
    $type: color
    primary: { $value: "#22c55e" }
`,
			);

			const allOut = path.join(dir, 'all');
			const all = await generateTheme({
				workspacePath: path.join(dir, 'main.yaml'),
				cliOutput: allOut,
				cliPlatform: 'md-yml',
				generateOptions: { night: false, profiles: 'all' },
			});
			expect(all.ok, all.ok ? undefined : all.message).toBe(true);
			if (all.ok) {
				expect(all.generatedFiles.sort()).toEqual([
					'profile-doc-mobile2md.yml',
					'profile-doc2md.yml',
				]);
			}
			expect((await fs.readdir(allOut)).sort()).toEqual([
				'profile-doc-mobile2md.yml',
				'profile-doc2md.yml',
			]);

			const namedOut = path.join(dir, 'named');
			const named = await generateTheme({
				workspacePath: path.join(dir, 'main.yaml'),
				cliOutput: namedOut,
				cliPlatform: 'md-yml',
				generateOptions: { night: false, profile: 'mobile' },
			});
			expect(named.ok, named.ok ? undefined : named.message).toBe(true);
			expect(await fs.readdir(namedOut)).toEqual(['profile-doc-mobile2md.yml']);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('CLI output alone preserves configured group passes', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-group-output-'));
		const outputDir = path.join(dir, 'override');
		try {
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				`$config:
  theme: group-output
  parameterGroup:
    json: { outputDir: ./json, platform: [json] }
    css: { outputDir: ./css, platform: [css] }
theme:
  color:
    primary: { $type: color, $value: "#1a72f0" }
`,
			);
			const result = await generateTheme({
				workspacePath: path.join(dir, 'main.yaml'),
				cliOutput: outputDir,
				generateOptions: { night: false },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			expect((await fs.readdir(outputDir)).sort()).toEqual([
				'group-output.css',
				'group-output.json',
			]);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('md-yml shares the current OKLCH transformed values with JSON', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-md-yml-oklch-'));
		try {
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				`$config:
  theme: oklch-doc
  parameter:
    outputDir: ./out
    platform: [json, md-yml]
    filterLayer: 1
    colorSpace: oklch
theme:
  color:
    primary: { $type: color, $value: "#0052f5" }
`,
			);
			const result = await generateTheme({
				workspacePath: path.join(dir, 'main.yaml'),
				generateOptions: { night: false },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			const json = JSON.parse(
				await fs.readFile(path.join(dir, 'out', 'oklch-doc.json'), 'utf8'),
			);
			const md = yaml.load(
				await fs.readFile(path.join(dir, 'out', 'oklch-doc2md.yml'), 'utf8'),
			) as Record<string, Record<string, unknown>>;
			expect(md.color?.primary).toEqual(json['color-primary']);
			expect(md.color?.primary).not.toMatch(/^#[0-9a-f]{8}$/i);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	describe('reference-gated resource loading', () => {
		const cases = [
			{
				name: 'missing unused resource',
				kind: 'custom',
				refs: ['./missing.yaml'],
				reference: undefined,
				succeeds: true,
			},
			{
				name: 'malformed unused resource',
				kind: 'custom',
				refs: ['./malformed.yaml'],
				files: { 'malformed.yaml': 'broken: [' },
				reference: undefined,
				succeeds: true,
			},
			{
				name: 'duplicate unused namespace',
				kind: 'custom',
				refs: ['./first.yaml', './second.yaml'],
				files: {
					'first.yaml':
						'shared:\n  color:\n    blue:\n      $value: "#2563eb"\n',
					'second.yaml':
						'shared:\n  color:\n    blue:\n      $value: "#1d4ed8"\n',
				},
				reference: undefined,
				succeeds: true,
			},
			{
				name: 'missing referenced resource',
				kind: 'custom',
				refs: ['./missing.yaml'],
				reference: '{missing.color.blue}',
				succeeds: false,
			},
			{
				name: 'malformed referenced resource',
				kind: 'custom',
				refs: ['./malformed.yaml'],
				files: { 'malformed.yaml': 'broken: [' },
				reference: '{broken.color.blue}',
				succeeds: false,
			},
			{
				name: 'duplicate referenced namespace',
				kind: 'custom',
				refs: ['./first.yaml', './second.yaml'],
				files: {
					'first.yaml':
						'shared:\n  color:\n    blue:\n      $value: "#2563eb"\n',
					'second.yaml':
						'shared:\n  color:\n    blue:\n      $value: "#1d4ed8"\n',
				},
				reference: '{shared.color.blue}',
				succeeds: false,
			},
		] as const;

		for (const testCase of cases) {
			test(testCase.name, async () => {
				const dir = await fs.mkdtemp(
					path.join(os.tmpdir(), 'wave-resource-gate-'),
				);
				try {
					const files = 'files' in testCase ? testCase.files : {};
					for (const [name, content] of Object.entries(
						files as Record<string, string>,
					)) {
						await fs.writeFile(path.join(dir, name), content);
					}
					const refs = testCase.refs.map((ref) => `      - ${ref}`).join('\n');
					await fs.writeFile(
						path.join(dir, 'main.yaml'),
						`$config:
  theme: resource-gate
  resource:
    ${testCase.kind}:
${refs}
  parameter:
    outputDir: ./out
    platform: [json]
theme:
  color:
    external:
      $type: color
      $value: "${testCase.reference ?? '#2563eb'}"
`,
					);

					const ctx = new BuildContext();
					const result = await generateTheme(
						{
							workspacePath: path.join(dir, 'main.yaml'),
							generateOptions: { night: false },
						},
						ctx,
					);

					expect(result.ok).toBe(testCase.succeeds);
					expect(ctx.warnings).toEqual([]);
					if (testCase.succeeds) {
						expect(ctx.resources).toEqual([]);
					} else {
						if (result.ok) return;
						expect(result.exitCode).toBe(ExitCode.INVALID_PARAMETER);
						expect(result.message).toContain(
							'Unresolved theme references found',
						);
						expect(result.message).toContain('at theme.color.external');
						expect(ctx.resources).toEqual([]);
					}
				} finally {
					await fs.rm(dir, { recursive: true, force: true });
				}
			});
		}

		for (const reference of [
			'"{external.color.blue}"',
			'{ $ref: "#/external/color/blue/$value" }',
		]) {
			test(`resolves external value ${reference}`, async () => {
				const dir = await fs.mkdtemp(
					path.join(os.tmpdir(), 'wave-external-ref-'),
				);
				try {
					await fs.writeFile(
						path.join(dir, 'external.yaml'),
						'external:\n  color:\n    blue:\n      $value: "#2563eb"\n',
					);
					await fs.writeFile(
						path.join(dir, 'main.yaml'),
						`$config:
  theme: external-ref
  resource:
    custom: [./external.yaml]
  parameter: { outputDir: ./out, platform: [json] }
theme:
  color:
    external:
      $type: color
      $value: ${reference}
`,
					);
					const ctx = new BuildContext();
					const result = await generateTheme(
						{
							workspacePath: path.join(dir, 'main.yaml'),
							generateOptions: { night: false },
						},
						ctx,
					);

					expect(result.ok, result.ok ? undefined : result.message).toBe(true);
					expect(ctx.resources).toEqual([
						{
							kind: 'custom',
							ref: './external.yaml',
							source: 'user',
						},
					]);
				} finally {
					await fs.rm(dir, { recursive: true, force: true });
				}
			});
		}

		test('resolves a resource reference nested in smoothShadow extensions', async () => {
			const dir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-extension-ref-'),
			);
			try {
				await fs.writeFile(
					path.join(dir, 'motion.yaml'),
					'motion:\n  easing:\n    ease:\n      $value: [0.33, 1, 0.68, 1]\n',
				);
				await fs.writeFile(
					path.join(dir, 'main.yaml'),
					`$config:
  theme: extension-ref
  resource:
    custom: [./motion.yaml]
  parameter: { outputDir: ./out, platform: [json] }
theme:
  shadow:
    raised:
      $type: shadow
      $value: { color: "#000000", offsetX: 0, offsetY: 1, blur: 2, spread: 0 }
      $extensions:
        smoothShadow:
          cubicBezier: "{motion.easing.ease}"
          step: 2
          target: { alpha: 0.2, offsetX: 0, offsetY: 2, blur: 4, spread: 0 }
`,
				);
				const result = await generateTheme({
					workspacePath: path.join(dir, 'main.yaml'),
					generateOptions: { night: false },
				});

				expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			} finally {
				await fs.rm(dir, { recursive: true, force: true });
			}
		});

		test('does not leak themefile resources into an adjacent configured main', async () => {
			const dir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-config-precedence-'),
			);
			try {
				await fs.writeFile(
					path.join(dir, 'themefile'),
					'THEME precedence\nRESOURCE custom ./missing.yaml\n',
				);
				await fs.writeFile(
					path.join(dir, 'main.yaml'),
					`$config:
  theme: precedence
  parameter: { outputDir: ./out, platform: [json] }
theme:
  color:
    base: { $type: color, $value: "#2563eb" }
`,
				);
				const ctx = new BuildContext();
				const result = await generateTheme(
					{
						workspacePath: path.join(dir, 'main.yaml'),
						generateOptions: { night: false },
					},
					ctx,
				);

				expect(result.ok, result.ok ? undefined : result.message).toBe(true);
				expect(ctx.resources).toEqual([]);
			} finally {
				await fs.rm(dir, { recursive: true, force: true });
			}
		});

		test('legacy input is rejected without touching existing artifacts', async () => {
			const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-main-only-'));
			const outputDir = path.join(dir, 'out');
			const markerPath = path.join(outputDir, 'existing.json');
			const marker = Buffer.from([0, 1, 2, 255, 10, 13]);
			try {
				await fs.mkdir(outputDir);
				await fs.writeFile(markerPath, marker);
				await fs.writeFile(path.join(dir, 'themefile'), 'THEME legacy\n');
				await fs.writeFile(path.join(dir, 'tokens.yaml'), 'theme: {}\n');

				for (const testCase of [
					{
						input: path.join(dir, 'themefile'),
						exitCode: ExitCode.INVALID_PARAMETER,
					},
					{
						input: path.join(dir, 'tokens.yaml'),
						exitCode: ExitCode.INVALID_PARAMETER,
					},
					{
						input: path.join(dir, 'missing', 'main.yaml'),
						exitCode: ExitCode.FILE_NOT_FOUND,
					},
				]) {
					const result = await generateTheme({
						workspacePath: testCase.input,
						cliOutput: outputDir,
						generateOptions: { night: false },
					});

					expect(result.ok).toBe(false);
					if (!result.ok) {
						expect(result.exitCode).toBe(testCase.exitCode);
						expect(result.message).toContain(testCase.input);
						expect(result.message).toContain('main.yaml');
						expect(result.message).toContain('wave dt init');
					}
					expect(await fs.readFile(markerPath)).toEqual(marker);
					expect(await fs.readdir(outputDir)).toEqual(['existing.json']);
				}
			} finally {
				await fs.rm(dir, { recursive: true, force: true });
			}
		});
	});

	describe('标准主题生成', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('standard');
		});

		test('应成功生成主题', async () => {
			const result = await generateTheme(
				makeInput({ workspacePath: theme.mainYaml }),
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles.length).toBeGreaterThan(0);
			}
		});

		test('应生成 JSON 和 CSS 文件', async () => {
			const result = await generateTheme(
				makeInput({ workspacePath: theme.mainYaml }),
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
				makeInput({ workspacePath: theme.mainYaml }),
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
						color: '#0000001a',
						offsetX: '0px',
						offsetY: '1px',
						blur: '2px',
						spread: '0px',
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
					workspacePath: path.join(themeDir, 'main.yaml'),
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
				expect(textAssetByName(sketch, 'font-body').text).toMatchObject({
					fontSize: 12.25,
					lineHeight: 21,
					kerning: 1.4,
				});
				expect(json['font-body']).toMatchObject({
					fontSize: '0.875rem',
					lineHeight: '1.5rem',
					letterSpacing: '0.1rem',
				});
				expect(JSON.stringify(json)).not.toContain('baseFontSize');
				expect(jsonc).toContain('"fontSize":"0.875rem"');
				expect(jsonc).toContain('"lineHeight":"1.5rem"');
				expect(jsonc).toContain('"letterSpacing":"0.1rem"');
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
					workspacePath: path.join(themeDir, 'main.yaml'),
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
					expect(textAssetByName(sketch, 'font-body').text).toMatchObject({
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
					workspacePath: path.join(themeDir, 'main.yaml'),
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
				expect(textAssetByName(sketch, 'font-body').text).toMatchObject({
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
				workspacePath: themePath,
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
				expect(css).toContain('--font-heading-h1-weight:');
				expect(css).not.toContain('--dimension-');
				expect(JSON.stringify(sketch)).toContain('"kind":"text"');
				expect(JSON.stringify(sketch)).toContain('"version":2');
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
				workspacePath: themePath,
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

			const ctx = new BuildContext();
			const result = await generateTheme(
				{
					workspacePath: themePath,
					cliOutput: outputDir,
					generateOptions: { night: false, profiles: 'all' },
				},
				ctx,
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('profile-model.json');
				expect(result.generatedFiles).toContain('profile-model.css');
				expect(result.generatedFiles).toContain('profile-model-mobile.json');
				expect(ctx.resources).toEqual([
					{ kind: 'palette', ref: 'tailwindcss', source: 'builtin' },
					{ kind: 'dimension', ref: 'wave', source: 'builtin' },
					{
						kind: 'custom',
						ref: path.join(
							process.cwd(),
							'tests/fixtures/themes/profile-model/resources/mobile-resource.yaml',
						),
						source: 'user',
					},
				]);
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
					workspacePath: themePath,
					cliOutput: outputDir,
					generateOptions: { night: true, profiles: 'all' },
				});

				expect(result.ok, result.ok ? undefined : result.message).toBe(true);
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

		test('invalid night mode is skipped without failing day profile build', async () => {
			const outputDir = createTempOutputDir();
			const themePath = path.join(
				process.cwd(),
				'tests/fixtures/themes/profile-model/main.yaml',
			);
			const ctx = new BuildContext();

			const result = await generateTheme(
				{
					workspacePath: themePath,
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
					workspacePath: themePath,
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
					workspacePath: themePath,
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
					workspacePath: themePath,
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

		test('应解析内部引用链与带 alpha 的外部引用，并输出稳定 artifact', async () => {
			const result = await generateTheme(
				makeInput({ workspacePath: theme.mainYaml }),
			);

			expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			if (!result.ok) return;
			expect(result.generatedFiles).toEqual(['test-ref.json']);

			const json = JSON.parse(
				await fs.readFile(path.join(tempDir, 'test-ref.json'), 'utf8'),
			);
			expect(json['theme-color-base']).toBe('#0066cc');
			expect(json['theme-color-hover']).toBe('#0066cc');
			expect(json['theme-color-semi-transparent']).toBe('#0066cc80');
			expect(json['theme-color-derived']).toBe('#0066cc');
			expect(json['theme-style-shadow-elevated']).toEqual([
				{
					color: '#4f39f633',
					offsetX: '0px',
					offsetY: '8px',
					blur: '16px',
					spread: '0px',
				},
			]);
			expect(JSON.stringify(json)).not.toContain('$ref');
		});
	});

	describe('inheritColor 继承色', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('inherit-color');
		});

		test('应在 JSON、CSS 和 Sketch 输出中保留 inheritColor 语义', async () => {
			const result = await generateTheme(
				makeInput({
					workspacePath: theme.mainYaml,
				}),
			);

			expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			if (!result.ok) return;
			expect(result.generatedFiles).toEqual([
				'inherit-color.json',
				'inherit-color.css',
				'inherit-color2sketch.json',
			]);

			const json = JSON.parse(
				await fs.readFile(path.join(tempDir, 'inherit-color.json'), 'utf8'),
			);
			const css = await fs.readFile(
				path.join(tempDir, 'inherit-color.css'),
				'utf8',
			);
			const sketch = JSON.parse(
				await fs.readFile(
					path.join(tempDir, 'inherit-color2sketch.json'),
					'utf8',
				),
			);

			expect(json['theme-color-interaction-inheritplain']).toBe(
				'$COLOR_FOREGROUND',
			);
			expect(json['theme-color-interaction-inheritwithopacity']).toEqual({
				color: '$COLOR_FOREGROUND',
				opacity: 0.5,
			});
			expect(json['theme-color-interaction-inheritfull']).toEqual({
				color: '$COLOR_FOREGROUND',
				opacity: 0.3,
			});
			expect(css).toContain(
				'--theme-color-interaction-inheritplain: currentColor;',
			);
			expect(css).toContain(
				'--theme-color-interaction-inheritwithopacity: color-mix(in srgb, currentColor 50%, transparent);',
			);
			expect(css).toContain(
				'--theme-color-interaction-inheritfull: color-mix(in srgb, currentColor 30%, transparent);',
			);
			expect(
				assetByName(sketch, 'theme-color-interaction-inheritwithsibling'),
			).toEqual({
				name: 'theme-color-interaction-inheritwithsibling',
				kind: 'color',
				color: '#00cc00ff',
			});
			// opacity 折入 HEX8（255 * 0.3 -> 0x4d），color 记录无独立 opacity 字段。
			expect(
				assetByName(sketch, 'theme-color-interaction-inheritfull'),
			).toEqual({
				name: 'theme-color-interaction-inheritfull',
				kind: 'color',
				color: '#00cc004d',
			});
			expect(
				assetByName(sketch, 'theme-color-interaction-inheritmissingsibling'),
			).toEqual({
				name: 'theme-color-interaction-inheritmissingsibling',
				kind: 'color',
				color: '#ff00ffff',
			});
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
					workspacePath: theme.mainYaml,
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

		test('应在三平台 artifact 中锁定 $extends 继承与 public-root 合同', async () => {
			const result = await generateTheme(
				makeInput({
					workspacePath: theme.mainYaml,
				}),
			);

			expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			if (!result.ok) return;
			expect(result.generatedFiles).toEqual([
				'test-extends.json',
				'test-extends.css',
				'test-extends2sketch.json',
			]);

			const json = JSON.parse(
				await fs.readFile(path.join(tempDir, 'test-extends.json'), 'utf8'),
			);
			const css = await fs.readFile(
				path.join(tempDir, 'test-extends.css'),
				'utf8',
			);
			const sketch = JSON.parse(
				await fs.readFile(
					path.join(tempDir, 'test-extends2sketch.json'),
					'utf8',
				),
			);

			expect(json['theme-component-button-outline-primary-fill']).toBe(
				'#ffffff',
			);
			expect(json['theme-component-button-outline-primary-border']).toBe(
				'#615fff',
			);
			expect(json['theme-component-button-outline-primary-radius']).toBe('4px');
			expect(json['theme-component-button-filled-secondary-text']).toBe(
				'#ffffff',
			);
			expect(json['theme-component-button-filled-secondary-radius']).toBe(
				'4px',
			);
			expect(css).toBe(':root {\n}');
			// 可同步资产为空：v2 payload 仍保留 meta 结构，assets 为空清单。
			expect(sketch).toEqual({
				meta: { themeId: null, version: 2 },
				assets: [],
			});
		});
	});

	describe('Sketch extensions 集成输出', () => {
		test('应在真实生成链路中锁定 sketch.path、property 和 filterLayer 合同', async () => {
			const fixture = await copyFixtureWorkspace(
				'fixtures/themes/sketch-extensions',
			);
			const outputDir = path.join(fixture.dir, 'theme');
			const mainPath = path.join(fixture.dir, 'main.yaml');
			const mainContent = await fs.readFile(mainPath, 'utf8');
			await fs.writeFile(
				mainPath,
				mainContent.replace('    night: false\n', ''),
			);

			try {
				const result = await generateTheme({
					workspacePath: mainPath,
					generateOptions: { night: true },
				});

				expect(result.ok, result.ok ? undefined : result.message).toBe(true);
				if (!result.ok) return;
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

				const assetNames: string[] = sketch.assets.map(
					(asset: SketchAsset) => asset.name,
				);

				expect(assetNames).toContain('foundation/color/color-primary-main');
				expect(assetNames).toContain('color-shadow');
				expect(
					assetNames.some((name) => name.startsWith('foundation/interaction')),
				).toBe(false);
				expect(
					assetNames.some((name) => name.startsWith('foundation/radius')),
				).toBe(false);
				expect(
					layerAssetByName(sketch, 'aaa/bbb/shadow-1').shadows,
				).toHaveLength(4);
				expect(assetNames).not.toContain('aaa/bbb');
				expect(assetNames.some((name) => name === 'color')).toBe(false);
				expect(assetNames.some((name) => name === 'dimension')).toBe(false);
				expect(assetNames.some((name) => name.startsWith('component'))).toBe(
					false,
				);
				expect(json['color-primary-main']).toBe('#1872f0');
				expect(JSON.stringify(json)).not.toContain('_sketch');
			} finally {
				await fs.rm(fixture.dir, { recursive: true, force: true });
			}
		});
	});

	test('generates every DTCG standard type across JSON, CSS, and Sketch', async () => {
		const fixture = await copyFixtureWorkspace(
			'fixtures/themes/dtcg-standard-types',
		);
		const outputDir = path.join(fixture.dir, 'theme');
		const previousEnv = applyResourceEnv(fixture.env);

		try {
			const result = await generateTheme({
				workspacePath: path.join(fixture.dir, 'main.yaml'),
				generateOptions: { night: false },
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toEqual(
					expect.arrayContaining([
						'dtcg-standard-types.json',
						'dtcg-standard-types.jsonc',
						'dtcg-standard-types.css',
						'dtcg-standard-types2sketch.json',
					]),
				);
			}

			const json = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'dtcg-standard-types.json'),
					'utf-8',
				),
			);
			const jsonc = await fs.readFile(
				path.join(outputDir, 'dtcg-standard-types.jsonc'),
				'utf-8',
			);
			const css = await fs.readFile(
				path.join(outputDir, 'dtcg-standard-types.css'),
				'utf-8',
			);
			const sketch = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'dtcg-standard-types2sketch.json'),
					'utf-8',
				),
			);

			expect(json['state-source-color']).toBe('#336699');
			expect(json['state-spacing-alias']).toBe('8px');
			expect(json['state-wave-spacing']).toBe('12px');
			expect(json['state-font-stack']).toEqual([
				'Inter',
				'Helvetica Neue',
				'sans-serif',
			]);
			expect(json['state-semibold']).toBe(600);
			expect(json['state-fast']).toBe('200ms');
			expect(json['state-easing']).toEqual([0.4, 0, 0.2, 1]);
			expect(json['state-scale']).toBe(0.75);
			expect(json['state-antline-style']).toEqual({
				dashArray: ['3px', '5px', '2px', '3px', '5px', '2px'],
				lineCap: 'round',
			});
			expect(json['state-antline']).toEqual({
				color: '#336699',
				width: '8px',
				style: json['state-antline-style'],
			});
			expect(json['state-emphasis']).toEqual({
				duration: '200ms',
				delay: '50ms',
				timingFunction: [0.4, 0, 0.2, 1],
			});
			expect(json['state-raised']).toEqual({
				color: '#336699',
				offsetX: '0px',
				offsetY: '4px',
				blur: '12px',
				spread: '-2px',
				inset: true,
			});
			expect(json['state-focus-gradient']).toEqual([
				{ color: '#336699', position: 0 },
				{ color: '#336699', position: 0.25 },
				{ color: '#ffffff', position: 0.75 },
				{ color: '#ffffff', position: 1 },
			]);
			expect(json['state-body']).toEqual({
				fontFamily: ['Inter', 'sans-serif'],
				fontSize: '16px',
				fontWeight: 400,
				letterSpacing: '0px',
				lineHeight: 1.5,
			});
			expect(json['state-body-wave']).toEqual({
				fontFamily: 'Inter',
				fontSize: '16px',
				fontWeight: 400,
				letterSpacing: '0px',
				lineHeight: '24px',
				color: '#336699',
			});
			expect(jsonc).toContain('"state-wave-spacing": "12px"');
			expect(jsonc).toContain('"lineCap":"round"');

			expect(css).toContain(
				'--state-font-stack: Inter, "Helvetica Neue", sans-serif;',
			);
			expect(css).toContain('--state-semibold: 600;');
			expect(css).toContain('--state-easing: cubic-bezier(0.4, 0, 0.2, 1);');
			expect(css).toContain('--state-antline: 8px dashed #336699;');
			expect(css).toContain(
				'--state-antline-dash-array: 3px 5px 2px 3px 5px 2px;',
			);
			expect(css).toContain('--state-antline-line-cap: round;');
			expect(css).toContain(
				'--state-emphasis: 200ms cubic-bezier(0.4, 0, 0.2, 1) 50ms;',
			);
			expect(css).toContain(
				'--state-raised: inset 0 4px 12px -2px rgb(51 102 153 / 1);',
			);
			expect(css).toContain('rgb(51 102 153 / 1) 0%');
			expect(css).toContain('rgb(255 255 255 / 1) 100%');
			expect(css).toContain('--state-body-wave-line-height: 24px;');
			expect(css).not.toContain('[object Object]');

			expect(assetByName(sketch, 'state-source-color')).toEqual({
				name: 'state-source-color',
				kind: 'color',
				color: '#336699ff',
			});
			// 普通 border、generic dimension、transition、strokeStyle 退出 payload。
			expect(assetByName(sketch, 'state-spacing-alias')).toBeUndefined();
			expect(assetByName(sketch, 'state-antline-style')).toBeUndefined();
			expect(assetByName(sketch, 'state-antline')).toBeUndefined();
			expect(assetByName(sketch, 'state-emphasis')).toBeUndefined();
			expect(layerAssetByName(sketch, 'state-raised').shadows).toEqual([
				{
					x: 0,
					y: 4,
					blur: 12,
					spread: -2,
					color: '#336699ff',
					inset: true,
				},
			]);
			expect(
				layerAssetByName(sketch, 'state-focus-gradient').gradient,
			).toHaveLength(4);
			expect(textAssetByName(sketch, 'state-body').text).toEqual({
				fontFamily: 'Inter',
				fontSize: 16,
				fontWeight: 400,
				lineHeight: 24,
				kerning: 0,
			});
			// textColor 退役：text 记录只含 5 个纯字体字段。
			expect(textAssetByName(sketch, 'state-body-wave').text).toEqual({
				fontFamily: 'Inter',
				fontSize: 16,
				fontWeight: 400,
				lineHeight: 24,
				kerning: 0,
			});
			expect(
				JSON.stringify(assetByName(sketch, 'state-body-wave')),
			).not.toContain('color');
		} finally {
			restoreResourceEnv(previousEnv);
			await fs.rm(fixture.dir, { recursive: true, force: true });
		}
	});

	test('rejects stockStyle composite builds without changing output artifacts', async () => {
		const fixture = await copyFixtureWorkspace(
			'fixtures/themes/stock-style-invalid',
		);
		const outputDir = path.join(fixture.dir, 'theme');
		const sentinelPath = path.join(outputDir, 'stock-style-invalid.json');
		const sentinel = Buffer.from('existing-json-artifact\n');
		const previousEnv = applyResourceEnv(fixture.env);

		try {
			await fs.mkdir(outputDir);
			await fs.writeFile(sentinelPath, sentinel);

			const result = await generateTheme({
				workspacePath: path.join(fixture.dir, 'main.yaml'),
				generateOptions: { night: false },
			});

			expect(result).toMatchObject({
				ok: false,
				exitCode: ExitCode.GENERAL_ERROR,
			});
			if (!result.ok) {
				expect(result.message).toContain('theme.border.antline');
				expect(result.message).toContain('stockStyle');
			}
			expect(await fs.readFile(sentinelPath)).toEqual(sentinel);
			expect(await fs.readdir(outputDir)).toEqual(['stock-style-invalid.json']);
		} finally {
			restoreResourceEnv(previousEnv);
			await fs.rm(fixture.dir, { recursive: true, force: true });
		}
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
				workspacePath: path.join(fixtureDir, 'main.yaml'),
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
			expect(css).toContain('--antline-line-cap: butt;');
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
				fontSize: '14pt',
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: '0px',
				color: '#0f172b',
			});
			expect(jsonc).toContain('"fontSize":"14pt"');
			expect(jsonc).toContain('"letterSpacing":"0px"');
			expect(jsonc).toContain('"color":"#0f172b"');

			const sketch = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'sketch', 'orca-realistic2sketch.json'),
					'utf-8',
				),
			);
			expect(assetByName(sketch, 'foundation/color/orcaFallback-main')).toEqual(
				{
					name: 'foundation/color/orcaFallback-main',
					kind: 'color',
					color: '#0052f5ff',
				},
			);
			expect(
				layerAssetByName(sketch, 'foundation/shadow/raised').shadows,
			).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ color: '#0052f580' }),
				]),
			);
			expect(
				layerAssetByName(sketch, 'foundation/gradient/fallback').gradient?.[0]
					?.color,
			).toBe('#0052f540');
			// inheritColor + opacity 0.36 -> 折入 HEX8（255 * 0.36 -> 0x5c）。
			expect(assetByName(sketch, 'foundation/color/outline-default')).toEqual({
				name: 'foundation/color/outline-default',
				kind: 'color',
				color: '#ff00ff5c',
			});
			expect(textAssetByName(sketch, 'foundation/font/body').text).toEqual({
				fontFamily: 'PingFang SC',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 21,
				kerning: 0,
			});
			// textColor 退役：heading/display 的 color 引用不再出现在 payload。
			expect(JSON.stringify(sketch)).not.toContain('textColor');
			expect(JSON.stringify(sketch)).not.toContain('"@/');
			expect(
				textAssetByName(sketch, 'v2/heading/heading-h1').text,
			).toMatchObject({ fontFamily: 'PingFang SC', fontWeight: 400 });
			expect(
				textAssetByName(sketch, 'v2/heading/heading-escaped').text,
			).toBeDefined();
			expect(
				textAssetByName(sketch, 'v2/heading/heading-external').text,
			).toBeDefined();
			expect(
				textAssetByName(sketch, 'v2/heading/heading-literal').text,
			).toBeDefined();
			expect(
				textAssetByName(sketch, 'v2/heading/heading-alpha').text,
			).toBeDefined();
			expect(
				textAssetByName(sketch, 'v2/display/display-body').text,
			).toBeDefined();
			expect(
				textAssetByName(sketch, 'v2/display/display-footnote').text,
			).toBeDefined();
			expect(
				textAssetByName(sketch, 'v2/display/display-alias').text,
			).toBeDefined();
			expect(
				textAssetByName(sketch, 'foundation/font/label').text.lineHeight,
			).toBe(20);
			expect(assetByName(sketch, 'foundation/font/internal')).toBeUndefined();
			expect(json['font-internal']).toBeDefined();
			const fontBodyJsoncLine = jsonc
				.split('\n')
				.find((line) => line.includes('"font-body"'));
			expect(fontBodyJsoncLine).toContain(
				`"font-body": ${JSON.stringify(json['font-body'])}`,
			);
			expect(jsonc).toContain('"font-internal"');
			expect(css).toContain('--internal-line-height: 1.25;');
			// 普通 border（蚂蚁线）退出 payload；outline ring 保持双层 shadows。
			expect(assetByName(sketch, 'foundation/border/antline')).toBeUndefined();
			const ring = layerAssetByName(sketch, 'foundation/border/outline');
			expect(ring.shadows?.[0]).toMatchObject({ spread: 3 });
			expect(ring.shadows?.[1]).toEqual({
				x: 0,
				y: 0,
				blur: 0,
				spread: 2,
				color: '#ffffffff',
			});
			// ring 的颜色位置是 HEX8 快照；整份 payload 不含任何 swatch 引用。
			expect(
				ring.shadows?.[0]?.color && typeof ring.shadows[0]!.color === 'string',
			).toBe(true);
			expect(JSON.stringify(sketch)).not.toContain('$ref');
		} finally {
			restoreResourceEnv(previousEnv);
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	describe('DTCG colorSpace mixed platform', () => {
		test('main config renders sketch from hex tokens in mixed colorSpace pass', async () => {
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
					path.join(tempThemeDir, 'main.yaml'),
					[
						'$config:',
						'  theme: main-mixed',
						'  resource:',
						'    palette: [./palette.yaml]',
						'    dimension: [./dimension.yaml]',
						'  parameter:',
						'    outputDir: ./out',
						'    platform: [css, sketch]',
						'    colorSpace: oklch',
						'theme:',
						'  color:',
						'    primary:',
						'      $type: color',
						'      $value: "{custom.color.primary}"',
						'',
					].join('\n'),
					'utf-8',
				);

				const result = await generateTheme({
					workspacePath: path.join(tempThemeDir, 'main.yaml'),
					generateOptions: { night: true },
				});

				if (!result.ok) throw new Error(result.message);
				const css = await fs.readFile(
					path.join(outputDir, 'main-mixed.css'),
					'utf-8',
				);
				const sketch = JSON.parse(
					await fs.readFile(
						path.join(outputDir, 'main-mixed2sketch.json'),
						'utf-8',
					),
				);
				expect(css).toContain('oklch(');
				expect(sketch.assets).toEqual([
					{
						name: 'theme-color-primary',
						kind: 'color',
						color: '#fb2c36ff',
					},
				]);
			} finally {
				await fs.rm(tempThemeDir, { recursive: true, force: true });
			}
		});

		test('main build does not record a legacy fallback warning', async () => {
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
					path.join(tempThemeDir, 'main.yaml'),
					[
						'$config:',
						'  theme: main-warning',
						'  resource:',
						'    palette: [./palette.yaml]',
						'    dimension: [./dimension.yaml]',
						'  parameter: { outputDir: ./out, platform: [json] }',
						'theme:',
						'  color:',
						'    primary: { $type: color, $value: "{custom.color.primary}" }',
						'',
					].join('\n'),
					'utf-8',
				);

				const ctx = new BuildContext();
				const result = await generateTheme(
					{
						workspacePath: path.join(tempThemeDir, 'main.yaml'),
						generateOptions: { night: false },
					},
					ctx,
				);

				expect(result.ok).toBe(true);
				expect(ctx.warnings).toEqual([]);
			} finally {
				await fs.rm(tempThemeDir, { recursive: true, force: true });
			}
		});

		test('main parameter groups do not record legacy fallback warnings', async () => {
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
					path.join(tempThemeDir, 'main.yaml'),
					[
						'$config:',
						'  theme: main-groups',
						'  resource:',
						'    palette: [./palette.yaml]',
						'    dimension: [./dimension.yaml]',
						'  parameterGroup:',
						'    json: { outputDir: ./json, platform: [json] }',
						'    css: { outputDir: ./css, platform: [css] }',
						'theme:',
						'  color:',
						'    primary: { $type: color, $value: "{custom.color.primary}" }',
						'',
					].join('\n'),
					'utf-8',
				);

				const ctx = new BuildContext();
				const result = await generateTheme(
					{
						workspacePath: path.join(tempThemeDir, 'main.yaml'),
						generateOptions: { night: false },
					},
					ctx,
				);

				expect(result.ok).toBe(true);
				expect(ctx.warnings).toEqual([]);
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
						'      platform:',
						'        sketch:',
						'          path: foundation/color',
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
						'      platform:',
						'        sketch:',
						'          path: foundation/space',
						'    spacing:',
						'      sm:',
						'        $value: 4',
						'',
					].join('\n'),
					'utf-8',
				);
			}

			try {
				const mainPath = path.join(tempThemeDir, 'main.yaml');
				await writeThemeYaml(mainPath, '#fb2c36');
				const tokenContent = await fs.readFile(mainPath, 'utf8');
				await fs.writeFile(
					mainPath,
					`$config:
  theme: mixed-branches
  resource:
    palette: [tailwindcss]
    dimension: [wave]
  parameter:
    outputDir: ./out
    platform: [css, sketch]
    colorSpace: oklch

${tokenContent}`,
					'utf8',
				);
				await writeThemeYaml(
					path.join(tempThemeDir, 'main@night.yaml'),
					'#0052f5',
				);
				for (const run of [1, 2]) {
					const result = await generateTheme({
						workspacePath: mainPath,
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
				expect(
					assetByName(sketch, 'foundation/color/theme-color-primary'),
				).toMatchObject({
					kind: 'color',
					color: expect.stringMatching(/^#[0-9a-f]{8}$/i),
				});
				expect(
					assetByName(sketch, 'foundation/color/theme-color-secondary'),
				).toEqual({
					name: 'foundation/color/theme-color-secondary',
					kind: 'color',
					color: '#0052f5ff',
				});
				// generic dimension 退出 payload：space 前缀不产生记录。
				expect(
					sketch.assets.some((asset: SketchAsset) =>
						asset.name.startsWith('foundation/space'),
					),
				).toBe(false);
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
		test('normalizes shadow lengths and outline border colors', async () => {
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
        $extensions: { platform: { sketch: { outline: { offset: 2 } } } }
      token-curly-base:
        $type: border
        $value: { color: "{theme.color.base}", width: 1, style: solid }
        $extensions: { platform: { sketch: { outline: { offset: 2 } } } }
      token-curly-alias:
        $type: border
        $value: { color: "{theme.color.alias}", width: 1, style: solid }
        $extensions: { platform: { sketch: { outline: { offset: 2 } } } }
      token-curly-external:
        $type: border
        $value: { color: "{theme.color.external}", width: 1, style: solid }
        $extensions: { platform: { sketch: { outline: { offset: 2 } } } }
      pointer-token:
        $type: border
        $value:
          color: { $ref: "#/theme/color/base" }
          width: 1
          style: solid
        $extensions: { platform: { sketch: { outline: { offset: 2 } } } }
      pointer-value:
        $type: border
        $value:
          color: { $ref: "#/theme/color/base/$value" }
          width: 1
          style: solid
        $extensions: { platform: { sketch: { outline: { offset: 2 } } } }
      pointer-alias-value:
        $type: border
        $value:
          color: { $ref: "#/theme/color/alias/$value" }
          width: 1
          style: solid
        $extensions: { platform: { sketch: { outline: { offset: 2 } } } }
      ref-width:
        $type: border
        $value:
          color: "{theme.color.base}"
          width: "{wave.dimension.px.2}"
          style: solid
        $extensions: { platform: { sketch: { outline: { offset: 2 } } } }
`,
			);

			try {
				const result = await generateTheme({
					workspacePath: themePath,
					cliOutput: outputDir,
					cliPlatform: 'css,sketch',
					generateOptions: { night: false },
				});

				expect(result.ok, result.ok ? undefined : result.message).toBe(true);
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

				// 颜色位置一律 HEX8 快照，各引用形态的输出值一致。
				const ringColor = (name: string): unknown =>
					layerAssetByName(sketch, name).shadows?.[0]?.color;
				expect(ringColor('border-outline-direct-hex')).toBe('#2563ebff');
				expect(ringColor('border-outline-token-curly-base')).toBe('#2563ebff');
				expect(ringColor('border-outline-token-curly-alias')).toBe('#2563ebff');
				expect(ringColor('border-outline-token-curly-external')).toBe(
					'#1d293dff',
				);
				expect(ringColor('border-outline-pointer-token')).toBe('#2563ebff');
				expect(ringColor('border-outline-pointer-value')).toBe('#2563ebff');
				expect(ringColor('border-outline-pointer-alias-value')).toBe(
					'#2563ebff',
				);
				expect(
					layerAssetByName(sketch, 'border-outline-ref-width').shadows?.[0],
				).toMatchObject({
					spread: 6,
				});
				expect(ringColor('border-outline-ref-width')).toBe('#2563ebff');
			} finally {
				await fs.rm(tempThemeDir, { recursive: true, force: true });
			}
		});
	});

	describe('错误处理', () => {
		test('应在 main.yaml 不存在时返回错误', async () => {
			const result = await generateTheme({
				workspacePath: '/nonexistent/main.yaml',
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
					workspacePath: theme.mainYaml,
				}),
			);

			expect(result.ok).toBe(false);

			await cleanupTempTheme(theme);
		});

		test('build rejects negative typography dimensions at the CSS platform', async () => {
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
			await addMainConfig(theme);

			const result = await generateTheme(
				makeInput({
					workspacePath: theme.mainYaml,
				}),
			);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.message).toContain('CSS platform error');
				expect(result.message).toContain(
					'typography fontSize must be non-negative',
				);
				expect(result.message).toContain('theme.font.body');
			}
			await cleanupTempTheme(theme);
		});

		test('build rejects negative border dash values at the CSS platform', async () => {
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
          lineCap: butt
`,
				'utf8',
			);
			await addMainConfig(theme);

			const result = await generateTheme(
				makeInput({
					workspacePath: theme.mainYaml,
				}),
			);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.message).toContain(
					'CSS border dashArray has an invalid member at index 0',
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
          lineCap: butt
`,
				'utf8',
			);
			await addMainConfig(theme, ['css']);

			const result = await generateTheme(
				makeInput({
					workspacePath: theme.mainYaml,
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
