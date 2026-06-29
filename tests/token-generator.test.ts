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
			expect(sketch['theme-color-primary']).toEqual({
				color: expect.stringMatching(/^#[0-9a-f]{8}$/i),
			});
		});
	});
});
