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
									fontWeight: '400',
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
			['fontFamily', 'Bad\nFamily'],
			['fontSize', '+14'],
			['fontWeight', '1e2'],
			['lineHeight', { value: 20, unit: 'rem' }],
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

	test('rejects leading and trailing font family control characters', () => {
		for (const fontFamily of ['\u0000Inter', 'Inter\u007f', '\u0085Inter']) {
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
			expect(result.valid, JSON.stringify(fontFamily)).toBe(false);
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

	test('accepts string and DTCG dashArray border styles', () => {
		for (const style of [
			'solid',
			{
				dashArray: [0, 4, '8', '1.5rem', { value: 2, unit: 'pt' }, '25%'],
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
			[0, '0px'],
			[-1, 2],
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
									style: { dashArray },
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

	test('rejects border style objects with fields other than dashArray', () => {
		const result = validateThemeSchema(
			{
				theme: {
					border: {
						$type: 'border',
						pattern: {
							$value: {
								color: '#000000',
								width: 1,
								style: { dashArray: [2, 4], lineCap: 'round' },
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
				path: 'theme.border.pattern.$value.style.lineCap',
			}),
		);
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
							style: { dashArray: [member, 8] },
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
