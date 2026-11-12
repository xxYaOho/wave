import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export interface CliResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface CliInvocation {
	command: string[];
	cwd?: string;
	env?: Record<string, string | undefined>;
	/** 省略时保持继承环境；只在调用方要求时注入 LANG。 */
	lang?: string;
	/** 提供 input（包括空串）时使用 pipe 并发送 EOF，否则保持 Bun 的 ignore 默认值。 */
	input?: string;
}

export async function runCli(invocation: CliInvocation): Promise<CliResult> {
	const { command, cwd, env, lang, input } = invocation;
	const proc = Bun.spawn(command, {
		cwd,
		env: lang === undefined ? env : { ...(env ?? process.env), LANG: lang },
		stdin: input === undefined ? 'ignore' : 'pipe',
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (input !== undefined && proc.stdin && typeof proc.stdin !== 'number') {
		proc.stdin.write(input);
		proc.stdin.end();
	}
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exitCode, stdout, stderr };
}

/** 参数适配只生成启动描述，保留迁移前的调用签名及默认值。 */
export function createCliRunner<Args extends unknown[]>(
	configure: (...args: Args) => CliInvocation,
): (...args: Args) => Promise<CliResult> {
	return (...args) => runCli(configure(...args));
}

/** 每次创建独立目录，清理仅作用于本次 fixture；可复制源 fixture。 */
export async function withCliFixture<Result>(
	run: (directory: string) => Promise<Result>,
	source?: string,
): Promise<Result> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-cli-'));
	try {
		if (source) await fs.cp(source, directory, { recursive: true });
		return await run(directory);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}

const rootDir = path.resolve(import.meta.dir, '../..');

export async function runWavePty(
	args: string[],
	options: {
		cwd: string;
		env?: Record<string, string>;
		input?: string;
		delayMs?: number;
	},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const envAssignments = {
		...(process.env as Record<string, string | undefined>),
		...options.env,
		TERM: 'xterm-256color',
	};
	const envArgs = Object.entries(envAssignments)
		.filter(
			(entry): entry is [string, string] =>
				typeof entry[1] === 'string' && entry[1].length > 0,
		)
		.map(([key, value]) => `set env(${key}) ${tclQuote(value)}`);
	return runCli({
		command: [
			'expect',
			'-c',
			[
				'set timeout 10',
				`cd ${tclQuote(options.cwd)}`,
				...envArgs,
				'log_user 1',
				`spawn bun run ${tclQuote(path.join(rootDir, 'src/index.ts'))} ${args.map(tclQuote).join(' ')}`,
				...(options.delayMs ? [`after ${options.delayMs}`] : []),
				`send ${tclQuote(options.input ?? '\\r')}`,
				'expect eof',
				'catch wait result',
				'exit [lindex $result 3]',
			].join('\n'),
		],
		cwd: rootDir,
		env: { ...process.env, TERM: 'xterm-256color' },
	});
}

function tclQuote(value: string): string {
	return `{${value.replaceAll('\\', '\\\\').replaceAll('}', '\\}')}}`;
}
