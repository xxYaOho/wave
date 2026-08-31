import { describe, expect, test } from 'bun:test';
import * as yaml from 'js-yaml';
import { flatJsonFormat } from '../src/core/generator/formats/flat.ts';
import { mdYamlFormat } from '../src/core/generator/formats/md-yml.ts';
import {
	setTokenReferenceLineage,
	type TokenReferenceLineage,
} from '../src/core/transformer/reference-lineage.ts';
import type { WaveToken } from '../src/types/index.ts';

function makeToken(
	path: string[],
	value: unknown,
	partial: Partial<WaveToken> = {},
): WaveToken {
	return {
		name: path.join('-'),
		path,
		value,
		_order: 0,
		...partial,
	};
}

function parse(output: string): Record<string, unknown> {
	return yaml.load(output) as Record<string, unknown>;
}

function ownValue(record: object, key: string): unknown {
	return Object.getOwnPropertyDescriptor(record, key)?.value;
}

function withLineage(
	token: WaveToken,
	lineage: readonly TokenReferenceLineage[],
): WaveToken {
	setTokenReferenceLineage(token, lineage);
	return token;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (typeof value !== 'object' || value === null || seen.has(value))
		return value;
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value, seen);
	}
	return Object.freeze(value);
}

describe('mdYamlFormat', () => {
	test('preserves projected theme references against the complete base graph', () => {
		const fontFamily = makeToken(
			['theme', 'font', 'font-family'],
			['Inter', 'sans-serif'],
		);
		const emphasis = makeToken(
			['theme', 'color', 'text', 'emphasis'],
			'#112233',
			{ _order: 1 },
		);
		const heading = withLineage(
			makeToken(
				['theme', 'font', 'heading', 'h1'],
				{
					color: '#112233',
					fontFamily: ['Inter', 'sans-serif'],
					fontSize: '2.5rem',
				},
				{ _order: 2 },
			),
			[
				{
					valuePath: ['fontFamily'],
					targetPath: ['theme', 'font', 'font-family'],
				},
				{
					valuePath: ['color'],
					targetPath: ['theme', 'color', 'text', 'emphasis'],
				},
			],
		);

		expect(
			mdYamlFormat([fontFamily, emphasis, heading], { filterLayer: 1 }),
		).toBe(
			"font:\n  font-family:\n    - Inter\n    - sans-serif\n  heading-h1:\n    color: '{color.text-emphasis}'\n    fontFamily: '{font.font-family}'\n    fontSize: 2.5rem\ncolor:\n  text-emphasis: '#112233'\n",
		);
	});

	test('preserves root, nested array, alias-chain, and composite-child references', () => {
		const base = makeToken(['theme', 'color', 'base'], '#112233');
		const middle = withLineage(
			makeToken(['theme', 'color', 'middle'], '#112233', { _order: 1 }),
			[{ valuePath: [], targetPath: ['theme', 'color', 'base'] }],
		);
		const alias = withLineage(
			makeToken(['theme', 'color', 'alias'], '#112233', { _order: 2 }),
			[{ valuePath: [], targetPath: ['theme', 'color', 'middle'] }],
		);
		const gradient = withLineage(
			makeToken(
				['theme', 'gradient', 'hero'],
				[
					{ color: '#112233', position: 0 },
					{ color: '#ffffff', position: 1 },
				],
				{ _order: 3 },
			),
			[{ valuePath: [0, 'color'], targetPath: ['theme', 'color', 'base'] }],
		);
		const compositeChild = withLineage(
			makeToken(['theme', 'component', 'button', 'fill'], '#112233', {
				_composite: 'theme.component.button',
				_order: 4,
			}),
			[{ valuePath: [], targetPath: ['theme', 'color', 'base'] }],
		);

		const filtered = parse(
			mdYamlFormat([base, middle, alias, gradient, compositeChild], {
				filterLayer: 1,
			}),
		);
		expect(filtered).toEqual({
			color: {
				base: '#112233',
				middle: '{color.base}',
				alias: '{color.middle}',
			},
			gradient: {
				hero: [
					{ color: '{color.base}', position: 0 },
					{ color: '#ffffff', position: 1 },
				],
			},
			component: { button: { fill: '{color.base}' } },
		});
		expect(parse(mdYamlFormat([base, middle], { filterLayer: 0 }))).toEqual({
			theme: { 'color-base': '#112233', 'color-middle': '{theme.color-base}' },
		});
	});

	test('falls back for missing targets, missing slots, mismatches, and composite targets', () => {
		const base = makeToken(['theme', 'color', 'base'], '#112233');
		const compositeTarget = makeToken(
			['theme', 'component', 'button', 'fill'],
			'#112233',
			{ _composite: 'theme.component.button', _order: 1 },
		);
		const consumer = withLineage(
			makeToken(
				['theme', 'custom', 'consumer'],
				{ equal: '#112233', mismatch: '#445566', kept: '#112233' },
				{ _order: 2 },
			),
			[
				{ valuePath: ['missing'], targetPath: ['theme', 'color', 'base'] },
				{ valuePath: ['mismatch'], targetPath: ['theme', 'color', 'base'] },
				{ valuePath: ['equal'], targetPath: ['theme', 'color', 'absent'] },
				{
					valuePath: ['kept'],
					targetPath: ['theme', 'component', 'button', 'fill'],
				},
			],
		);

		const parsed = parse(
			mdYamlFormat([base, compositeTarget, consumer], { filterLayer: 1 }),
		);
		const custom = ownValue(parsed, 'custom') as object;
		expect(ownValue(custom, 'consumer')).toEqual({
			equal: '#112233',
			mismatch: '#445566',
			kept: '#112233',
		});
	});

	test('normalizes lineage deterministically and rejects contradictory targets', () => {
		const one = makeToken(['theme', 'color', 'one'], '#111111');
		const two = makeToken(['theme', 'color', 'two'], '#111111', { _order: 1 });
		const consumer = withLineage(
			makeToken(['theme', 'color', 'consumer'], '#111111', { _order: 2 }),
			[
				{ valuePath: [], targetPath: ['theme', 'color', 'one'] },
				{ valuePath: [], targetPath: ['theme', 'color', 'one'] },
			],
		);
		const parsed = parse(
			mdYamlFormat([one, two, consumer], { filterLayer: 1 }),
		);
		expect(ownValue(ownValue(parsed, 'color') as object, 'consumer')).toBe(
			'{color.one}',
		);

		setTokenReferenceLineage(consumer, [
			{ valuePath: [], targetPath: ['theme', 'color', 'two'] },
			{ valuePath: [], targetPath: ['theme', 'color', 'one'] },
		]);
		expect(() =>
			mdYamlFormat([one, two, consumer], { filterLayer: 1 }),
		).toThrow(
			/theme\.color\.consumer.*contradiction.*theme\.color\.one.*theme\.color\.two/,
		);
	});

	test('lets an eligible ancestor cover descendants and retries after an ineligible ancestor', () => {
		const color = makeToken(['theme', 'color', 'base'], '#112233');
		const object = makeToken(
			['theme', 'custom', 'object'],
			{ color: '#112233', label: 'base' },
			{ _order: 1 },
		);
		const covered = withLineage(
			makeToken(
				['theme', 'custom', 'covered'],
				{ color: '#112233', label: 'base' },
				{ _order: 2 },
			),
			[
				{ valuePath: ['color'], targetPath: ['theme', 'color', 'base'] },
				{ valuePath: [], targetPath: ['theme', 'custom', 'object'] },
			],
		);
		const retried = withLineage(
			makeToken(
				['theme', 'custom', 'retried'],
				{ color: '#112233', label: 'changed' },
				{ _order: 3 },
			),
			[
				{ valuePath: [], targetPath: ['theme', 'custom', 'object'] },
				{ valuePath: ['color'], targetPath: ['theme', 'color', 'base'] },
			],
		);

		const parsed = parse(
			mdYamlFormat([color, object, covered, retried], { filterLayer: 1 }),
		);
		const custom = ownValue(parsed, 'custom') as object;
		expect(ownValue(custom, 'covered')).toBe('{custom.object}');
		expect(ownValue(custom, 'retried')).toEqual({
			color: '{color.base}',
			label: 'changed',
		});
	});

	test('overlays prototype-sensitive and restricted descriptors without mutation', () => {
		const nested = Object.create(null) as Record<string, unknown>;
		Object.defineProperty(nested, '__proto__', {
			value: '#112233',
			enumerable: true,
			writable: false,
			configurable: false,
		});
		Object.defineProperty(nested, 'constructor', {
			value: '#112233',
			enumerable: true,
			writable: false,
			configurable: false,
		});
		const array = [{ prototype: '#112233' }];
		Object.defineProperty(array, '0', {
			value: array[0],
			enumerable: true,
			writable: false,
			configurable: false,
		});
		const value = { nested, array };
		const base = makeToken(['theme', 'color', 'base'], '#112233');
		const consumer = withLineage(
			makeToken(['theme', 'custom', 'safe'], value, { _order: 1 }),
			[
				{
					valuePath: ['nested', '__proto__'],
					targetPath: ['theme', 'color', 'base'],
				},
				{
					valuePath: ['nested', 'constructor'],
					targetPath: ['theme', 'color', 'base'],
				},
				{
					valuePath: ['array', 0, 'prototype'],
					targetPath: ['theme', 'color', 'base'],
				},
			],
		);
		const beforePrototype = Object.getPrototypeOf(nested);
		const parsed = parse(mdYamlFormat([base, consumer], { filterLayer: 1 }));
		const custom = ownValue(parsed, 'custom') as object;
		const safe = ownValue(custom, 'safe') as object;
		const parsedNested = ownValue(safe, 'nested') as object;
		const parsedArray = ownValue(safe, 'array');

		expect(ownValue(parsedNested, '__proto__')).toBe('{color.base}');
		expect(ownValue(parsedNested, 'constructor')).toBe('{color.base}');
		expect(parsedArray).toEqual([{ prototype: '{color.base}' }]);
		expect(Object.getPrototypeOf(nested)).toBe(beforePrototype);
		expect(ownValue(nested, '__proto__')).toBe('#112233');
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
	test('projects filtered paths into namespace and hyphen-joined local keys', () => {
		const tokens = [
			makeToken(['theme', 'color', 'primary', 'main'], '#1a72f0', {
				type: 'color',
			}),
			makeToken(['theme', 'radius', 'md'], '8px', {
				type: 'dimension',
				_order: 1,
			}),
		];

		const output = mdYamlFormat(tokens, { filterLayer: 1 });
		expect(output).toBe(
			"color:\n  primary-main: '#1a72f0'\nradius:\n  md: 8px\n",
		);
		expect(parse(output)).toEqual({
			color: { 'primary-main': '#1a72f0' },
			radius: { md: '8px' },
		});
	});

	test('preserves scalar, object, array, composite, and metadata-shaped values', () => {
		const values = {
			color: '#112233',
			typography: {
				fontFamily: 'Inter',
				fontSize: '16px',
				fontWeight: 700,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			border: { color: '#112233', width: '1px', style: 'solid' },
			shadow: [
				{
					color: '#00000080',
					offsetX: '0px',
					offsetY: '4px',
					blur: '8px',
					spread: '0px',
				},
			],
			gradient: [
				{ color: '#000000', position: 0 },
				{ color: '#ffffff', position: 1 },
			],
			custom: {
				$type: 'vendor',
				$value: ['true', '001', 'null'],
				$description: '---',
			},
		};
		const tokens = Object.entries(values).map(([key, value], index) =>
			makeToken(['theme', 'token', key], value, { _order: index }),
		);

		const output = mdYamlFormat(tokens, { filterLayer: 1 });
		expect(parse(output)).toEqual({ token: values });
		expect(output.startsWith('---')).toBe(false);
		expect(output).not.toContain('# ');
	});

	test('places interleaved explicit composites at first-child position', () => {
		const tokens = [
			makeToken(['theme', 'component', 'button', 'fill'], '#1a72f0', {
				_composite: 'theme.component.button',
				_order: 1,
			}),
			makeToken(['theme', 'component', 'label'], 'Label', { _order: 2 }),
			makeToken(['theme', 'component', 'button', 'radius'], '8px', {
				_composite: 'theme.component.button',
				_order: 3,
			}),
			makeToken(['theme', 'color', 'accent'], '#ff00aa', { _order: 0 }),
		];

		const output = mdYamlFormat(tokens, { filterLayer: 1 });
		expect(output.indexOf('color:')).toBeLessThan(output.indexOf('component:'));
		expect(output.indexOf('  button:')).toBeLessThan(
			output.indexOf('  label:'),
		);
		expect(output.indexOf('    fill:')).toBeLessThan(
			output.indexOf('    radius:'),
		);
		expect(parse(output)).toEqual({
			color: { accent: '#ff00aa' },
			component: {
				button: { fill: '#1a72f0', radius: '8px' },
				label: 'Label',
			},
		});
	});

	test('keeps no-dot multi-segment paths valid', () => {
		const output = mdYamlFormat(
			[makeToken(['theme', 'component', 'button', 'primary', 'fill'], '#fff')],
			{ filterLayer: 1 },
		);
		expect(parse(output)).toEqual({
			component: { 'button-primary-fill': '#fff' },
		});
	});

	test('rejects invalid filterLayer values', () => {
		const tokens = [makeToken(['theme', 'color', 'primary'], '#fff')];
		for (const filterLayer of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => mdYamlFormat(tokens, { filterLayer })).toThrow(
				/md-yml.*filterLayer.*non-negative finite integer/,
			);
		}
	});

	test('rejects paths too short after filtering for direct and explicit composite tokens', () => {
		expect(() =>
			mdYamlFormat([makeToken(['theme', 'color'], '#fff')], {
				filterLayer: 1,
			}),
		).toThrow(/theme\.color.*filterLayer 1.*namespace and local key/);

		expect(() =>
			mdYamlFormat(
				[
					makeToken(['theme', 'button', 'fill'], '#fff', {
						_composite: 'theme.button',
					}),
				],
				{ filterLayer: 1 },
			),
		).toThrow(/theme\.button\.fill.*filterLayer 1.*namespace and local key/);
	});

	test('rejects empty or dotted participating path segments', () => {
		for (const path of [
			['theme', '', 'primary'],
			['theme', 'color', ''],
			['theme', 'color.main', 'primary'],
			['theme', 'color', 'primary.main'],
		]) {
			expect(() =>
				mdYamlFormat([makeToken(path, '#fff')], { filterLayer: 1 }),
			).toThrow(path.includes('') ? /empty segment/ : /segment.*contains "\."/);
		}

		expect(() =>
			mdYamlFormat(
				[
					makeToken(['theme', 'component', 'button', 'fill.main'], '#fff', {
						_composite: 'theme.component.button',
					}),
				],
				{ filterLayer: 1 },
			),
		).toThrow(/fill\.main.*contains "\."/);
	});

	test('rejects collapsed, direct/composite, and duplicate-property collisions', () => {
		const collapsed = [
			makeToken(['theme', 'color', 'primary-main'], '#111'),
			makeToken(['theme', 'color', 'primary', 'main'], '#222', { _order: 1 }),
		];
		expect(() => mdYamlFormat(collapsed, { filterLayer: 1 })).toThrow(
			/color\.primary-main.*theme\.color\.primary-main.*theme\.color\.primary\.main/,
		);

		const directComposite = [
			makeToken(['theme', 'component', 'button'], 'direct'),
			makeToken(['theme', 'component', 'button', 'fill'], '#fff', {
				_composite: 'theme.component.button',
				_order: 1,
			}),
		];
		expect(() => mdYamlFormat(directComposite, { filterLayer: 1 })).toThrow(
			/component\.button.*theme\.component\.button.*theme\.component\.button\.fill/,
		);

		const collapsedComposites = [
			makeToken(['theme', 'component', 'button-main', 'fill'], '#111', {
				_composite: 'theme.component.button-main',
			}),
			makeToken(['theme', 'component', 'button', 'main', 'radius'], '8px', {
				_composite: 'theme.component.button.main',
				_order: 1,
			}),
		];
		expect(() => mdYamlFormat(collapsedComposites, { filterLayer: 1 })).toThrow(
			/component\.button-main.*theme\.component\.button-main\.fill.*theme\.component\.button\.main\.radius/,
		);

		const duplicateProperty = [
			makeToken(['theme', 'component', 'button', 'fill'], '#111', {
				_composite: 'theme.component.button',
			}),
			makeToken(['theme', 'component', 'button', 'fill'], '#222', {
				_composite: 'theme.component.button',
				_order: 1,
			}),
		];
		expect(() => mdYamlFormat(duplicateProperty, { filterLayer: 1 })).toThrow(
			/component\.button\.fill.*theme\.component\.button\.fill/,
		);
	});

	test('rejects an explicit composite marker that disagrees with the exact child path', () => {
		expect(() =>
			mdYamlFormat(
				[
					makeToken(['theme', 'component', 'button', 'fill'], '#fff', {
						_composite: 'theme.component.card',
					}),
				],
				{ filterLayer: 1 },
			),
		).toThrow(/_composite.*theme\.component\.card.*theme\.component\.button/);
	});

	test('round-trips the complete safe YAML value domain', () => {
		const nullPrototype = Object.create(null) as Record<string, unknown>;
		nullPrototype.value = 'kept';
		const value = {
			null: null,
			string: 'true',
			boolean: true,
			number: 2.5,
			array: [1, '001', false, [null]],
			plain: { nested: 'value' },
			nullPrototype,
		};
		const output = mdYamlFormat(
			[makeToken(['theme', 'custom', 'safe'], value)],
			{ filterLayer: 1 },
		);
		expect(parse(output)).toEqual({ custom: { safe: value } });
	});

	test('emits the shared inheritColor value contract exactly', () => {
		const tokens = [
			makeToken(['theme', 'color', 'foreground'], '#000000', {
				inheritColor: true,
				inheritColorAlpha: 0.4,
				inheritColorOpacity: 0.6,
			}),
		];
		const output = mdYamlFormat(tokens, { filterLayer: 1 });
		const expectedValue = {
			color: '$COLOR_FOREGROUND',
			alpha: 0.4,
			opacity: 0.6,
		};

		expect(output).toBe(
			'color:\n  foreground:\n    color: $COLOR_FOREGROUND\n    alpha: 0.4\n    opacity: 0.6\n',
		);
		expect(parse(output)).toEqual({ color: { foreground: expectedValue } });
		expect(
			(
				JSON.parse(flatJsonFormat(tokens, { filterLayer: 1 })) as Record<
					string,
					unknown
				>
			)['color-foreground'],
		).toEqual(expectedValue);
	});

	test('rejects unsafe values before serialization with token and nested paths', () => {
		const cases: Array<{ value: unknown; nestedPath?: string }> = [
			{ value: undefined },
			{ value: { nested: undefined }, nestedPath: '$.nested' },
			{ value: [undefined], nestedPath: '$[0]' },
			{ value: Array(1), nestedPath: '$[0]' },
			{ value: Number.NaN },
			{ value: Number.POSITIVE_INFINITY },
			{ value: 1n },
			{ value: Symbol('x') },
			{ value: () => 1 },
			{ value: new Date() },
			{ value: new Map() },
			{ value: new Set() },
		];

		for (const { value, nestedPath } of cases) {
			const run = () =>
				mdYamlFormat([makeToken(['theme', 'unsafe', 'value'], value)]);
			expect(run).toThrow(/md-yml.*theme\.unsafe\.value/);
			if (nestedPath) expect(run).toThrow(nestedPath);
		}

		const cycle: Record<string, unknown> = {};
		cycle.self = cycle;
		expect(() =>
			mdYamlFormat([makeToken(['theme', 'unsafe', 'cycle'], cycle)]),
		).toThrow(/theme\.unsafe\.cycle.*\$\.self.*cycle/);
	});

	test('rejects silently lossy object and array properties without invoking accessors', () => {
		let getterCalls = 0;
		let setterCalls = 0;
		const accessor = {};
		Object.defineProperty(accessor, 'danger', {
			enumerable: true,
			get() {
				getterCalls += 1;
				return 'value';
			},
		});
		const setterOnly = {};
		Object.defineProperty(setterOnly, 'danger', {
			enumerable: true,
			set(_value: unknown) {
				setterCalls += 1;
			},
		});
		const nonEnumerable = {};
		Object.defineProperty(nonEnumerable, 'hidden', {
			value: 'value',
			enumerable: false,
		});
		const symbolObject = { [Symbol('secret')]: 'value' };
		const extraArray = ['value'];
		Object.defineProperty(extraArray, 'extra', {
			value: 'lost',
			enumerable: true,
		});
		const symbolArray = ['value'];
		Object.defineProperty(symbolArray, Symbol('extra'), {
			value: 'lost',
			enumerable: true,
		});

		for (const value of [
			accessor,
			setterOnly,
			nonEnumerable,
			symbolObject,
			extraArray,
			symbolArray,
		]) {
			expect(() =>
				mdYamlFormat([makeToken(['theme', 'unsafe', 'property'], value)]),
			).toThrow(/md-yml.*theme\.unsafe\.property/);
		}
		expect(getterCalls).toBe(0);
		expect(setterCalls).toBe(0);
	});

	test('round-trips prototype-sensitive source keys safely', () => {
		const tokens = [
			makeToken(['theme', '__proto__', 'constructor'], 'namespace'),
			makeToken(['theme', 'constructor', 'prototype'], 'local', { _order: 1 }),
			makeToken(['theme', 'prototype', 'item', '__proto__'], 'property', {
				_composite: 'theme.prototype.item',
				_order: 2,
			}),
		];
		const parsed = parse(mdYamlFormat(tokens, { filterLayer: 1 }));
		expect(Object.hasOwn(parsed, '__proto__')).toBe(true);
		const protoNamespace = ownValue(parsed, '__proto__') as object;
		expect(ownValue(protoNamespace, 'constructor')).toBe('namespace');
		expect(ownValue(parsed, 'constructor')).toEqual({ prototype: 'local' });
		const prototypeNamespace = ownValue(parsed, 'prototype') as object;
		const prototypeItem = ownValue(prototypeNamespace, 'item') as object;
		expect(Object.hasOwn(prototypeItem, '__proto__')).toBe(true);
		expect(ownValue(prototypeItem, '__proto__')).toBe('property');
	});

	test('does not mutate inputs and remains byte-stable across formatter order', () => {
		const tokens = deepFreeze([
			makeToken(['theme', 'color', 'direct'], { nested: ['value'] }),
			makeToken(['theme', 'component', 'button', 'fill'], '#fff', {
				_composite: 'theme.component.button',
				_order: 1,
			}),
			makeToken(['theme', 'component', 'button', 'radius'], '8px', {
				_composite: 'theme.component.button',
				_order: 2,
			}),
			makeToken(['theme', 'color', 'foreground'], '#000', {
				inheritColor: true,
				inheritColorAlpha: 0.4,
				inheritColorOpacity: 0.6,
				_order: 3,
			}),
		]);

		const jsonFirst = flatJsonFormat(tokens);
		const yamlSecond = mdYamlFormat(tokens);
		const yamlFirst = mdYamlFormat(tokens);
		const jsonSecond = flatJsonFormat(tokens);
		expect(jsonFirst).toBe(jsonSecond);
		expect(yamlFirst).toBe(yamlSecond);
	});

	test('does not emit anchors for repeated non-cyclic object references', () => {
		const shared = { value: 'same' };
		const output = mdYamlFormat(
			[
				makeToken(['theme', 'custom', 'first'], shared),
				makeToken(['theme', 'custom', 'second'], shared, { _order: 1 }),
			],
			{ filterLayer: 1 },
		);
		expect(parse(output)).toEqual({
			custom: { first: shared, second: shared },
		});
		expect(output).not.toMatch(/[&*]ref_/);
	});
});
