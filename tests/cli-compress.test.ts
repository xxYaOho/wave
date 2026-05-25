import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

async function runWave(
	args: string[],
	options: { cwd?: string; env?: Record<string, string>; input?: string } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(
		[process.execPath, 'run', path.join(rootDir, 'src/index.ts'), ...args],
		{
			cwd: options.cwd ?? rootDir,
			env: { ...process.env, ...options.env },
			stdin: 'pipe',
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);

	proc.stdin.write(options.input ?? '');
	proc.stdin.end();

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { exitCode, stdout, stderr };
}

async function createFakeToolDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-tools-'));
	const toolScript = `#!/usr/bin/env bun
import * as fs from 'node:fs/promises';
const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-version')) {
	console.log('fake-tool 1.0.0');
	process.exit(0);
}
let out = '';
let input = args[args.length - 1];
for (let i = 0; i < args.length; i++) {
	if (['--out', '--output', '-outfile'].includes(args[i])) out = args[i + 1] ?? '';
	if (args[i] === '--input') input = args[i + 1] ?? input;
}
if (!out) out = input;
const content = await fs.readFile(input);
await fs.writeFile(out, content.subarray(0, Math.max(1, Math.floor(content.length / 2))));
`;
	for (const name of [
		'oxipng',
		'svgo',
		'gifsicle',
		'jpegtran',
		'pngquant',
		'mozjpeg',
	]) {
		const file = path.join(dir, name);
		await fs.writeFile(file, toolScript);
		await fs.chmod(file, 0o755);
	}
	return dir;
}

async function createSingleFakeTool(name: string): Promise<string> {
	const dir = await createFakeToolDir();
	for (const entry of await fs.readdir(dir)) {
		if (entry !== name) await fs.rm(path.join(dir, entry));
	}
	return dir;
}

async function createLargerFakeTool(name: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-tools-'));
	const toolScript = `#!/usr/bin/env bun
import * as fs from 'node:fs/promises';
const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-version')) {
	console.log('fake-tool 1.0.0');
	process.exit(0);
}
let out = '';
let input = args[args.length - 1];
for (let i = 0; i < args.length; i++) {
	if (['--out', '--output', '-outfile'].includes(args[i])) out = args[i + 1] ?? '';
	if (args[i] === '--input') input = args[i + 1] ?? input;
}
if (!out) out = input;
const content = await fs.readFile(input);
await fs.writeFile(out, Buffer.concat([content, content]));
`;
	const file = path.join(dir, name);
	await fs.writeFile(file, toolScript);
	await fs.chmod(file, 0o755);
	return dir;
}

describe('wave compress', () => {
	test('module help is actionable at wave compress -h', async () => {
		const { exitCode, stdout } = await runWave(['compress', '-h']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Wave Compress');
		expect(stdout.match(/Wave Compress/g)?.length).toBe(1);
		expect(stdout).toContain('wave compress [file-or-dir] [options]');
		expect(stdout).toContain('wave compress -f <file-or-dir> [options]');
		expect(stdout).toContain('--force');
		expect(stdout).toContain('Preview first, then ask whether to write output');
	});

	test('wave compress help renders help instead of treating help as input', async () => {
		const { exitCode, stdout, stderr } = await runWave(['compress', 'help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Wave Compress');
		expect(stdout).toContain('wave compress ./assets');
		expect(stderr).not.toContain('ENOENT');
	});

	test('dry-run previews supported files without writing output', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			await fs.writeFile(path.join(tempDir, 'sample.png'), '0123456789');

			const { exitCode, stdout } = await runWave(
				['compress', tempDir, '--dry-run'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('COMPRESS PREVIEW');
			expect(stdout).toContain('sample.png');
			expect(stdout).toContain('50%');
			expect(stdout).toContain('oxipng');
			expect(
				await Bun.file(path.join(tempDir, 'wave-compress/sample.png')).exists(),
			).toBe(false);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('default prompt accepts no and exits without writing output', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			await fs.writeFile(path.join(tempDir, 'sample.png'), '0123456789');

			const { exitCode, stdout } = await runWave(['compress', tempDir], {
				env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` },
				input: 'n\n',
			});

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Write compressed output? [y/N]');
			expect(
				await Bun.file(path.join(tempDir, 'wave-compress/sample.png')).exists(),
			).toBe(false);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('default prompt accepts yes and writes output', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			await fs.writeFile(path.join(tempDir, 'sample.png'), '0123456789');

			const { exitCode, stdout } = await runWave(['compress', tempDir], {
				env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` },
				input: 'y\n',
			});

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Write compressed output? [y/N]');
			expect(
				await Bun.file(path.join(tempDir, 'wave-compress/sample.png')).exists(),
			).toBe(true);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('--yes writes default output under input directory wave-compress', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			await fs.writeFile(path.join(tempDir, 'sample.png'), '0123456789');

			const { exitCode, stdout } = await runWave(
				['compress', tempDir, '--type', 'png', '--yes'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('COMPRESS RECEIPT');
			expect(stdout).toContain('Output');
			expect(
				await Bun.file(path.join(tempDir, 'wave-compress/sample.png')).exists(),
			).toBe(true);
			expect(
				await Bun.file(path.join(rootDir, 'compressed/sample.png')).exists(),
			).toBe(false);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('file input defaults output to parent wave-compress directory', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			const source = path.join(tempDir, 'sample.png');
			await fs.writeFile(source, '0123456789');

			const { exitCode, stdout } = await runWave(
				['compress', source, '--type', 'png', '--yes'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('COMPRESS RECEIPT');
			expect(stdout).toContain('Output');
			expect(
				await Bun.file(path.join(tempDir, 'wave-compress/sample.png')).exists(),
			).toBe(true);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('--yes writes previewed output to the selected directory', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			const outDir = path.join(tempDir, 'out');
			await fs.writeFile(
				path.join(tempDir, 'sample.svg'),
				'<svg>123456789</svg>',
			);

			const { exitCode, stdout } = await runWave(
				['compress', tempDir, '--type', 'svg', '--out', outDir, '--yes'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('COMPRESS RECEIPT');
			expect(await Bun.file(path.join(outDir, 'sample.svg')).exists()).toBe(
				true,
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('checks only tools needed by matched file types', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createSingleFakeTool('svgo');
		try {
			await fs.writeFile(
				path.join(tempDir, 'sample.svg'),
				'<svg>123456789</svg>',
			);

			const { exitCode, stdout } = await runWave(
				['compress', tempDir, '--type', 'svg', '--dry-run'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('COMPRESS PREVIEW');
			expect(stdout).not.toContain('WCP_TOOL_MISSING');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('dry-run marks larger optimizer output as unchanged', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createLargerFakeTool('oxipng');
		try {
			await fs.writeFile(path.join(tempDir, 'sample.png'), '12345');

			const { exitCode, stdout } = await runWave(
				['compress', tempDir, '--type', 'png', '--dry-run'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('unchanged');
			expect(stdout).not.toContain('larger');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('--yes copies original bytes when optimizer output is larger', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createLargerFakeTool('oxipng');
		try {
			const outDir = path.join(tempDir, 'out');
			await fs.writeFile(path.join(tempDir, 'sample.png'), '12345');

			const { exitCode, stdout } = await runWave(
				['compress', tempDir, '--type', 'png', '--out', outDir, '--yes'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('unchanged');
			const output = await fs.readFile(
				path.join(outDir, 'sample.png'),
				'utf-8',
			);
			expect(output).toBe('12345');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('existing output without --force fails with WCP_OUTPUT_EXISTS', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			await fs.writeFile(path.join(tempDir, 'sample.png'), '0123456789');
			await fs.mkdir(path.join(tempDir, 'wave-compress'));
			await fs.writeFile(path.join(tempDir, 'wave-compress/sample.png'), 'old');

			const { exitCode, stdout } = await runWave(
				['compress', tempDir, '--type', 'png', '--yes'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).not.toBe(0);
			expect(stdout).toContain('COMPRESS PREVIEW');
			expect(stdout).toContain('WCP_OUTPUT_EXISTS');
			expect(stdout).toContain('Compression blocked');
			expect(
				await fs.readFile(
					path.join(tempDir, 'wave-compress/sample.png'),
					'utf-8',
				),
			).toBe('old');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('--force allows overwriting existing output', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			await fs.writeFile(path.join(tempDir, 'sample.png'), '0123456789');
			await fs.mkdir(path.join(tempDir, 'wave-compress'));
			await fs.writeFile(path.join(tempDir, 'wave-compress/sample.png'), 'old');

			const { exitCode } = await runWave(
				['compress', tempDir, '--type', 'png', '--yes', '--force'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(
				await fs.readFile(
					path.join(tempDir, 'wave-compress/sample.png'),
					'utf-8',
				),
			).toBe('01234');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('--json is non-interactive and only prints JSON', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
		const tools = await createFakeToolDir();
		try {
			await fs.writeFile(path.join(tempDir, 'sample.png'), '0123456789');

			const { exitCode, stdout } = await runWave(
				['compress', tempDir, '--type', 'png', '--json'],
				{ env: { PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).not.toContain('COMPRESS PREVIEW');
			expect(stdout).not.toContain('Write compressed output');
			expect(JSON.parse(stdout).items[0].source).toContain('sample.png');
			expect(
				await Bun.file(path.join(tempDir, 'wave-compress/sample.png')).exists(),
			).toBe(false);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
			await fs.rm(tools, { recursive: true, force: true });
		}
	});

	test('doctor reports missing tools with WCP code', async () => {
		const { exitCode, stdout } = await runWave(['compress', 'doctor'], {
			env: { PATH: '' },
		});

		expect(exitCode).not.toBe(0);
		expect(stdout).toContain('WCP_TOOL_MISSING');
		expect(stdout).toContain('WCP_TOOL_MISSING');
	});

	test('install --check renders install plan without executing', async () => {
		const { exitCode, stdout } = await runWave([
			'compress',
			'install',
			'--check',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('wave compress install plan');
		expect(stdout).toContain('Command: mise run install:compress');
	});
});
