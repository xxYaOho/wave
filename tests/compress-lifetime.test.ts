import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCompress } from '../src/core/compress/index.ts';
import {
	BunCommandRunner,
	CommandTerminationError,
} from '../src/core/tools/command-runner.ts';
import type { ToolResolver } from '../src/core/tools/types.ts';

const roots: string[] = [];
async function tempRoot() {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), 'wave-compress-lifetime-'),
	);
	roots.push(root);
	return root;
}
afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});
async function waitFor(file: string) {
	for (let attempt = 0; attempt < 150; attempt++) {
		if (await Bun.file(file).exists()) return;
		await Bun.sleep(10);
	}
	throw new Error(`Marker not created: ${file}`);
}
function running(pid: number) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
async function assertExited(pid: number) {
	for (let attempt = 0; attempt < 100 && running(pid); attempt++)
		await Bun.sleep(10);
	expect(running(pid)).toBe(false);
}
const resolver: ToolResolver = {
	async resolveCapability(requirement) {
		const candidate = { name: 'oxipng', command: 'oxipng', available: true };
		return { requirement, selected: candidate, candidates: [candidate] };
	},
};

describe('compress process lifetime', () => {
	for (const mode of [
		'abort',
		'timeout',
		'leader-exits',
		'redirected-child',
	] as const) {
		test(`${mode} terminates ignored-signal descendants and closes inherited pipes`, async () => {
			const root = await tempRoot();
			const marker = path.join(root, 'pids.json');
			const controller = new AbortController();
			const child = `process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);`;
			const script = `
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
process.on('SIGTERM',()=>{});
const child=spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:${mode === 'redirected-child' ? "['ignore','ignore','ignore']" : "['ignore','inherit','inherit']"}});
writeFileSync(${JSON.stringify(marker)},JSON.stringify([process.pid,child.pid]));
${mode === 'leader-exits' ? 'setTimeout(()=>process.exit(0),100);' : 'setInterval(()=>{},1000);'}
`;
			const runner = new BunCommandRunner({
				signal: controller.signal,
				timeoutMs: mode === 'abort' || mode === 'redirected-child' ? 3000 : 500,
				killGraceMs: 40,
			});
			let pids: number[] = [];
			let pending: Promise<unknown> | undefined;
			try {
				const started = performance.now();
				// Handle rejection immediately while waiting for fixture readiness.
				pending = runner
					.run({ command: process.execPath, args: ['-e', script] })
					.catch((error) => error);
				await waitFor(marker);
				pids = JSON.parse(await fs.readFile(marker, 'utf8'));
				if (mode === 'abort' || mode === 'redirected-child') {
					await Bun.sleep(80);
					controller.abort();
				}
				const error = await pending;
				expect(error).toBeInstanceOf(CommandTerminationError);
				expect((error as CommandTerminationError).code).toBe(
					mode === 'abort' || mode === 'redirected-child'
						? 'WCP_CANCELLED'
						: 'WCP_TIMEOUT',
				);
				expect(performance.now() - started).toBeLessThan(2500);
				if (mode === 'redirected-child')
					for (const pid of pids) expect(running(pid)).toBe(false);
				for (const pid of pids) await assertExited(pid);
			} finally {
				controller.abort();
				if (pids[0]) {
					try {
						process.kill(-pids[0], 'SIGKILL');
					} catch {}
				}
				await pending;
			}
		});
	}

	test('pre-aborted runner never starts its command', async () => {
		const root = await tempRoot();
		const marker = path.join(root, 'spawned');
		const controller = new AbortController();
		controller.abort();
		const runner = new BunCommandRunner({
			signal: controller.signal,
			timeoutMs: 500,
		});
		await expect(
			runner.run({
				command: process.execPath,
				args: [
					'-e',
					`require('fs').writeFileSync(${JSON.stringify(marker)},'started')`,
				],
			}),
		).rejects.toMatchObject({ code: 'WCP_CANCELLED' });
		expect(await Bun.file(marker).exists()).toBe(false);
	});

	test('pre-aborted batch does not dispatch encoders or invent missing-tool issues', async () => {
		const root = await tempRoot();
		await fs.writeFile(path.join(root, 'a.png'), '0123456789');
		const controller = new AbortController();
		controller.abort();
		const result = await runCompress({
			input: root,
			yes: true,
			signal: controller.signal,
			runner: {
				async run() {
					throw new Error('must not dispatch');
				},
			},
		});
		expect(result.cancelled).toBe(true);
		expect(result.items).toEqual([]);
		expect(result.issues).toEqual([]);
		expect(result.summary).toMatchObject({
			total: 0,
			writtenCount: 0,
			cancelled: true,
		});
		expect(await fs.exists(path.join(root, 'wave-compress'))).toBe(false);
	});

	test('default runner retains delayed non-compress command behavior', async () => {
		const result = await new BunCommandRunner().run({
			command: process.execPath,
			args: ['-e', "setTimeout(()=>{console.log('completed')},250)"],
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe('completed');
	});

	test('compress timeout is a per-item hard failure and healthy items finish', async () => {
		const root = await tempRoot();
		const input = path.join(root, 'input');
		await fs.mkdir(input);
		for (const name of ['a-bad.png', 'b-good.png', 'c-good.png'])
			await fs.writeFile(path.join(input, name), '0123456789');
		const tool = path.join(root, 'tool.ts');
		await fs.writeFile(
			tool,
			`
import * as fs from 'node:fs/promises';
const args=process.argv.slice(2);const input=args.at(-1)!;const output=args[args.indexOf('--out')+1]!;
if(input.includes('bad.png')) {process.on('SIGTERM',()=>{});setInterval(()=>{},1000);} else {await fs.writeFile(output,'01234');}
`,
		);
		const managed = new BunCommandRunner({ timeoutMs: 250, killGraceMs: 20 });
		const result = await runCompress({
			input,
			outDir: path.join(root, 'output'),
			yes: true,
			resolver,
			runner: {
				run(command) {
					return managed.run({
						command: process.execPath,
						args: [tool, ...command.args!],
					});
				},
			},
		});
		expect(result.items.map((item) => item.result)).toEqual([
			'hard-failed',
			'success',
			'success',
		]);
		expect(result.items[0]).toMatchObject({ code: 'WCP_TIMEOUT' });
		expect(result.summary).toMatchObject({
			total: 3,
			hardFailed: 1,
			writtenCount: 2,
		});
		expect(result.cancelled).toBeUndefined();
	});

	for (const boundary of [
		'before-copy',
		'during-copy',
		'copy-fails',
	] as const) {
		for (const force of [false, true]) {
			test(`cancellation ${boundary}, force=${force} respects copy settle boundary`, async () => {
				const root = await tempRoot();
				const program = path.join(root, 'case.ts');
				const modulePath = path.resolve(
					import.meta.dir,
					'../src/core/compress/index.ts',
				);
				await fs.writeFile(
					program,
					`
import {mock} from 'bun:test';
import * as fs from 'node:fs/promises';
const actual={...fs};
const input=${JSON.stringify(path.join(root, 'input'))}; const outDir=${JSON.stringify(path.join(root, 'output'))};
await actual.mkdir(input);await actual.mkdir(outDir);await actual.writeFile(input+'/a.png','0123456789');
${force ? "await actual.writeFile(outDir+'/a.png','old-output');" : ''}
const controller=new AbortController();let committed=false;let attempted=false;
mock.module('node:fs/promises',()=>({...actual,
 async mkdir(target,options) {const result=await actual.mkdir(target,options);if(${JSON.stringify(boundary)}==='before-copy' && String(target)===outDir)controller.abort();return result;},
 async copyFile(source,target,...rest) {if(String(target).startsWith(outDir+'/')) {attempted=true;controller.abort();await Bun.sleep(50);if(${JSON.stringify(boundary)}==='copy-fails')throw new Error('fixture commit failed');await actual.copyFile(source,target,...rest);committed=true;return;}return actual.copyFile(source,target,...rest);}
}));
const {runCompress}=await import(${JSON.stringify(modulePath)});
const result=await runCompress({input,outDir,yes:true,force:${force},signal:controller.signal,
 resolver:{async resolveCapability(requirement){const c={name:'oxipng',command:'oxipng',available:true};return {requirement,selected:c,candidates:[c]};}},
 runner:{async run(command){await actual.writeFile(command.args[command.args.indexOf('--out')+1],'01234');return {exitCode:0,stdout:'',stderr:''};}}
});
console.log(JSON.stringify({result,attempted,committed,output:await actual.readFile(outDir+'/a.png','utf8').catch(()=>null)}));
`,
				);
				const proc = Bun.spawn([process.execPath, program], {
					stdout: 'pipe',
					stderr: 'pipe',
				});
				const [stdout, stderr, exit] = await Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
					proc.exited,
				]);
				expect(stderr).toBe('');
				expect(exit).toBe(0);
				const data = JSON.parse(stdout);
				expect(data.result.cancelled).toBe(true);
				expect(data.result.summary.cancelled).toBe(true);
				if (boundary === 'during-copy') {
					expect(data.attempted).toBe(true);
					expect(data.committed).toBe(true);
					expect(data.output).toBe('01234');
					expect(data.result.items[0]).toMatchObject({
						result: 'success',
						written: true,
					});
				} else {
					expect(data.committed).toBe(false);
					expect(data.output).toBe(force ? 'old-output' : null);
					expect(data.result.items[0]).toMatchObject({
						result: 'hard-failed',
						code:
							boundary === 'copy-fails' ? 'WCP_WRITE_FAILED' : 'WCP_CANCELLED',
					});
				}
			});
		}
	}
});
