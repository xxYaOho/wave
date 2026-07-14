import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateTokens } from '../src/core/generator/token-generator.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, WaveToken } from '../src/types/index.ts';

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
			expect(parsed['theme-color-bg']).toEqual({ color: '#abcdefff' });
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
					_sketch: { path: 'radius/v2' },
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

	test('returns success:true with no files when no valid platform', async () => {
		await withTempDir(async (outputDir) => {
			const result = await generateTokens({
				themeName: 'demo',
				outputDir,
				tokens: [],
				platform: ['unknown'],
			});

			expect(result.success).toBe(true);
			expect(result.files).toEqual([]);
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
			);
			expect(css).toContain('oklch(');
			expect(css).toContain('font-size: 14px;');
			expect(css).toContain('--theme-font-body-size: 0.875rem;');
			expect(sketch['theme-color-primary']).toEqual({
				color: expect.stringMatching(/^#[0-9a-f]{8}$/i),
			});
			expect(sketch['theme-font-body'].textStyle).toMatchObject({
				fontSize: 12.25,
				lineHeight: 21,
				kerning: 1.4,
			});
		});
	});
});
