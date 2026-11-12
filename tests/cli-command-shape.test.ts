import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import type { Command } from 'commander';
import { commandRegistry } from '../src/cli/registry.ts';
import { createCliRunner } from './utils/cli-runner.ts';

const rootDir = path.resolve(import.meta.dir, '..');

const runWave = createCliRunner((args: string[], lang: string = 'C') => ({
	command: ['bun', 'run', path.join(rootDir, 'src/index.ts'), ...args],
	cwd: rootDir,
	env: { ...process.env, LANG: lang },
}));

function commandPaths(): string[][] {
	const paths: string[][] = [];
	const visit = (prefix: string[], command: Command) => {
		const current = [...prefix, command.name()];
		paths.push(current);
		for (const child of command.commands) visit(current, child);
	};
	for (const definition of commandRegistry) visit([], definition.command);
	return paths;
}

function registryPaths(): Array<{
	path: string[];
	help: string;
	href: string;
	source: string;
}> {
	const paths: Array<{
		path: string[];
		help: string;
		href: string;
		source: string;
	}> = [];
	const visit = (
		prefix: string[],
		definition: (typeof commandRegistry)[number],
	) => {
		const path = [...prefix, definition.name];
		paths.push({
			path,
			help: definition.help,
			href: definition.manual.href,
			source: definition.manual.source,
		});
		for (const child of definition.children) visit(path, child);
	};
	for (const definition of commandRegistry) visit([], definition);
	return paths;
}

describe('public CLI command shape', () => {
	test('top-level help uses grouped new command tree', async () => {
		const result = await runWave(['--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Common commands:');
		expect(result.stdout).toContain('token');
		expect(result.stdout).toContain('Workspace:');
		expect(result.stdout).toContain('Toolchain:');
		expect(result.stdout).toContain('version');
	});

	test('token help separates commands and resources', async () => {
		const result = await runWave(['token', '--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('build');
		expect(result.stdout).toContain('new');
		expect(result.stdout).toContain('migrate');
		expect(result.stdout).toContain('Resources:');
		expect(result.stdout).toContain('show');
		expect(result.stdout).not.toContain('\n    resources');
		expect(result.stdout).not.toContain('--out <path>');
	});

	test('all token output help uses the shared short output flag', async () => {
		const result = await runWave(['token', 'build', '--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('-o, --output <path>');
		expect(result.stdout).not.toContain('--out <path>');
	});

	test('token new exposes profile and night creation commands', async () => {
		const result = await runWave(['token', 'new', '--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('profile');
		expect(result.stdout).toContain('night');

		const night = await runWave(['token', 'new', 'night', '--help']);
		expect(night.exitCode).toBe(0);
		expect(night.stdout).toContain('wave token new night [options]');
		expect(night.stdout).toContain('-f, --file <path>');
		expect(night.stdout).toContain('-m, --manual');
		expect(night.stdout).toContain('-h, --help');
		expect(night.stdout).not.toContain('[theme]');
		expect(night.stdout.match(/Wave Night/g)?.length).toBe(1);

		const positional = await runWave(['token', 'new', 'night', './main.yaml']);
		expect(positional.exitCode).not.toBe(0);
	});

	test('top-level help uses the approved groups and options', async () => {
		const result = await runWave(['--help']);
		expect(result.stdout).toContain('Common commands:');
		expect(result.stdout).toContain('Workspace:');
		expect(result.stdout).toContain('Other:');
		expect(result.stdout).toContain('Options:');
		expect(result.stdout).toContain('-m, --manual');
		expect(result.stdout).toContain('-h, --help');
		expect(result.stdout).toContain('--version');
		const shortVersion = await runWave(['-v']);
		expect(shortVersion.exitCode).toBe(0);
	});

	test('manual short-circuits every command level', async () => {
		const result = await runWave(['token', 'build', '--manual']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('# token build');
		expect(result.stdout).not.toContain('BUILD FAILED');
	});

	test('manual rejects unknown command paths', async () => {
		const result = await runWave(['token', 'unknown', '--manual']);
		expect(result.exitCode).not.toBe(0);
		expect(result.stdout).toBe('');
		expect(result.stderr).toContain('Unknown command path');
	});

	test('tailwind-version compatibility flag is rejected', async () => {
		const result = await runWave([
			'token',
			'update',
			'--tailwind-version',
			'4',
		]);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('unknown option');
	});

	test('legacy aliases and subcommands fail', async () => {
		for (const args of [
			['design-token'],
			['dt'],
			['mg'],
			['night'],
			['show'],
			['compress', 'run'],
			['motion', 'gif'],
			['workspace', 'create'],
			['token', '--build'],
		]) {
			const result = await runWave(args);
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).not.toContain('CommanderError');
		}
	});

	test('every registered public help is English and LANG-stable', async () => {
		for (const commandPath of [[], ...commandPaths()]) {
			const outputs: string[] = [];
			for (const lang of ['C', 'zh_CN.UTF-8', 'en_US.UTF-8']) {
				const result = await runWave([...commandPath, '--help'], lang);
				expect(result.exitCode).toBe(0);
				expect(result.stderr).toBe('');
				expect(result.stdout).not.toMatch(/[\u4e00-\u9fff]/);
				outputs.push(result.stdout);
			}
			expect(outputs[1]).toBe(outputs[0]);
			expect(outputs[2]).toBe(outputs[0]);
		}
	});

	test('registry metadata covers every public command level', () => {
		const entries = registryPaths();
		expect(entries.length).toBeGreaterThan(20);
		for (const entry of entries) {
			expect(entry.help.length).toBeGreaterThan(0);
			expect(entry.help).not.toMatch(/[\u4e00-\u9fff]/);
			expect(entry.source).toBe('manual-data');
			expect(entry.href.startsWith('/')).toBe(true);
		}
	});
});
