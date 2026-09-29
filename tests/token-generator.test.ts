import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateTokens } from '../src/core/generator/token-generator.ts';
import { resolveReferences } from '../src/core/resolver/theme-reference.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type {
	DtcgTokenGroup,
	ResolvedTokenGroup,
	SketchAsset,
	SketchPayloadV2,
	WaveToken,
} from '../src/types/index.ts';

function assetByName(payload: SketchPayloadV2, name: string) {
	return payload.assets.find((asset) => asset.name === name);
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-gen-test-'));
	try {
		await fn(dir);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}

describe('generateTokens (Wave-native)', () => {
	test('writes a JSON file when platform=json', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'color-primary',
					path: ['color', 'primary'],
					value: '#ff0000',
					type: 'color',
					_order: 0,
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['json'],
			});

			expect(result.success).toBe(true);
			const file = path.join(outputDir, 'demo.json');
			const content = await fs.readFile(file, 'utf-8');
			const parsed = JSON.parse(content);
			expect(parsed['color-primary']).toBe('#ff0000');
		});
	});

	test('writes a CSS file when platform=css', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'theme-color-primary',
					path: ['theme', 'color', 'primary'],
					value: '#ff0000',
					type: 'color',
					_order: 0,
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['css'],
			});

			expect(result.success).toBe(true);
			const content = await fs.readFile(
				path.join(outputDir, 'demo.css'),
				'utf-8',
			);
			expect(content).toContain(':root {');
			expect(content).toContain('--theme-color-primary: #ff0000;');
		});
	});

	test('writes md-yml and supports a JSON companion output', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'theme-color-primary-main',
					path: ['theme', 'color', 'primary', 'main'],
					value: '#1a72f0',
					type: 'color',
					_order: 0,
				},
			];
			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['json', 'md-yml'],
				filterLayer: 1,
			});
			expect(result).toMatchObject({
				success: true,
				files: ['demo.json', 'demo2md.yml'],
			});
			expect(
				await fs.readFile(path.join(outputDir, 'demo2md.yml'), 'utf8'),
			).toBe("color:\n  primary-main: '#1a72f0'\n");
		});
	});

	test('css platform emits public roots and excludes legacy dimension root', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'theme-state-hover',
					path: ['theme', 'state', 'hover'],
					value: 0.16,
					type: 'number',
					_order: 0,
				},
				{
					name: 'theme-radius-md',
					path: ['theme', 'radius', 'md'],
					value: 8,
					type: 'dimension',
					_order: 1,
				},
				{
					name: 'theme-dimension-alpha-sm',
					path: ['theme', 'dimension', 'alpha', 'sm'],
					value: 0.16,
					type: 'number',
					_order: 2,
				},
				{
					name: 'style-shadow-legacy',
					path: ['style', 'shadow', 'legacy'],
					value: [
						{ color: '#000000', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
					],
					type: 'shadow',
					_order: 3,
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['css'],
				filterLayer: 1,
			});

			expect(result.success).toBe(true);
			const content = await fs.readFile(
				path.join(outputDir, 'demo.css'),
				'utf-8',
			);
			expect(content).toContain('--state-hover: 0.16;');
			expect(content).toContain('--radius-md: 8px;');
			expect(content).not.toContain('--dimension-alpha-sm');
			expect(content).not.toContain('--shadow-legacy');
		});
	});

	test('writes a Sketch JSON when platform=sketch', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'theme-color-bg',
					path: ['theme', 'color', 'bg'],
					value: '#abcdef',
					type: 'color',
					_order: 0,
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['sketch'],
			});

			expect(result.success).toBe(true);
			const content = await fs.readFile(
				path.join(outputDir, 'demo2sketch.json'),
				'utf-8',
			);
			const parsed = JSON.parse(content);
			expect(parsed).toEqual({
				meta: { themeId: null, baseId: null, version: 2 },
				assets: [
					{
						name: 'theme-color-bg',
						kind: 'color',
						color: '#abcdefff',
					},
				],
			});
		});
	});

	test('sketch platform excludes legacy dimension root', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'theme-dimension-radius-md',
					path: ['theme', 'dimension', 'radius', 'md'],
					value: 8,
					type: 'dimension',
					_order: 0,
					_sketch: { path: 'dimension/v2/radius' },
				},
				{
					name: 'theme-radius-md',
					path: ['theme', 'radius', 'md'],
					value: 8,
					type: 'dimension',
					_order: 1,
					_sketch: { property: { cornerRadius: true } },
				},
				{
					name: 'style-shadow-legacy',
					path: ['style', 'shadow', 'legacy'],
					value: [
						{ color: '#000000', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
					],
					type: 'shadow',
					_order: 2,
					_sketch: { path: 'legacy/shadow' },
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['sketch'],
				filterLayer: 1,
			});

			expect(result.success).toBe(true);
			const content = await fs.readFile(
				path.join(outputDir, 'demo2sketch.json'),
				'utf-8',
			);
			expect(content).toContain('radius-md');
			expect(content).not.toContain('dimension-radius-md');
			expect(content).not.toContain('shadow-legacy');
		});
	});

	test('writes multiple files when given multiple platforms', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'color-primary',
					path: ['color', 'primary'],
					value: '#ff0000',
					type: 'color',
					_order: 0,
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['json', 'jsonc'],
			});

			expect(result.success).toBe(true);
			expect(result.files).toContain('demo.json');
			expect(result.files).toContain('demo.jsonc');
		});
	});

	test('applies sketch.skip only to Sketch output', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'theme-color-hidden',
					path: ['theme', 'color', 'hidden'],
					value: '#ff0000',
					type: 'color',
					_order: 0,
					_sketch: { skip: true },
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['json', 'jsonc', 'css', 'sketch'],
			});

			expect(result.success).toBe(true);
			expect(
				await fs.readFile(path.join(outputDir, 'demo.json'), 'utf8'),
			).toContain('theme-color-hidden');
			expect(
				await fs.readFile(path.join(outputDir, 'demo.jsonc'), 'utf8'),
			).toContain('theme-color-hidden');
			expect(
				await fs.readFile(path.join(outputDir, 'demo.css'), 'utf8'),
			).toContain('--theme-color-hidden');
			expect(
				await fs.readFile(path.join(outputDir, 'demo2sketch.json'), 'utf8'),
			).not.toContain('theme-color-hidden');
		});
	});

	test('formats every platform before writing any output file', async () => {
		await withTempDir(async (outputDir) => {
			const jsonPath = path.join(outputDir, 'demo.json');
			const cssPath = path.join(outputDir, 'demo.css');
			await fs.writeFile(jsonPath, 'existing-json');
			await fs.writeFile(cssPath, 'existing-css');
			const tokens: WaveToken[] = [
				{
					name: 'theme-font-bad',
					path: ['theme', 'font', 'bad'],
					type: 'typography',
					value: {
						fontFamily: 'Inter',
						fontSize: 'bad',
						fontWeight: 400,
						lineHeight: 1.5,
						letterSpacing: 0,
					},
					_order: 0,
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['json', 'css', 'sketch'],
			});

			expect(result.success).toBe(false);
			expect(await fs.readFile(jsonPath, 'utf8')).toBe('existing-json');
			expect(await fs.readFile(cssPath, 'utf8')).toBe('existing-css');
			expect(
				await fs
					.stat(path.join(outputDir, 'demo2sketch.json'))
					.catch(() => undefined),
			).toBeUndefined();
		});
	});

	test('keeps existing outputs unchanged when CSS companion preflight fails', async () => {
		await withTempDir(async (outputDir) => {
			const jsonPath = path.join(outputDir, 'demo.json');
			const cssPath = path.join(outputDir, 'demo.css');
			await fs.writeFile(jsonPath, 'existing-json');
			await fs.writeFile(cssPath, 'existing-css');
			const tokens: WaveToken[] = [
				{
					name: 'theme-border-antline',
					path: ['theme', 'border', 'antline'],
					type: 'border',
					value: {
						color: '#000000',
						width: '1px',
						style: { dashArray: ['4px', '8px'], lineCap: 'butt' },
					},
					_order: 0,
				},
				{
					name: 'theme-border-antline-line-cap',
					path: ['theme', 'border', 'antline', 'line-cap'],
					type: 'string',
					value: 'round',
					_order: 1,
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['json', 'css'],
				filterLayer: 1,
			});

			expect(result.success).toBe(false);
			expect(result.files).toEqual([]);
			expect(result.error).toContain('--border-antline-line-cap');
			expect(await fs.readFile(jsonPath, 'utf8')).toBe('existing-json');
			expect(await fs.readFile(cssPath, 'utf8')).toBe('existing-css');
		});
	});

	test('writes no platform outputs when the sketch preflight fails', async () => {
		await withTempDir(async (outputDir) => {
			// fontWeight 刻度是 sketch 平台合同：CSS/JSON 正常，sketch 报错，
			// 多平台写入保持原子性（全部不落盘）。
			const tokens: WaveToken[] = [
				{
					name: 'theme-font-body',
					path: ['theme', 'font', 'body'],
					type: 'typography',
					value: {
						fontFamily: 'Inter',
						fontSize: 14,
						fontWeight: 250,
						lineHeight: 1.5,
						letterSpacing: 0,
					},
					_order: 0,
				},
			];

			const result = await generateTokens({
				themeName: 'atomic',
				outputDir,
				tokens,
				platform: ['json', 'css', 'sketch'],
			});

			expect(result.success).toBe(false);
			expect(result.files).toEqual([]);
			expect(result.error).toContain(
				'fontWeight 250 is off the Sketch 100-900 integer-hundred scale',
			);
			expect(await fs.readdir(outputDir)).toEqual([]);
		});
	});

	test('rejects an unknown platform before writing known outputs', async () => {
		await withTempDir(async (outputDir) => {
			const jsonPath = path.join(outputDir, 'demo.json');
			await fs.writeFile(jsonPath, 'existing-json');
			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens: [],
				platform: ['json', 'unknown'],
			});

			expect(result).toMatchObject({
				success: false,
				files: [],
				error:
					'Unknown platform "unknown". Supported platforms: json, jsonc, css, sketch, md-yml',
			});
			expect(await fs.readFile(jsonPath, 'utf8')).toBe('existing-json');
			expect(await fs.readdir(outputDir)).toEqual(['demo.json']);
		});
	});

	test('rejects an empty platform list', async () => {
		await withTempDir(async (outputDir) => {
			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens: [],
				platform: [],
			});

			expect(result).toEqual({
				success: false,
				files: [],
				error: 'At least one output platform is required',
			});
			expect(await fs.readdir(outputDir)).toEqual([]);
		});
	});

	for (const platform of [
		['json', 'md-yml', 'css'],
		['md-yml', 'json', 'css'],
	]) {
		test(`keeps current pass artifacts unchanged when md-yml formatting fails (${platform.join(',')})`, async () => {
			await withTempDir(async (outputDir) => {
				const jsonPath = path.join(outputDir, 'demo.json');
				const cssPath = path.join(outputDir, 'demo.css');
				await fs.writeFile(jsonPath, 'json-marker');
				await fs.writeFile(cssPath, 'css-marker');
				const tokens: WaveToken[] = [
					{
						name: 'theme-color-a-b',
						path: ['theme', 'color', 'a', 'b'],
						value: '#fff',
						_order: 0,
					},
					{
						name: 'theme-color-a-b-collision',
						path: ['theme', 'color', 'a-b'],
						value: '#000',
						_order: 1,
					},
				];
				const result = await generateTokens({
					themeName: 'demo',
					outputDir,
					tokens,
					platform,
					filterLayer: 1,
				});
				expect(result.success).toBe(false);
				expect(await fs.readFile(jsonPath, 'utf8')).toBe('json-marker');
				expect(await fs.readFile(cssPath, 'utf8')).toBe('css-marker');
				expect(
					await Bun.file(path.join(outputDir, 'demo2md.yml')).exists(),
				).toBe(false);
			});
		});
	}

	test('normalizes and deduplicates platforms', async () => {
		await withTempDir(async (outputDir) => {
			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens: [],
				platform: [' json ', 'json'],
			});

			expect(result.success).toBe(true);
			expect(result.files).toEqual(['demo.json']);
			expect(await fs.readdir(outputDir)).toEqual(['demo.json']);
		});
	});

	test('defaults to json platform when none specified', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'color-primary',
					path: ['color', 'primary'],
					value: '#ff0000',
					_order: 0,
				},
			];

			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
			});

			expect(result.success).toBe(true);
			expect(result.files).toContain('demo.json');
		});
	});

	test('does not leave temp files behind', async () => {
		await withTempDir(async (outputDir) => {
			const tokens: WaveToken[] = [
				{
					name: 'color-primary',
					path: ['color', 'primary'],
					value: '#ff0000',
					_order: 0,
				},
			];

			await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens,
				platform: ['json'],
			});

			const files = await fs.readdir(outputDir);
			expect(files.every((f) => !f.startsWith('.temp-'))).toBe(true);
		});
	});

	test('multi-platform pass keeps css colorSpace while sketch uses hex tokens', async () => {
		await withTempDir(async (outputDir) => {
			const resolved = {
				theme: {
					color: {
						$type: 'color',
						primary: {
							$value: {
								colorSpace: 'oklch',
								components: [0.518, 0.251, 262.6],
								hex: '#0052f5',
							},
						},
					},
					font: {
						$type: 'typography',
						$extensions: {
							typography: {
								baseFontSize: 14,
								defaults: {
									fontFamily: 'Inter',
									fontWeight: 400,
									lineHeight: 1.5,
									letterSpacing: 0,
								},
							},
						},
						body: {
							$value: {
								fontSize: { value: 0.875, unit: 'rem' },
								lineHeight: { value: 1.5, unit: 'rem' },
								letterSpacing: { value: 0.1, unit: 'rem' },
							},
						},
					},
				},
			} as ResolvedTokenGroup;
			const oklchTokens = transformToWaveTokens(resolved, undefined, 'oklch');

			const result = await generateTokens({
				themeName: 'multi-platform',
				outputDir,
				tokens: oklchTokens.tokens,
				resolved,
				platform: ['css', 'sketch'],
				colorSpace: 'oklch',
			});

			expect(result.success).toBe(true);
			const css = await fs.readFile(
				path.join(outputDir, 'multi-platform.css'),
				'utf-8',
			);
			const sketch = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'multi-platform2sketch.json'),
					'utf-8',
				),
			) as SketchPayloadV2;
			expect(css).toContain('oklch(');
			expect(css).toContain('font-size: 14px;');
			expect(css).toContain('--theme-font-body-size: 0.875rem;');
			const colorAsset = assetByName(sketch, 'theme-color-primary');
			expect(colorAsset).toMatchObject({
				kind: 'color',
				color: expect.stringMatching(/^#[0-9a-f]{8}$/i),
			});
			const textAsset = assetByName(sketch, 'theme-font-body') as Extract<
				SketchAsset,
				{ kind: 'text' }
			>;
			expect(textAsset.text).toMatchObject({
				fontSize: 12.25,
				lineHeight: 21,
				kerning: 1.4,
			});
		});
	});

	test('reference context keeps legacy platform bytes identical through Sketch HEX re-transform', async () => {
		await withTempDir(async (outputDir) => {
			const raw: DtcgTokenGroup = {
				theme: {
					color: {
						$type: 'color',
						base: { $value: '#0052f5' },
						alias: { $value: '{theme.color.base}' },
					},
				},
			};
			const resolution = resolveReferences(raw, {});
			const plain = transformToWaveTokens(resolution.tree, undefined, 'oklch');
			const contextual = transformToWaveTokens(
				resolution.tree,
				undefined,
				'oklch',
				resolution,
			);
			const plainDir = path.join(outputDir, 'plain');
			const contextualDir = path.join(outputDir, 'contextual');
			const platforms = ['json', 'jsonc', 'css', 'sketch'];

			const plainResult = await generateTokens({
				themeName: 'parity',
				outputDir: plainDir,
				tokens: plain.tokens,
				platform: platforms,
				resolved: resolution.tree,
				colorSpace: 'oklch',
			});
			const contextualResult = await generateTokens({
				themeName: 'parity',
				outputDir: contextualDir,
				tokens: contextual.tokens,
				platform: platforms,
				resolved: resolution.tree,
				colorSpace: 'oklch',
			});

			expect(contextualResult).toEqual(plainResult);
			for (const filename of plainResult.files) {
				expect(
					await fs.readFile(path.join(contextualDir, filename), 'utf8'),
				).toBe(await fs.readFile(path.join(plainDir, filename), 'utf8'));
			}
		});
	});
});
