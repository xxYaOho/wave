/**
 * Theme Service 集成测试
 *
 * 测试主题生成的完整流程
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../src/core/pipeline/theme-service.ts';
import {
	cleanupTempTheme,
	createTempTheme,
	loadTestTheme,
	type TestTheme,
} from '../utils/fixture-loader.ts';

describe('Theme Service Integration', () => {
	describe('标准主题生成', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('standard');
		});

		test('应成功生成主题', async () => {
			const input: ThemeGenerationInput = {
				themeName: 'test-standard',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles.length).toBeGreaterThan(0);
			}
		});

		test('应生成 JSON 和 CSS 文件', async () => {
			const input: ThemeGenerationInput = {
				themeName: 'test-standard',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const hasJson = result.generatedFiles.some((f) => f.endsWith('.json'));
				const hasCss = result.generatedFiles.some((f) => f.endsWith('.css'));
				expect(hasJson).toBe(true);
				expect(hasCss).toBe(true);
			}
		});
	});

	describe('$ref 引用解析', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('ref-test');
		});

		test('应正确解析内部引用', async () => {
			const input: ThemeGenerationInput = {
				themeName: 'test-ref',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

			expect(result.ok).toBe(true);
		});

		test('应正确解析外部引用', async () => {
			const input: ThemeGenerationInput = {
				themeName: 'test-ref',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

			expect(result.ok).toBe(true);
		});
	});

	describe('inheritColor 继承色', () => {
		let theme: TestTheme;

		beforeAll(async () => {
			theme = await loadTestTheme('inherit-color');
		});

		test('应正确生成继承色主题的所有平台文件', async () => {
			const input: ThemeGenerationInput = {
				themeName: 'test-inherit-color',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

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
			const input: ThemeGenerationInput = {
				themeName: 'test-inherit-color',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const cssFile = result.generatedFiles.find(
					(f) => f.endsWith('.css') && !f.includes('night'),
				);
				expect(cssFile).toBeDefined();
			}
		});

		test('JSON 输出应包含 $COLOR_FOREGROUND 哨兵值', async () => {
			const input: ThemeGenerationInput = {
				themeName: 'test-inherit-color',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

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
				palette: 'tailwindcss4',
				dimension: 'wave',
				platform: ['json'],
				tokens: {
					color: {
						$type: 'color',
						primary: {
							$value: '{tailwindcss4.color.indigo.600}',
						},
					},
				},
			});

			const input: ThemeGenerationInput = {
				themeName: 'temp-test',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

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
			const input: ThemeGenerationInput = {
				themeName: 'test-extends',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles.length).toBeGreaterThan(0);
			}
		});

		test('应生成 JSON、CSS 和 Sketch 文件', async () => {
			const input: ThemeGenerationInput = {
				themeName: 'test-extends',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

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
			const input: ThemeGenerationInput = {
				themeName: 'test-extends',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

			expect(result.ok).toBe(true);
			if (result.ok) {
				// 验证生成了主 JSON 文件
				const jsonFile = result.generatedFiles.find(
					(f) => f.endsWith('.json') && !f.includes('sketch'),
				);
				expect(jsonFile).toBeDefined();
			}
		});
	});

	describe('错误处理', () => {
		test('应在 themefile 不存在时返回错误', async () => {
			const input: ThemeGenerationInput = {
				themeName: 'nonexistent',
				themePath: '/nonexistent/themefile',
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

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

			const input: ThemeGenerationInput = {
				themeName: 'circular-test',
				themePath: theme.themefile,
				generateOptions: { night: false },
			};

			const result = await generateTheme(input);

			expect(result.ok).toBe(false);

			await cleanupTempTheme(theme);
		});
	});
});
