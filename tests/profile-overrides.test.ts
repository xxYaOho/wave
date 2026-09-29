import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { prepareBuildPass } from '../src/core/pipeline/pass-preparer.ts';
import {
	NIGHT_SKIP_MESSAGE,
	parseProfileDocument,
} from '../src/core/pipeline/profile-resolver.ts';
import { processThemeDocument } from '../src/core/pipeline/theme-pipeline.ts';
import { generateTheme } from '../src/core/pipeline/theme-service.ts';
import { ExitCode } from '../src/types/index.ts';
import { BuildContext } from '../src/utils/receipt.ts';

const base = {
	$id: 'base-identity',
	$config: { theme: 'overrides', parameter: { platform: ['json', 'sketch'] } },
	theme: {
		color: {
			$type: 'color',
			primary: { $id: 'primary-id', $value: '#000000', $description: 'kept' },
			secondary: { $id: 'secondary-id', $value: '#999999' },
		},
		number: {
			pair: { $id: 'pair-id', $type: 'cubicBezier', $value: [0, 0, 1, 1] },
		},
	},
};

async function workspace<T>(
	profile: unknown,
	run: (mainPath: string, dir: string, profilePath: string) => Promise<T>,
	main: unknown = base,
): Promise<T> {
	const dir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'wave-profile-overrides-'),
	);
	const mainPath = path.join(dir, 'main.yaml');
	const profilePath = path.join(dir, 'profiles', 'mobile.yaml');
	try {
		await fs.mkdir(path.dirname(profilePath));
		await fs.writeFile(mainPath, yaml.dump(main));
		await fs.writeFile(profilePath, yaml.dump(profile));
		return await run(mainPath, dir, profilePath);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}

const config = { base: 'base-identity' };

describe('profile override build contract', () => {
	test('inherits base tokens, replaces values, resolves aliases, and adds locally typed tokens', async () => {
		await workspace(
			{
				$id: 'mobile-identity',
				$config: config,
				$helper: { ignored: true },
				$override: {
					'primary-id': { $value: '{theme.color.secondary}' },
					'pair-id': { $value: [0.2, 0.3, 0.8, 0.9] },
				},
				theme: {
					extra: { $type: 'number', count: { $id: 'count-id', $value: 7 } },
				},
			},
			async (mainPath, dir) => {
				const result = await generateTheme({
					workspacePath: mainPath,
					cliOutput: path.join(dir, 'out'),
					generateOptions: { night: false, profile: 'mobile' },
				});
				expect(result.ok).toBe(true);
				const output = await Bun.file(
					path.join(dir, 'out/overrides-mobile.json'),
				).json();
				expect(output).toMatchObject({
					'theme-color-primary': '#999999',
					'theme-color-secondary': '#999999',
					'theme-extra-count': 7,
					'theme-number-pair': [0.2, 0.3, 0.8, 0.9],
				});
			},
		);
	});

	test('retains authored local resource order after inherited declarations', async () => {
		await workspace(
			{
				$config: {
					...config,
					resource: { custom: ['./local.yaml'], palette: 'tailwindcss' },
				},
			},
			async (_mainPath, dir, profilePath) => {
				const document = await parseProfileDocument(
					{ name: 'mobile', path: profilePath, isDefault: false },
					{
						baseDir: dir,
						baseId: base.$id,
						baseTree: { theme: base.theme },
						baseConfig: {
							theme: 'overrides',
							resources: [{ kind: 'dimension', ref: 'wave' }],
							parameter: {},
							parameterGroups: [],
						},
					},
				);
				expect(document.config.resources).toEqual([
					{ kind: 'dimension', ref: 'wave' },
					{ kind: 'custom', ref: path.join(dir, 'profiles/local.yaml') },
					{ kind: 'palette', ref: 'tailwindcss' },
				]);
			},
		);
	});

	const invalid: Array<[string, unknown, string, unknown?]> = [
		['missing config', {}, '$config'],
		['nonobject root', [], 'root'],
		['null root', null, 'root'],
		[
			'unknown resource kind',
			{ $config: { ...config, resource: { future: 'x' } } },
			'future',
		],
		[
			'invalid parameter group',
			{ $config: { ...config, parameterGroup: { css: { filterLayer: -1 } } } },
			'filterLayer',
		],
		['missing base', { $config: {} }, 'base'],
		['empty base', { $config: { base: '' } }, 'base'],
		['wrong base', { $config: { base: 'other' } }, 'other'],
		[
			'base lacks id',
			{ $config: config },
			'ids --write',
			{ ...base, $id: undefined },
		],
		['unknown config field', { $config: { ...config, extra: true } }, 'extra'],
		['prohibited theme', { $config: { ...config, theme: 'other' } }, 'theme'],
		[
			'wrong parameter',
			{ $config: { ...config, parameter: { platform: 'json' } } },
			'platform',
		],
		['empty identity', { $config: config, $id: '' }, '$id'],
		['wrong identity type', { $config: config, $id: 12 }, '$id'],
		['nonobject override', { $config: config, $override: [] }, '$override'],
		['null override', { $config: config, $override: null }, '$override'],
		[
			'empty override id',
			{ $config: config, $override: { '': { $value: 1 } } },
			'$override',
		],
		[
			'unknown override id',
			{ $config: config, $override: { absent: { $value: 1 } } },
			'absent',
		],
		[
			'nonobject override entry',
			{ $config: config, $override: { 'primary-id': 1 } },
			'primary-id',
		],
		[
			'missing value',
			{ $config: config, $override: { 'primary-id': {} } },
			'$value',
		],
		[
			'extra entry key',
			{
				$config: config,
				$override: { 'primary-id': { $value: 1, $type: 'number' } },
			},
			'$value',
		],
		[
			'token collision',
			{
				$config: config,
				theme: { color: { primary: { $type: 'color', $value: '#ffffff' } } },
			},
			'theme.color.primary',
		],
		[
			'token becomes group',
			{
				$config: config,
				theme: {
					color: { primary: { child: { $type: 'number', $value: 1 } } },
				},
			},
			'theme.color.primary',
		],
		[
			'group becomes token',
			{ $config: config, theme: { color: { $type: 'number', $value: 1 } } },
			'theme.color',
		],
		...['$type', '$extensions', '$description'].map(
			(key): [string, unknown, string] => [
				`existing group ${key}`,
				{
					$config: config,
					theme: { color: { [key]: key === '$extensions' ? {} : 'color' } },
				},
				`theme.color.${key}`,
			],
		),
		[
			'base-only type',
			{ $config: config, theme: { color: { extra: { $value: '#ffffff' } } } },
			'theme.color.extra',
		],
	];

	for (const [name, profile, message, main] of invalid) {
		test(`rejects ${name} with FORMAT_ERROR and source path`, async () => {
			await workspace(
				profile,
				async (mainPath, dir, profilePath) => {
					const result = await generateTheme({
						workspacePath: mainPath,
						cliOutput: path.join(dir, 'out'),
						generateOptions: { night: false, profile: 'mobile' },
					});
					expect(result).toMatchObject({
						ok: false,
						exitCode: ExitCode.FORMAT_ERROR,
					});
					if (!result.ok) {
						expect(result.message).toContain(profilePath);
						expect(result.message).toContain(message);
					}
					expect(
						await Bun.file(
							path.join(dir, 'out/overrides-mobile.json'),
						).exists(),
					).toBe(false);
				},
				main ?? base,
			);
		});
	}

	test('composite values replace rather than merge, and JSON Pointer values resolve on the merged tree', async () => {
		const shadowBase = structuredClone(base);
		Object.assign(shadowBase.theme.number, {
			shadow: {
				$id: 'shadow-id',
				$type: 'shadow',
				$value: {
					color: '#000000',
					offsetX: 0,
					offsetY: 1,
					blur: 2,
					spread: 0,
				},
			},
		});
		await workspace(
			{
				$config: config,
				$override: {
					'primary-id': { $value: { $ref: '#/theme/color/secondary/$value' } },
					'shadow-id': {
						$value: { color: '#ffffff', offsetX: 2, offsetY: 3, blur: 4 },
					},
				},
			},
			async (mainPath, dir, profilePath) => {
				const result = await generateTheme({
					workspacePath: mainPath,
					cliOutput: path.join(dir, 'out'),
					generateOptions: { night: false, profile: 'mobile' },
				});
				expect(result).toMatchObject({
					ok: false,
					exitCode: ExitCode.FORMAT_ERROR,
				});
				if (!result.ok) {
					expect(result.message).toContain('spread');
					expect(result.message).toContain('theme.number.shadow');
					expect(result.message).toStartWith(`${profilePath}: `);
				}
			},
			shadowBase,
		);
		await workspace(
			{
				$config: config,
				$override: {
					'primary-id': { $value: { $ref: '#/theme/color/secondary/$value' } },
				},
			},
			async (mainPath, dir) => {
				const result = await generateTheme({
					workspacePath: mainPath,
					cliOutput: path.join(dir, 'out'),
					generateOptions: { night: false, profile: 'mobile' },
				});
				expect(result.ok).toBe(true);
				expect(
					await Bun.file(path.join(dir, 'out/overrides-mobile.json')).json(),
				).toMatchObject({ 'theme-color-primary': '#999999' });
			},
		);
	});

	test('main downstream schema errors include main.yaml and retain the token path', async () => {
		const invalidMain = {
			...base,
			theme: {
				...base.theme,
				color: {
					...base.theme.color,
					primary: { ...base.theme.color.primary, $value: 123 },
				},
			},
		};
		await workspace(
			{ $config: config },
			async (mainPath, dir) => {
				const result = await generateTheme({
					workspacePath: mainPath,
					cliOutput: path.join(dir, 'out'),
					generateOptions: { night: false },
				});
				expect(result).toMatchObject({
					ok: false,
					exitCode: ExitCode.FORMAT_ERROR,
				});
				if (!result.ok) {
					expect(result.message).toStartWith(
						`${mainPath}: Theme schema validation failed:`,
					);
					expect(result.message).toContain('theme.color.primary');
				}
			},
			invalidMain,
		);
	});

	test('night preparation attaches the source without changing the downstream failure or skip policy', async () => {
		await workspace({ $config: config }, async (mainPath, dir) => {
			const nightPath = path.join(dir, 'profiles/mobile@night.yaml');
			await fs.writeFile(
				nightPath,
				yaml.dump({ theme: { color: { primary: { $value: 123 } } } }),
			);
			const yamlContent = yaml.dump({
				theme: {
					...base.theme,
					color: {
						...base.theme.color,
						primary: { ...base.theme.color.primary, $value: 123 },
					},
				},
			});
			const original = await processThemeDocument(
				nightPath,
				{},
				undefined,
				yamlContent,
			);
			const prepared = await prepareBuildPass({
				id: 'profile:mobile:night',
				themeName: 'overrides-mobile-night',
				yamlPath: nightPath,
				yamlContent,
				dict: {},
				pass: {
					outputDir: path.join(dir, 'out'),
					platforms: ['json'],
					filterLayer: undefined,
					colorSpace: undefined,
				},
			});
			expect(original).toMatchObject({
				ok: false,
				exitCode: ExitCode.FORMAT_ERROR,
			});
			expect(prepared.ok).toBe(false);
			if (!original.ok && !prepared.ok) {
				expect(prepared).toEqual({
					...original,
					message: `${nightPath}: ${original.message}`,
				});
				expect(prepared.message).toContain('theme.color.primary');
			}
			const ctx = new BuildContext();
			const result = await generateTheme(
				{
					workspacePath: mainPath,
					cliOutput: path.join(dir, 'out'),
					generateOptions: { night: true, profile: 'mobile' },
				},
				ctx,
			);
			expect(result.ok).toBe(true);
			expect(
				ctx.warnings.some((warning) => warning.message === NIGHT_SKIP_MESSAGE),
			).toBe(true);
			if (result.ok) {
				expect(result.generatedFiles).toContain('overrides-mobile.json');
				expect(result.generatedFiles).not.toContain(
					'overrides-mobile-night.json',
				);
			}
		});
	});

	test('duplicate ids target the first authored token before $extends copies are expanded', async () => {
		const main = {
			$id: 'base-identity',
			$config: { theme: 'overrides', parameter: { platform: ['json'] } },
			theme: {
				number: {
					first: { $id: 'same-id', $type: 'number', $value: 1 },
					second: { $id: 'same-id', $type: 'number', $value: 2 },
				},
				copy: { $extends: '{theme.number}' },
			},
		};
		await workspace(
			{ $config: config, $override: { 'same-id': { $value: 3 } } },
			async (mainPath, dir) => {
				const result = await generateTheme({
					workspacePath: mainPath,
					cliOutput: path.join(dir, 'out'),
					generateOptions: { night: false, profile: 'mobile' },
				});
				expect(result.ok).toBe(true);
				expect(
					await Bun.file(path.join(dir, 'out/overrides-mobile.json')).json(),
				).toEqual({
					'theme-number-first': 3,
					'theme-number-second': 2,
					'theme-copy-first': 3,
					'theme-copy-second': 2,
				});
			},
			main,
		);
	});

	test('night overlays run on merged day tokens and keep the profile identity', async () => {
		await workspace(
			{
				$id: 'mobile-identity',
				$config: config,
				$override: { 'primary-id': { $value: '#112233' } },
			},
			async (mainPath, dir) => {
				await fs.writeFile(
					path.join(dir, 'profiles/mobile@night.yaml'),
					yaml.dump({ theme: { color: { secondary: { $value: '#ffffff' } } } }),
				);
				const result = await generateTheme({
					workspacePath: mainPath,
					cliOutput: path.join(dir, 'out'),
					generateOptions: { night: true, profiles: 'all' },
				});
				expect(result.ok).toBe(true);
				const night = await Bun.file(
					path.join(dir, 'out/overrides-mobile-night.json'),
				).json();
				expect(night).toMatchObject({
					'theme-color-primary': '#112233',
					'theme-color-secondary': '#ffffff',
				});
				expect(
					(await Bun.file(path.join(dir, 'out/overrides2sketch.json')).json())
						.meta,
				).toEqual({ themeId: 'base-identity', baseId: null, version: 2 });
				for (const suffix of ['mobile', 'mobile-night']) {
					expect(
						(
							await Bun.file(
								path.join(dir, `out/overrides-${suffix}2sketch.json`),
							).json()
						).meta,
					).toEqual({
						themeId: 'mobile-identity',
						baseId: 'base-identity',
						version: 2,
					});
				}
			},
		);
	});

	for (const contrast of [false, true]) {
		test(`doctor ${contrast ? 'contrast' : 'ordinary'} retains profile format exit`, async () => {
			await workspace(
				{ $config: config, $override: { missing: { $value: 1 } } },
				async (mainPath, _dir, profilePath) => {
					const proc = Bun.spawn(
						[
							process.execPath,
							'run',
							path.resolve(import.meta.dir, '../src/index.ts'),
							'dt',
							'doctor',
							'-f',
							mainPath,
							'--profile',
							'mobile',
							...(contrast ? ['--contrast'] : []),
						],
						{ stdout: 'pipe', stderr: 'pipe' },
					);
					const [code, stdout, stderr] = await Promise.all([
						proc.exited,
						new Response(proc.stdout).text(),
						new Response(proc.stderr).text(),
					]);
					expect(code).toBe(ExitCode.FORMAT_ERROR);
					expect(stdout + stderr).toContain(profilePath);
					expect(stdout + stderr).toContain('missing');
				},
			);
		});
	}
});
