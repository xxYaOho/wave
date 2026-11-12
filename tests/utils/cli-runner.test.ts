import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createCliRunner, runCli, withCliFixture } from './cli-runner.ts';

const evaluate = (source: string) => [process.execPath, '-e', source];

describe('CLI process runner', () => {
	test('captures both streams and a nonzero exit without rejecting', async () => {
		const result = await runCli({
			command: evaluate(
				"console.log('output'); console.error('failure'); process.exitCode = 7;",
			),
		});
		expect(result).toEqual({
			stdout: 'output\n',
			stderr: 'failure\n',
			exitCode: 7,
		});
	});

	test('drains stdout and stderr concurrently beyond pipe capacity', async () => {
		const result = await runCli({
			command: evaluate(
				"process.stderr.write('e'.repeat(256 * 1024)); process.stdout.write('o'.repeat(256 * 1024));",
			),
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('o'.repeat(256 * 1024));
		expect(result.stderr).toBe('e'.repeat(256 * 1024));
	});

	test('sends input and EOF, including empty input', async () => {
		for (const input of ['', 'first\n第二行\n']) {
			const result = await runCli({
				command: evaluate('process.stdout.write(await Bun.stdin.text());'),
				input,
			});
			expect(result).toEqual({ stdout: input, stderr: '', exitCode: 0 });
		}
	});

	test('omitted input ignores parent stdin, matching the original Bun.spawn default', async () => {
		const runner = new URL('./cli-runner.ts', import.meta.url).href;
		const command = evaluate('process.stdout.write(await Bun.stdin.text());');
		const result = await runCli({
			command: evaluate(`
				import { runCli } from ${JSON.stringify(runner)};
				const result = await runCli({ command: ${JSON.stringify(command)} });
				process.stdout.write(result.stdout);
				process.exitCode = result.exitCode;
			`),
			input: 'parent input must not reach the nested CLI',
		});
		expect(result).toEqual({ stdout: '', stderr: '', exitCode: 0 });
	});

	test('uses child cwd, environment and LANG without changing the parent', async () => {
		const parentCwd = process.cwd();
		const parentLang = process.env.LANG;
		await withCliFixture(async (cwd) => {
			const result = await runCli({
				command: evaluate(
					'console.log(JSON.stringify({ cwd: process.cwd(), lang: process.env.LANG, marker: process.env.WAVE_RUNNER_TEST }));',
				),
				cwd,
				env: { ...process.env, LANG: 'overridden', WAVE_RUNNER_TEST: 'child' },
				lang: 'zh_CN.UTF-8',
			});
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe('');
			expect(JSON.parse(result.stdout)).toEqual({
				cwd: await fs.realpath(cwd),
				lang: 'zh_CN.UTF-8',
				marker: 'child',
			});
		});
		expect(process.cwd()).toBe(parentCwd);
		expect(process.env.LANG).toBe(parentLang);
	});

	test('preserves inherited LANG when injection is omitted', async () => {
		const result = await runCli({
			command: evaluate(
				'console.log(JSON.stringify(process.env.LANG ?? null));',
			),
		});
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toBe(process.env.LANG ?? null);
	});

	test('configured runners preserve argument and default mapping', async () => {
		const run = createCliRunner((value: string, code: number = 0) => ({
			command: evaluate(
				`console.log(${JSON.stringify(value)}); process.exitCode = ${code};`,
			),
		}));
		expect(await run('default')).toEqual({
			stdout: 'default\n',
			stderr: '',
			exitCode: 0,
		});
		expect(await run('explicit', 3)).toEqual({
			stdout: 'explicit\n',
			stderr: '',
			exitCode: 3,
		});
	});

	test('rejects process launch failure', async () => {
		await withCliFixture(async (directory) => {
			await expect(
				runCli({ command: [path.join(directory, 'missing-executable')] }),
			).rejects.toThrow();
		});
	});
});

describe('CLI fixture isolation', () => {
	test('copies independent fixtures, preserves source and cleans both copies', async () => {
		const copies: string[] = [];
		await withCliFixture(async (source) => {
			await fs.writeFile(path.join(source, 'main.yaml'), 'original');
			const results = await Promise.all(
				['first', 'second'].map((value) =>
					withCliFixture(async (directory) => {
						copies.push(directory);
						const file = path.join(directory, 'main.yaml');
						expect(await fs.readFile(file, 'utf8')).toBe('original');
						await fs.writeFile(file, value);
						return fs.readFile(file, 'utf8');
					}, source),
				),
			);
			expect(results).toEqual(['first', 'second']);
			expect(new Set(copies).size).toBe(2);
			expect(await fs.readFile(path.join(source, 'main.yaml'), 'utf8')).toBe(
				'original',
			);
		});
		for (const directory of copies) {
			expect(await fs.stat(directory).catch(() => null)).toBeNull();
		}
	});

	test('cleans the fixture and preserves callback rejection identity', async () => {
		let fixture = '';
		const failure = new Error('fixture callback failed');
		await expect(
			withCliFixture(async (directory) => {
				fixture = directory;
				await fs.writeFile(path.join(directory, 'partial'), 'partial');
				throw failure;
			}),
		).rejects.toBe(failure);
		expect(await fs.stat(fixture).catch(() => null)).toBeNull();
	});
});
