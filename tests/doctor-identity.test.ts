import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
	collectThemeIdentityReport,
	identityBlockingFindings,
	loadIdentityInputs,
} from '../src/core/doctor/identity.ts';
import { detectThemeFiles } from '../src/core/doctor/theme-context.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');

async function runWave(
	args: string[],
	cwd = rootDir,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { exitCode, stdout, stderr };
}

async function scanFixture(fixture: string) {
	const themeDir = path.join(rootDir, 'tests/fixtures/themes', fixture);
	const entries = await detectThemeFiles(themeDir);
	const labelOf = new Map(
		entries.map((entry) => [entry.name, path.relative(themeDir, entry.path)]),
	);
	const inputs = await loadIdentityInputs(
		entries.map((entry) => {
			const nightStem = entry.name.endsWith('@night')
				? entry.name.slice(0, -'@night'.length)
				: undefined;
			const baseLabel =
				nightStem !== undefined ? labelOf.get(nightStem) : undefined;
			return {
				label: path.relative(themeDir, entry.path),
				path: entry.path,
				baseLabel,
			};
		}),
	);
	return collectThemeIdentityReport(inputs);
}

describe('theme identity report', () => {
	test('identity-ladder fixture covers every rung of the ladder', async () => {
		const report = await scanFixture('identity-ladder');

		// main brand (registered) + night override of the same id is the same
		// identity at one path; profiles/mobile accent is unregistered.
		expect(report.registered).toBeGreaterThanOrEqual(1);
		expect(report.emptySlots.map((slot) => slot.path)).toContain(
			'theme.color.reserved',
		);
		expect(report.emptySlots.map((slot) => slot.path)).toContain(
			'theme.color.blank',
		);
		expect(report.unregistered.map((item) => item.path)).toContain(
			'theme.color.legacy',
		);
		const custom = report.nonCanonical.find(
			(item) => item.path === 'theme.color.custom',
		);
		expect(custom?.id).toBe('brand-legacy-id');
		// No conflicts: the night override reuses the base id (rule 3).
		expect(report.conflicts).toEqual([]);
		expect(identityBlockingFindings(report)).toEqual([]);
	});

	test('identity-conflict fixture reports each cross-file rule separately', async () => {
		const report = await scanFixture('identity-conflict');

		// Rule 1: same id at different paths across files = conflict.
		const duplicates = report.conflicts.filter(
			(conflict) => conflict.kind === 'duplicate-id',
		);
		expect(duplicates).toHaveLength(1);
		expect(duplicates[0]!.id).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
		expect(duplicates[0]!.crossFile).toBe(true);
		expect(
			duplicates[0]!.occurrences.map((item) => `${item.file}:${item.path}`),
		).toEqual([
			'main.yaml:theme.color.beta',
			'profiles/mobile.yaml:theme.color.gamma',
		]);

		// Rule 2: same path with different ids across files = conflict.
		const divergents = report.conflicts.filter(
			(conflict) => conflict.kind === 'divergent-id',
		);
		expect(divergents).toHaveLength(1);
		expect(divergents[0]!.crossFile).toBe(true);
		expect(divergents[0]!.occurrences[0]!.path).toBe('theme.color.alpha');
		expect(divergents[0]!.ids).toEqual([
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			'cccccccccccccccccccccccccccccccc',
		]);

		// Rule 3 (negative): same path + same id across files = consistent,
		// the healthy post-sync state, never a conflict.
		expect(
			report.conflicts.some((conflict) =>
				conflict.occurrences.some((item) => item.path === 'theme.color.shared'),
			),
		).toBe(false);

		expect(identityBlockingFindings(report)).toHaveLength(2);
	});

	test('night overlay same id stays healthy while a divergent id conflicts', () => {
		const base = {
			theme: {
				color: {
					brand: { $id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', $value: '#111111' },
					alert: { $id: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1', $value: '#222222' },
				},
			},
		};
		const report = collectThemeIdentityReport([
			{ file: 'main.yaml', tree: base },
			{
				file: 'main@night.yaml',
				baseTree: base,
				tree: {
					theme: {
						color: {
							// same id as base: inherited identity, single registration
							brand: {
								$id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
								$value: '#000011',
							},
							// different id at the same path: divergent conflict
							alert: {
								$id: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2',
								$value: '#000022',
							},
						},
					},
				},
			},
		]);

		expect(report.conflicts).toHaveLength(1);
		expect(report.conflicts[0]!.kind).toBe('divergent-id');
		expect(report.conflicts[0]!.ids).toEqual([
			'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1',
			'c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2',
		]);
		expect(report.conflicts[0]!.crossFile).toBe(true);
		expect(identityBlockingFindings(report)).toHaveLength(1);
	});

	test('detects suspected typo empty nodes but not null scalar values', () => {
		const report = collectThemeIdentityReport([
			{
				file: 'main.yaml',
				tree: {
					theme: {
						color: {
							$type: 'color',
							empty: { $value: null },
							onlyDescription: { $description: 'forgot $value' },
							fine: { $value: '#ffffff' },
						},
					},
				},
			},
		]);

		expect(report.typoEmptyNodes.map((node) => node.path)).toEqual([
			'theme.color.onlyDescription',
		]);
		// null scalar values are a tolerated degenerate form, never typos.
		expect(
			report.typoEmptyNodes.some((node) => node.path === 'theme.color.empty'),
		).toBe(false);
	});

	test('reports undecidable types including unresolvable references (DTCG §5.2.2)', () => {
		const report = collectThemeIdentityReport([
			{
				file: 'main.yaml',
				tree: {
					theme: {
						color: {
							heuristic: { $value: '#123456' },
						},
						state: {
							// Reference targets outside the scanned trees cannot be
							// resolved to a type: undecidable, doctor errors.
							pressed: { $value: '{wave.dimension.alpha.200}' },
							slotted: { $value: { $ref: '#/wave/duration/fast' } },
							broken: { $value: '4px' },
						},
						alias: {
							typed: { $type: 'dimension', $value: '8px' },
							// Internal reference resolving to a typed target: decidable.
							redirect: { $value: '{theme.alias.typed}' },
						},
						extended: {
							$extends: '{theme.color}',
							deferred: { $value: '4px' },
						},
						typed: {
							$type: 'dimension',
							explicit: { $value: '4px' },
						},
					},
				},
			},
		]);

		expect(report.undecidableTypes.map((item) => item.path)).toEqual([
			'theme.state.pressed',
			'theme.state.slotted',
			'theme.state.broken',
		]);
		// §5.2.2 is a doctor-strict health item: undecidable types block.
		expect(identityBlockingFindings(report)).toHaveLength(3);
	});

	test('within-file duplicate ids are conflicts without blocking', () => {
		const report = collectThemeIdentityReport([
			{
				file: 'main.yaml',
				tree: {
					theme: {
						color: {
							$type: 'color',
							first: { $id: 'abc', $value: '#111111' },
							second: { $id: 'abc', $value: '#222222' },
						},
					},
				},
			},
		]);

		expect(report.conflicts).toHaveLength(1);
		expect(report.conflicts[0]!.kind).toBe('duplicate-id');
		expect(report.conflicts[0]!.crossFile).toBe(false);
		expect(identityBlockingFindings(report)).toEqual([]);
	});
});

describe('dt doctor token identity output', () => {
	test('identity-ladder prints the identity report and passes', async () => {
		const { exitCode, stdout } = await runWave([
			'dt',
			'doctor',
			'-f',
			'tests/fixtures/themes/identity-ladder/main.yaml',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Token Identity');
		expect(stdout).toContain('registered 2');
		expect(stdout).toContain('empty $id slot: theme.color.reserved (main.yaml)');
		expect(stdout).toContain(
			'non-canonical id form (hint): theme.color.custom "brand-legacy-id" (main.yaml)',
		);
		expect(stdout).toContain('All checks passed!');
	});

	test('identity-conflict fails the doctor with both cross-file conflict kinds', async () => {
		const { exitCode, stdout } = await runWave([
			'dt',
			'doctor',
			'-f',
			'tests/fixtures/themes/identity-conflict/main.yaml',
		]);

		expect(exitCode).not.toBe(0);
		expect(stdout).toContain(
			'cross-file $id conflict "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
		);
		expect(stdout).toContain('cross-file $id conflict at "theme.color.alpha"');
	});
});
