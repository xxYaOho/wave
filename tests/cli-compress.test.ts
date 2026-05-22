import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

async function runWave(
	args: string[],
	options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(
		[process.execPath, 'run', path.join(rootDir, 'src/index.ts'), ...args],
		{
			cwd: options.cwd ?? rootDir,
			env: { ...process.env, ...options.env },
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);

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
			expect(stdout).toContain('Compress Preview');
			expect(stdout).toContain('sample.png');
			expect(stdout).toContain('50%');
			expect(
				await Bun.file(path.join(rootDir, 'compressed/sample.png')).exists(),
			).toBe(false);
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
			expect(stdout).toContain('Compress Receipt');
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
			expect(stdout).toContain('Compress Preview');
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
