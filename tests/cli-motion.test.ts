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
		['bun', 'run', path.join(rootDir, 'src/index.ts'), ...args],
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

describe('wave motion', () => {
	test('mg gif dry-run shows frame plan and does not write output', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-motion-'));
		try {
			const framesDir = path.join(tempDir, 'frames');
			await fs.mkdir(framesDir);
			await writePng(path.join(framesDir, '1.png'), 320, 240);
			await writePng(path.join(framesDir, '2.png'), 320, 240);
			const binDir = await createFakeToolDir(tempDir);

			const { exitCode, stdout } = await runWave(
				['mg', 'gif', framesDir, '--dry-run', '--fps', '12'],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Motion Plan');
			expect(stdout).toContain('Format      GIF');
			expect(stdout).toContain('Frames      2');
			expect(stdout).toContain('FPS         12');
			expect(stdout).toContain('Duration    0.17s');
			expect(stdout).toContain('Size        320 x 240');
			expect(stdout).toContain('Tool        gifski');
			expect(await fileExists(path.join(tempDir, 'frames.gif'))).toBe(false);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('motion doctor reports frame details and ignores non-png files', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-motion-'));
		try {
			const framesDir = path.join(tempDir, 'frames');
			await fs.mkdir(framesDir);
			await writePng(path.join(framesDir, '001.png'), 64, 64);
			await writePng(path.join(framesDir, '002.png'), 64, 64);
			await fs.writeFile(path.join(framesDir, 'cover.jpg'), 'not used');
			const binDir = await createFakeToolDir(tempDir);

			const { exitCode, stdout } = await runWave(
				['motion', 'doctor', framesDir, '--verbose'],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Motion Doctor');
			expect(stdout).toContain('PASS GIF encoding');
			expect(stdout).toContain('PASS APNG encoding');
			expect(stdout).toContain('WARNING WMG_NON_PNG_IGNORED');
			expect(stdout).toContain('2 frames, 64x64, duration 0.08s at 24 fps');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('motion rejects existing output unless overwrite is set', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-motion-'));
		try {
			const framesDir = path.join(tempDir, 'frames');
			await fs.mkdir(framesDir);
			await writePng(path.join(framesDir, 'a.png'), 16, 16);
			await writePng(path.join(framesDir, 'b.png'), 16, 16);
			await fs.writeFile(path.join(tempDir, 'frames.gif'), 'exists');
			const binDir = await createFakeToolDir(tempDir);

			const { exitCode, stdout } = await runWave(
				['motion', 'gif', framesDir, '--dry-run'],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(1);
			expect(stdout).toContain('ERROR WMG_OUTPUT_EXISTS');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('motion rejects mismatched frame sizes', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-motion-'));
		try {
			const framesDir = path.join(tempDir, 'frames');
			await fs.mkdir(framesDir);
			await writePng(path.join(framesDir, 'a.png'), 16, 16);
			await writePng(path.join(framesDir, 'b.png'), 32, 16);
			const binDir = await createFakeToolDir(tempDir);

			const { exitCode, stdout } = await runWave(
				['motion', 'apng', framesDir, '--dry-run'],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(1);
			expect(stdout).toContain('ERROR WMG_FRAME_SIZE_MISMATCH');
			expect(stdout).toContain('b.png is 32x16, expected 16x16');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('motion gif encode writes output through command runner', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-motion-'));
		try {
			const framesDir = path.join(tempDir, 'frames');
			const outputPath = path.join(tempDir, 'loading.gif');
			await fs.mkdir(framesDir);
			await writePng(path.join(framesDir, 'a.png'), 24, 24);
			await writePng(path.join(framesDir, 'b.png'), 24, 24);
			const binDir = await createFakeToolDir(tempDir);

			const { exitCode, stdout } = await runWave(
				['motion', 'gif', framesDir, '--out', outputPath],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Output Size 6 B');
			expect(await fs.readFile(outputPath, 'utf-8')).toBe('GIF89a');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('motion reports invalid png bytes without a runtime stack', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-motion-'));
		try {
			const framesDir = path.join(tempDir, 'frames');
			await fs.mkdir(framesDir);
			await writePng(path.join(framesDir, '001.png'), 24, 24);
			await fs.writeFile(path.join(framesDir, '002.png'), 'not a png');
			const binDir = await createFakeToolDir(tempDir);

			const commandResult = await runWave(
				['motion', 'gif', framesDir, '--dry-run'],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);
			expect(commandResult.exitCode).toBe(1);
			expect(commandResult.stdout).toContain(
				'ERROR WMG_FRAME_FORMAT_UNSUPPORTED',
			);
			expect(commandResult.stderr).not.toContain('Not a PNG file');

			const doctorResult = await runWave(['motion', 'doctor', framesDir], {
				env: { PATH: `${binDir}:${process.env.PATH ?? ''}` },
			});
			expect(doctorResult.exitCode).toBe(1);
			expect(doctorResult.stdout).toContain(
				'ERROR WMG_FRAME_FORMAT_UNSUPPORTED',
			);
			expect(doctorResult.stderr).not.toContain('Not a PNG file');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('motion validates loop option instead of silently ignoring it', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-motion-'));
		try {
			const framesDir = path.join(tempDir, 'frames');
			await fs.mkdir(framesDir);
			await writePng(path.join(framesDir, 'a.png'), 24, 24);
			await writePng(path.join(framesDir, 'b.png'), 24, 24);
			const binDir = await createFakeToolDir(tempDir);

			const gifResult = await runWave(
				['motion', 'gif', framesDir, '--dry-run', '--loop', 'once'],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);
			expect(gifResult.exitCode).toBe(1);
			expect(gifResult.stdout).toContain('ERROR WMG_LOOP_UNSUPPORTED');

			const invalidResult = await runWave(
				['motion', 'apng', framesDir, '--dry-run', '--loop', 'twice'],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);
			expect(invalidResult.exitCode).toBe(1);
			expect(invalidResult.stdout).toContain('ERROR WMG_LOOP_INVALID');

			const apngOutput = path.join(tempDir, 'loading.png');
			const apngResult = await runWave(
				['motion', 'apng', framesDir, '--out', apngOutput, '--loop', 'once'],
				{ env: { PATH: `${binDir}:${process.env.PATH ?? ''}` } },
			);
			expect(apngResult.exitCode).toBe(0);
			const apngArgv = JSON.parse(
				await fs.readFile(`${apngOutput}.argv`, 'utf-8'),
			);
			expect(apngArgv.at(-1)).toBe('1');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});

async function createFakeToolDir(tempDir: string): Promise<string> {
	const binDir = path.join(tempDir, 'bin');
	await fs.mkdir(binDir);
	await writeExecutable(
		path.join(binDir, 'gifski'),
		`#!/usr/bin/env bun
if (process.argv.includes('--version')) {
	console.log('gifski 1.0.0');
	process.exit(0);
}
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1) {
	await Bun.write(process.argv[outputIndex + 1], 'GIF89a');
}
`,
	);
	await writeExecutable(
		path.join(binDir, 'apngasm'),
		`#!/usr/bin/env bun
if (process.argv.includes('--version')) {
	console.log('apngasm 1.0.0');
	process.exit(0);
}
await Bun.write(process.argv[2], 'APNG');
await Bun.write(process.argv[2] + '.argv', JSON.stringify(process.argv.slice(2)));
`,
	);
	return binDir;
}

async function writeExecutable(
	filePath: string,
	content: string,
): Promise<void> {
	await fs.writeFile(filePath, content);
	await fs.chmod(filePath, 0o755);
}

async function writePng(
	filePath: string,
	width: number,
	height: number,
): Promise<void> {
	const header = Buffer.alloc(24);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
	header.writeUInt32BE(13, 8);
	header.write('IHDR', 12, 'ascii');
	header.writeUInt32BE(width, 16);
	header.writeUInt32BE(height, 20);
	await fs.writeFile(filePath, header);
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}
