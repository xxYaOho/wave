import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type {
	ResolvedTokenGroup,
	SketchAsset,
	SketchPayloadV2,
	WaveToken,
} from '../src/types/index.ts';

function token(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.path ?? partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

function assetByName(
	payload: SketchPayloadV2,
	name: string,
): SketchAsset | undefined {
	return payload.assets.find((asset) => asset.name === name);
}

describe('sketch extension format', () => {
	test('uses sketch.path as name prefix and filterLayer key as leaf', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'foundation/color/primary-main')).toEqual({
			name: 'foundation/color/primary-main',
			kind: 'color',
			color: '#1872f0ff',
		});
	});

	test('uses bare leaf names when sketch.path is absent', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				type: 'color',
			}),
			token({
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				value: 8,
				type: 'dimension',
				_sketch: { property: { cornerRadius: true } },
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'primary-main')).toEqual({
			name: 'primary-main',
			kind: 'color',
			color: '#1872f0ff',
		});
		expect(assetByName(parsed, 'radius-card')).toEqual({
			name: 'radius-card',
			kind: 'layer',
			corners: { radii: 8 },
		});
	});

	test('converts object color values to sketch hex8', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: { color: '#1872f0' },
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'foundation/color/primary-main')).toMatchObject({
			color: '#1872f0ff',
		});
	});

	test('normalizes shorthand color values to sketch hex8 objects', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-on-main',
				path: ['theme', 'color', 'primary', 'on-main'],
				value: '#fff',
				type: 'color',
				_sketch: { path: 'color-v2' },
			}),
			token({
				name: 'theme-color-overlay',
				path: ['theme', 'color', 'overlay'],
				value: '#0000',
				type: 'color',
				_sketch: { path: 'color-v2' },
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'color-v2/primary-on-main')).toEqual({
			name: 'color-v2/primary-on-main',
			kind: 'color',
			color: '#ffffffff',
		});
		expect(assetByName(parsed, 'color-v2/overlay')).toEqual({
			name: 'color-v2/overlay',
			kind: 'color',
			color: '#00000000',
		});
	});

	test('rejects non-color values in color output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-alpha',
				path: ['theme', 'color', 'alpha'],
				value: 0.16,
				type: 'color',
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch output failed at theme.color.alpha',
		);
		expect(() => sketchFormat(tokens)).toThrow(
			'color is not a transformer-normalized hex color',
		);
	});

	test('uses sketch.property.opacity for number output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-interaction-hover',
				path: ['theme', 'dimension', 'interaction', 'hover'],
				value: 0.16,
				type: 'number',
				_sketch: {
					path: 'foundation/interaction',
					property: { opacity: true },
				},
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(
			assetByName(parsed, 'foundation/interaction/interaction-hover'),
		).toEqual({
			name: 'foundation/interaction/interaction-hover',
			kind: 'layer',
			opacity: 0.16,
		});
	});

	test('uses sketch.property.opacity for state number output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-state-hover',
				path: ['theme', 'state', 'hover'],
				value: 0.16,
				type: 'number',
				_sketch: {
					path: 'foundation/state',
					property: { opacity: true },
				},
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(assetByName(parsed, 'foundation/state/state-hover')).toEqual({
			name: 'foundation/state/state-hover',
			kind: 'layer',
			opacity: 0.16,
		});
	});

	test('uses sketch.property.cornerRadius for dimension output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				value: '8px',
				type: 'dimension',
				_sketch: { property: { cornerRadius: true } },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'radius-card')).toEqual({
			name: 'radius-card',
			kind: 'layer',
			corners: { radii: 8 },
		});
	});

	test('infers corners output for dimension-v radius path', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-radius-md',
				path: ['theme', 'dimension', 'radius', 'md'],
				value: '8px',
				type: 'dimension',
				_sketch: { path: 'dimension-v2/radius' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'dimension-v2/radius/radius-md')).toEqual({
			name: 'dimension-v2/radius/radius-md',
			kind: 'layer',
			corners: { radii: 8 },
		});
	});

	test('rejects non-numeric opacity values', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-interaction-hover',
				path: ['theme', 'dimension', 'interaction', 'hover'],
				value: '8px',
				type: 'dimension',
				_sketch: { property: { opacity: true } },
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch property opacity requires a finite number',
		);
	});

	test('rejects invalid cornerRadius values', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				value: 'auto',
				type: 'dimension',
				_sketch: { property: { cornerRadius: true } },
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch output failed at theme.dimension.radius.card',
		);
		expect(() => sketchFormat(tokens)).toThrow(
			'property.cornerRadius requires a finite number or px/pt dimension',
		);
	});

	test('converts shadow tokens to composable shadows arrays', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-shadow-1',
				path: ['theme', 'shadow', '1'],
				value: [
					{
						color: '#0f172b0f',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: -2,
					},
					{
						color: '#0f172b05',
						offsetX: 0,
						offsetY: 0,
						blur: 2,
						spread: 1,
					},
				],
				type: 'shadow',
				_sketch: { path: 'aaa/bbb' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		const asset = assetByName(parsed, 'aaa/bbb/shadow-1') as Extract<
			SketchAsset,
			{ kind: 'layer' }
		>;
		expect(asset.shadows).toHaveLength(2);
		expect(asset.shadows?.[0]).toMatchObject({
			color: '#0f172b05',
			y: 0,
			blur: 2,
		});
	});

	test('converts gradient tokens to composable gradient arrays', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-gradient-brand',
				path: ['theme', 'gradient', 'brand'],
				value: [
					{ color: '#00000000', position: 0 },
					{ color: '#000000cc', position: 1 },
				],
				type: 'gradient',
				_sketch: { path: 'foundation/gradient' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(assetByName(parsed, 'foundation/gradient/gradient-brand')).toEqual({
			name: 'foundation/gradient/gradient-brand',
			kind: 'layer',
			gradient: [
				{ color: '#00000000', position: 0 },
				{ color: '#000000cc', position: 1 },
			],
		});
	});

	test('detects duplicate sketch asset names', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
			token({
				name: 'theme-color-primary-main-copy',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#0f172b',
				type: 'color',
				_sketch: { path: 'foundation/color' },
				_order: 1,
			}),
		];

		expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
			'Duplicate Sketch asset name "foundation/color/primary-main"',
		);
	});

	test('coexists with strict-prefix names in either token order', () => {
		// v1 在嵌套树中拒绝前缀路径；v2 扁平 name 中 "group" 与 "group/foo"
		// 是两条不同记录（orca-test 缺口的根因消解）。
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-foo',
				path: ['theme', 'dimension', 'foo'],
				value: 4,
				type: 'dimension',
				_sketch: { path: 'group', property: { opacity: true } },
			}),
			token({
				name: 'theme-dimension-bar',
				path: ['theme', 'dimension', 'bar'],
				value: 8,
				type: 'dimension',
				_sketch: { path: 'group/foo', property: { opacity: true } },
				_order: 1,
			}),
		];

		for (const orderedTokens of [tokens, [...tokens].reverse()]) {
			const parsed = JSON.parse(
				sketchFormat(orderedTokens, { filterLayer: 2 }),
			);
			expect(assetByName(parsed, 'group/foo')).toMatchObject({
				kind: 'layer',
				opacity: 4,
			});
			expect(assetByName(parsed, 'group/foo/bar')).toMatchObject({
				kind: 'layer',
				opacity: 8,
			});
		}
	});

	test('rejects exact name collisions across kinds', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-foo',
				path: ['theme', 'color', 'foo'],
				value: '#112233',
				type: 'color',
				_sketch: { path: 'group' },
			}),
			token({
				name: 'theme-dimension-foo',
				path: ['theme', 'dimension', 'foo'],
				value: 4,
				type: 'dimension',
				_sketch: { path: 'group', property: { opacity: true } },
				_order: 1,
			}),
		];

		expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
			'Duplicate Sketch asset name "group/foo"',
		);
	});

	test('filters skipped tokens before output name and duplicate checks', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-skipped',
				path: ['theme', 'color', 'primary'],
				value: '#111111',
				type: 'color',
				_sketch: { path: 'foundation/color', skip: true },
			}),
			token({
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#1872f0',
				type: 'color',
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

	test('excludes non-writable tokens from name collision preflight', () => {
		const written = token({
			name: 'theme-color-primary',
			path: ['theme', 'color', 'primary'],
			value: '#1872f0',
			type: 'color',
			_sketch: { path: 'foundation/color' },
		});
		const conflicting = token({
			name: 'theme-dimension-primary',
			path: ['theme', 'dimension', 'primary'],
			value: 8,
			type: 'dimension',
			_sketch: { path: 'foundation/color' },
		});

		const withoutValue = JSON.parse(
			sketchFormat([{ ...conflicting, value: undefined }, written], {
				filterLayer: 2,
			}),
		);
		expect(assetByName(withoutValue, 'foundation/color/primary')).toMatchObject(
			{
				color: '#1872f0ff',
			},
		);

		const skipped = JSON.parse(
			sketchFormat(
				[
					{ ...conflicting, _sketch: { ...conflicting._sketch, skip: true } },
					written,
				],
				{ filterLayer: 2 },
			),
		);
		expect(assetByName(skipped, 'foundation/color/primary')).toMatchObject({
			color: '#1872f0ff',
		});

		const rootExcluded = JSON.parse(
			sketchFormat([conflicting, written], {
				filterLayer: 2,
				includeRootKeys: ['color'],
			}),
		);
		expect(assetByName(rootExcluded, 'foundation/color/primary')).toMatchObject(
			{
				color: '#1872f0ff',
			},
		);
	});

	test('keeps skipped tokens available to inheritColor sibling lookup', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-component-button-label',
				path: ['theme', 'component', 'button', 'label'],
				value: '#1872f0',
				type: 'color',
				_sketch: { skip: true },
			}),
			token({
				name: 'theme-component-button-icon',
				path: ['theme', 'component', 'button', 'icon'],
				value: '#000000',
				type: 'color',
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
			token({
				name: 'theme-component-button-background',
				path: ['theme', 'component', 'button', 'background'],
				value: '#1872f0',
				type: 'color',
				_composite: 'theme.component.button',
			}),
			token({
				name: 'theme-component-button-radius',
				path: ['theme', 'component', 'button', 'radius'],
				value: 8,
				type: 'dimension',
				_composite: 'theme.component.button',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'button-background')).toEqual({
			name: 'button-background',
			kind: 'color',
			color: '#1872f0ff',
		});
		expect(assetByName(parsed, 'button-radius')).toBeUndefined();
	});

	test('formats inherited group sketch.path after transformer normalization', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					$extensions: { platform: { sketch: { path: 'foundation/color' } } },
					primary: { $value: '#1872f0' },
				},
			},
		};
		const { tokens } = transformToWaveTokens(resolved);

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'foundation/color/primary')).toEqual({
			name: 'foundation/color/primary',
			kind: 'color',
			color: '#1872f0ff',
		});
	});

	test('builds outline rings whose color target is skipped or excluded', () => {
		const typography = {
			fontFamily: 'Inter',
			fontSize: 14,
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
			color: '#112233',
		};
		const target = token({
			name: 'theme-color-text-default',
			path: ['theme', 'color', 'text', 'default'],
			value: '#112233',
			type: 'color',
			_sketch: { skip: true },
		});
		const ring = token({
			name: 'theme-border-outline-focus',
			path: ['theme', 'border', 'outline', 'focus'],
			type: 'border',
			value: { color: '#112233', width: 1, style: 'solid' },
			_outline: { offset: 2 },
			_sketchColorReference: '{theme.color.text.default}',
			_order: 2,
		});
		const ringColorOf = (payloadText: string): unknown =>
			(
				assetByName(JSON.parse(payloadText), 'theme-border-outline-focus') as
					| Extract<SketchAsset, { kind: 'layer' }>
					| undefined
			)?.shadows?.[0]?.color;

		// 目标被 sketch.skip 跳过、被 root selection 排除、或被过滤后无值：
		// ring 一律构建成功并输出 HEX8 快照，不再校验目标是否入账。
		expect(ringColorOf(sketchFormat([target, ring]))).toBe('#112233ff');
		expect(
			ringColorOf(
				sketchFormat([{ ...target, _sketch: undefined }, ring], {
					includeRootKeys: ['border'],
				}),
			),
		).toBe('#112233ff');
		expect(
			ringColorOf(
				sketchFormat([
					{ ...target, value: undefined, _sketch: undefined },
					ring,
				]),
			),
		).toBe('#112233ff');

		// text 与普通 border 不产生 layer 颜色位置。
		const body = token({
			name: 'theme-font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: typography,
			_typographyColor: '#112233',
			_sketchColorReference: '{theme.color.text.default}',
			_order: 1,
		});
		const plainBorder = token({
			name: 'theme-border-focus',
			path: ['theme', 'border', 'focus'],
			type: 'border',
			value: { color: '#112233', width: 1, style: 'solid' },
			_sketchColorReference: '{theme.color.text.default}',
			_order: 2,
		});
		const parsed = JSON.parse(sketchFormat([target, body, plainBorder]));
		expect(assetByName(parsed, 'theme-font-body')).toMatchObject({
			kind: 'text',
		});
		expect(assetByName(parsed, 'theme-border-focus')).toBeUndefined();
	});

	test('allows duplicate filtered color keys under distinct names', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				value: '#112233',
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
			token({
				name: 'theme-state-text-default',
				path: ['theme', 'state', 'text', 'default'],
				value: '#445566',
				type: 'color',
				_sketch: { path: 'foundation/state' },
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(assetByName(parsed, 'foundation/color/text-default')).toEqual({
			name: 'foundation/color/text-default',
			kind: 'color',
			color: '#112233ff',
		});
		expect(assetByName(parsed, 'foundation/state/text-default')).toEqual({
			name: 'foundation/state/text-default',
			kind: 'color',
			color: '#445566ff',
		});
	});
});
