import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { encodeMotionPlan } from '../src/core/motion/motion.ts';
import { BunCommandRunner } from '../src/core/tools/command-runner.ts';

const entry = path.resolve(import.meta.dir, '../src/index.ts');
async function waitFor(file: string) {
	for (let n = 0; n < 200; n++) {
		if (await Bun.file(file).exists()) return;
		await Bun.sleep(10);
	}
	throw new Error(`Fixture did not reach ${file}`);
}

describe('compress SIGINT CLI contract', () => {
	for (const json of [true, false]) {
		test(`SIGINT keeps committed file, stops dispatch, reports cancellation and exits 130 (${json ? 'JSON' : 'receipt'})`, async () => {
			const root = await fs.mkdtemp(
				path.join(os.tmpdir(), 'wave-compress-sigint-'),
			);
			const input = path.join(root, 'input');
			const outDir = path.join(root, 'output');
			const tools = path.join(root, 'tools');
			let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
			try {
				await fs.mkdir(input);
				await fs.mkdir(tools);
				for (const name of [
					'a-fast.png',
					'b-hold.png',
					'c-hold.png',
					'd-never.png',
				])
					await fs.writeFile(path.join(input, name), '0123456789');
				const script = `#!${process.execPath}
import * as fs from 'node:fs/promises';import * as path from 'node:path';
const args=process.argv.slice(2);if(args.includes('--version')){console.log('fixture 1');process.exit(0);}
const input=args.at(-1)!;const output=args[args.indexOf('--out')+1]!;const name=path.basename(input);
await fs.writeFile(${JSON.stringify(root)}+'/'+name+'.pid',String(process.pid));
if(name.startsWith('a-')){await fs.writeFile(output,'01234');}else{process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}
`;
				for (const name of ['oxipng', 'pngquant']) {
					const target = path.join(tools, name);
					await fs.writeFile(target, script);
					await fs.chmod(target, 0o755);
				}
				proc = Bun.spawn(
					[
						process.execPath,
						entry,
						'compress',
						'-f',
						input,
						'-o',
						outDir,
						'--yes',
						...(json ? ['--json'] : []),
					],
					{
						env: { ...process.env, PATH: tools },
						stdin: 'ignore',
						stdout: 'pipe',
						stderr: 'pipe',
					},
				);
				const stdout = new Response(proc.stdout).text();
				const stderr = new Response(proc.stderr).text();
				await waitFor(path.join(root, 'c-hold.png.pid'));
				await waitFor(path.join(outDir, 'a-fast.png'));
				proc.kill('SIGINT');
				const [text, error, exit] = await Promise.all([
					stdout,
					stderr,
					proc.exited,
				]);
				expect(exit).toBe(130);
				expect(error).toBe('');
				expect(await fs.readdir(outDir)).toEqual(['a-fast.png']);
				expect(
					await Bun.file(path.join(root, 'd-never.png.pid')).exists(),
				).toBe(false);
				if (json) {
					const result = JSON.parse(text);
					expect(result.cancelled).toBe(true);
					expect(result.summary).toMatchObject({
						cancelled: true,
						total: 3,
						succeeded: 1,
						hardFailed: 2,
						writtenCount: 1,
					});
					expect(
						result.items.map((item: { result: string }) => item.result),
					).toEqual(['success', 'hard-failed', 'hard-failed']);
				} else {
					expect(text).toContain('Compression cancelled; 1 file written');
					expect(text.match(/COMPRESS RECEIPT/g)?.length).toBe(1);
				}
				for (const name of ['b-hold.png', 'c-hold.png']) {
					const pid = Number(
						await fs.readFile(path.join(root, `${name}.pid`), 'utf8'),
					);
					expect(() => process.kill(pid, 0)).toThrow();
				}
			} finally {
				if (proc && proc.exitCode === null) {
					proc.kill('SIGINT');
					await proc.exited;
				}
				await fs.rm(root, { recursive: true, force: true });
			}
		});
	}
});

describe('non-compress consumers retain default runner lifetime', () => {
	test('Motion still completes a delayed encoder without managed cancellation or timeout', async () => {
		const root = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-motion-lifetime-'),
		);
		try {
			const outputPath = path.join(root, 'motion.gif');
			const result = await encodeMotionPlan(
				{
					format: 'gif',
					framesDir: root,
					frames: [],
					fps: 24,
					quality: 80,
					loop: 'forever',
					durationSeconds: 0,
					width: 1,
					height: 1,
					outputPath,
					tool: 'fixture',
					issues: [],
					command: {
						command: process.execPath,
						args: [
							'-e',
							`setTimeout(()=>{require('fs').writeFileSync(${JSON.stringify(outputPath)},'gif')},250)`,
						],
					},
				},
				new BunCommandRunner(),
			);
			expect(result.outputSize).toBe(3);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
	test('install still uses its ordinary delayed mise runner', async () => {
		const root = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-install-lifetime-'),
		);
		try {
			const mise = path.join(root, 'mise');
			await fs.writeFile(
				mise,
				`#!${process.execPath}\nif(process.argv.includes('--version'))console.log('mise fixture');else setTimeout(()=>console.log('fixture installation complete'),250);\n`,
			);
			await fs.chmod(mise, 0o755);
			const proc = Bun.spawn(
				[process.execPath, entry, 'compress', 'install', '--yes', '--json'],
				{ env: { ...process.env, PATH: root }, stdout: 'pipe', stderr: 'pipe' },
			);
			const [stdout, stderr, exit] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			expect(exit).toBe(0);
			expect(stderr).toBe('');
			expect(JSON.parse(stdout)).toMatchObject({
				ok: true,
				stdout: 'fixture installation complete\n',
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
