import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';

describe('theme schema', () => {
	test('accepts fontFamily as a known token type', () => {
		const result = validateThemeSchema({
			theme: {
				font: {
					family: {
						$type: 'fontFamily',
						$value: ['system-ui', 'PingFang SC'],
					},
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('recognizes every newly supported DTCG token type', () => {
		for (const [type, value] of [
			['fontWeight', 'demi-bold'],
			['duration', { value: 200, unit: 'ms' }],
			['strokeStyle', 'solid'],
			[
				'transition',
				{
					duration: { value: 200, unit: 'ms' },
					delay: { value: 0, unit: 'ms' },
					timingFunction: [0.4, 0, 0.2, 1],
				},
			],
		] as const) {
			const result = validateThemeSchema(
				{ theme: { token: { $type: type, $value: value } } },
				'resolved',
			);
			expect(result.valid, type).toBe(true);
			expect(
				result.issues.some((issue) => issue.message.includes('Unknown $type')),
				type,
			).toBe(false);
		}
	});

	test('treats opacity as an unknown token type without affecting opacity extensions', () => {
		const tokenType = validateThemeSchema({
			theme: { state: { disabled: { $type: 'opacity', $value: 0.5 } } },
		});
		expect(tokenType.valid).toBe(true);
		expect(tokenType.issues).toContainEqual(
			expect.objectContaining({
				level: 'warning',
				message: 'Unknown $type "opacity"',
			}),
		);

		const extension = validateThemeSchema({
			theme: {
				state: {
					disabled: {
						$type: 'number',
						$value: 0.5,
						$extensions: { sketch: { property: { opacity: true } } },
					},
				},
			},
		});
		expect(extension.valid).toBe(true);
	});

	test('validates standard primitive value contracts', () => {
		for (const [type, value] of [
			['dimension', 8],
			['dimension', '8'],
			['dimension', { value: 8, unit: 'rem' }],
			['fontFamily', []],
			['fontWeight', 1],
			['fontWeight', 1000],
			['duration', { value: -20, unit: 'ms' }],
			['cubicBezier', [0, -2, 1, 3]],
			['number', -0.5],
		] as const) {
			expect(
				validateThemeSchema(
					{ theme: { token: { $type: type, $value: value } } },
					'resolved',
				).valid,
				`${type}: ${JSON.stringify(value)}`,
			).toBe(true);
		}

		for (const [type, value] of [
			['dimension', { value: 8, unit: 'ms' }],
			['fontFamily', ['Inter', 2]],
			['fontWeight', 0],
			['fontWeight', 1001],
			['fontWeight', 'Bold'],
			['duration', { value: 20, unit: 'px' }],
			['cubicBezier', [-0.1, 0, 1, 1]],
			['cubicBezier', [0, 0, 1.1, 1]],
			['number', Number.POSITIVE_INFINITY],
		] as const) {
			expect(
				validateThemeSchema(
					{ theme: { token: { $type: type, $value: value } } },
					'resolved',
				).valid,
				`${type}: ${JSON.stringify(value)}`,
			).toBe(false);
		}
	});

	test('accepts DTCG typography type', () => {
		const result = validateThemeSchema(
			{
				theme: {
					font: {
						heading: {
							h1: {
								$type: 'typography',
								$value: {
									fontFamily: 'Inter',
									fontSize: { value: 32, unit: 'px' },
									fontWeight: 700,
									lineHeight: 1.2,
									letterSpacing: { value: -0.2, unit: 'px' },
								},
							},
						},
					},
				},
			},
			'resolved',
		);

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('accepts partial typography defaults and legacy token color', () => {
		const result = validateThemeSchema(
			{
				theme: {
					font: {
						$type: 'typography',
						$extensions: {
							typography: {
								defaults: {
									fontFamily: ['system-ui', 'PingFang SC'],
									fontWeight: 400,
									letterSpacing: 0,
								},
							},
						},
						body: {
							$value: {
								fontSize: { value: 14, unit: 'pt' },
								lineHeight: 1.5,
								color: '#112233',
							},
						},
					},
				},
			},
			'resolved',
		);

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('accepts rem typography dimensions with a theme.font baseFontSize', () => {
		const result = validateThemeSchema(
			{
				theme: {
					font: {
						$type: 'typography',
						$extensions: {
							typography: {
								baseFontSize: 14,
								defaults: {
									fontFamily: 'Inter',
									fontWeight: 400,
									letterSpacing: 0,
								},
							},
						},
						body: {
							$value: {
								fontSize: { value: 0.875, unit: 'rem' },
								lineHeight: { value: 1.5, unit: 'rem' },
								letterSpacing: { value: 0.1, unit: 'rem' },
							},
						},
					},
				},
			},
			'resolved',
		);

		expect(result.valid).toBe(true);
	});

	test('allows direct and default rem dimensions without an explicit baseFontSize', () => {
		const typography = {
			fontFamily: 'Inter',
			fontSize: { value: 0.875, unit: 'rem' },
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
		};
		const direct = validateThemeSchema(
			{
				theme: {
					font: { $type: 'typography', body: { $value: typography } },
				},
			},
			'resolved',
		);
		expect(direct.valid).toBe(true);

		const defaults = {
			fontFamily: 'Inter',
			fontSize: { value: 0.875, unit: 'rem' },
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
		};
		const withoutBase = validateThemeSchema(
			{
				theme: {
					font: {
						$type: 'typography',
						$extensions: { typography: { defaults } },
						body: { $value: {} },
					},
				},
			},
			'resolved',
		);
		expect(withoutBase.valid).toBe(true);

		const withBase = validateThemeSchema(
			{
				theme: {
					font: {
						$type: 'typography',
						$extensions: { typography: { baseFontSize: 14, defaults } },
						body: { $value: {} },
					},
				},
			},
			'resolved',
		);
		expect(withBase.valid).toBe(true);
	});

	test('limits baseFontSize to a finite positive theme.font value', () => {
		for (const baseFontSize of [0, -1, '14', { value: 14, unit: 'px' }]) {
			const result = validateThemeSchema(
				{
					theme: {
						font: {
							$type: 'typography',
							$extensions: {
								typography: {
									baseFontSize,
									defaults: { fontFamily: 'Inter' },
								},
							},
						},
					},
				},
				'resolved',
			);
			expect(result.valid, JSON.stringify(baseFontSize)).toBe(false);
		}

		const nested = validateThemeSchema(
			{
				theme: {
					font: {
						$type: 'typography',
						body: {
							$extensions: {
								typography: {
									baseFontSize: 14,
									defaults: { fontFamily: 'Inter' },
								},
							},
						},
					},
				},
			},
			'resolved',
		);
		expect(nested.valid).toBe(false);
		expect(nested.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.font.body.$extensions.typography.baseFontSize',
			}),
		);
	});

	test('defers raw baseFontSize references and requires resolved numeric values', () => {
		for (const baseFontSize of [
			'{theme.number.base}',
			{ $ref: '#/theme/number/base/$value' },
		]) {
			const raw = validateThemeSchema({
				theme: {
					number: { base: { $value: 14, $type: 'number' } },
					font: {
						$type: 'typography',
						$extensions: {
							typography: { baseFontSize, defaults: { fontFamily: 'Inter' } },
						},
					},
				},
			});
			expect(raw.valid, JSON.stringify(baseFontSize)).toBe(true);
		}

		for (const baseFontSize of [
			'{theme.number.base}',
			{ $ref: '#/theme/number/base/$value' },
		]) {
			const resolved = validateThemeSchema(
				{
					theme: {
						font: {
							$type: 'typography',
							$extensions: {
								typography: { baseFontSize, defaults: { fontFamily: 'Inter' } },
							},
						},
					},
				},
				'resolved',
			);
			expect(resolved.valid, JSON.stringify(baseFontSize)).toBe(false);
		}
	});

	test('rejects unknown defaults and typography value fields', () => {
		const result = validateThemeSchema(
			{
				theme: {
					font: {
						$type: 'typography',
						$extensions: {
							typography: { defaults: { alignment: 'center' } },
						},
						body: {
							$value: {
								fontFamily: 'Inter',
								fontSize: 14,
								fontWeight: 400,
								lineHeight: 1.5,
								letterSpacing: 0,
								alignment: 'center',
							},
						},
					},
				},
			},
			'resolved',
		);

		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.path)).toContain(
			'theme.font.$extensions.typography.defaults.alignment',
		);
		expect(result.issues.map((issue) => issue.path)).toContain(
			'theme.font.body.$value.alignment',
		);
	});

	test('rejects typography defaults on tokens and non-typography groups', () => {
		const result = validateThemeSchema(
			{
				theme: {
					color: {
						$type: 'color',
						$extensions: {
							typography: { defaults: { fontFamily: 'Inter' } },
						},
						primary: {
							$value: '#000000',
							$extensions: {
								typography: { defaults: { fontFamily: 'Inter' } },
							},
						},
					},
				},
			},
			'raw',
		);

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('only supported on groups'),
			),
		).toBe(true);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('$type "typography"'),
			),
		).toBe(true);
	});

	test('defers typography defaults type validation for raw extends groups', () => {
		const tree = {
			theme: {
				base: { $type: 'typography', body: { $value: {} } },
				derived: {
					$extends: '{theme.base}',
					$extensions: {
						typography: { defaults: { fontFamily: 'Inter' } },
					},
				},
			},
		};

		expect(validateThemeSchema(tree, 'raw').valid).toBe(true);
	});

	test('resolved typography requires all five materialized fields', () => {
		const result = validateThemeSchema(
			{
				theme: {
					font: {
						$type: 'typography',
						body: {
							$value: {
								fontFamily: 'Inter',
								fontSize: 14,
								fontWeight: 400,
								lineHeight: 1.5,
							},
						},
					},
				},
			},
			'resolved',
		);

		expect(result.valid).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.font.body',
				message: expect.stringContaining('letterSpacing'),
			}),
		);
	});

	test('enforces typography numeric, unit, and family contracts after resolution', () => {
		for (const [field, value] of [
			['fontFamily', ['Inter', 2]],
			['fontSize', '+14'],
			['fontWeight', '1e2'],
			['lineHeight', { value: 20, unit: 'em' }],
			['letterSpacing', Number.NaN],
		] as const) {
			const typography = {
				fontFamily: 'Inter',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
				[field]: value,
			};
			const result = validateThemeSchema(
				{
					theme: {
						font: {
							$type: 'typography',
							body: { $value: typography },
						},
					},
				},
				'resolved',
			);
			expect(result.valid, field).toBe(false);
		}
	});

	test('keeps standard fontFamily schema structural', () => {
		for (const fontFamily of ['', [], '\u0000Inter']) {
			const result = validateThemeSchema(
				{
					theme: {
						font: {
							$type: 'typography',
							body: {
								$value: {
									fontFamily,
									fontSize: 14,
									fontWeight: 400,
									lineHeight: 1.5,
									letterSpacing: 0,
								},
							},
						},
					},
				},
				'resolved',
			);
			expect(result.valid, JSON.stringify(fontFamily)).toBe(true);
		}
	});

	test('rejects a unitless lineHeight object', () => {
		const result = validateThemeSchema(
			{
				theme: {
					font: {
						$type: 'typography',
						body: {
							$value: {
								fontFamily: 'Inter',
								fontSize: 14,
								fontWeight: 400,
								lineHeight: { value: 1.5 },
								letterSpacing: 0,
							},
						},
					},
				},
			},
			'resolved',
		);

		expect(result.valid).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.font.body.$value.lineHeight',
			}),
		);
	});

	test('accepts outline extension on border token', () => {
		const result = validateThemeSchema({
			theme: {
				border: {
					outline: {
						focus: {
							$type: 'border',
							$value: {
								color: '#000000',
								width: 1,
								style: 'solid',
							},
							$extensions: {
								outline: {
									offset: 2,
								},
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('rejects outline extension on non-border token', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					focus: {
						$type: 'color',
						$value: '#000000',
						$extensions: {
							outline: {
								offset: 2,
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('outline can only be used with $type "border"'),
			),
		).toBe(true);
	});

	test('rejects outline extension when token type is missing', () => {
		const result = validateThemeSchema({
			theme: {
				misc: {
					focus: {
						$value: { color: '#000000', width: 1, style: 'solid' },
						$extensions: {
							outline: {
								offset: 2,
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('outline can only be used with $type "border"'),
			),
		).toBe(true);
	});

	test('rejects invalid outline offset', () => {
		const result = validateThemeSchema({
			theme: {
				border: {
					focus: {
						$type: 'border',
						$value: { color: '#000000', width: 1, style: 'solid' },
						$extensions: {
							outline: {
								offset: -1,
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes(
					'outline.offset must be a non-negative finite number',
				),
			),
		).toBe(true);
	});

	test('validates closed standard composite shapes', () => {
		const validValues = [
			[
				'border',
				{
					color: '#000000',
					width: { value: 1, unit: 'px' },
					style: 'solid',
				},
			],
			[
				'transition',
				{
					duration: { value: 200, unit: 'ms' },
					delay: { value: -50, unit: 'ms' },
					timingFunction: [0.4, 0, 0.2, 1],
				},
			],
			[
				'shadow',
				{
					color: '#00000080',
					offsetX: '-1px',
					offsetY: '2px',
					blur: '4px',
					spread: '0px',
					inset: true,
				},
			],
			[
				'gradient',
				[
					{ color: '#000000', position: -1 },
					{ color: '#ffffff', position: 2 },
				],
			],
		] as const;

		for (const [type, value] of validValues) {
			expect(
				validateThemeSchema(
					{ theme: { token: { $type: type, $value: value } } },
					'resolved',
				).valid,
				`${type}: ${JSON.stringify(value)}`,
			).toBe(true);
		}

		for (const [type, value] of [
			['border', { color: '#000000', width: '1px' }],
			[
				'border',
				{ color: '#000000', width: '1px', style: 'solid', extra: true },
			],
			[
				'transition',
				{
					duration: { value: 200, unit: 'ms' },
					delay: { value: 0, unit: 'ms' },
					timingFunction: [0.4, 0, 0.2, 1],
					extra: true,
				},
			],
			[
				'shadow',
				{
					color: '#000000',
					offsetX: '0px',
					offsetY: '1px',
					blur: '2px',
					spread: '0px',
					inset: 'yes',
				},
			],
			['gradient', [{ color: '#000000', position: 0, extra: true }]],
		] as const) {
			expect(
				validateThemeSchema(
					{ theme: { token: { $type: type, $value: value } } },
					'resolved',
				).valid,
				`${type}: ${JSON.stringify(value)}`,
			).toBe(false);
		}
	});

	test('validates DTCG color component ranges even when hex is present', () => {
		for (const value of [
			{ colorSpace: 'srgb', components: [2, 0, 0], hex: '#ff0000' },
			{ colorSpace: 'hsl', components: [360, 100, 50], hex: '#ff0000' },
			{ colorSpace: 'oklch', components: [0.5, -0.1, 20], hex: '#777777' },
			{ colorSpace: 'lab', components: [50, Number.NaN, 0], hex: '#777777' },
			{ colorSpace: 'display-p3', components: [1, 0], hex: '#ff00ff' },
		]) {
			const result = validateThemeSchema(
				{ theme: { token: { $type: 'color', $value: value } } },
				'resolved',
			);
			expect(result.valid, JSON.stringify(value)).toBe(false);
		}
	});

	test('accepts DTCG none and unbounded signed color components', () => {
		for (const value of [
			{ colorSpace: 'hsl', components: ['none', 0, 100] },
			{ colorSpace: 'lab', components: [50, -200, 200] },
			{ colorSpace: 'oklab', components: [0.5, -2, 2] },
			{ colorSpace: 'lch', components: [50, 500, 359.999] },
		]) {
			const result = validateThemeSchema(
				{ theme: { token: { $type: 'color', $value: value } } },
				'resolved',
			);
			expect(result.valid, JSON.stringify(value)).toBe(true);
		}
	});

	test('keeps legacy percent color fallback separate from standard validation', () => {
		const result = validateThemeSchema(
			{
				theme: {
					token: {
						$type: 'color',
						$value: {
							colorSpace: 'oklch',
							components: ['51.8%', 0.251, 262.6],
							hex: '#0052f5',
						},
					},
				},
			},
			'resolved',
		);
		expect(result.valid).toBe(true);
	});

	test('rejects authored color metadata in the raw phase', () => {
		const result = validateThemeSchema(
			{
				theme: {
					token: {
						$type: 'color',
						$value: {
							colorSpace: 'srgb',
							components: [1, 0, 0],
							_swatchName: 'authored/name',
						},
					},
				},
			},
			'raw',
		);
		expect(result.valid).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({ path: 'theme.token.$value._swatchName' }),
		);
	});

	test('defers raw shadow inset and gradient position references', () => {
		for (const [type, value] of [
			[
				'shadow',
				{
					color: '#000000',
					offsetX: 0,
					offsetY: 1,
					blur: 2,
					spread: 0,
					inset: '{theme.boolean.inset}',
				},
			],
			[
				'gradient',
				[
					{
						color: '#000000',
						position: { $ref: '#/theme/number/start/$value' },
					},
				],
			],
		] as const) {
			const result = validateThemeSchema(
				{ theme: { token: { $type: type, $value: value } } },
				'raw',
			);
			expect(result.valid, type).toBe(true);
		}
	});

	test('accepts string and DTCG dashArray border styles', () => {
		for (const style of [
			'solid',
			{
				dashArray: [0, 4, '8', '1.5rem', { value: 2, unit: 'pt' }, '25%'],
				lineCap: 'butt',
			},
		]) {
			const result = validateThemeSchema(
				{
					theme: {
						border: {
							$type: 'border',
							pattern: {
								$value: { color: '#000000', width: 1, style },
							},
						},
					},
				},
				'resolved',
			);
			expect(result.valid, JSON.stringify(style)).toBe(true);
		}
	});

	test('raw border dashArray accepts aliases before resolution', () => {
		const result = validateThemeSchema(
			{
				theme: {
					border: {
						$type: 'border',
						pattern: {
							$value: {
								color: '#000000',
								width: 1,
								style: {
									dashArray: [
										'{theme.dimension.dash}',
										{ $ref: '#/resource/dimension/dash/$value' },
									],
									lineCap: 'square',
								},
							},
						},
					},
				},
			},
			'raw',
		);

		expect(result.valid).toBe(true);
	});

	test('rejects invalid resolved border dashArray values', () => {
		for (const dashArray of [
			[],
			[Number.NaN, 2],
			['1e2', 2],
			['+2px', 2],
			['2vh', 2],
			[{ value: 2, unit: 'vh' }, 2],
			[{ value: 2, unit: 'px', extra: true }, 2],
			[{ nope: 2 }, 2],
		] as unknown[][]) {
			const result = validateThemeSchema(
				{
					theme: {
						border: {
							$type: 'border',
							pattern: {
								$value: {
									color: '#000000',
									width: 1,
									style: { dashArray, lineCap: 'round' },
								},
							},
						},
					},
				},
				'resolved',
			);
			expect(result.valid, JSON.stringify(dashArray)).toBe(false);
		}
	});

	test('accepts lineCap and rejects unknown strokeStyle fields', () => {
		const result = validateThemeSchema(
			{
				theme: {
					border: {
						$type: 'border',
						pattern: {
							$value: {
								color: '#000000',
								width: 1,
								style: {
									dashArray: [2, 4],
									lineCap: 'round',
									extra: true,
								},
							},
						},
					},
				},
			},
			'resolved',
		);

		expect(result.valid).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.border.pattern.$value.style.extra',
			}),
		);
	});

	test('accepts negative and all-zero strokeStyle dash arrays at schema level', () => {
		for (const dashArray of [
			[0, '0px'],
			[-1, 2],
		]) {
			const result = validateThemeSchema(
				{
					theme: {
						stroke: {
							$type: 'strokeStyle',
							$value: { dashArray, lineCap: 'butt' },
						},
					},
				},
				'resolved',
			);
			expect(result.valid, JSON.stringify(dashArray)).toBe(true);
		}
	});

	test('allows resolved swatch metadata but rejects user dash dimension fields', () => {
		const makeTree = (member: Record<string, unknown>) => ({
			theme: {
				border: {
					$type: 'border',
					pattern: {
						$value: {
							color: '#000000',
							width: 1,
							style: { dashArray: [member, 8], lineCap: 'butt' },
						},
					},
				},
			},
		});

		expect(
			validateThemeSchema(
				makeTree({ value: 4, unit: 'px', _swatchName: 'dimension/dash' }),
				'resolved',
			).valid,
		).toBe(true);
		expect(
			validateThemeSchema(
				makeTree({ value: 4, unit: 'px', extra: true }),
				'resolved',
			).valid,
		).toBe(false);
		expect(
			validateThemeSchema(
				makeTree({ value: 4, unit: 'px', _swatchName: 'user-value' }),
				'raw',
			).valid,
		).toBe(false);
	});

	test('allows sketch opacity property under theme.state', () => {
		const result = validateThemeSchema({
			theme: {
				state: {
					hover: {
						$type: 'number',
						$value: 0.16,
						$extensions: {
							sketch: {
								property: {
									opacity: true,
								},
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('allows sketch cornerRadius property under theme.radius', () => {
		const result = validateThemeSchema({
			theme: {
				radius: {
					md: {
						$type: 'dimension',
						$value: { value: 8, unit: 'px' },
						$extensions: {
							sketch: {
								property: {
									cornerRadius: true,
								},
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('rejects sketch opacity property under theme.radius', () => {
		const result = validateThemeSchema({
			theme: {
				radius: {
					md: {
						$type: 'number',
						$value: 8,
						$extensions: {
							sketch: {
								property: {
									opacity: true,
								},
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes(
					'sketch.property.opacity must be under a dimension or state root',
				),
			),
		).toBe(true);
	});
});
