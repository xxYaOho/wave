import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	IdsEntryError,
	type IdsWorkspaceReport,
	runIdsWorkspace,
} from '../src/core/ids/ids.ts';

async function makeTempWorkspace(
	files: Record<string, string>,
): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-ids-'));
	for (const [name, content] of Object.entries(files)) {
		const target = path.join(dir, name);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, content, 'utf8');
	}
	return dir;
}

async function copyFixture(name: string): Promise<string> {
	const source = path.resolve(import.meta.dir, 'fixtures/themes', name);
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-ids-fixture-'));
	await fs.cp(source, dir, { recursive: true });
	return dir;
}

const ID_LINE = /^\$id\s*:/;

/** Remove `$id` value lines; the remainder must be byte-identical after a surgical write. */
function stripIdLines(content: string): string {
	return content
		.split('\n')
		.filter((line) => !ID_LINE.test(line.trimStart()))
		.join('\n');
}

function countIdLines(content: string): number {
	return content.split('\n').filter((line) => ID_LINE.test(line.trimStart()))
		.length;
}

const GENERATED_ID = /^[0-9a-f]{32}$/;

async function read(dir: string, name: string): Promise<string> {
	return fs.readFile(path.join(dir, name), 'utf8');
}

const MAIN_COMMENTS = `$config:
  theme: ids-demo
  parameter:
    outputDir: ./dist

# workspace 头注释
theme:
  color:
    $type: color
    primary:
      # token 注释必须原样保留
      $description: "brand primary"
      $value: "#1872f0"
    secondary:
      $value: "#3366cc"
`;

const PROFILE_SHARED = `theme:
  color:
    $type: color
    primary:
      $value: "#0044bb"
    accent:
      $value: "#ff8800"
`;

describe('wave dt ids — diff and plan', () => {
	test('dry-run reports counts and details without touching files', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': MAIN_COMMENTS,
			'profiles/mobile.yaml': PROFILE_SHARED,
		});

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'));
		expect(report.write).toBe(false);
		expect(report.written).toBe(false);
		// Origins: main primary, main secondary, profile accent; profile
		// primary adopts the path identity minted at main (synced).
		expect(report.added).toBe(3);
		expect(report.synced).toBe(1);
		expect(report.problems).toEqual([]);

		const primary = report.changes.find(
			(change) =>
				change.file === 'main.yaml' &&
				change.tokenPath === 'theme.color.primary',
		);
		expect(primary?.kind).toBe('generate');
		expect(primary?.mode).toBe('insert');
		expect(primary?.id).toMatch(GENERATED_ID);

		const sync = report.changes.find(
			(change) =>
				change.file === 'profiles/mobile.yaml' &&
				change.tokenPath === 'theme.color.primary',
		);
		expect(sync?.kind).toBe('sync');
		expect(sync?.mode).toBe('insert');
		expect(sync?.source).toBe('main.yaml');
		expect(sync?.id).toBe(primary?.id);

		expect(await read(dir, 'main.yaml')).toBe(MAIN_COMMENTS);
		expect(await read(dir, 'profiles/mobile.yaml')).toBe(PROFILE_SHARED);
		expect(report.files).toEqual([
			{ file: 'main.yaml', status: 'pending', added: 2, synced: 0 },
			{
				file: 'profiles/mobile.yaml',
				status: 'pending',
				added: 1,
				synced: 1,
			},
		]);
	});

	test('empty slots adopt the committed authority in both directions', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': `theme:
  color:
    $type: color
    alpha:
      $id: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      $value: "#0066cc"
    beta:
      $id: ""
      $value: "#3366cc"
    gamma:
      $id: ""
      $value: "#0044cc"
`,
			'profiles/mobile.yaml': `theme:
  color:
    $type: color
    alpha:
      $id: ""
      $value: "#ff0000"
    beta:
      $id: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      $value: "#112233"
    gamma:
      $id: null
      $value: "#0033dd"
`,
		});

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		expect(report.problems).toEqual([]);
		// gamma: both slots empty on a shared path -> one minted identity
		// (main origin added, profile copy synced). alpha and beta adopt the
		// committed authorities in both directions.
		expect(report.added).toBe(1);
		expect(report.synced).toBe(3);

		const alpha = report.changes.find(
			(change) => change.tokenPath === 'theme.color.alpha',
		);
		expect(alpha).toMatchObject({
			file: 'profiles/mobile.yaml',
			kind: 'sync',
			mode: 'fill',
			id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			source: 'main.yaml',
		});
		const beta = report.changes.find(
			(change) => change.tokenPath === 'theme.color.beta',
		);
		expect(beta).toMatchObject({
			file: 'main.yaml',
			kind: 'sync',
			mode: 'fill',
			id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			source: 'profiles/mobile.yaml',
		});
		const gammaMain = report.changes.find(
			(change) =>
				change.tokenPath === 'theme.color.gamma' && change.file === 'main.yaml',
		);
		const gammaProfile = report.changes.find(
			(change) =>
				change.tokenPath === 'theme.color.gamma' &&
				change.file === 'profiles/mobile.yaml',
		);
		expect(gammaMain?.kind).toBe('generate');
		expect(gammaProfile?.kind).toBe('sync');
		expect(gammaMain?.id).toBe(gammaProfile?.id);
	});
});

describe('wave dt ids — surgical write-back', () => {
	test('write preserves comments/layout, only $id lines change, second run is a no-op', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': MAIN_COMMENTS,
			'profiles/mobile.yaml': PROFILE_SHARED,
		});

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		expect(report.written).toBe(true);
		expect(report.refusal).toBeUndefined();

		const main = await read(dir, 'main.yaml');
		const profile = await read(dir, 'profiles/mobile.yaml');

		// Diff surface: non-$id lines byte-identical, in order.
		expect(stripIdLines(main)).toBe(stripIdLines(MAIN_COMMENTS));
		expect(stripIdLines(profile)).toBe(stripIdLines(PROFILE_SHARED));
		// added + synced equals the number of inserted $id lines.
		expect(report.added + report.synced).toBe(
			countIdLines(main) -
				countIdLines(MAIN_COMMENTS) +
				countIdLines(profile) -
				countIdLines(PROFILE_SHARED),
		);

		// Convention position: $id between $description and $value.
		expect(main).toMatch(
			/ {6}\$description: "brand primary"\n {6}\$id: [0-9a-f]{32}\n {6}\$value: "#1872f0"/,
		);
		// Comments survive verbatim.
		expect(main).toContain('# workspace 头注释');
		expect(main).toContain('# token 注释必须原样保留');

		// Shared path carries the same identity in both files.
		const mainPrimary = main.match(/\$id: ([0-9a-f]{32})/) ?? [];
		expect(profile).toContain(`$id: ${mainPrimary[1]}`);

		// Idempotent: second run is a no-op with byte-identical files.
		const second = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
		});
		expect(second.added).toBe(0);
		expect(second.synced).toBe(0);
		expect(second.written).toBe(false);
		expect(await read(dir, 'main.yaml')).toBe(main);
		expect(await read(dir, 'profiles/mobile.yaml')).toBe(profile);
	});

	test('empty slot fill keeps the key in place and only changes its value', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': `theme:
  color:
    reserved:
      $id: ""
      $value: "#00ff55"
`,
		});
		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		expect(report.added).toBe(1);
		const main = await read(dir, 'main.yaml');
		expect(stripIdLines(main)).toBe(
			stripIdLines(
				'theme:\n  color:\n    reserved:\n      $id: ""\n      $value: "#00ff55"\n',
			),
		);
		const filled = report.changes[0]?.id;
		expect(main).toContain(`$id: ${filled}`);
		expect(filled).toMatch(GENERATED_ID);
	});

	test('night overlay files are outside the ids surface', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': MAIN_COMMENTS,
			'main@night.yaml': `theme:
  color:
    primary:
      $value: "#001a44"
`,
		});
		const nightBefore = await read(dir, 'main@night.yaml');

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		expect(report.written).toBe(true);
		expect(report.files.map((file) => file.file)).toEqual(['main.yaml']);
		expect(await read(dir, 'main@night.yaml')).toBe(nightBefore);
	});

	test('fixture copy: identity-ladder write only touches $id lines', async () => {
		const dir = await copyFixture('identity-ladder');
		const mainBefore = await read(dir, 'main.yaml');
		const mobileBefore = await read(dir, 'profiles/mobile.yaml');
		const nightBefore = await read(dir, 'main@night.yaml');

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		// Origins: reserved, blank, legacy, radius.md (main) + accent (mobile);
		// custom keeps its non-canonical id and is warned about. The plain
		// temp workspace has no git repo, so the write adds one
		// "cleanliness unverifiable" warning on top.
		expect(report.added).toBe(5);
		expect(report.synced).toBe(0);
		const hints = report.warnings.filter((warning) =>
			warning.message.includes('32-hex'),
		);
		expect(hints).toHaveLength(1);
		expect(hints[0]?.tokenPath).toBe('theme.color.custom');
		expect(hints[0]?.message).toContain('brand-legacy-id');
		expect(report.problems).toEqual([]);

		const main = await read(dir, 'main.yaml');
		const mobile = await read(dir, 'profiles/mobile.yaml');
		expect(stripIdLines(main)).toBe(stripIdLines(mainBefore));
		expect(stripIdLines(mobile)).toBe(stripIdLines(mobileBefore));
		expect(await read(dir, 'main@night.yaml')).toBe(nightBefore);

		const second = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
		});
		expect(second.added).toBe(0);
		expect(second.synced).toBe(0);
		expect(await read(dir, 'main.yaml')).toBe(main);
	});
});

describe('wave dt ids — conflicts are hard blockers', () => {
	const DIVERGENT_MAIN = `theme:
  color:
    $type: color
    alpha:
      $id: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      $value: "#0066cc"
`;
	const DIVERGENT_PROFILE = `theme:
  color:
    $type: color
    alpha:
      $id: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      $value: "#ff0000"
`;

	test('same path with different ids across files: error, zero write', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': DIVERGENT_MAIN,
			'profiles/mobile.yaml': DIVERGENT_PROFILE,
		});

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
		});
		expect(report.problems).toHaveLength(1);
		expect(report.problems[0]?.message).toContain('theme.color.alpha');
		expect(report.problems[0]?.message).toContain(
			'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" vs "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
		);
		expect(report.written).toBe(false);
		expect(await read(dir, 'main.yaml')).toBe(DIVERGENT_MAIN);
		expect(await read(dir, 'profiles/mobile.yaml')).toBe(DIVERGENT_PROFILE);
	});

	test('same id at different paths across files: error, zero write', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': `theme:
  color:
    one:
      $id: cccccccccccccccccccccccccccccccc
      $value: "#111111"
`,
			'profiles/mobile.yaml': `theme:
  color:
    two:
      $id: cccccccccccccccccccccccccccccccc
      $value: "#222222"
`,
		});

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
		});
		expect(report.problems).toHaveLength(1);
		expect(report.problems[0]?.message).toContain(
			'Cross-file token $id conflict',
		);
		expect(report.written).toBe(false);
	});

	test('single-file duplicate id is repaired: first kept, rest reissued', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': `theme:
  color:
    one:
      $id: cccccccccccccccccccccccccccccccc
      $value: "#111111"
    two:
      $id: cccccccccccccccccccccccccccccccc
      $value: "#222222"
`,
		});

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		expect(report.problems).toEqual([]);
		expect(report.added).toBe(1);
		const reissue = report.changes[0];
		expect(reissue?.mode).toBe('reissue');
		expect(reissue?.tokenPath).toBe('theme.color.two');

		const main = await read(dir, 'main.yaml');
		expect(main).toContain('$id: cccccccccccccccccccccccccccccccc'); // one keeps
		expect(main).toContain(`$id: ${reissue?.id}`); // two reissued
		expect(stripIdLines(main)).toBe(
			stripIdLines(
				'theme:\n  color:\n    one:\n      $id: cccccccccccccccccccccccccccccccc\n      $value: "#111111"\n    two:\n      $id: cccccccccccccccccccccccccccccccc\n      $value: "#222222"\n',
			),
		);
	});

	test('duplicate spanning main plus agreeing profile repairs consistently', async () => {
		// doctor's duplicate rule dedupes same-path re-registrations first, so
		// id ccc... spans the distinct paths one/two within main only: the
		// document-order first occurrence keeps the id, two is reissued, and
		// the agreeing profile occurrence at one stays consistent.
		const dir = await makeTempWorkspace({
			'main.yaml': `theme:
  color:
    one:
      $id: cccccccccccccccccccccccccccccccc
      $value: "#111111"
    two:
      $id: cccccccccccccccccccccccccccccccc
      $value: "#222222"
`,
			'profiles/mobile.yaml': `theme:
  color:
    one:
      $id: cccccccccccccccccccccccccccccccc
      $value: "#111111"
`,
		});

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		expect(report.problems).toEqual([]);
		expect(report.added).toBe(1);
		const reissue = report.changes[0];
		expect(reissue?.mode).toBe('reissue');
		expect(reissue?.file).toBe('main.yaml');
		expect(reissue?.tokenPath).toBe('theme.color.two');

		const main = await read(dir, 'main.yaml');
		const profile = await read(dir, 'profiles/mobile.yaml');
		expect(main).toContain('$id: cccccccccccccccccccccccccccccccc'); // one keeps
		expect(main).toContain(`$id: ${reissue?.id}`); // two reissued
		expect(profile).not.toContain(`$id: ${reissue?.id}`);

		// Post-repair workspace is doctor-clean: second run is a no-op.
		const second = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
		});
		expect(second.problems).toEqual([]);
		expect(second.added).toBe(0);
	});

	test('CRLF file blocks the whole workspace write', async () => {
		const crlf =
			'theme:\r\n  color:\r\n    primary:\r\n      $value: "#1872f0"\r\n';
		const dir = await makeTempWorkspace({ 'main.yaml': crlf });

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		expect(report.problems).toHaveLength(1);
		expect(report.problems[0]?.message).toContain('round-trip');
		expect(report.written).toBe(false);
		expect(await read(dir, 'main.yaml')).toBe(crlf);
	});
});

describe('wave dt ids — warnings and entry contract', () => {
	test('non-canonical committed ids are advisory warnings, never rewritten', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': `theme:
  color:
    custom:
      $id: brand-legacy-id
      $value: "#654321"
    other:
      $value: "#123456"
`,
		});

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'));
		expect(report.problems).toEqual([]);
		expect(report.warnings).toEqual([
			{
				file: 'main.yaml',
				tokenPath: 'theme.color.custom',
				message: expect.stringContaining('brand-legacy-id'),
			},
		]);
		expect(
			report.changes.find(
				(change) => change.tokenPath === 'theme.color.custom',
			),
		).toBeUndefined();
	});

	test('enforces main.yaml entry contract', async () => {
		const dir = await makeTempWorkspace({ 'theme.yaml': 'theme: {}\n' });

		const notMain = await runIdsWorkspace(path.join(dir, 'theme.yaml')).catch(
			(error: unknown) => error,
		);
		expect(notMain).toBeInstanceOf(IdsEntryError);
		expect((notMain as IdsEntryError).code).toBe('ENTRY_NOT_MAIN');

		const missing = await runIdsWorkspace(
			path.join(dir, 'missing', 'main.yaml'),
		).catch((error: unknown) => error);
		expect(missing).toBeInstanceOf(IdsEntryError);
		expect((missing as IdsEntryError).code).toBe('ENTRY_NOT_FOUND');
	});
});

describe('wave dt ids — git cleanliness gate', () => {
	async function initGitRepo(dir: string): Promise<void> {
		const git = async (args: string[]): Promise<void> => {
			const proc = Bun.spawn(['git', ...args], {
				cwd: dir,
				stdout: 'pipe',
				stderr: 'pipe',
			});
			await new Response(proc.stderr).text();
			const code = await proc.exited;
			if (code !== 0) throw new Error(`git ${args[0]} failed (${code})`);
		};
		await git(['init', '-q']);
		await git(['add', '-A']);
		await git([
			'-c',
			'user.name=wave',
			'-c',
			'user.email=wave@local',
			'-c',
			'commit.gpgsign=false',
			'commit',
			'-qm',
			'init',
		]);
	}

	test('clean tree writes; dirty tree refuses unless --allow-dirty', async () => {
		const dir = await makeTempWorkspace({ 'main.yaml': MAIN_COMMENTS });
		await initGitRepo(dir);

		const clean = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
		});
		expect(clean.git).toBe('clean');
		expect(clean.written).toBe(true);

		const written = await read(dir, 'main.yaml');
		// Recreate pending changes, then dirty the tree with an untracked file.
		await Bun.write(path.join(dir, 'main.yaml'), MAIN_COMMENTS);
		await Bun.write(path.join(dir, 'junk.txt'), 'untracked\n');

		const dirty = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
		});
		expect(dirty.git).toBe('dirty');
		expect(dirty.refusal).toBe('dirty-worktree');
		expect(dirty.written).toBe(false);
		// Changes were planned but nothing was written.
		expect(dirty.added).toBe(2);
		expect(await read(dir, 'main.yaml')).toBe(MAIN_COMMENTS);

		const allowed = await runIdsWorkspace(path.join(dir, 'main.yaml'), {
			write: true,
			allowDirty: true,
		});
		expect(allowed.written).toBe(true);
		expect(await read(dir, 'main.yaml')).not.toBe(MAIN_COMMENTS);
		expect(await read(dir, 'main.yaml')).not.toBe(written);
	});

	test('dry-run skips the git gate entirely', async () => {
		const dir = await makeTempWorkspace({ 'main.yaml': MAIN_COMMENTS });
		await Bun.write(path.join(dir, 'junk.txt'), 'untracked\n');

		const report = await runIdsWorkspace(path.join(dir, 'main.yaml'));
		expect(report.git).toBe('unchecked');
		expect(report.added).toBe(2);
		expect(await read(dir, 'main.yaml')).toBe(MAIN_COMMENTS);
	});

	test('non-git workspace warns and still writes', async () => {
		const dir = await makeTempWorkspace({ 'main.yaml': MAIN_COMMENTS });

		const report: IdsWorkspaceReport = await runIdsWorkspace(
			path.join(dir, 'main.yaml'),
			{ write: true },
		);
		expect(report.git).toBe('unavailable');
		expect(
			report.warnings.some((warning) =>
				warning.message.includes('git status unavailable'),
			),
		).toBe(true);
		expect(report.written).toBe(true);
	});
});

describe('wave dt ids CLI', () => {
	const rootDir = path.resolve(import.meta.dir, '..');
	const cliEntry = path.join(rootDir, 'src/index.ts');

	async function runWave(
		args: string[],
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
			cwd: rootDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;
		return { exitCode, stdout, stderr };
	}

	test('dry-run then write round trip through the CLI', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': MAIN_COMMENTS,
			'profiles/mobile.yaml': PROFILE_SHARED,
		});

		const dry = await runWave(['dt', 'ids', '-f', path.join(dir, 'main.yaml')]);
		expect(dry.exitCode).toBe(0);
		expect(dry.stdout).toContain('Token IDs report: 3 to add, 1 to sync');
		expect(dry.stdout).toContain('(dry-run)');
		expect(dry.stdout).toContain('Dry run only');
		expect(dry.stdout).toContain('(synced from main.yaml)');
		expect(await read(dir, 'main.yaml')).toBe(MAIN_COMMENTS);

		const write = await runWave([
			'dt',
			'ids',
			'-f',
			path.join(dir, 'main.yaml'),
			'--write',
		]);
		expect(write.exitCode).toBe(0);
		expect(write.stdout).toContain('Token IDs written: 3 added, 1 synced');
		expect(await read(dir, 'main.yaml')).not.toBe(MAIN_COMMENTS);

		const again = await runWave([
			'dt',
			'ids',
			'-f',
			path.join(dir, 'main.yaml'),
			'--write',
		]);
		expect(again.exitCode).toBe(0);
		expect(again.stdout).toContain('Token IDs up to date.');
	});

	test('conflict exits non-zero through the CLI and writes nothing', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': `theme:
  color:
    alpha:
      $id: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      $value: "#0066cc"
`,
			'profiles/mobile.yaml': `theme:
  color:
    alpha:
      $id: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      $value: "#ff0000"
`,
		});

		const run = await runWave([
			'dt',
			'ids',
			'-f',
			path.join(dir, 'main.yaml'),
			'--write',
		]);
		expect(run.exitCode).toBe(1);
		expect(run.stderr).toContain('theme.color.alpha');
		expect(run.stderr).toContain('nothing was written');
		expect(await read(dir, 'main.yaml')).toContain(
			'$id: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		);
	});

	test('dirty git tree refuses --write; --allow-dirty applies', async () => {
		const dir = await makeTempWorkspace({ 'main.yaml': MAIN_COMMENTS });
		await Bun.spawn(['git', 'init', '-q', dir]);
		await Bun.write(path.join(dir, 'junk.txt'), 'untracked\n');

		const refused = await runWave([
			'dt',
			'ids',
			'-f',
			path.join(dir, 'main.yaml'),
			'--write',
		]);
		expect(refused.exitCode).toBe(5); // INVALID_PARAMETER
		expect(refused.stderr).toContain('refusing --write');
		expect(refused.stderr).toContain('--allow-dirty');
		expect(await read(dir, 'main.yaml')).toBe(MAIN_COMMENTS);

		const allowed = await runWave([
			'dt',
			'ids',
			'-f',
			path.join(dir, 'main.yaml'),
			'--write',
			'--allow-dirty',
		]);
		expect(allowed.exitCode).toBe(0);
		expect(allowed.stdout).toContain('Token IDs written');
		expect(await read(dir, 'main.yaml')).not.toBe(MAIN_COMMENTS);
	});

	test('entry contract errors map to CLI exit codes', async () => {
		const dir = await makeTempWorkspace({ 'theme.yaml': 'theme: {}\n' });

		const notMain = await runWave([
			'dt',
			'ids',
			'-f',
			path.join(dir, 'theme.yaml'),
		]);
		expect(notMain.exitCode).toBe(5);

		const missing = await runWave([
			'dt',
			'ids',
			'-f',
			path.join(dir, 'missing', 'main.yaml'),
		]);
		expect(missing.exitCode).toBe(10);
	});
});
