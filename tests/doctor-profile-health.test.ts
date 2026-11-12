import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { createCliRunner } from './utils/cli-runner.ts';

const cli = path.resolve(import.meta.dir, '../src/index.ts');
const baseId = '00000000000000000000000000000001';
const tempDirs: string[] = [];

async function workspace(
	profiles: Record<string, unknown>,
	baseExtra: Record<string, unknown> = {},
) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-doctor-profiles-'));
	tempDirs.push(dir);
	await fs.mkdir(path.join(dir, 'profiles'));
	await fs.writeFile(
		path.join(dir, 'main.yaml'),
		yaml.dump({
			$id: baseId,
			$config: { theme: 'doctor-profiles' },
			theme: {
				size: { $type: 'number', $id: 'size-id', $value: 14 },
				alias: { $type: 'number', $id: 'alias-id', $value: '{theme.size}' },
				...baseExtra,
			},
		}),
	);
	for (const [name, profile] of Object.entries(profiles)) {
		await fs.writeFile(
			path.join(dir, `profiles/${name}.yaml`),
			yaml.dump(profile),
		);
	}
	return dir;
}

function profile(overrides: Record<string, unknown> = {}) {
	return {
		$id: '00000000000000000000000000000002',
		$config: { base: baseId },
		$override: overrides,
	};
}

const run = createCliRunner((dir: string, args: string[] = []) => ({
	command: ['bun', 'run', cli, 'token', 'doctor', ...args],
	cwd: dir,
}));

afterEach(async () => {
	for (const dir of tempDirs.splice(0))
		await fs.rm(dir, { recursive: true, force: true });
});

describe('token doctor profile workspace health', () => {
	for (const [name, bad, message] of [
		['missing-base', { ...profile(), $config: {} }, '$config.base'],
		[
			'wrong-base',
			{ ...profile(), $config: { base: 'foreign-base' } },
			'does not match',
		],
		['unmatched', profile({ absent: { $value: 18 } }), '$override.absent'],
	] as const) {
		test(`default and single-profile matrix: ${name}`, async () => {
			const dir = await workspace({
				healthy: profile({ 'size-id': { $value: 16 } }),
				bad,
			});
			const all = await run(dir);
			expect(all.exitCode, all.stdout).toBe(12);
			expect(all.stdout).toContain('profiles/bad.yaml');
			expect(all.stdout).toContain(message);
			const selected = await run(dir, [
				'-f',
				path.join(dir, 'profiles/healthy.yaml'),
			]);
			expect(selected.exitCode, selected.stdout).toBe(0);
			expect(selected.stdout).not.toContain('profiles/bad.yaml');
			const selectedBad = await run(dir, [
				'-f',
				path.join(dir, 'profiles/bad.yaml'),
			]);
			expect(selectedBad.exitCode).toBe(12);
			expect(selectedBad.stdout).toContain(
				name === 'missing-base' ? 'Invalid $config: base:' : message,
			);
		});
		test(`JSON and status expose the same error findings: ${name}`, async () => {
			const dir = await workspace({ bad });
			const text = await run(dir);
			const json = await run(dir, ['--json']);
			const status = await run(dir, ['--status']);
			expect(json.exitCode).toBe(12);
			expect(status.exitCode).toBe(12);
			const report = JSON.parse(json.stdout);
			expect(report.ok).toBe(false);
			expect(report.findings).toContainEqual(
				expect.objectContaining({
					level: 'error',
					message: expect.stringContaining(message),
				}),
			);
			for (const finding of report.findings) {
				expect(text.stdout).toContain(finding.message);
				expect(status.stdout).toContain(finding.message);
			}
		});
	}

	test('healthy structured and status modes do not invent errors and respect single-profile scope', async () => {
		const dir = await workspace({
			healthy: profile({ 'size-id': { $value: 16 } }),
			bad: { ...profile(), $config: { base: 'foreign' } },
		});
		for (const mode of ['--json', '--status']) {
			const result = await run(dir, [
				mode,
				'-f',
				path.join(dir, 'profiles/healthy.yaml'),
			]);
			expect(result.exitCode, result.stdout).toBe(0);
			expect(result.stdout).not.toContain('profiles/bad.yaml');
			if (mode === '--json') {
				const report = JSON.parse(result.stdout);
				expect(report.ok).toBe(true);
				expect(
					report.findings.filter((f: { level: string }) => f.level === 'error'),
				).toEqual([]);
				expect(
					report.identity.documents.map((d: { file: string }) => d.file),
				).toEqual(['profiles/healthy.yaml']);
			}
		}
	});

	test('redundant overrides are one info summary, compare authored values, and do not alter exit status', async () => {
		const dir = await workspace({
			snapshot: profile({
				'size-id': { $value: 14 },
				'alias-id': { $value: '{theme.size}' },
			}),
		});
		const json = await run(dir, ['--json']);
		const report = JSON.parse(json.stdout);
		expect(json.exitCode).toBe(0);
		expect(report.findings).toHaveLength(1);
		expect(report.findings[0].level).toBe('info');
		expect(report.findings[0].message).toContain('2/2');
		expect(report.findings[0].message).toContain('remove');
		const text = await run(dir);
		const status = await run(dir, ['--status']);
		expect(text.exitCode).toBe(0);
		expect(status.exitCode).toBe(0);
		expect(text.stdout).toContain(report.findings[0].message);
		expect(status.stdout).toContain(report.findings[0].message);
		const different = await workspace({
			changed: profile({
				'size-id': { $value: 16 },
				'alias-id': { $value: 14 },
			}),
		});
		const changed = JSON.parse((await run(different, ['--json'])).stdout);
		expect(changed.findings).toEqual([]);
	});

	test('default health scan does not widen resource validation beyond main', async () => {
		const dir = await workspace({
			mobile: {
				...profile(),
				$config: { base: baseId, resource: { custom: ['./missing.yaml'] } },
			},
		});
		for (const mode of [[], ['--json'], ['--status']]) {
			const main = await run(dir, mode);
			expect(main.exitCode, main.stdout).toBe(0);
			const mobile = await run(dir, [
				...mode,
				'-f',
				path.join(dir, 'profiles/mobile.yaml'),
			]);
			expect(mobile.exitCode).toBe(1);
			expect(mobile.stdout).toContain('Resource not found');
			if (mode.includes('--json'))
				expect(JSON.parse(mobile.stdout).findings[0].level).toBe('error');
		}
	});

	test('malformed profile YAML remains a structured FORMAT_ERROR with its source path', async () => {
		const dir = await workspace({ bad: profile() });
		await fs.writeFile(path.join(dir, 'profiles/bad.yaml'), '$config: [');
		for (const args of [['--json'], ['--status']]) {
			const result = await run(dir, args);
			expect(result.exitCode).toBe(12);
			expect(result.stdout).toContain('profiles/bad.yaml');
			if (args.includes('--json'))
				expect(JSON.parse(result.stdout).findings[0].level).toBe('error');
		}
	});

	test('mixed redundancy counts only equal source values, not resolved alias equivalents', async () => {
		const dir = await workspace({
			mixed: profile({ 'size-id': { $value: 14 }, 'alias-id': { $value: 14 } }),
		});
		const result = await run(dir, ['--json']);
		const report = JSON.parse(result.stdout);
		expect(result.exitCode).toBe(0);
		expect(report.findings).toHaveLength(1);
		expect(report.findings[0].level).toBe('info');
		expect(report.findings[0].message).toContain('1/2');
	});

	test('redundancy uses the same first-hit id target as the merge layer', async () => {
		const dir = await workspace(
			{ changed: profile({ 'size-id': { $value: 99 } }) },
			{ duplicate: { $type: 'number', $id: 'size-id', $value: 99 } },
		);
		const result = await run(dir, ['--json']);
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout).findings).toEqual([]);
	});

	test('document identity cannot act as an override target', async () => {
		const dir = await workspace({ bad: profile({ [baseId]: { $value: 99 } }) });
		const result = await run(dir, ['--json']);
		expect(result.exitCode).toBe(12);
		expect(JSON.parse(result.stdout).findings[0].message).toContain(
			`$override.${baseId} does not match`,
		);
	});

	test('single-profile identity scope follows the selected path for normalized names', async () => {
		const dir = await workspace({
			'Mobile One': profile(),
			bad: { ...profile(), $config: { base: 'foreign' } },
		});
		const result = await run(dir, [
			'-f',
			path.join(dir, 'profiles/Mobile One.yaml'),
			'--json',
		]);
		expect(result.exitCode).toBe(0);
		expect(
			JSON.parse(result.stdout).identity.documents.map(
				(d: { file: string }) => d.file,
			),
		).toEqual(['profiles/Mobile One.yaml']);
		expect(result.stdout).not.toContain('profiles/bad.yaml');
	});

	test('base conflicts surface even when a different workspace resource failure also exists', async () => {
		const dir = await workspace({
			bad: { ...profile(), $config: { base: 'foreign' } },
		});
		const source = yaml.load(
			await fs.readFile(path.join(dir, 'main.yaml'), 'utf8'),
		) as Record<string, unknown>;
		source.$config = {
			theme: 'doctor-profiles',
			resource: { custom: ['./missing.yaml'] },
		};
		await fs.writeFile(path.join(dir, 'main.yaml'), yaml.dump(source));
		const report = JSON.parse((await run(dir, ['--json'])).stdout);
		expect(
			report.findings.some((f: { message: string }) =>
				f.message.includes('$config.base'),
			),
		).toBe(true);
		expect(
			report.findings.some((f: { message: string }) =>
				f.message.includes('Resource not found'),
			),
		).toBe(true);
	});
});
