import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';

describe('theme schema', () => {
	test('accepts DTCG typography type', () => {
		const result = validateThemeSchema({
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
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
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
