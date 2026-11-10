import { describe, expect, test } from 'bun:test';
import { normalizeWaveArgv } from '../src/cli/normalize-argv.ts';

describe('normalizeWaveArgv', () => {
	test('does not rewrite public argv', () => {
		const input = ['bun', 'wave', 'token', '--file', './main.yaml'];
		expect(normalizeWaveArgv(input)).toBe(input);
	});

	test('leaves legacy aliases and shortcut flags for Commander to reject', () => {
		const input = ['bun', 'wave', 'dt', '--ids-write'];
		expect(normalizeWaveArgv(input)).toEqual(input);
	});
});
