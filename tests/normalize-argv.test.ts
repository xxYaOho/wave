import { describe, expect, test } from 'bun:test';
import { normalizeWaveArgv } from '../src/cli/normalize-argv.ts';

function argv(...parts: string[]): string[] {
	return ['bun', 'wave', ...parts];
}

describe('normalizeWaveArgv', () => {
	test('defaults bare dt to build', () => {
		expect(normalizeWaveArgv(argv('dt'))).toEqual(argv('dt', 'build'));
		expect(normalizeWaveArgv(argv('dt', './main.yaml', '--night'))).toEqual(
			argv('dt', 'build', './main.yaml', '--night'),
		);
	});

	test('strips explicit --build sugar', () => {
		expect(
			normalizeWaveArgv(argv('dt', './main.yaml', '--build', '--output', 'dist')),
		).toEqual(argv('dt', 'build', './main.yaml', '--output', 'dist'));
	});

	test('routes --ids and --ids-write sugars', () => {
		expect(normalizeWaveArgv(argv('dt', './main.yaml', '--ids'))).toEqual(
			argv('dt', 'ids', './main.yaml'),
		);
		expect(
			normalizeWaveArgv(argv('dt', './main.yaml', '--ids-write', '--allow-dirty')),
		).toEqual(argv('dt', 'ids', '--write', './main.yaml', '--allow-dirty'));
		expect(normalizeWaveArgv(argv('dt', '--ids-write', '-f', './main.yaml'))).toEqual(
			argv('dt', 'ids', '--write', '-f', './main.yaml'),
		);
	});

	test('ids-write wins over ids/build when combined', () => {
		expect(
			normalizeWaveArgv(argv('dt', '--build', '--ids', '--ids-write', 'main.yaml')),
		).toEqual(argv('dt', 'ids', '--write', 'main.yaml'));
	});

	test('leaves real subcommands alone', () => {
		expect(normalizeWaveArgv(argv('dt', 'ids', '--write'))).toEqual(
			argv('dt', 'ids', '--write'),
		);
		expect(normalizeWaveArgv(argv('dt', 'doctor', '-f', 'main.yaml'))).toEqual(
			argv('dt', 'doctor', '-f', 'main.yaml'),
		);
	});

	test('remaps update --version', () => {
		expect(
			normalizeWaveArgv(argv('dt', 'update', 'tailwindcss', '--version', '4')),
		).toEqual(
			argv('dt', 'update', 'tailwindcss', '--tailwind-version', '4'),
		);
	});

	test('compress and workspace defaults', () => {
		expect(normalizeWaveArgv(argv('compress', 'img.png'))).toEqual(
			argv('compress', 'run', 'img.png'),
		);
		expect(normalizeWaveArgv(argv('workspace', 'my-app'))).toEqual(
			argv('workspace', 'create', 'my-app'),
		);
	});
});
