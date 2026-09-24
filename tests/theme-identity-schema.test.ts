import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';

describe('theme schema token identity', () => {
	test('group node $id is an error and the message names the group path', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$id: 'abc',
					primary: { $type: 'color', $value: '#0066cc' },
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.color.$id',
				level: 'error',
				message: expect.stringContaining('theme.color'),
			}),
		);
		expect(
			result.issues.find((issue) => issue.level === 'error')?.message,
		).toContain('$id is only supported');
	});

	test('nested group $id reports the full group path', () => {
		const result = validateThemeSchema({
			theme: {
				radius: {
					round: {
						$id: null,
						sm: { $type: 'dimension', $value: '4px' },
					},
				},
			},
		});

		expect(result.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.radius.round.$id',
				level: 'error',
			}),
		);
	});

	test('token $id missing key is legal (unregistered)', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					primary: { $value: '#0066cc' },
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('token $id null is a legal pre-declared empty slot', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					primary: { $value: '#0066cc', $id: null },
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('token $id empty or whitespace-only strings are legal empty slots', () => {
		for (const id of ['', '   ', '\t\n']) {
			const result = validateThemeSchema({
				theme: {
					color: {
						$type: 'color',
						primary: { $value: '#0066cc', $id: id },
					},
				},
			});
			expect(result.valid, JSON.stringify(id)).toBe(true);
			expect(result.issues, JSON.stringify(id)).toEqual([]);
		}
	});

	test('token $id non-empty string is a legal identity of any form', () => {
		for (const id of [
			'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
			'brand-legacy-id',
			'id-with-Ünïcödé',
		]) {
			const result = validateThemeSchema({
				theme: {
					color: {
						$type: 'color',
						primary: { $value: '#0066cc', $id: id },
					},
				},
			});
			expect(result.valid, JSON.stringify(id)).toBe(true);
			expect(result.issues, JSON.stringify(id)).toEqual([]);
		}
	});

	test('token $id non-string non-null values are errors', () => {
		for (const id of [42, true, { nested: true }, ['a']]) {
			const result = validateThemeSchema({
				theme: {
					color: {
						$type: 'color',
						primary: { $value: '#0066cc', $id: id },
					},
				},
			});
			expect(result.valid, JSON.stringify(id)).toBe(false);
			expect(result.issues).toContainEqual(
				expect.objectContaining({
					path: 'theme.color.primary.$id',
					level: 'error',
					message: expect.stringContaining('$id must be a string or null'),
				}),
			);
		}
	});
});

describe('theme schema token body purity (DTCG §6.1)', () => {
	test('$value mixed with child nodes is an error', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					primary: {
						$value: '#0066cc',
						child: { $type: 'color', $value: '#ffffff' },
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.color.primary',
				level: 'error',
				message: expect.stringContaining('cannot mix $value with child nodes'),
			}),
		);
	});

	test('$value with meta-only siblings ($type/$description/$extensions) stays legal', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					primary: {
						$value: '#0066cc',
						$description: 'brand',
						$extensions: { platform: { sketch: { skip: true } } },
					},
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('_-prefixed runtime metadata keys are not authored children', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					primary: {
						$value: '#0066cc',
						_colorReference: '{theme.color.base}',
						_swatchName: 'brand',
					},
				},
			},
		});

		// Runtime metadata injected during resolution never trips §6.1.
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('_-prefixed keys do not excuse real authored children', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					primary: {
						$value: '#0066cc',
						_runtime: 'ignored',
						child: { $type: 'color', $value: '#ffffff' },
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				path: 'theme.color.primary',
				level: 'error',
				message: expect.stringContaining('(child)'),
			}),
		);
	});
});
