import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { Command } from 'commander';
import {
	CommandLoadError,
	lazyAction,
} from '../src/cli/commands/lazy-action.ts';
import { commandRegistry } from '../src/cli/registry.ts';

const root = path.resolve(import.meta.dir, '..');
const entry = path.join(root, 'src/index.ts');
const probe = path.join(root, 'tests/fixtures/cli-loading/probe.ts');
const failurePreload = path.join(
	root,
	'tests/fixtures/cli-loading/failure-preload.ts',
);

/*
 * M-01 观测协议：每次用当前 Bun 启动 fresh CLI 子进程，preload 在该进程
 * 注册 exit 回调，以 createRequire.cache 读取同一个进程的 ESM 已加载模块。
 * 不检查父测试进程的缓存；help 即使 process.exit 仍会采样。被测集合是完整
 * src/core/** 加下面显式列出的 action 实现入口；静态注册壳不属于业务实现。
 * 每条文档路径重复两次，执行路径和故意导入 theme-service 是阳性对照。
 * cache 若不再暴露 ESM，阳性对照必须失败，禁止把空集合解释成通过。
 */
const actionModules = [
	'build-action.ts',
	'compress-action.ts',
	'doctor-action.ts',
	'doctor-core-action.ts',
	'dt-action.ts',
	'dt-ids-action.ts',
	'dt-init-action.ts',
	'dt-migrate-extensions-action.ts',
	'dt-new-profile-action.ts',
	'install.ts',
	'manual-action.ts',
	'motion-action.ts',
	'night-action.ts',
	'show-action.ts',
	'token-migrate-action.ts',
	'token-new-action.ts',
	'tool-module-action.ts',
	'workspace-action.ts',
].map((name) => `src/cli/commands/${name}`);

function businessModules(modules: string[]): string[] {
	return modules.filter(
		(file) => file.startsWith('src/core/') || actionModules.includes(file),
	);
}

function commandPaths(): string[][] {
	const paths: string[][] = [[]];
	const visit = (
		definition: (typeof commandRegistry)[number],
		parent: string[],
	) => {
		const current = [...parent, definition.name];
		paths.push(current);
		for (const child of definition.children) visit(child, current);
	};
	for (const definition of commandRegistry) visit(definition, []);
	return paths;
}

async function run(
	args: string[],
	preload = probe,
	env: Record<string, string> = {},
) {
	const child = Bun.spawn(
		[process.execPath, '--preload', preload, entry, ...args],
		{
			cwd: root,
			env: { ...process.env, LANG: 'C', ...env },
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, exitCode };
}

async function observe(args: string[], positive = false) {
	const result = await run(args, probe, {
		WAVE_PROBE_POSITIVE: positive ? '1' : '0',
	});
	const match = /^WAVE_MODULE_CACHE:(.+)$/m.exec(result.stderr);
	expect(match).not.toBeNull();
	const cache = JSON.parse(match![1]!) as { bun: string; modules: string[] };
	// Ensure the probe observes the actual CLI and metadata, not an empty process.
	expect(cache.modules).toContain('src/cli/index.ts');
	expect(cache.modules).toContain('src/cli/registry.ts');
	return {
		...result,
		stderr: result.stderr.replace(/^WAVE_MODULE_CACHE:.+\n?/m, ''),
		cache,
		business: businessModules(cache.modules),
	};
}

describe('CLI lazy loading evidence', () => {
	for (const commandPath of commandPaths()) {
		for (const flag of ['-h', '-m']) {
			test(`${[...commandPath, flag].join(' ')} loads zero business modules, repeatably`, async () => {
				const first = await observe([...commandPath, flag]);
				const second = await observe([...commandPath, flag]);
				for (const result of [first, second]) {
					expect(result.exitCode).toBe(0);
					expect(result.stderr).toBe('');
					expect(result.business).toEqual([]);
				}
				expect(second.stdout).toBe(first.stdout);
				expect(second.cache.modules).toEqual(first.cache.modules);
			});
		}
	}

	test('deliberate ESM import is detectable by the same documentation probe', async () => {
		const result = await observe(['-h'], true);
		expect(result.exitCode).toBe(0);
		expect(result.business).toContain('src/core/pipeline/theme-service.ts');
		expect(result.business.length).toBeGreaterThan(1);
	});

	test('token build execution loads its pipeline and no asset or manual implementation', async () => {
		const result = await observe([
			'token',
			'build',
			'-f',
			'./__missing_loading_probe__.yaml',
		]);
		expect(result.exitCode).toBe(10);
		expect(result.business).toContain('src/cli/commands/build-action.ts');
		expect(result.business).toContain('src/core/pipeline/theme-service.ts');
		for (const file of result.business) {
			expect(file).not.toMatch(
				/src\/core\/(compress|motion|workspace|manual)\//,
			);
		}
	});

	test('top-level doctor loads only the toolchain domain', async () => {
		const result = await observe(['doctor', '--json']);
		expect([0, 1]).toContain(result.exitCode);
		expect(result.business).toContain('src/cli/commands/doctor-core-action.ts');
		expect(result.business).toContain('src/core/doctor/toolchain.ts');
		expect(JSON.parse(result.stdout)).toHaveProperty('ok');
		expect(result.stderr).toBe('');
		for (const file of result.business) {
			expect(file).not.toMatch(
				/src\/core\/(pipeline|compress|motion|workspace|manual)\//,
			);
		}
	});

	test('compress execution loads its domain without token, motion or manual actions', async () => {
		const result = await observe([
			'compress',
			'-f',
			'./__missing_loading_probe__',
			'--json',
		]);
		expect(result.exitCode).not.toBe(0);
		expect(result.business).toContain('src/cli/commands/compress-action.ts');
		expect(result.business).toContain('src/core/compress/index.ts');
		for (const file of result.business) {
			expect(file).not.toMatch(
				/src\/core\/(pipeline|motion|workspace|manual)\//,
			);
		}
	});
});

describe('lazy action failure contract', () => {
	test('preserves positional/options/Command identity, receiver, order and async result', async () => {
		const command = new Command('probe');
		const options = { file: 'source.yaml' };
		const value = { ok: true };
		let invoked = false;
		const action = lazyAction(
			'probe',
			async () =>
				async function (
					this: unknown,
					name: string,
					opts: typeof options,
					current: Command,
				) {
					expect(this).toBe(command);
					expect([name, opts, current]).toEqual(['profile', options, command]);
					expect(opts).toBe(options);
					expect(current).toBe(command);
					await Promise.resolve();
					invoked = true;
					return value;
				},
		);
		expect(invoked).toBe(false);
		expect(await action.call(command, 'profile', options, command)).toBe(value);
		expect(invoked).toBe(true);
	});

	test('the real Commander parser supplies the same positional, options and live command', async () => {
		const program = new Command('probe');
		const child = program
			.command('child')
			.argument('<name>')
			.option('--file <path>');
		let invoked = false;
		child.action(
			lazyAction(
				'probe child',
				async () =>
					async function (
						this: unknown,
						name: string,
						options: { file: string },
						current: Command,
					) {
						expect(name).toBe('mobile');
						expect(options).toBe(child.opts());
						expect(options.file).toBe('main.yaml');
						expect(current).toBe(child);
						expect(current.parent).toBe(program);
						expect(this).toBe(child);
						invoked = true;
					},
			),
		);
		await program.parseAsync(['child', 'mobile', '--file', 'main.yaml'], {
			from: 'user',
		});
		expect(invoked).toBe(true);
	});

	test('wraps only loader rejection and preserves the original cause', async () => {
		const cause = new Error('load');
		const action = lazyAction('probe', async (): Promise<() => void> => {
			throw cause;
		});
		try {
			await action();
			throw new Error('expected rejection');
		} catch (error) {
			expect(error).toBeInstanceOf(CommandLoadError);
			expect((error as CommandLoadError).cause).toBe(cause);
		}
	});

	test('preserves business rejection identity without a load wrapper', async () => {
		const failure = new Error('business');
		const action = lazyAction('probe', async () => async () => {
			throw failure;
		});
		await expect(action()).rejects.toBe(failure);
	});

	for (const mode of ['load', 'business', 'handled']) {
		test(`actual CLI dynamic import failure matrix: ${mode}`, async () => {
			const result = await run(['token', 'build'], failurePreload, {
				WAVE_INJECT_FAILURE: mode,
			});
			expect(result).toEqual(
				mode === 'load'
					? {
							stdout: '',
							stderr:
								'Failed to load command token build: injected module rejection\n',
							exitCode: 1,
						}
					: mode === 'business'
						? {
								stdout: 'business-start\n',
								stderr: 'Command failed: injected business rejection\n',
								exitCode: 1,
							}
						: {
								stdout: 'business-start\n',
								stderr: 'business-invalid\n',
								exitCode: 5,
							},
			);
		});
	}
});
