import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { generateTheme } from '../src/core/pipeline/theme-service.ts';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import type { DtcgTokenGroup } from '../src/types/index.ts';

function group(extension: unknown): DtcgTokenGroup {
	return {
		theme: {
			font: { $type: 'typography', $extensions: { typography: extension } },
		},
	} as DtcgTokenGroup;
}

const fieldValues = {
	fontFamily: ['Inter', 'system-ui'],
	fontSize: { value: 1, unit: 'rem' },
	fontWeight: 500,
	lineHeight: 1.5,
	letterSpacing: 0,
};

describe('flat typography extension contract', () => {
	for (const [field, value] of Object.entries({
		baseFontSize: 14,
		...fieldValues,
	})) {
		test(`accepts ${field} as the sole declared field`, () => {
			expect(
				validateThemeSchema(group({ [field]: value }), 'resolved').valid,
			).toBe(true);
		});
	}

	for (const defaults of [{ fontFamily: 'Inter' }, {}, null, []]) {
		test(`rejects the legacy defaults key with a flat rewrite example: ${JSON.stringify(defaults)}`, () => {
			const result = validateThemeSchema(group({ defaults }));
			expect(result.valid).toBe(false);
			expect(result.issues).toContainEqual(
				expect.objectContaining({
					path: 'theme.font.$extensions.typography.defaults',
					level: 'error',
					message: expect.stringContaining('typography: { fontFamily:'),
				}),
			);
		});
	}

	for (const extension of [
		{},
		{ future: true },
		{ color: '#ffffff' },
		null,
		[],
	]) {
		test(`rejects empty, unknown or malformed extensions: ${JSON.stringify(extension)}`, () => {
			expect(validateThemeSchema(group(extension)).valid).toBe(false);
		});
	}

	for (const [field, value] of Object.entries({
		fontFamily: 1,
		fontSize: 'large',
		fontWeight: 0,
		lineHeight: '1em',
		letterSpacing: false,
	})) {
		test(`validates the flat ${field} slot`, () => {
			const result = validateThemeSchema(group({ [field]: value }), 'resolved');
			expect(result.valid).toBe(false);
			expect(result.issues).toContainEqual(
				expect.objectContaining({
					path: `theme.font.$extensions.typography.${field}`,
					level: 'error',
				}),
			);
		});
	}

	test('distinguishes the rem baseline from its sibling composite fontSize slot', () => {
		expect(
			validateThemeSchema(
				group({ baseFontSize: 14, fontSize: { value: 2, unit: 'rem' } }),
				'resolved',
			).valid,
		).toBe(true);
		const invalid = validateThemeSchema(
			group({ baseFontSize: { value: 14, unit: 'px' }, fontSize: 'large' }),
			'resolved',
		);
		expect(invalid.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.font.$extensions.typography.baseFontSize',
				message: expect.stringContaining(
					'baseFontSize must be a finite positive number',
				),
			}),
		);
		expect(invalid.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.font.$extensions.typography.fontSize',
				message: expect.stringContaining('typography.fontSize'),
			}),
		);
	});

	test('builds inherited flat fields and restores references while profiles adjust only the rem baseline', async () => {
		const dir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-typography-flat-'),
		);
		try {
			await fs.mkdir(path.join(dir, 'profiles'));
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				yaml.dump({
					$id: 'base-id',
					$config: {
						theme: 'flat-font',
						parameter: {
							platform: ['json', 'css', 'sketch', 'md-yml'],
							filterLayer: 1,
						},
					},
					theme: {
						font: {
							$type: 'typography',
							$extensions: {
								typography: {
									baseFontSize: '{theme.font.base-size}',
									fontFamily: '{theme.font.family}',
									fontSize: { value: 2, unit: 'rem' },
									fontWeight: 400,
									lineHeight: 1.5,
									letterSpacing: 0,
								},
							},
							'base-size': {
								$type: 'number',
								$id: 'base-size-id',
								$value: 14,
								$extensions: { platform: { sketch: { skip: true } } },
							},
							family: {
								$type: 'fontFamily',
								$value: ['Inter'],
								$extensions: { platform: { sketch: { skip: true } } },
							},
							'heading-family': {
								$type: 'fontFamily',
								$value: ['Heading'],
								$extensions: { platform: { sketch: { skip: true } } },
							},
							body: { $value: {} },
							heading: {
								$extensions: {
									typography: {
										fontFamily: '{theme.font.heading-family}',
										fontSize: { value: 1, unit: 'rem' },
										fontWeight: 500,
									},
								},
								h1: { $value: { fontWeight: 700 } },
							},
							fixed: { $value: { fontSize: 20, fontFamily: ['Literal'] } },
						},
					},
				}),
			);
			await fs.writeFile(
				path.join(dir, 'profiles/mobile.yaml'),
				yaml.dump({
					$config: { base: 'base-id' },
					$override: { 'base-size-id': { $value: 16 } },
				}),
			);
			const result = await generateTheme({
				workspacePath: path.join(dir, 'main.yaml'),
				cliOutput: path.join(dir, 'out'),
				generateOptions: { night: false, profiles: 'all' },
			});
			expect(result.ok, result.ok ? undefined : result.message).toBe(true);
			for (const [suffix, baseline] of [
				['', 14],
				['-mobile', 16],
			] as const) {
				const json = await Bun.file(
					path.join(dir, `out/flat-font${suffix}.json`),
				).json();
				expect(json['font-body']).toEqual({
					fontFamily: ['Inter'],
					fontSize: '2rem',
					fontWeight: 400,
					lineHeight: 1.5,
					letterSpacing: '0px',
				});
				expect(json['font-heading-h1']).toMatchObject({
					fontSize: '1rem',
					fontWeight: 700,
				});
				expect(json['font-body']).not.toHaveProperty('baseFontSize');
				const css = await Bun.file(
					path.join(dir, `out/flat-font${suffix}.css`),
				).text();
				expect(css).toContain(`font-size: ${baseline}px`);
				expect(css).toContain('--font-body-size: 2rem');
				expect(css).toContain('--font-heading-family: Heading');
				expect(css).not.toContain('--font-heading-h1-family:');
				const mdYaml = await Bun.file(
					path.join(dir, `out/flat-font${suffix}2md.yml`),
				).text();
				expect(mdYaml).toContain("fontFamily: '{font.family}'");
				const sketch = await Bun.file(
					path.join(dir, `out/flat-font${suffix}2sketch.json`),
				).json();
				for (const [name, size, weight] of [
					['font-body', baseline * 2, 400],
					['font-heading-h1', baseline, 700],
					['font-fixed', 20, 400],
				]) {
					expect(
						sketch.assets.find((asset: { name: string }) => asset.name === name)
							?.text,
					).toMatchObject({ fontSize: size, fontWeight: weight });
				}
			}
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('defers all six references in raw but rejects unresolved values in resolved', () => {
		const references = Object.fromEntries(
			Object.keys({ baseFontSize: 14, ...fieldValues }).map((field) => [
				field,
				'{theme.reference.value}',
			]),
		);
		expect(validateThemeSchema(group(references), 'raw').valid).toBe(true);
		expect(validateThemeSchema(group(references), 'resolved').valid).toBe(
			false,
		);
	});
});
