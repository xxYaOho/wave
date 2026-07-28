import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { planBuildOutputs } from '../src/core/pipeline/output-plan.ts';

describe('planBuildOutputs', () => {
	test('rejects a partial platform overlap between passes', () => {
		const outputDir = path.resolve('/tmp/wave-output-plan');
		const result = planBuildOutputs([
			{
				id: 'group:all',
				themeName: 'demo',
				outputDir,
				platforms: ['json', 'css'],
			},
			{
				id: 'group:json',
				themeName: 'demo',
				outputDir,
				platforms: ['json'],
			},
		]);

		expect(result).toEqual({
			ok: false,
			error: `Output path collision: "${path.join(outputDir, 'demo.json')}" is produced by passes "group:all" and "group:json"`,
		});
	});

	test('normalizes dot segments before collision detection', () => {
		const root = path.resolve('/tmp/wave-output-plan');
		const result = planBuildOutputs([
			{
				id: 'dot-segment',
				themeName: 'demo',
				outputDir: path.join(root, 'nested', '..'),
				platforms: ['json'],
			},
			{
				id: 'resolved',
				themeName: 'demo',
				outputDir: root,
				platforms: ['json'],
			},
		]);

		expect(result).toEqual({
			ok: false,
			error: `Output path collision: "${path.join(root, 'demo.json')}" is produced by passes "dot-segment" and "resolved"`,
		});
	});

	test('keeps disjoint json and css outputs', () => {
		const result = planBuildOutputs([
			{
				id: 'json',
				themeName: 'demo',
				outputDir: '/tmp/wave-output-plan',
				platforms: ['json'],
			},
			{
				id: 'css',
				themeName: 'demo',
				outputDir: '/tmp/wave-output-plan',
				platforms: ['css'],
			},
		]);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.passes.map((pass) => pass.outputs[0]?.platform)).toEqual([
			'json',
			'css',
		]);
	});

	test('reuses the Sketch 2sketch filename contract', () => {
		const result = planBuildOutputs([
			{
				id: 'sketch',
				themeName: 'demo',
				outputDir: '/tmp/wave-output-plan',
				platforms: ['sketch'],
			},
		]);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.passes[0]?.outputs[0]?.filePath).toBe(
			path.resolve('/tmp/wave-output-plan/demo2sketch.json'),
		);
	});

	test('uses lexical paths without case or Unicode canonicalization', () => {
		const result = planBuildOutputs([
			{
				id: 'upper',
				themeName: 'Demo',
				outputDir: '/tmp/wave-output-plan',
				platforms: ['json'],
			},
			{
				id: 'lower',
				themeName: 'demo',
				outputDir: '/tmp/wave-output-plan',
				platforms: ['json'],
			},
			{
				id: 'unicode-nfc',
				themeName: 'caf\u00e9',
				outputDir: '/tmp/wave-output-plan',
				platforms: ['json'],
			},
			{
				id: 'unicode-nfd',
				themeName: 'cafe\u0301',
				outputDir: '/tmp/wave-output-plan',
				platforms: ['json'],
			},
		]);

		expect(result.ok).toBe(true);
	});
});
