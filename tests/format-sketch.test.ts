import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import {
	assembleSketchPayload,
	buildSketchWriteTokens,
} from '../src/core/generator/formats/sketch-payload.ts';
import type {
	SketchAsset,
	SketchPayloadV2,
	WaveToken,
} from '../src/types/index.ts';

function assetByName(
	payload: SketchPayloadV2,
	name: string,
): SketchAsset | undefined {
	return payload.assets.find((asset) => asset.name === name);
}

function expectNoAsset(payload: SketchPayloadV2, name: string): void {
	expect(assetByName(payload, name)).toBeUndefined();
}

function colorAsset(
	partial: Partial<WaveToken> & { name: string; path: string[] },
): WaveToken {
	return {
		value: '#000000',
		type: 'color',
		_order: 0,
		...partial,
	};
}

describe('sketchFormat (payload v2)', () => {
	test('emits meta with themeId passthrough and version 2', () => {
		const tokens: WaveToken[] = [
			colorAsset({ name: 'theme-color-x', path: ['theme', 'color', 'x'] }),
		];

		const withoutThemeId = JSON.parse(sketchFormat(tokens)) as SketchPayloadV2;
		expect(withoutThemeId.meta).toEqual({ themeId: null, version: 2 });

		const withThemeId = JSON.parse(
			sketchFormat(tokens, { themeId: '0f1e2d3c4b5a69788796a5b4c3d2e1f0' }),
		) as SketchPayloadV2;
		expect(withThemeId.meta).toEqual({
			themeId: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
			version: 2,
		});
	});

	test('carries token uuid into the record and omits unregistered tokens', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-registered',
				path: ['theme', 'color', 'registered'],
				id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
			}),
			colorAsset({
				name: 'theme-color-unregistered',
				path: ['theme', 'color', 'unregistered'],
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens)) as SketchPayloadV2;
		expect(parsed.assets).toEqual([
			{
				uuid: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
				name: 'theme-color-registered',
				kind: 'color',
				color: '#000000ff',
			},
			{
				name: 'theme-color-unregistered',
				kind: 'color',
				color: '#000000ff',
			},
		]);
	});

	test('builds names from sketch.path prefix and filterLayer-trimmed leaf', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#ff0000',
				_sketch: { path: 'foundation/color' },
			}),
			colorAsset({
				name: 'theme-color-scrim',
				path: ['theme', 'color', 'scrim'],
				value: '#000000',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(
			sketchFormat(tokens, { filterLayer: 2 }),
		) as SketchPayloadV2;
		expect(assetByName(parsed, 'foundation/color/primary-main')).toEqual({
			name: 'foundation/color/primary-main',
			kind: 'color',
			color: '#ff0000ff',
		});
		expect(assetByName(parsed, 'scrim')).toEqual({
			name: 'scrim',
			kind: 'color',
			color: '#000000ff',
		});
	});

	test('keeps raw slashes and dots in names without path encoding', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-escaped',
				path: ['theme', 'color', 'text', 'escaped.key/~color'],
				value: '#112233',
				_sketch: { path: 'foundation/color' },
			}),
		];

		const parsed = JSON.parse(
			sketchFormat(tokens, { filterLayer: 2 }),
		) as SketchPayloadV2;
		// RFC 6901 encoding is gone with the v1 tree: the name is plain data.
		expect(parsed.assets.map((asset) => asset.name)).toEqual([
			'foundation/color/text-escaped.key/~color',
		]);
	});

	test('orders records by source order', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-last',
				path: ['theme', 'color', 'last'],
				_order: 9,
			}),
			{
				name: 'theme-font-body',
				path: ['theme', 'font', 'body'],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: 12,
					fontWeight: 400,
					lineHeight: '16px',
					letterSpacing: 0,
				},
				_order: 2,
			},
			colorAsset({
				name: 'theme-color-first',
				path: ['theme', 'color', 'first'],
				value: '#112233',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens)) as SketchPayloadV2;
		expect(parsed.assets.map((asset) => asset.name)).toEqual([
			'theme-color-first',
			'theme-font-body',
			'theme-color-last',
		]);
	});

	test('emits exact payloads for every syncable type and exits the rest', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-brand',
				path: ['theme', 'color', 'brand'],
				value: '#112233',
				_order: 0,
			}),
			...[
				['dimension', '8px'],
				['fontFamily', ['Inter', 'sans-serif']],
				['fontWeight', 700],
				['duration', '200ms'],
				['cubicBezier', [0.4, 0, 0.2, 1]],
				['number', 0.5],
				['strokeStyle', { dashArray: ['4px', '8px'], lineCap: 'butt' }],
				[
					'transition',
					{
						duration: '200ms',
						delay: '0ms',
						timingFunction: [0.4, 0, 0.2, 1],
					},
				],
			].map(([type, value], index) => ({
				name: `theme-standard-${type}`,
				path: ['theme', 'standard', type as string],
				type: type as string,
				value,
				_order: index + 1,
			})),
			{
				name: 'theme-standard-border',
				path: ['theme', 'standard', 'border'],
				type: 'border',
				value: {
					color: '#112233',
					width: '1px',
					style: { dashArray: ['4px', '8px'], lineCap: 'butt' },
				},
				_order: 9,
			},
			{
				name: 'theme-standard-shadow',
				path: ['theme', 'standard', 'shadow'],
				type: 'shadow',
				value: [
					{
						color: '#11223380',
						offsetX: '0px',
						offsetY: '4px',
						blur: '8px',
						spread: '0px',
						inset: false,
					},
				],
				_order: 10,
			},
			{
				name: 'theme-standard-gradient',
				path: ['theme', 'standard', 'gradient'],
				type: 'gradient',
				value: [
					{ color: '#112233', position: 0 },
					{ color: '#445566', position: 1 },
				],
				_order: 11,
			},
			{
				name: 'theme-standard-typography',
				path: ['theme', 'standard', 'typography'],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: '16px',
					fontWeight: 400,
					letterSpacing: '0px',
					lineHeight: 1.5,
				},
				_order: 12,
			},
		];

		const parsed = JSON.parse(
			sketchFormat(tokens, { filterLayer: 2 }),
		) as SketchPayloadV2;
		// Only syncable assets produce records; ordinary borders, generic
		// dimensions, transitions, and scalar payloads exit the manifest.
		expect(parsed.assets.map((asset) => asset.name)).toEqual([
			'brand',
			'shadow',
			'gradient',
			'typography',
		]);
		expect(assetByName(parsed, 'brand')).toEqual({
			name: 'brand',
			kind: 'color',
			color: '#112233ff',
		});
		expect(assetByName(parsed, 'shadow')).toEqual({
			name: 'shadow',
			kind: 'layer',
			shadows: [
				{
					x: 0,
					y: 4,
					blur: 8,
					spread: 0,
					color: '#11223380',
					inset: false,
				},
			],
		});
		expect(assetByName(parsed, 'gradient')).toEqual({
			name: 'gradient',
			kind: 'layer',
			gradient: [
				{ color: '#112233ff', position: 0 },
				{ color: '#445566ff', position: 1 },
			],
		});
		expect(assetByName(parsed, 'typography')).toEqual({
			name: 'typography',
			kind: 'text',
			text: {
				fontFamily: 'Inter',
				fontSize: 16,
				fontWeight: 400,
				lineHeight: 24,
				kerning: 0,
			},
		});
		for (const exited of [
			'dimension',
			'fontFamily',
			'fontWeight',
			'duration',
			'cubicBezier',
			'number',
			'strokeStyle',
			'transition',
			'border',
		]) {
			expectNoAsset(parsed, exited);
		}
	});

	test('sketch output excludes public dimension root', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-dimension-radius-md',
				path: ['theme', 'dimension', 'radius', 'md'],
				value: 8,
				type: 'dimension',
				_order: 0,
				_sketch: { path: 'dimension/v2/radius' },
			},
			{
				name: 'theme-radius-md',
				path: ['theme', 'radius', 'md'],
				value: 8,
				type: 'dimension',
				_order: 1,
				_sketch: { property: { cornerRadius: true } },
			},
			{
				name: 'style-shadow-legacy',
				path: ['style', 'shadow', 'legacy'],
				value: [
					{ color: '#000000', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
				],
				type: 'shadow',
				_order: 2,
				_sketch: { path: 'legacy/shadow' },
			},
		];

		const out = sketchFormat(tokens, {
			filterLayer: 1,
			includeRootKeys: [
				'color',
				'state',
				'shadow',
				'gradient',
				'border',
				'radius',
				'font',
			],
		});

		expect(out).toContain('radius-md');
		expect(out).not.toContain('dimension-radius-md');
		expect(out).not.toContain('shadow-legacy');
	});

	test('emits shadow tokens as composable shadows arrays', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-1',
				path: ['theme', 'shadow', '1'],
				value: [
					{
						color: '#00000080',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: 0,
					},
				],
				type: 'shadow',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
		const asset = assetByName(parsed, 'shadow-1') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		expect(asset.kind).toBe('layer');
		expect(asset.shadows?.[0]).toMatchObject({
			x: 0,
			y: 4,
			blur: 8,
			spread: 0,
			color: '#00000080',
		});
	});

	test('formats outline border as a two-layer shadows record', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: { color: '#000000', width: 1, style: 'solid' },
				_outline: { offset: 2 },
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
		const asset = assetByName(parsed, 'border-outline-focus') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		expect(asset.shadows).toEqual([
			{ x: 0, y: 0, blur: 0, spread: 3, color: '#000000ff' },
			{ x: 0, y: 0, blur: 0, spread: 2, color: '#ffffffff' },
		]);
	});

	test('throws instead of falling back for object outline color', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: {
					color: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
					width: 1,
					style: 'solid',
				},
				_outline: { offset: 2 },
				_order: 0,
			},
		];

		expect(() => sketchFormat(tokens, { filterLayer: 1 })).toThrow(
			'Sketch outline output requires transformer-normalized color',
		);
	});

	test('throws instead of falling back for object outline width', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: {
					color: '#000000',
					width: { value: 1, unit: 'px' },
					style: 'solid',
				},
				_outline: { offset: 2 },
				_order: 0,
			},
		];

		expect(() => sketchFormat(tokens, { filterLayer: 1 })).toThrow(
			'Sketch outline output requires transformer-normalized width',
		);
	});

	test('reverses multi-layer shadow order for sketch without mutating tokens', () => {
		const originalValue = [
			{ color: '#000000', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
			{ color: '#000000', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
			{ color: '#000000', offsetX: 0, offsetY: 8, blur: 16, spread: 0 },
		];
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-multi',
				path: ['theme', 'shadow', 'multi'],
				value: originalValue,
				type: 'shadow',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
		const asset = assetByName(parsed, 'shadow-multi') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		const shadow = asset.shadows ?? [];

		expect(shadow[0]).toMatchObject({ blur: 16, y: 8 });
		expect(shadow[1]).toMatchObject({ blur: 8, y: 4 });
		expect(shadow[2]).toMatchObject({ blur: 2, y: 1 });
		expect((tokens[0]!.value as unknown[])[0]).toMatchObject({ blur: 2 });
	});

	test('throws when sketch receives non-hex color string', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: 'oklch(52% 0.25 263)',
			}),
		];

		expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
			'Sketch output failed at theme.color.primary.main',
		);
	});

	test('fails preserved none colors with path, platform, target, and reason', () => {
		const preservedColor = {
			colorSpace: 'oklch',
			components: ['none', 0.2, 260],
			alpha: 1,
		};
		const cases: WaveToken[] = [
			{
				name: 'theme-color-none',
				path: ['theme', 'color', 'none'],
				type: 'color',
				value: preservedColor,
				_targetColorSpace: 'oklch',
				_order: 0,
			},
			{
				name: 'theme-shadow-none',
				path: ['theme', 'shadow', 'none'],
				type: 'shadow',
				value: {
					color: preservedColor,
					offsetX: '0px',
					offsetY: '1px',
					blur: '2px',
					spread: '0px',
				},
				_targetColorSpace: 'oklch',
				_order: 1,
			},
			{
				name: 'theme-gradient-none',
				path: ['theme', 'gradient', 'none'],
				type: 'gradient',
				value: [
					{ color: preservedColor, position: 0 },
					{ color: preservedColor, position: 1 },
				],
				_targetColorSpace: 'oklch',
				_order: 2,
			},
		];

		for (const token of cases) {
			let message = '';
			try {
				sketchFormat([token]);
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}
			expect(message).toContain('Sketch');
			expect(message).toContain(token.path.join('.'));
			expect(message).toContain('_targetColorSpace "oklch"');
			expect(message).toContain('contains "none"');
			expect(message).toContain('hex fallback');
		}
	});

	test('text payloads retire textColor instead of failing on preserved colors', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-font-none',
				path: ['theme', 'font', 'none'],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: '16px',
					fontWeight: 400,
					letterSpacing: '0px',
					lineHeight: 1.5,
					color: {
						colorSpace: 'oklch',
						components: ['none', 0.2, 260],
						alpha: 1,
					},
				},
				_targetColorSpace: 'oklch',
				_order: 0,
			},
		];

		// Text carries the 5 pure font fields only; the color slot is gone.
		const parsed = JSON.parse(sketchFormat([tokens[0]!]));
		expect(assetByName(parsed, 'theme-font-none')).toEqual({
			name: 'theme-font-none',
			kind: 'text',
			text: {
				fontFamily: 'Inter',
				fontSize: 16,
				fontWeight: 400,
				lineHeight: 24,
				kerning: 0,
			},
		});
	});

	test('rejects units without a Sketch numeric projection contract', () => {
		for (const unit of ['em', 'rem', '%']) {
			const radius: WaveToken = {
				name: `theme-radius-${unit}`,
				path: ['theme', 'radius', unit],
				type: 'dimension',
				value: `1${unit}`,
				_sketch: { property: { cornerRadius: true } },
				_order: 0,
			};
			const shadow: WaveToken = {
				name: `theme-shadow-${unit}`,
				path: ['theme', 'shadow', unit],
				type: 'shadow',
				value: {
					color: '#000000',
					offsetX: `1${unit}`,
					offsetY: '0px',
					blur: '1px',
					spread: '0px',
				},
				_order: 1,
			};

			for (const token of [radius, shadow]) {
				expect(() => sketchFormat([token])).toThrow('Sketch output failed');
				expect(() => sketchFormat([token])).toThrow(token.path.join('.'));
			}
		}
	});

	test('formats normalized shadow and gradient colors as hex8', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-raised',
				path: ['theme', 'shadow', 'raised'],
				value: [
					{
						color: '#ff00ff80',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: 0,
					},
				],
				type: 'shadow',
				_order: 0,
			},
			{
				name: 'theme-gradient-accent',
				path: ['theme', 'gradient', 'accent'],
				value: [
					{ color: '#ff000040', position: 0 },
					{ color: '#ff000040', position: 1 },
				],
				type: 'gradient',
				_order: 1,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
		const raised = assetByName(parsed, 'shadow-raised') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		const accent = assetByName(parsed, 'gradient-accent') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		expect(raised.shadows?.[0]?.color).toBe('#ff00ff80');
		expect(accent.gradient?.[0]?.color).toBe('#ff000040');
	});

	test('formats typography as a 5-field text payload without color keys', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-font-heading-h1',
				path: ['theme', 'font', 'heading', 'h1'],
				type: 'typography',
				value: {
					fontFamily: 'Helvetica',
					fontSize: '32px',
					fontWeight: 400,
					lineHeight: '40px',
					letterSpacing: 0,
				},
				_order: 0,
				_sketch: { path: 'font/v2' },
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
		const asset = assetByName(parsed, 'font/v2/font-heading-h1') as Extract<
			SketchAsset,
			{ kind: 'text' }
		>;
		expect(asset.kind).toBe('text');
		expect(Object.keys(asset.text).sort()).toEqual([
			'fontFamily',
			'fontSize',
			'fontWeight',
			'kerning',
			'lineHeight',
		]);
		expect(asset.text).toEqual({
			fontFamily: 'Helvetica',
			fontSize: 32,
			fontWeight: 400,
			lineHeight: 40,
			kerning: 0,
		});
	});

	test('retires textColor: typography color metadata emits no color key', () => {
		const typography = {
			fontFamily: 'Inter',
			fontSize: 14,
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
			color: '#112233',
		};
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				value: '#112233',
			}),
			{
				name: 'theme-font-literal',
				path: ['theme', 'font', 'literal'],
				type: 'typography',
				value: typography,
				_colorReference: '{theme.color.text.default}',
				_typographyColor: '#112233',
				_order: 1,
			},
			{
				name: 'theme-font-referenced',
				path: ['theme', 'font', 'referenced'],
				type: 'typography',
				value: typography,
				_typographyColor: '#112233',
				_order: 2,
			},
			{
				name: 'theme-font-external',
				path: ['theme', 'font', 'external'],
				type: 'typography',
				value: typography,
				_typographyColor: '#112233',
				_order: 3,
			},
			{
				name: 'theme-font-alpha',
				path: ['theme', 'font', 'alpha'],
				type: 'typography',
				value: typography,
				_colorReference: '#/theme/color/text/default',
				_typographyColor: '#11223380',
				_order: 4,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		for (const name of ['literal', 'referenced', 'external', 'alpha']) {
			const asset = assetByName(parsed, name) as Extract<
				SketchAsset,
				{ kind: 'text' }
			>;
			expect(asset?.kind).toBe('text');
			expect(JSON.stringify(asset)).not.toContain('color');
			expect(JSON.stringify(asset)).not.toContain('$ref');
			expect(JSON.stringify(asset)).not.toContain('@/');
		}
	});

	test('prefers PingFang SC and resolves multiplier line height', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-font-body',
				path: ['theme', 'font', 'body'],
				type: 'typography',
				value: {
					fontFamily: ['system-ui', 'Inter', 'PingFang SC'],
					fontSize: { value: 14, unit: 'pt' },
					fontWeight: '400',
					lineHeight: 1.33333,
					letterSpacing: { value: -0.2, unit: 'pt' },
					color: '#112233',
				},
				_typographyColor: '#112233',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens));
		expect(assetByName(parsed, 'theme-font-body')).toMatchObject({
			kind: 'text',
			text: {
				fontFamily: 'PingFang SC',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 19,
				kerning: -0.2,
			},
		});
	});

	test('converts rem typography lengths using the shared base font size', () => {
		const token: WaveToken = {
			name: 'theme-font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: '0.875rem',
				fontWeight: 400,
				lineHeight: '1.25rem',
				letterSpacing: '0.1rem',
			},
			_typographyBaseFontSize: 14,
			_order: 0,
		};

		const parsed = JSON.parse(sketchFormat([token]));
		const asset = assetByName(parsed, 'theme-font-body') as Extract<
			SketchAsset,
			{ kind: 'text' }
		>;
		expect(asset.text).toMatchObject({
			fontSize: 12.25,
			lineHeight: 18,
			kerning: 1.4,
		});
	});

	test('ceilings rem line height and rejects missing base metadata', () => {
		const token: WaveToken = {
			name: 'theme-font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: '0.875rem',
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_typographyBaseFontSize: 14,
			_order: 0,
		};

		const parsed = JSON.parse(sketchFormat([token]));
		const asset = assetByName(parsed, 'theme-font-body') as Extract<
			SketchAsset,
			{ kind: 'text' }
		>;
		expect(asset.text.lineHeight).toBe(19);
		expect(() =>
			sketchFormat([{ ...token, _typographyBaseFontSize: undefined }]),
		).toThrow('theme.font.body');
	});

	test('accepts exactly the 100-900 integer-hundred fontWeight scale', () => {
		const makeToken = (weight: number): WaveToken => ({
			name: `font-weight-${weight}`,
			path: ['theme', 'font', `weight-${weight}`],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: 14,
				fontWeight: weight,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_order: 0,
		});

		for (const weight of [100, 400, 700, 900]) {
			const parsed = JSON.parse(sketchFormat([makeToken(weight)]));
			const asset = assetByName(parsed, `font-weight-${weight}`) as Extract<
				SketchAsset,
				{ kind: 'text' }
			>;
			expect(asset.text.fontWeight).toBe(weight);
		}

		for (const weight of [50, 250, 425, 950, 1000]) {
			expect(() => sketchFormat([makeToken(weight)])).toThrow(
				`fontWeight ${weight} is off the Sketch 100-900 integer-hundred scale`,
			);
		}
	});

	test('ceilings fractional absolute line height', () => {
		for (const lineHeight of ['18.6px', '18.6pt']) {
			const token: WaveToken = {
				name: `font-caption-${lineHeight}`,
				path: ['font', 'caption', lineHeight],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: 12,
					fontWeight: 400,
					lineHeight,
					letterSpacing: 0,
				},
				_order: 0,
			};

			const parsed = JSON.parse(sketchFormat([token]));
			const asset = assetByName(
				parsed,
				`font-caption-${lineHeight}`,
			) as Extract<SketchAsset, { kind: 'text' }>;
			expect(asset.text.lineHeight).toBe(19);
		}
	});

	test('selects the first concrete family and omits aliases-only arrays', () => {
		const makeTypography = (family: string[], order: number): WaveToken => ({
			name: `font-${order}`,
			path: ['font', String(order)],
			type: 'typography',
			value: {
				fontFamily: family,
				fontSize: 12,
				fontWeight: 400,
				lineHeight: '16px',
				letterSpacing: 0,
			},
			_order: order,
		});
		const parsed = JSON.parse(
			sketchFormat([
				makeTypography(['SYSTEM-UI', 'Inter', 'Helvetica'], 0),
				makeTypography(['sans-serif', '-APPLE-SYSTEM'], 1),
			]),
		);
		const first = assetByName(parsed, 'font-0') as Extract<
			SketchAsset,
			{ kind: 'text' }
		>;
		const second = assetByName(parsed, 'font-1') as Extract<
			SketchAsset,
			{ kind: 'text' }
		>;
		expect(first.text.fontFamily).toBe('Inter');
		// fontFamily 缺失按插件 defaults 回退（协议 10b），wave 侧省略字段。
		expect(second.text.fontFamily).toBeUndefined();
		expect('fontFamily' in second.text).toBe(false);
		expect(first.text.lineHeight).toBe(16);
	});

	test('throws with token path when multiplier line height cannot use font size', () => {
		const token: WaveToken = {
			name: 'font-bad',
			path: ['theme', 'font', 'bad'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: 'bad',
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_order: 0,
		};
		expect(() => sketchFormat([token])).toThrow('theme.font.bad');
	});

	test('normalizes string font families and rejects control boundaries', () => {
		const token: WaveToken = {
			name: 'font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: '  Inter  ',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_order: 0,
		};
		const parsed = JSON.parse(sketchFormat([token]));
		const asset = assetByName(parsed, 'font-body') as Extract<
			SketchAsset,
			{ kind: 'text' }
		>;
		expect(asset.text.fontFamily).toBe('Inter');

		for (const fontFamily of ['\u0000Inter', 'Inter\u007f', '\u0085Inter']) {
			expect(() =>
				sketchFormat([
					{
						...token,
						value: { ...(token.value as object), fontFamily },
					},
				]),
			).toThrow('theme.font.body');
		}
	});

	test('rejects a unitless lineHeight object', () => {
		const token: WaveToken = {
			name: 'font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: { value: 1.5 },
				letterSpacing: 0,
			},
			_order: 0,
		};

		expect(() => sketchFormat([token])).toThrow('lineHeight');
	});

	test('formats sketch property dimension tokens as layer records', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-radius-md',
				path: ['theme', 'radius', 'md'],
				type: 'dimension',
				value: '8px',
				_order: 0,
				_sketch: { property: { cornerRadius: true } },
			},
			{
				name: 'theme-state-hover',
				path: ['theme', 'state', 'hover'],
				type: 'number',
				value: 0.16,
				_order: 1,
				_sketch: { property: { opacity: true } },
			},
			{
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				type: 'dimension',
				value: 24,
				_order: 2,
				_sketch: { path: 'foundation/radius' },
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
		expect(assetByName(parsed, 'radius-md')).toEqual({
			name: 'radius-md',
			kind: 'layer',
			corners: { radii: 8 },
		});
		expect(assetByName(parsed, 'state-hover')).toEqual({
			name: 'state-hover',
			kind: 'layer',
			opacity: 0.16,
		});
		// radius 终段的 sketch.path 同样按 corners 收敛。
		expect(
			assetByName(parsed, 'foundation/radius/dimension-radius-card'),
		).toEqual({
			name: 'foundation/radius/dimension-radius-card',
			kind: 'layer',
			corners: { radii: 24 },
		});
	});

	test('folds opacity and alpha overrides into HEX8 color records', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-plain',
				path: ['theme', 'color', 'plain'],
				value: '#112233',
			}),
			colorAsset({
				name: 'theme-color-alpha-value',
				path: ['theme', 'color', 'alpha-value'],
				value: '#11223380',
				_order: 1,
			}),
			{
				name: 'theme-color-derived',
				path: ['theme', 'color', 'derived'],
				value: { _color: '#ff00ff' },
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'plain',
				inheritColorOpacity: 0.36,
				_order: 2,
			},
			{
				name: 'theme-color-derived-alpha',
				path: ['theme', 'color', 'derived-alpha'],
				value: { _color: '#ff00ff' },
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'plain',
				inheritColorAlpha: 0.5,
				_order: 3,
			},
			{
				name: 'theme-color-stacked',
				path: ['theme', 'color', 'stacked'],
				value: { color: '#11223380', opacity: 0.5 },
				type: 'color',
				_order: 4,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(assetByName(parsed, 'plain')).toEqual({
			name: 'plain',
			kind: 'color',
			color: '#112233ff',
		});
		expect(assetByName(parsed, 'alpha-value')).toEqual({
			name: 'alpha-value',
			kind: 'color',
			color: '#11223380',
		});
		// opacity 0.36 folds onto the sibling color: 255 * 0.36 -> 0x5c.
		expect(assetByName(parsed, 'derived')).toEqual({
			name: 'derived',
			kind: 'color',
			color: '#1122335c',
		});
		expect(assetByName(parsed, 'derived-alpha')).toEqual({
			name: 'derived-alpha',
			kind: 'color',
			color: '#11223380',
		});
		// existing alpha composes: 0x80 * 0.5 -> 0x40.
		expect(assetByName(parsed, 'stacked')).toEqual({
			name: 'stacked',
			kind: 'color',
			color: '#11223340',
		});
	});

	test('falls back to diagnostic pink when the inherit sibling is missing', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-style-interaction-danger-border',
				path: ['theme', 'style', 'interaction', 'danger', 'border'],
				value: { _color: '#ff0000' },
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'nonexistent',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(assetByName(parsed, 'interaction-danger-border')).toEqual({
			name: 'interaction-danger-border',
			kind: 'color',
			color: '#ff00ffff',
		});
	});

	test('formats outline ring colors as HEX8 snapshots', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				value: '#112233',
				id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
			}),
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: { color: '#112233', width: 1, style: 'solid' },
				_outline: { offset: 2 },
				_order: 1,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		const asset = assetByName(parsed, 'outline-focus') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		// 颜色位置写具体值：目标 color 资产即使登记了 $id 也不再被绑定。
		expect(asset.shadows?.[0]?.color).toBe('#112233ff');
		expect(asset.shadows?.[1]?.color).toBe('#ffffffff');
	});

	test('keeps alpha overrides folded into the ring HEX8 snapshot', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-outline-alpha',
				path: ['theme', 'border', 'outline', 'alpha'],
				type: 'border',
				value: { color: '#11223380', width: 1, style: 'solid' },
				_outline: { offset: 2 },
				_order: 1,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		const asset = assetByName(parsed, 'outline-alpha') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		expect(asset.shadows?.[0]?.color).toBe('#11223380');
		expect(asset.shadows?.[1]?.color).toBe('#ffffffff');
	});

	test('builds outline rings whose color target is skipped or out of scope', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-skipped',
				path: ['theme', 'color', 'skipped'],
				value: '#112233',
				_sketch: { skip: true },
			}),
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: { color: '#112233', width: 1, style: 'solid' },
				_outline: { offset: 2 },
				_order: 1,
			},
		];

		// 目标被 sketch.skip 跳过：ring 仍构建成功，颜色位置输出 HEX8 快照。
		const skipped = JSON.parse(sketchFormat(tokens)) as SketchPayloadV2;
		const skippedRing = assetByName(
			skipped,
			'theme-border-outline-focus',
		) as Extract<SketchAsset, { kind: 'layer' }>;
		expect(skippedRing.shadows?.[0]?.color).toBe('#112233ff');

		// 目标被 root selection 排除：同样不失败。
		const scoped = JSON.parse(
			sketchFormat(tokens, { includeRootKeys: ['border'] }),
		) as SketchPayloadV2;
		const scopedRing = assetByName(
			scoped,
			'theme-border-outline-focus',
		) as Extract<SketchAsset, { kind: 'layer' }>;
		expect(scopedRing.shadows?.[0]?.color).toBe('#112233ff');
	});

	test('keeps shadow, gradient, and inheritColor output as hex8', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-base',
				path: ['theme', 'color', 'base'],
				value: '#112233',
			}),
			colorAsset({
				name: 'theme-color-derived',
				path: ['theme', 'color', 'derived'],
				value: '#112233',
				inheritColor: true,
				inheritColorSiblingSlot: 'base',
				_order: 1,
			}),
			{
				name: 'theme-shadow-raised',
				path: ['theme', 'shadow', 'raised'],
				type: 'shadow',
				value: { color: '#112233', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
				_order: 2,
			},
			{
				name: 'theme-gradient-accent',
				path: ['theme', 'gradient', 'accent'],
				type: 'gradient',
				value: [
					{ color: '#112233', position: 0 },
					{ color: '#112233', position: 1 },
				],
				_order: 3,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		// inheritColor 派生形态归类为 color 记录（Swatch），不升格 layer。
		expect(assetByName(parsed, 'derived')).toEqual({
			name: 'derived',
			kind: 'color',
			color: '#112233ff',
		});
		const raised = assetByName(parsed, 'raised') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		const accent = assetByName(parsed, 'accent') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		expect(raised.shadows?.[0]?.color).toBe('#112233ff');
		expect(accent.gradient?.[0]?.color).toBe('#112233ff');
	});

	test('hard-fails on duplicate asset names inside one payload', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				_sketch: { path: 'foundation/color' },
			}),
			colorAsset({
				name: 'theme-color-primary-main-copy',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#0f172b',
				_sketch: { path: 'foundation/color' },
				_order: 1,
			}),
		];

		expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
			'Duplicate Sketch asset name "foundation/color/primary-main"',
		);
	});

	test('detects name collisions across kinds and filter extremes', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-foo',
				path: ['theme', 'color', 'foo'],
				value: '#112233',
				type: 'color',
				_sketch: { path: 'group' },
				_order: 0,
			},
			{
				name: 'theme-shadow-foo',
				path: ['theme', 'shadow', 'foo'],
				type: 'shadow',
				value: { color: '#112233', offsetX: 0, offsetY: 0, blur: 0, spread: 0 },
				_sketch: { path: 'group' },
				_order: 1,
			},
		];

		expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
			'Duplicate Sketch asset name',
		);
	});

	test('coexists with prefix-overlapping names (flat data, not a tree)', () => {
		// orca-test 形态内化：color 名 "shadow" 与 layer 名 "shadow/elevation-high"
		// 在 v1 嵌套树中是前缀冲突；v2 扁平 name 中两者互不碰撞。
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-shadow',
				path: ['theme', 'color', 'shadow'],
				value: '#0f172b',
			}),
			{
				name: 'theme-shadow-elevation-high',
				path: ['theme', 'shadow', 'elevation', 'high'],
				type: 'shadow',
				value: [
					{ color: '#0f172b0f', offsetX: 0, offsetY: 2, blur: 4, spread: -1 },
				],
				_sketch: { path: 'shadow' },
				_order: 1,
			},
		];

		const parsed = JSON.parse(
			sketchFormat(tokens, { filterLayer: 2 }),
		) as SketchPayloadV2;
		expect(assetByName(parsed, 'shadow')).toMatchObject({
			kind: 'color',
			color: '#0f172bff',
		});
		expect(assetByName(parsed, 'shadow/elevation-high')).toMatchObject({
			kind: 'layer',
		});
		expect(parsed.assets).toHaveLength(2);
	});

	test('filters skipped tokens before name checks', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#111111',
				_sketch: { path: 'foundation/color', skip: true },
			}),
			colorAsset({
				name: 'theme-color-primary-copy',
				path: ['theme', 'color', 'primary'],
				value: '#1872f0',
				_sketch: { path: 'foundation/color' },
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(assetByName(parsed, 'foundation/color/primary')).toEqual({
			name: 'foundation/color/primary',
			kind: 'color',
			color: '#1872f0ff',
		});
	});

	test('keeps skipped tokens available to inheritColor sibling lookup', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-component-button-label',
				path: ['theme', 'component', 'button', 'label'],
				value: '#1872f0',
				_sketch: { skip: true },
			}),
			colorAsset({
				name: 'theme-component-button-icon',
				path: ['theme', 'component', 'button', 'icon'],
				value: '#000000',
				inheritColor: true,
				inheritColorSiblingSlot: 'label',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));
		expect(assetByName(parsed, 'theme-component-button-label')).toBeUndefined();
		expect(assetByName(parsed, 'theme-component-button-icon')).toEqual({
			name: 'theme-component-button-icon',
			kind: 'color',
			color: '#1872f0ff',
		});
	});

	test('does not map composite tokens through component special cases', () => {
		const tokens: WaveToken[] = [
			colorAsset({
				name: 'theme-component-button-background',
				path: ['theme', 'component', 'button', 'background'],
				value: '#1872f0',
				_composite: 'theme.component.button',
			}),
			{
				name: 'theme-component-button-radius',
				path: ['theme', 'component', 'button', 'radius'],
				value: 8,
				type: 'dimension',
				_composite: 'theme.component.button',
				_order: 1,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(assetByName(parsed, 'button-background')).toEqual({
			name: 'button-background',
			kind: 'color',
			color: '#1872f0ff',
		});
		// generic dimension 退出 payload。
		expect(assetByName(parsed, 'button-radius')).toBeUndefined();
	});

	test('assembleSketchPayload emits HEX8 outline ring colors without swatch refs', () => {
		const writeTokens: WaveToken[] = [
			colorAsset({
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				value: '#112233',
				id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
			}),
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: { color: '#112233', width: 1, style: 'solid' },
				_outline: { offset: 2 },
				_order: 1,
			},
		];
		const allTokens = [...writeTokens].sort((a, b) => a._order - b._order);

		const payload = assembleSketchPayload(
			buildSketchWriteTokens(allTokens, {
				filterLayer: 2,
			}),
			allTokens,
			{ filterLayer: 2, themeId: undefined },
		);

		const ring = assetByName(payload, 'outline-focus') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		expect(ring.shadows?.[0]?.color).toBe('#112233ff');
		expect(ring.shadows?.[1]?.color).toBe('#ffffffff');
		// 记录集合不因颜色表达而改变。
		expect(payload.assets.map((asset) => asset.name)).toEqual([
			'text-default',
			'outline-focus',
		]);
	});
});
