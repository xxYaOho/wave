import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { load as jsYamlLoad } from 'js-yaml';
import {
	detectWriteOptions,
	MigrationEntryError,
	migrateExtensionsSource,
	migrateExtensionsWorkspace,
} from '../src/core/migrate/extensions.ts';
import { createCliRunner } from './utils/cli-runner.ts';

async function makeTempWorkspace(
	files: Record<string, string>,
): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-migrate-'));
	for (const [name, content] of Object.entries(files)) {
		const target = path.join(dir, name);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, content, 'utf8');
	}
	return dir;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
	}
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		const ka = Object.keys(a as object);
		const kb = Object.keys(b as object);
		return (
			ka.length === kb.length &&
			ka.every((k) =>
				deepEqual(
					(a as Record<string, unknown>)[k],
					(b as Record<string, unknown>)[k],
				),
			)
		);
	}
	return false;
}

/** Simulated post-migration data shape for semantic comparison. */
function expectedRename(data: unknown): unknown {
	if (Array.isArray(data)) return data.map(expectedRename);
	if (data && typeof data === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
			if (
				k === '$extensions' &&
				v &&
				typeof v === 'object' &&
				!Array.isArray(v)
			) {
				const ext = { ...(v as Record<string, unknown>) };
				const sketch = ext.sketch;
				const outline = ext.outline;
				if (sketch !== undefined || outline !== undefined) {
					const inner: Record<string, unknown> = {};
					if (outline !== undefined) inner.outline = expectedRename(outline);
					if (
						sketch !== undefined &&
						typeof sketch === 'object' &&
						!Array.isArray(sketch)
					) {
						Object.assign(inner, sketch as Record<string, unknown>);
					} else if (sketch !== undefined) {
						inner.sketch = sketch;
					}
					out.$extensions = { ...ext, platform: { sketch: inner } };
					delete (out.$extensions as Record<string, unknown>).sketch;
					delete (out.$extensions as Record<string, unknown>).outline;
					continue;
				}
				out[k] = expectedRename(v);
				continue;
			}
			out[k] = expectedRename(v);
		}
		return out;
	}
	return data;
}

const LEGACY_SOURCE = `$schema: "https://www.designtokens.org/tr/2025.10/format/"

$config:
  theme: demo
  parameter:
    outputDir: ./dist

# 主题注释必须原样保留
theme:
  color:
    $type: color
    primary:
      # token 前注释
      $value: "#1872f0"
      $extensions:
        sketch:
          path: "foundation/color"

    shadow:
      $value: "#0f172b"

  dimension:
    hover:
      $type: number
      $value: 0.16
      $extensions:
        sketch:
          path: "foundation/interaction"
          property:
            opacity: true

  border:
    focus:
      $type: border
      $value:
        color: "#000000"
        width: 1
        style: solid
      $extensions:
        outline:
          offset: 2
        sketch:
          path: "v2/outline"

  font:
    $type: typography
    $extensions:
      typography:
        baseFontSize: 14
        fontFamily: Helvetica
`;

describe('migrateExtensionsSource', () => {
	test('renames legacy keys with layout and semantics preserved', () => {
		const result = migrateExtensionsSource(LEGACY_SOURCE);

		expect(result.status).toBe('migrated');
		expect(result.sketchRenamed).toBe(3);
		expect(result.outlineRenamed).toBe(1);
		expect(result.content).toBeDefined();

		const out = result.content!;
		// 语义等价：数据层面与期望重命名形态一致
		expect(
			deepEqual(jsYamlLoad(out), expectedRename(jsYamlLoad(LEGACY_SOURCE))),
		).toBe(true);

		// 版式守恒：注释行/空行数不变；正文行仅增缩进
		const a = LEGACY_SOURCE.split('\n');
		const b = out.split('\n');
		const norm = (lines: string[]) =>
			lines
				.map((l) => l.replace(/^\s+/, ''))
				.filter((l) => l !== '')
				.sort();
		const stripKeys = (lines: string[]) =>
			norm(lines).filter(
				(l) => !['platform:', 'sketch:', 'outline:'].includes(l),
			);
		expect(stripKeys(a)).toEqual(stripKeys(b));
		expect(a.filter((l) => l.trim().startsWith('#'))).toEqual(
			b.filter((l) => l.trim().startsWith('#')),
		);
		expect(a.filter((l) => l.trim() === '').length).toBe(
			b.filter((l) => l.trim() === '').length,
		);

		// typography 顶层保持不变，且未被误迁移
		const data = jsYamlLoad(out) as Record<string, unknown>;
		const font = (data.theme as Record<string, unknown>).font as Record<
			string,
			unknown
		>;
		const extensions = font.$extensions as Record<string, unknown>;
		expect(extensions.typography).toEqual({
			baseFontSize: 14,
			fontFamily: 'Helvetica',
		});
		expect(extensions.platform).toBeUndefined();
	});

	test('is idempotent: migrating migrated output is a clean no-op', () => {
		const first = migrateExtensionsSource(LEGACY_SOURCE);
		expect(first.status).toBe('migrated');

		const second = migrateExtensionsSource(first.content!);
		expect(second.status).toBe('clean');
		expect(second.sketchRenamed).toBe(0);
		expect(second.outlineRenamed).toBe(0);
		expect(second.content).toBeUndefined();
	});

	test('rejects mixed-form files without guessing', () => {
		const mixed = `theme:
  color:
    primary:
      $value: "#1872f0"
      $extensions:
        platform:
          sketch:
            path: "already/new"
  dimension:
    hover:
      $type: number
      $value: 0.5
      $extensions:
        sketch:
          skip: true
`;
		const result = migrateExtensionsSource(mixed);
		expect(result.status).toBe('mixed');
		expect(result.content).toBeUndefined();
		expect(result.message).toContain('does not guess');
		expect(result.message).toContain('theme.color.primary.$extensions');
		expect(result.message).toContain('theme.dimension.hover.$extensions');
	});

	test('rejects same-node legacy and platform conflict', () => {
		const conflict = `theme:
  color:
    primary:
      $value: "#1872f0"
      $extensions:
        sketch:
          skip: true
        platform:
          sketch:
            path: "a/b"
`;
		const result = migrateExtensionsSource(conflict);
		expect(result.status).toBe('mixed');
	});

	test('reports unsupported files instead of rewriting them', () => {
		const folded = `theme:
  desc: >
    folded line one
    still folding
  tok:
    $value: "#123456"
    $extensions:
      sketch:
        skip: true
`;
		const result = migrateExtensionsSource(folded);
		expect(result.status).toBe('unsupported');
		expect(result.content).toBeUndefined();
		expect(detectWriteOptions(folded)).toBeUndefined();
	});

	test('clean files without legacy keys stay untouched', () => {
		const modern = `theme:
  color:
    primary:
      $value: "#1872f0"
      $extensions:
        platform:
          sketch:
            skip: true
`;
		const result = migrateExtensionsSource(modern);
		expect(result.status).toBe('clean');
		expect(result.content).toBeUndefined();
	});
});

const MAIN = LEGACY_SOURCE;
const PROFILE = `theme:
  dimension:
    press:
      $type: number
      $value: 0.2
      $extensions:
        sketch:
          property:
            opacity: true
`;
const CLEAN_PROFILE = `theme:
  color:
    primary:
      $value: "#ffffff"
`;

describe('migrateExtensionsWorkspace', () => {
	test('dry-run reports without writing', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': MAIN,
			'profiles/legacy.yaml': PROFILE,
			'profiles/clean.yaml': CLEAN_PROFILE,
		});

		const report = await migrateExtensionsWorkspace(
			path.join(dir, 'main.yaml'),
			false,
		);
		expect(report.write).toBe(false);
		expect(report.migrated).toBe(2);
		expect(report.clean).toBe(1);
		expect(report.mixed).toBe(0);
		expect(report.unsupported).toBe(0);
		expect(report.files.map((f) => f.file)).toEqual([
			'main.yaml',
			'profiles/clean.yaml',
			'profiles/legacy.yaml',
		]);

		// 文件未被修改
		expect(await fs.readFile(path.join(dir, 'main.yaml'), 'utf8')).toBe(MAIN);
		expect(
			await fs.readFile(path.join(dir, 'profiles/legacy.yaml'), 'utf8'),
		).toBe(PROFILE);
	});

	test('write applies migration and a second run is a zero-diff no-op', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': MAIN,
			'profiles/legacy.yaml': PROFILE,
		});
		const entry = path.join(dir, 'main.yaml');

		const first = await migrateExtensionsWorkspace(entry, true);
		expect(first.migrated).toBe(2);

		const migratedMain = await fs.readFile(entry, 'utf8');
		const migratedProfile = await fs.readFile(
			path.join(dir, 'profiles/legacy.yaml'),
			'utf8',
		);
		expect(migratedMain).not.toBe(MAIN);
		expect(migratedProfile).not.toBe(PROFILE);

		const second = await migrateExtensionsWorkspace(entry, true);
		expect(second.migrated).toBe(0);
		expect(second.clean).toBe(2);
		expect(await fs.readFile(entry, 'utf8')).toBe(migratedMain);
		expect(
			await fs.readFile(path.join(dir, 'profiles/legacy.yaml'), 'utf8'),
		).toBe(migratedProfile);
	});

	test('mixed-form file blocks the run with exit-level detail', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': MAIN,
			'profiles/mixed.yaml': `theme:
  color:
    primary:
      $value: "#1872f0"
      $extensions:
        platform:
          sketch:
            path: "already/new"
  state:
    hover:
      $type: number
      $value: 0.5
      $extensions:
        sketch:
          skip: true
`,
		});

		const dryRun = await migrateExtensionsWorkspace(
			path.join(dir, 'main.yaml'),
			false,
		);
		expect(dryRun.mixed).toBe(1);
		expect(
			dryRun.files.find((f) => f.file === 'profiles/mixed.yaml')?.message,
		).toContain('does not guess');

		// 写模式同样不得写入任何文件
		const writeAttempt = await migrateExtensionsWorkspace(
			path.join(dir, 'main.yaml'),
			true,
		);
		expect(writeAttempt.mixed).toBe(1);
		expect(await fs.readFile(path.join(dir, 'main.yaml'), 'utf8')).toBe(MAIN);
	});

	test('enforces main.yaml entry contract', async () => {
		const dir = await makeTempWorkspace({ 'theme.yaml': MAIN });

		await expect(
			migrateExtensionsWorkspace(path.join(dir, 'theme.yaml'), false),
		).rejects.toThrow(MigrationEntryError);
		await expect(
			migrateExtensionsWorkspace(path.join(dir, 'missing.yaml'), false),
		).rejects.toThrow(MigrationEntryError);
	});
});

describe('wave token migrate extensions CLI', () => {
	const rootDir = path.resolve(import.meta.dir, '..');
	const cliEntry = path.join(rootDir, 'src/index.ts');

	const runWave = createCliRunner((args: string[]) => ({
		command: ['bun', 'run', cliEntry, ...args],
		cwd: rootDir,
	}));

	test('dry-run then write round trip through the CLI', async () => {
		const dir = await makeTempWorkspace({ 'main.yaml': MAIN });

		const dry = await runWave([
			'token',
			'migrate',
			'extensions',
			'-f',
			path.join(dir, 'main.yaml'),
		]);
		expect(dry.exitCode).toBe(0);
		expect(dry.stdout).toContain('(dry-run)');
		expect(dry.stdout).toContain('Dry run only');
		expect(await fs.readFile(path.join(dir, 'main.yaml'), 'utf8')).toBe(MAIN);

		const write = await runWave([
			'token',
			'migrate',
			'extensions',
			'-f',
			path.join(dir, 'main.yaml'),
			'--write',
		]);
		expect(write.exitCode).toBe(0);
		expect(write.stdout).toContain('(written)');
		expect(await fs.readFile(path.join(dir, 'main.yaml'), 'utf8')).not.toBe(
			MAIN,
		);

		const again = await runWave([
			'token',
			'migrate',
			'extensions',
			'-f',
			path.join(dir, 'main.yaml'),
			'--write',
		]);
		expect(again.exitCode).toBe(0);
		expect(again.stdout).toContain('up to date');
	});

	test('mixed workspace exits non-zero and writes nothing', async () => {
		const dir = await makeTempWorkspace({
			'main.yaml': MAIN,
			'profiles/mixed.yaml': `theme:
  color:
    primary:
      $value: "#1872f0"
      $extensions:
        platform:
          sketch:
            path: "already/new"
  state:
    hover:
      $type: number
      $value: 0.5
      $extensions:
        sketch:
          skip: true
`,
		});
		const before = await fs.readFile(path.join(dir, 'main.yaml'), 'utf8');

		const run = await runWave([
			'token',
			'migrate',
			'extensions',
			'-f',
			path.join(dir, 'main.yaml'),
			'--write',
		]);
		expect(run.exitCode).toBe(1);
		expect(await fs.readFile(path.join(dir, 'main.yaml'), 'utf8')).toBe(before);
	});

	test('rejects positional file input', async () => {
		const dir = await makeTempWorkspace({ 'main.yaml': MAIN });

		const result = await runWave([
			'token',
			'migrate',
			'extensions',
			path.join(dir, 'main.yaml'),
		]);
		expect(result.exitCode).not.toBe(0);
		expect(`${result.stdout}\n${result.stderr}`).toContain(
			'too many arguments',
		);
	});
});
