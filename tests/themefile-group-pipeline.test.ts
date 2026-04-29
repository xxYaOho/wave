import { describe, expect, test } from 'bun:test';
import {
	mergeParameters,
	resolveParameters,
	buildGroupPasses,
} from '../src/core/pipeline/theme-pipeline.ts';
import type { ParsedThemefile } from '../src/types/index.ts';

function makeParsed(overrides?: Partial<ParsedThemefile>): ParsedThemefile {
	return {
		THEME: 'test-theme',
		PARAMETER: {},
		resources: [
			{ kind: 'palette', ref: 'leonardo' },
			{ kind: 'dimension', ref: 'wave' },
		],
		groups: [],
		...overrides,
	};
}

describe('mergeParameters', () => {
	test('group overrides global', () => {
		const global = { output: './build', platform: 'json' };
		const group = { platform: 'css' };
		const merged = mergeParameters(global, group);
		expect(merged.output).toBe('./build');
		expect(merged.platform).toBe('css');
	});

	test('global field preserved when group does not specify it', () => {
		const global = { output: './build', colorSpace: 'oklch' };
		const group = { platform: 'css' };
		const merged = mergeParameters(global, group);
		expect(merged.output).toBe('./build');
		expect(merged.colorSpace).toBe('oklch');
		expect(merged.platform).toBe('css');
	});

	test('empty group keeps all global', () => {
		const global = { output: './build', platform: 'json' };
		const merged = mergeParameters(global, {});
		expect(merged).toEqual(global);
	});
});

describe('resolveParameters', () => {
	test('default platform is ["json"]', () => {
		const result = resolveParameters({}, '/theme');
		expect(result.platforms).toEqual(['json']);
	});

	test('resolves platform from params', () => {
		const result = resolveParameters({ platform: 'css,json' }, '/theme');
		expect(result.platforms).toEqual(['css', 'json']);
	});

	test('resolves filterLayer as number', () => {
		const result = resolveParameters({ filterLayer: '3' }, '/theme');
		expect(result.filterLayer).toBe(3);
	});

	test('resolves valid colorSpace', () => {
		const result = resolveParameters({ colorSpace: 'oklch' }, '/theme');
		expect(result.colorSpace).toBe('oklch');
	});

	test('resolves outputDir from params', () => {
		const result = resolveParameters({ output: './build' }, '/theme');
		expect(result.outputDir).toBe('/theme/build');
	});

	test('CLI output overrides PARAMETER output', () => {
		const result = resolveParameters(
			{ output: './build' },
			'/theme',
			'/cli/output',
		);
		expect(result.outputDir).toBe('/cli/output');
	});

	test('CLI platform overrides PARAMETER platform', () => {
		const result = resolveParameters(
			{ platform: 'css' },
			'/theme',
			undefined,
			'sketch',
		);
		expect(result.platforms).toEqual(['sketch']);
	});

	test('empty outputDir when no output specified', () => {
		const result = resolveParameters({}, '/theme');
		expect(result.outputDir).toBe('');
	});
});

describe('buildGroupPasses', () => {
	test('empty groups → single pass from global params', () => {
		const parsed = makeParsed({
			PARAMETER: { output: './build', platform: 'css' },
		});
		const passes = buildGroupPasses(parsed, '/theme');
		expect(passes).toHaveLength(1);
		expect(passes[0].platforms).toEqual(['css']);
		expect(passes[0].outputDir).toBe('/theme/build');
	});

	test('no groups (backward compat) → single pass with default outputDir', () => {
		const parsed = makeParsed();
		const passes = buildGroupPasses(parsed, '/theme');
		expect(passes).toHaveLength(1);
		expect(passes[0].outputDir).toBe('/theme/test-theme');
		expect(passes[0].platforms).toEqual(['json']);
	});

	test('multiple groups → one pass per group', () => {
		const parsed = makeParsed({
			PARAMETER: { output: './build' },
			groups: [
				{ name: 'css', PARAMETER: { platform: 'css', output: './build/css' } },
				{
					name: 'sketch',
					PARAMETER: { platform: 'sketch', output: './build/sketch' },
				},
			],
		});
		const passes = buildGroupPasses(parsed, '/theme');
		expect(passes).toHaveLength(2);
		expect(passes[0].outputDir).toBe('/theme/build/css');
		expect(passes[0].platforms).toEqual(['css']);
		expect(passes[1].outputDir).toBe('/theme/build/sketch');
		expect(passes[1].platforms).toEqual(['sketch']);
	});

	test('group inherits global params', () => {
		const parsed = makeParsed({
			PARAMETER: { colorSpace: 'oklch' },
			groups: [{ name: 'css', PARAMETER: { platform: 'css' } }],
		});
		const passes = buildGroupPasses(parsed, '/theme');
		expect(passes).toHaveLength(1);
		expect(passes[0].colorSpace).toBe('oklch');
		expect(passes[0].platforms).toEqual(['css']);
	});

	test('CLI output overrides all groups', () => {
		const parsed = makeParsed({
			groups: [
				{ name: 'css', PARAMETER: { output: './build/css' } },
				{ name: 'sketch', PARAMETER: { output: './build/sketch' } },
			],
		});
		const passes = buildGroupPasses(parsed, '/theme', '/cli/out');
		expect(passes).toHaveLength(2);
		expect(passes[0].outputDir).toBe('/cli/out');
		expect(passes[1].outputDir).toBe('/cli/out');
	});

	test('CLI platform overrides all groups', () => {
		const parsed = makeParsed({
			groups: [
				{ name: 'css', PARAMETER: { platform: 'css' } },
				{ name: 'sketch', PARAMETER: { platform: 'sketch' } },
			],
		});
		const passes = buildGroupPasses(parsed, '/theme', undefined, 'json');
		expect(passes).toHaveLength(2);
		expect(passes[0].platforms).toEqual(['json']);
		expect(passes[1].platforms).toEqual(['json']);
	});
});
