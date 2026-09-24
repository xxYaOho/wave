import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import {
	getOutlineExtension,
	parseSketchExtension,
} from '../src/core/transformer/sketch-extension.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { DtcgTokenGroup } from '../src/types/index.ts';

/**
 * M2 Task-5 负向断言：旧形态（$extensions.sketch.* / $extensions.outline）
 * 不再被解析，遇到即报错并指引 `wave dt migrate-extensions`。
 * 每种旧形态键各一条：sketch.path / sketch.property / sketch.skip / outline。
 */

function expectLegacyRejection(
	theme: DtcgTokenGroup,
	legacyPathSuffix: string,
) {
	const result = validateThemeSchema(theme);
	expect(result.valid).toBe(false);
	const issue = result.issues.find(
		(i) =>
			i.level === 'error' &&
			i.path.endsWith(legacyPathSuffix) &&
			i.message.includes('wave dt migrate-extensions'),
	);
	expect(issue).toBeDefined();
	return result;
}

describe('legacy sketch extension rejection (M2 Task-5)', () => {
	test('sketch.path is rejected', () => {
		const result = expectLegacyRejection(
			{
				theme: {
					color: {
						$type: 'color',
						primary: {
							$value: '#1872f0',
							$extensions: { sketch: { path: 'foundation/color' } },
						},
					},
				},
			},
			'$extensions.sketch',
		);
		expect(
			result.issues.some((i) => i.message.includes('"platform.sketch"')),
		).toBe(true);
	});

	test('sketch.skip is rejected (explicit false included)', () => {
		const result = expectLegacyRejection(
			{
				theme: {
					color: {
						$type: 'color',
						muted: {
							$value: '#8899aa',
							$extensions: { sketch: { skip: false } },
						},
					},
				},
			},
			'$extensions.sketch',
		);
		expect(result.issues.length).toBeGreaterThan(0);
	});

	test('sketch.property is rejected', () => {
		const result = expectLegacyRejection(
			{
				theme: {
					dimension: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: { sketch: { property: { opacity: true } } },
						},
					},
				},
			},
			'$extensions.sketch',
		);
		expect(
			result.issues.some((i) => i.message.includes('"platform.sketch"')),
		).toBe(true);
	});

	test('outline is rejected with the platform.sketch.outline hint', () => {
		const result = expectLegacyRejection(
			{
				theme: {
					border: {
						focus: {
							$type: 'border',
							$value: { color: '#000000', width: 1, style: 'solid' },
							$extensions: { outline: { offset: 2 } },
						},
					},
				},
			},
			'$extensions.outline',
		);
		expect(
			result.issues.some((i) =>
				i.message.includes('"platform.sketch.outline"'),
			),
		).toBe(true);
	});

	test('group-level sketch path/skip is rejected', () => {
		const result = expectLegacyRejection(
			{
				theme: {
					color: {
						$type: 'color',
						$extensions: { sketch: { path: 'foundation/color', skip: true } },
						primary: { $value: '#1872f0' },
					},
				},
			},
			'$extensions.sketch',
		);
		expect(result.valid).toBe(false);
	});

	test('outline rejection ignores the border contract when the legacy key is present', () => {
		// 旧形态 outline 在 color token 上：拒绝理由是旧形态本身，而非类型合同
		const result = validateThemeSchema({
			theme: {
				color: {
					primary: {
						$value: '#1872f0',
						$extensions: { outline: { offset: 2 } },
					},
				},
			},
		});
		expect(result.valid).toBe(false);
		expect(
			result.issues.every(
				(i) => !i.message.includes('outline can only be used with $type'),
			),
		).toBe(true);
		expect(
			result.issues.some((i) => i.message.includes('migrate-extensions')),
		).toBe(true);
	});

	test('transformer derives nothing from legacy keys', () => {
		const resolved = {
			theme: {
				dimension: {
					hover: {
						$type: 'number',
						$value: 0.16,
						$extensions: {
							sketch: { path: 'legacy/path', property: { opacity: true } },
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved as never);
		const token = result.tokens.find((t) => t.name === 'theme-dimension-hover');
		expect(token?._sketch).toBeUndefined();
		expect(parseSketchExtension({ sketch: { skip: true } })).toBeUndefined();
		expect(getOutlineExtension({ outline: { offset: 2 } })).toBeUndefined();
	});
});
