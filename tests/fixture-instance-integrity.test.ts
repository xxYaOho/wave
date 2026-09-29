import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const themesDir = path.join(rootDir, 'tests/fixtures/themes');
const cliEntry = path.join(rootDir, 'src/index.ts');
const tempPrefix = 'wave-fixture-integrity-';

type Format = 'json' | 'jsonc' | 'css' | 'sketch' | 'md-yml';
type Pass = { profile: string; group: string; formats: readonly Format[] };
type ValidCase = {
	theme: string;
	day: readonly Pass[];
	night?: readonly Pass[];
	skippedNights?: readonly string[];
};
type ErrorCase = { code: number; messages: readonly string[] };
type Scenario =
	| { valid: ValidCase; error?: never }
	| { error: ErrorCase; valid?: never };

const pass = (profile: string, group: string, ...formats: Format[]): Pass => ({
	profile,
	group,
	formats,
});
const groups = (
	profiles: readonly string[],
	declarations: readonly Pass[],
): Pass[] =>
	profiles.flatMap((profile) =>
		declarations.map(({ group, formats }) => ({ profile, group, formats })),
	);

// External, authored expectation matrix: scopes/groups/formats are not obtained from build planners.
const scenarios: Record<string, Scenario> = {
	'config-main': {
		valid: {
			theme: 'config-main',
			day: [pass('main', 'css', 'css'), pass('main', 'sketch', 'sketch')],
		},
	},
	'config-group-profiles': {
		valid: {
			theme: 'config-group-profiles',
			day: groups(
				['main', 'dark'],
				[pass('', 'css', 'css'), pass('', 'sketch', 'sketch')],
			),
			night: groups(
				['main', 'dark'],
				[pass('', 'css', 'css'), pass('', 'sketch', 'sketch')],
			),
		},
	},
	'config-group-variants': {
		valid: {
			theme: 'config-group-variants',
			day: [pass('main', 'css', 'css'), pass('main', 'sketch', 'sketch')],
			skippedNights: ['main'],
		},
	},
	'config-main-missing': {
		error: { code: 12, messages: ['missing required $config'] },
	},
	'doctor-contrast-empty': {
		valid: {
			theme: 'doctor-contrast-empty',
			day: [pass('main', 'default', 'json')],
		},
	},
	'doctor-contrast-invalid': {
		valid: {
			theme: 'doctor-contrast-invalid',
			day: [pass('main', 'default', 'json')],
		},
	},
	'doctor-contrast-multi': {
		valid: {
			theme: 'doctor-contrast-multi',
			day: [pass('main', 'default', 'json')],
			skippedNights: ['main'],
		},
	},
	'doctor-contrast-pass': {
		valid: {
			theme: 'doctor-contrast-pass',
			day: [pass('main', 'default', 'json')],
		},
	},
	'doctor-contrast-report': {
		valid: {
			theme: 'doctor-contrast-report',
			day: [pass('main', 'default', 'json')],
		},
	},
	'doctor-contrast-variant-night': {
		valid: {
			theme: 'doctor-contrast-variant-night',
			day: groups(['main', 'dark'], [pass('', 'default', 'json')]),
			skippedNights: ['dark'],
		},
	},
	'dtcg-standard-types': {
		valid: {
			theme: 'dtcg-standard-types',
			day: [pass('main', 'default', 'json', 'jsonc', 'css', 'sketch')],
		},
	},
	'extends-test': {
		valid: {
			theme: 'test-extends',
			day: [pass('main', 'default', 'json', 'css', 'sketch')],
		},
	},
	'identity-conflict': {
		valid: {
			theme: 'identity-conflict',
			day: groups(['main', 'mobile'], [pass('', 'default', 'json')]),
		},
	},
	'identity-ladder': {
		valid: {
			theme: 'identity-ladder',
			day: groups(['main', 'mobile'], [pass('', 'default', 'json')]),
			night: [pass('main', 'default', 'json')],
		},
	},
	'inherit-color': {
		valid: {
			theme: 'inherit-color',
			day: [pass('main', 'default', 'json', 'css', 'sketch')],
		},
	},
	'md-yml-orca': {
		valid: { theme: 'orca-doc', day: [pass('main', 'default', 'md-yml')] },
	},
	'orca-realistic': {
		valid: {
			theme: 'orca-realistic',
			day: groups(
				['main', 'assistant-app', 'viz-fos'],
				[
					pass('', 'json', 'json', 'jsonc'),
					pass('', 'css', 'css'),
					pass('', 'sketch', 'sketch'),
				],
			),
		},
	},
	'orca-test': {
		valid: {
			theme: 'orca',
			day: groups(
				[
					'main',
					'app-dsh',
					'assistant-app',
					'example_modlie',
					'viz-custom-fsrq',
					'viz-fos',
					'viz-global',
					'viz-jzy',
					'viz-sdjy',
				],
				[pass('', 'group-1', 'css', 'md-yml'), pass('', 'group-2', 'sketch')],
			),
		},
	},
	'profile-model-missing-night': {
		valid: {
			theme: 'profile-model',
			day: groups(
				['main', 'missing-night'],
				[pass('', 'default', 'json', 'css', 'sketch')],
			),
		},
	},
	'profile-model/absolute-resource': {
		valid: {
			theme: 'absolute-resource',
			day: groups(['main', 'mobile'], [pass('', 'default', 'json')]),
		},
	},
	'profile-model/group-merge': {
		valid: {
			theme: 'profile-model',
			day: groups(['main', 'mobile'], [pass('', 'css', 'css')]),
		},
	},
	'profile-model/nested-invalid': {
		error: {
			code: 1,
			messages: ['Nested profile directories are not supported'],
		},
	},
	'profile-model/no-config-main': {
		error: { code: 12, messages: ['missing required $config'] },
	},
	'profile-model/profile-root-id-empty-invalid': {
		error: {
			code: 12,
			messages: ['Invalid $id; expected a non-empty string when present'],
		},
	},
	'profile-model/theme-in-profile-invalid': {
		error: { code: 12, messages: ['Invalid $config:', 'theme'] },
	},
	'profile-model': {
		valid: {
			theme: 'profile-model',
			day: [
				pass('main', 'default', 'json', 'css', 'sketch'),
				pass('bad-ref', 'default', 'json', 'css', 'sketch'),
				pass('mobile', 'default', 'json'),
			],
			night: [pass('main', 'default', 'json', 'css', 'sketch')],
			skippedNights: ['bad-ref', 'mobile'],
		},
	},
	'profile-overrides': {
		valid: {
			theme: 'profile-overrides',
			day: groups(['main', 'mobile'], [pass('', 'default', 'json')]),
		},
	},
	'ref-test': {
		valid: { theme: 'test-ref', day: [pass('main', 'default', 'json')] },
	},
	'sketch-extensions': {
		valid: {
			theme: 'sketch-extensions',
			day: [
				pass('main', 'json', 'json'),
				pass('main', 'css', 'css'),
				pass('main', 'sketch', 'sketch'),
			],
		},
	},
	'sketch-payload-v2': {
		valid: {
			theme: 'sketch-payload-v2',
			day: groups(['main', 'dark'], [pass('', 'default', 'json', 'sketch')]),
		},
	},
	standard: {
		valid: {
			theme: 'test-standard',
			day: [pass('main', 'default', 'json', 'css')],
		},
	},
	'stock-style-invalid': {
		error: { code: 1, messages: ['theme.border.antline', 'stockStyle'] },
	},
};

const suffix: Record<Format, string> = {
	json: '.json',
	jsonc: '.jsonc',
	css: '.css',
	sketch: '2sketch.json',
	'md-yml': '2md.yml',
};

function expectedFiles(scenario: ValidCase): string[] {
	const files: string[] = [];
	for (const [mode, passes] of [
		['day', scenario.day],
		['night', scenario.night ?? []],
	] as const) {
		for (const { profile, formats } of passes) {
			const name = `${scenario.theme}${profile === 'main' ? '' : `-${profile}`}${mode === 'night' ? '-night' : ''}`;
			files.push(...formats.map((format) => `${name}${suffix[format]}`));
		}
	}
	return files.sort();
}

async function inventory(directory: string): Promise<string[]> {
	const result: string[] = [];
	async function walk(current: string): Promise<void> {
		for (const entry of (
			await fs.readdir(current, { withFileTypes: true })
		).sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(current, entry.name);
			const relative = path.relative(directory, full);
			if (entry.isDirectory()) {
				result.push(`dir:${relative}`);
				await walk(full);
			} else if (entry.isSymbolicLink()) {
				result.push(`link:${relative}:${await fs.readlink(full)}`);
			} else if (entry.isFile()) {
				const digest = createHash('sha256')
					.update(await fs.readFile(full))
					.digest('hex');
				result.push(`file:${relative}:${digest}`);
			} else {
				result.push(`other:${relative}`);
			}
		}
	}
	await walk(directory);
	return result.sort();
}

async function allMainDirectories(directory: string): Promise<string[]> {
	const found: string[] = [];
	async function walk(current: string): Promise<void> {
		for (const entry of await fs.readdir(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) await walk(full);
			else if (entry.isFile() && entry.name === 'main.yaml')
				found.push(path.relative(directory, current));
		}
	}
	await walk(directory);
	return found.sort();
}

async function nightSources(workspace: string): Promise<string[]> {
	const found: string[] = [];
	for (const name of ['main@night.yaml']) {
		if (await Bun.file(path.join(workspace, name)).exists()) found.push('main');
	}
	const profilesDir = path.join(workspace, 'profiles');
	try {
		for (const entry of await fs.readdir(profilesDir, {
			withFileTypes: true,
		})) {
			if (entry.isFile() && entry.name.endsWith('@night.yaml'))
				found.push(entry.name.slice(0, -'@night.yaml'.length));
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	return found.sort();
}

async function cleanupOwnedTemp(
	directory: string,
	base: string,
): Promise<void> {
	const stat = await fs.lstat(directory);
	if (
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		path.dirname(directory) !== base ||
		!path.basename(directory).startsWith(tempPrefix)
	) {
		throw new Error(`Refusing to clean non-owned directory: ${directory}`);
	}
	await fs.rm(directory, { recursive: true, force: true });
}

async function withOwnedTemp<T>(
	body: (directory: string) => Promise<T>,
): Promise<T> {
	const base = await fs.realpath(os.tmpdir());
	const directory = await fs.mkdtemp(path.join(base, tempPrefix));
	try {
		const canonical = await fs.realpath(directory);
		expect(path.dirname(canonical)).toBe(base);
		expect(path.basename(canonical).startsWith(tempPrefix)).toBe(true);
		return await body(canonical);
	} finally {
		await cleanupOwnedTemp(directory, base);
	}
}

describe('every theme fixture main.yaml builds as its declared instance', () => {
	test('covers every workspace and every declared artifact or intentional error', async () => {
		const discovered = await allMainDirectories(themesDir);
		expect(discovered).toEqual(Object.keys(scenarios).sort());
		expect(discovered).toHaveLength(32);
		expect(
			Object.values(scenarios).filter((entry) => entry.valid),
		).toHaveLength(26);
		expect(
			Object.values(scenarios).filter((entry) => entry.error),
		).toHaveLength(6);
		expect(
			Object.values(scenarios).flatMap((entry) =>
				entry.valid ? expectedFiles(entry.valid) : [],
			),
		).toHaveLength(106);

		let nightSourceCount = 0;
		let skippedNightCount = 0;
		let missingNightCount = 0;
		for (const relative of discovered) {
			const workspace = path.join(themesDir, relative);
			const scenario = scenarios[relative]!;
			const sourceBefore = await inventory(workspace);
			const sources = await nightSources(workspace);
			nightSourceCount += sources.length;
			if (scenario.valid) {
				const expectedNights = [
					...new Set((scenario.valid.night ?? []).map((p) => p.profile)),
				];
				const skippedNights = [...(scenario.valid.skippedNights ?? [])];
				skippedNightCount += skippedNights.length;
				if (sources.length > 0) {
					const dayProfiles = new Set(scenario.valid.day.map((p) => p.profile));
					missingNightCount += [...dayProfiles].filter(
						(profile) => !sources.includes(profile),
					).length;
				}
				expect(sources, relative).toEqual(
					[...expectedNights, ...skippedNights].sort(),
				);
			}
			try {
				await withOwnedTemp(async (temporary) => {
					const out = path.join(temporary, 'out');
					await fs.mkdir(out);
					const args = [
						'dt',
						'build',
						'-f',
						path.join(workspace, 'main.yaml'),
						'--profiles',
						'all',
						'--out',
						out,
					];
					if (sources.length > 0) args.push('--night');
					const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
						cwd: rootDir,
						env: {
							...process.env,
							WAVE_RESOURCE_CACHE_DIR: path.join(temporary, 'cache'),
							WAVE_RESOURCE_STATE_PATH: path.join(temporary, 'state.json'),
							WAVE_RESOURCE_CONFIG_DIR: path.join(temporary, 'config'),
						},
						stdout: 'pipe',
						stderr: 'pipe',
					});
					const [stdout, stderr, exitCode] = await Promise.all([
						new Response(proc.stdout).text(),
						new Response(proc.stderr).text(),
						proc.exited,
					]);
					const report = `${stdout}\n${stderr}`;
					const outputInventory = await inventory(out);
					const outputFiles = outputInventory
						.filter((entry) => entry.startsWith('file:'))
						.map((entry) => entry.slice(5).split(':')[0]!);
					if (scenario.error) {
						expect(exitCode, `${relative}\n${report}`).toBe(
							scenario.error.code,
						);
						for (const message of scenario.error.messages)
							expect(report, relative).toContain(message);
						expect(outputInventory, relative).toEqual([]);
						return;
					}
					const valid = scenario.valid!;
					expect(exitCode, `${relative}\n${report}`).toBe(0);
					expect(report, relative).toContain('Theme generation complete');
					const expected = expectedFiles(valid);
					expect(new Set(expected).size, relative).toBe(expected.length);
					expect(outputFiles.sort(), `${relative}\n${report}`).toEqual(
						expected,
					);
					expect(outputInventory, `${relative}\n${report}`).toHaveLength(
						expected.length,
					);
					for (const file of outputFiles)
						expect(
							(await fs.stat(path.join(out, file))).size,
							`${relative}/${file}`,
						).toBeGreaterThan(0);
					const nightWarnings =
						report.match(
							/│\s+night\s+Night Mode unavailable\/invalid(?: and skipped| \.\.\.)/g,
						) ?? [];
					const missingDayNights =
						sources.length > 0
							? [...new Set(valid.day.map((p) => p.profile))].filter(
									(profile) => !sources.includes(profile),
								)
							: [];
					const expectedNightWarnings =
						(valid.skippedNights?.length ?? 0) + missingDayNights.length;
					expect(nightWarnings, `${relative}\n${report}`).toHaveLength(
						expectedNightWarnings,
					);
					if (expectedNightWarnings > 0) {
						expect(report, relative).toContain('WARNINGS');
					}
				});
			} finally {
				expect(
					await inventory(workspace),
					`${relative}: fixture sources changed`,
				).toEqual(sourceBefore);
			}
		}
		expect(nightSourceCount).toBe(9);
		expect(skippedNightCount).toBe(5);
		expect(missingNightCount).toBe(2);
	}, 120_000);
});
