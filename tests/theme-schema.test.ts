import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';

describe('theme schema', () => {
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
