import { describe, expect, test } from 'bun:test';
import { validateMainConfig } from '../src/core/validator/design-token-config.ts';
import { ExitCode } from '../src/types/index.ts';

describe('design token main config validator', () => {
	test('accepts the minimal config and supplies empty collections', () => {
		expect(validateMainConfig({ theme: 'orca' })).toEqual({
			ok: true,
			config: {
				theme: 'orca',
				parameter: {},
				resources: [],
				parameterGroups: [],
			},
		});
	});

	test('normalizes parameters, resources, and parameter groups', () => {
		const result = validateMainConfig({
			theme: '  orca  ',
			resource: {
				palette: ' tailwindcss ',
				dimension: ['wave', ' compact.yaml '],
				custom: ' custom/brand.yaml ',
			},
			parameter: {
				outputDir: ' ./dist ',
				platform: ['json', 'css'],
				filterLayer: 2,
				colorSpace: 'oklch',
			},
			parameterGroup: {
				sketch: {
					outputDir: './sketch',
					platform: ['sketch'],
					filterLayer: 0,
					colorSpace: 'srgb',
				},
			},
		});

		expect(result).toEqual({
			ok: true,
			config: {
				theme: 'orca',
				parameter: {
					output: './dist',
					platform: 'json,css',
					filterLayer: '2',
					colorSpace: 'oklch',
				},
				resources: [
					{ kind: 'palette', ref: 'tailwindcss' },
					{ kind: 'dimension', ref: 'wave' },
					{ kind: 'dimension', ref: 'compact.yaml' },
					{ kind: 'custom', ref: 'custom/brand.yaml' },
				],
				parameterGroups: [
					{
						name: 'sketch',
						parameter: {
							output: './sketch',
							platform: 'sketch',
							filterLayer: '0',
							colorSpace: 'srgb',
						},
					},
				],
			},
		});
	});

	test('preserves resource kind declaration order', () => {
		const result = validateMainConfig({
			theme: 'orca',
			resource: {
				custom: 'custom/brand.yaml',
				palette: 'tailwindcss',
				dimension: 'wave',
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config.resources).toEqual([
			{ kind: 'custom', ref: 'custom/brand.yaml' },
			{ kind: 'palette', ref: 'tailwindcss' },
			{ kind: 'dimension', ref: 'wave' },
		]);
	});

	test('accepts and normalizes the md-yml platform', () => {
		const result = validateMainConfig({
			theme: 'orca',
			parameter: { platform: ['md-yml'] },
		});
		expect(result).toMatchObject({
			ok: true,
			config: { parameter: { platform: 'md-yml' } },
		});
	});

	test('fails closed for unknown config fields', () => {
		const result = validateMainConfig({
			theme: ' ',
			plaform: ['css'],
		});

		expect(result).toMatchObject({
			ok: false,
			exitCode: ExitCode.FORMAT_ERROR,
		});
		if (result.ok) return;
		expect(result.message).toContain('theme');
		expect(result.message).toContain('plaform');
	});

	const invalidCases: Array<[string, unknown, string]> = [
		[
			'outputDir is empty',
			{ theme: 'orca', parameter: { outputDir: ' ' } },
			'parameter.outputDir',
		],
		[
			'platform is not an array',
			{ theme: 'orca', parameter: { platform: 'css' } },
			'parameter.platform',
		],
		[
			'platform is empty',
			{ theme: 'orca', parameter: { platform: [] } },
			'parameter.platform',
		],
		[
			'platform contains an unknown value',
			{ theme: 'orca', parameter: { platform: ['general'] } },
			'parameter.platform.0',
		],
		[
			'filterLayer is negative',
			{ theme: 'orca', parameter: { filterLayer: -1 } },
			'parameter.filterLayer',
		],
		[
			'filterLayer is fractional',
			{ theme: 'orca', parameter: { filterLayer: 1.5 } },
			'parameter.filterLayer',
		],
		[
			'colorSpace is unknown',
			{ theme: 'orca', parameter: { colorSpace: 'lab' } },
			'parameter.colorSpace',
		],
		[
			'custom resources contain a non-string',
			{ theme: 'orca', resource: { custom: [42] } },
			'resource.custom',
		],
		[
			'resource contains an unknown kind',
			{ theme: 'orca', resource: { brand: 'orca' } },
			'resource',
		],
		[
			'parameter group contains an unknown field',
			{
				theme: 'orca',
				parameterGroup: { css: { platform: ['css'], typo: true } },
			},
			'parameterGroup.css',
		],
	];

	for (const [name, value, issuePath] of invalidCases) {
		test(`rejects when ${name}`, () => {
			const result = validateMainConfig(value);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.exitCode).toBe(ExitCode.FORMAT_ERROR);
			expect(result.message).toContain(issuePath);
		});
	}
});
