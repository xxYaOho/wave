import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	type CompressOptions,
	previewCompressInput,
	runCompress,
} from '../src/core/compress/index.ts';
import {
	type CommandRunner,
	DefaultToolResolver,
	type PlannedCommand,
	type ToolCapability,
	type ToolRequirement,
	type ToolResolver,
} from '../src/core/tools/index.ts';

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

async function fixture(files: Record<string, string>) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-m1-'));
	roots.push(root);
	const input = path.join(root, 'input');
	await fs.mkdir(input);
	for (const [name, content] of Object.entries(files)) {
		const target = path.join(input, name);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, content);
	}
	return { input, outDir: path.join(root, 'output') };
}

class FixtureResolver implements ToolResolver {
	calls: ToolRequirement[] = [];
	constructor(private missing?: ToolCapability) {}
	async resolveCapability(requirement: ToolRequirement) {
		this.calls.push(requirement);
		const name = requirement.preferred![0]!;
		const selected = { name, command: name, available: true };
		return {
			requirement,
			selected: requirement.capability === this.missing ? undefined : selected,
			candidates: [selected],
		};
	}
}

class FixtureRunner implements CommandRunner {
	active = 0;
	peak = 0;
	calls: PlannedCommand[] = [];
	outputs: string[] = [];
	constructor(private fail: 'exit' | 'throw' | undefined = undefined) {}
	async run(command: PlannedCommand) {
		this.calls.push(command);
		this.peak = Math.max(this.peak, ++this.active);
		try {
			const args = command.args!;
			const outputIndex = args.findIndex((arg) =>
				['--out', '--output', '-outfile'].includes(arg),
			);
			const output = args[outputIndex + 1]!;
			const inputIndex = args.indexOf('--input');
			const input = inputIndex < 0 ? args.at(-1)! : args[inputIndex + 1]!;
			this.outputs.push(output);
			// Deliberately complete out of order, with enough overlap to observe permits.
			await Bun.sleep(path.basename(input).startsWith('a') ? 15 : 2);
			if (this.fail && path.basename(input).includes('bad')) {
				if (this.fail === 'throw') throw new Error('fixture spawn failure');
				return { exitCode: 7, stdout: '', stderr: 'fixture encoder failure' };
			}
			const content = await fs.readFile(input);
			const bytes = path.basename(input).includes('larger')
				? Buffer.concat([content, content])
				: content.subarray(0, Math.max(1, Math.floor(content.length / 2)));
			await fs.writeFile(output, bytes);
			return { exitCode: 0, stdout: '', stderr: '' };
		} finally {
			this.active--;
		}
	}
}

const assets = {
	'a.png': '0123456789',
	'b-larger.png': 'unchanged png',
	'c.jpg': '0123456789abcdef',
	'd-larger.gif': 'unchanged gif',
	'nested/e.svg': '<svg>optimized svg</svg>',
	'nested/f-larger.svg': '<svg>cleaned svg</svg>',
};

function completedFields(
	items: Awaited<ReturnType<typeof runCompress>>['items'],
) {
	return items.map(({ source: _source, output: _output, ...item }) => item);
}

describe('compress bounded orchestration', () => {
	for (const quality of [undefined, 73]) {
		test(`parallel bytes and result states equal scan-order serial fallback (${quality ?? 'safe'})`, async () => {
			const parallel = await fixture(assets);
			const serial = await fixture(assets);
			const parallelRunner = new FixtureRunner();
			const serialRunner = new FixtureRunner();
			const options = {
				recursive: true,
				yes: true,
				force: true,
				icon: true,
				quality,
				resolver: new FixtureResolver(),
			};
			const concurrent = await runCompress({
				...parallel,
				...options,
				runner: parallelRunner,
			});
			const sequential = await runCompress({
				...serial,
				outDir: serial.input,
				...options,
				runner: serialRunner,
			});
			expect(concurrent.issues).toEqual([]);
			expect(sequential.issues).toEqual([]);
			expect(parallelRunner.peak).toBe(2);
			expect(serialRunner.peak).toBe(1);
			expect(completedFields(concurrent.items)).toEqual(
				completedFields(sequential.items),
			);
			for (const item of concurrent.items) {
				expect(await fs.readFile(item.output)).toEqual(
					await fs.readFile(path.join(serial.input, item.relativePath)),
				);
			}
			expect(
				concurrent.items.map(
					(item) => item.result === 'success' && item.status,
				),
			).toEqual([
				'optimized',
				'unchanged',
				'optimized',
				'unchanged',
				'optimized',
				'cleaned',
			]);
			expect(
				await fs.readFile(path.join(parallel.input, 'b-larger.png'), 'utf8'),
			).toBe(assets['b-larger.png']);
			expect(concurrent.summary).toMatchObject({
				total: 6,
				succeeded: 6,
				softFailed: 0,
				hardFailed: 0,
				writtenCount: 6,
			});
			expect(parallelRunner.active).toBe(0);
			for (const tempOutput of parallelRunner.outputs)
				expect(await Bun.file(tempOutput).exists()).toBe(false);
		});
	}

	test('recursive reruns serialize output-to-source dependencies in scan order', async () => {
		const paths = await fixture({
			'a.png': '0123456789abcdef',
			'wave-compress/a.png': 'old-output',
		});
		const runner = new FixtureRunner();
		const outDir = path.join(paths.input, 'wave-compress');
		const result = await runCompress({
			...paths,
			outDir,
			recursive: true,
			yes: true,
			force: true,
			runner,
			resolver: new FixtureResolver(),
		});
		expect(runner.peak).toBe(1);
		expect(result.items.map((item) => item.relativePath)).toEqual([
			'a.png',
			'wave-compress/a.png',
		]);
		expect(await fs.readFile(path.join(outDir, 'a.png'), 'utf8')).toBe(
			'01234567',
		);
		expect(
			await fs.readFile(path.join(outDir, 'wave-compress/a.png'), 'utf8'),
		).toBe('0123');
	});

	for (const fail of ['exit', 'throw'] as const) {
		test(`${fail} hard failures aggregate while remaining files finish`, async () => {
			const paths = await fixture({
				'a-bad.png': '0123456789',
				'b.png': '0123456789',
				'c-bad.png': '0123456789',
				'd.png': '0123456789',
			});
			const runner = new FixtureRunner(fail);
			const result = await runCompress({
				...paths,
				yes: true,
				runner,
				resolver: new FixtureResolver(),
			});
			expect(result.items.map((item) => item.result)).toEqual([
				'hard-failed',
				'success',
				'hard-failed',
				'success',
			]);
			expect(result.written).toBe(true);
			expect(result.summary).toMatchObject({
				total: 4,
				succeeded: 2,
				softFailed: 0,
				hardFailed: 2,
				writtenCount: 2,
			});
			expect(result.issues).toHaveLength(2);
			expect(result.issues).toEqual(result.summary.issues);
			for (const item of result.items) {
				if (item.result !== 'hard-failed') continue;
				expect(Object.keys(item).sort()).toEqual(
					[
						'source',
						'output',
						'relativePath',
						'type',
						'result',
						'code',
						'message',
					].sort(),
				);
				expect(result.issues).toContainEqual({
					path: item.source,
					code: item.code,
					message: item.message,
					severity: 'error',
				});
				expect(await Bun.file(item.output).exists()).toBe(false);
			}
			expect(await fs.readFile(path.join(paths.outDir, 'd.png'), 'utf8')).toBe(
				'01234',
			);
			expect(runner.active).toBe(0);
			for (const tempOutput of runner.outputs)
				expect(await Bun.file(tempOutput).exists()).toBe(false);
		});
	}

	test('copy failure is an item failure and does not suppress another commit', async () => {
		const paths = await fixture({
			'a.png': '0123456789',
			'b.png': '0123456789',
		});
		await fs.mkdir(path.join(paths.outDir, 'a.png'), { recursive: true });
		const result = await runCompress({
			...paths,
			yes: true,
			force: true,
			runner: new FixtureRunner(),
			resolver: new FixtureResolver(),
		});
		expect(result.items[0]).toMatchObject({
			result: 'hard-failed',
			code: 'WCP_WRITE_FAILED',
		});
		expect(result.items[1]).toMatchObject({ result: 'success', written: true });
		expect(result.summary).toMatchObject({
			total: 2,
			hardFailed: 1,
			succeeded: 1,
			writtenCount: 1,
		});
		expect(await fs.readFile(path.join(paths.outDir, 'b.png'), 'utf8')).toBe(
			'01234',
		);
	});

	test('mixed missing tools preflight dispatches and writes nothing', async () => {
		const paths = await fixture({ 'a.png': '0123456789', 'b.svg': '<svg/>' });
		const runner = new FixtureRunner();
		const result = await runCompress({
			...paths,
			yes: true,
			runner,
			resolver: new FixtureResolver('compress-svg'),
		});
		expect(result.issues[0]?.code).toBe('WCP_TOOL_MISSING');
		expect(result.summary.issues[0]).toMatchObject({
			code: 'WCP_TOOL_MISSING',
			path: paths.input,
		});
		expect(result.items).toEqual([]);
		expect(result.written).toBe(false);
		expect(result.scanned).toBe(0);
		expect(result.matched).toBe(0);
		expect(result.summary).toMatchObject({
			total: 0,
			succeeded: 0,
			softFailed: 0,
			hardFailed: 0,
			writtenCount: 0,
		});
		expect(runner.calls).toEqual([]);
		expect(await fs.exists(paths.outDir)).toBe(false);
	});

	test('output conflicts block the whole batch before any encoder starts', async () => {
		const paths = await fixture({
			'a.png': '0123456789',
			'b.png': '0123456789',
		});
		await fs.mkdir(paths.outDir);
		await fs.writeFile(path.join(paths.outDir, 'b.png'), 'existing');
		const runner = new FixtureRunner();
		const result = await runCompress({
			...paths,
			yes: true,
			runner,
			resolver: new FixtureResolver(),
		});
		expect(result.issues[0]?.code).toBe('WCP_OUTPUT_EXISTS');
		expect(result.summary.total).toBe(0);
		expect(runner.calls).toEqual([]);
		expect(await fs.readdir(paths.outDir)).toEqual(['b.png']);
		expect(await fs.readFile(path.join(paths.outDir, 'b.png'), 'utf8')).toBe(
			'existing',
		);
	});

	for (const flags of [{ dryRun: true, yes: true }, { yes: false }]) {
		test(`preview flags ${JSON.stringify(flags)} keep final paths unwritten`, async () => {
			const paths = await fixture(assets);
			const result = await runCompress({
				...paths,
				...flags,
				recursive: true,
				runner: new FixtureRunner(),
				resolver: new FixtureResolver(),
			});
			expect(result.items).toHaveLength(6);
			expect(result.written).toBe(false);
			expect(result.summary.writtenCount).toBe(0);
			expect(await fs.exists(paths.outDir)).toBe(false);
		});
	}

	test('empty inputs settle without dispatching encoders', async () => {
		const paths = await fixture({});
		const runner = new FixtureRunner();
		const result = await runCompress({
			...paths,
			yes: true,
			runner,
			resolver: new FixtureResolver(),
		});
		expect(result.summary.total).toBe(0);
		expect(runner.peak).toBe(0);
		expect(await fs.exists(paths.outDir)).toBe(false);
	});
});

describe('compress scan and discovery reuse', () => {
	test('confirmation snapshot is reused and targets are still validated after confirmation', async () => {
		const paths = await fixture({ 'a.png': '0123456789' });
		const preview = await previewCompressInput(paths);
		await fs.writeFile(
			path.join(paths.input, 'new.png'),
			'new file after confirmation scan',
		);
		const options = {
			...paths,
			yes: true,
			resolver: new FixtureResolver(),
			runner: new FixtureRunner(),
		};
		const result = await runCompress(options, preview);
		expect(result.matched).toBe(1);
		expect(result.items.map((item) => item.relativePath)).toEqual(['a.png']);
		const blocked = await runCompress(options, preview);
		expect(blocked.items).toEqual([]);
		expect(blocked.issues[0]?.code).toBe('WCP_OUTPUT_EXISTS');
		const fresh = await runCompress({ ...options, dryRun: true });
		expect(fresh.matched).toBe(2);
	});

	for (const changed of [
		{ recursive: true },
		{ types: ['svg'] },
		{ outDir: 'changed-output' },
	] satisfies Partial<CompressOptions>[]) {
		test(`changed scan inputs do not reuse stale preview ${JSON.stringify(changed)}`, async () => {
			const paths = await fixture({
				'a.png': '0123456789',
				'b.svg': '<svg/>',
				'nested/c.png': '0123456789',
			});
			const preview = await previewCompressInput(paths);
			await fs.writeFile(path.join(paths.input, 'new.svg'), '<svg/>');
			const result = await runCompress(
				{
					...paths,
					...changed,
					dryRun: true,
					resolver: new FixtureResolver(),
					runner: new FixtureRunner(),
				},
				preview,
			);
			expect(result.items.some((item) => item.relativePath === 'new.svg')).toBe(
				true,
			);
		});
	}

	// Baseline 2e4248a: preview 0 probes; 16 mixed files produce 4 resolutions
	// and 6 distinct candidate probes. No repeat hits justify a resolver cache.
	test('many files resolve once per capability without duplicate candidate probes', async () => {
		const files: Record<string, string> = {};
		for (const ext of ['png', 'jpg', 'svg', 'gif'])
			for (let n = 0; n < 4; n++) files[`${n}.${ext}`] = '0123456789';
		const paths = await fixture(files);
		const probes: string[] = [];
		const resolver = new DefaultToolResolver({
			runner: {
				async run(command) {
					probes.push(command.command);
					return { exitCode: 0, stdout: 'fixture 1', stderr: '' };
				},
			},
		});
		const preview = await previewCompressInput(paths);
		expect(probes).toEqual([]);
		const result = await runCompress(
			{ ...paths, dryRun: true, resolver, runner: new FixtureRunner() },
			preview,
		);
		expect(result.toolResolutions).toHaveLength(4);
		expect(probes.sort()).toEqual([
			'gifsicle',
			'jpegtran',
			'mozjpeg',
			'oxipng',
			'pngquant',
			'svgo',
		]);
		expect(result.items).toHaveLength(16);
	});
});
