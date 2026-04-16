import { describe, expect, test } from 'bun:test';
import { extractDoctorPairs } from '../src/core/doctor/pair-extractor.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';

function buildResolved(obj: Record<string, unknown>): ResolvedTokenGroup {
	return obj as ResolvedTokenGroup;
}

describe('extractDoctorPairs', () => {
	test('extracts pairs from valid wcagPairs config', () => {
		const wcagPairs = {
			'primary-main': {
				foreground: '{theme.color.onPrimary}',
				background: '{theme.color.primary}',
			},
		};

		const resolved = buildResolved({
			theme: {
				color: {
					primary: { $type: 'color', $value: '#000000' },
					onPrimary: { $type: 'color', $value: '#ffffff' },
				},
			},
		});

		const { pairs, errors } = extractDoctorPairs(wcagPairs, resolved);
		expect(pairs).toHaveLength(1);
		expect(errors).toHaveLength(0);
		expect(pairs[0]).toEqual({
			name: 'primary-main',
			foregroundPath: 'theme.color.onPrimary',
			backgroundPath: 'theme.color.primary',
		});
	});

	test('returns empty when wcagPairs is empty', () => {
		const { pairs, errors } = extractDoctorPairs({}, buildResolved({}));
		expect(pairs).toHaveLength(0);
		expect(errors).toHaveLength(0);
	});

	test('reports error for unresolved foreground', () => {
		const wcagPairs = {
			'bad-pair': {
				foreground: '{theme.color.missing}',
				background: '{theme.color.primary}',
			},
		};

		const resolved = buildResolved({
			theme: {
				color: {
					primary: { $type: 'color', $value: '#000000' },
				},
			},
		});

		const { pairs, errors } = extractDoctorPairs(wcagPairs, resolved);
		expect(pairs).toHaveLength(0);
		expect(errors).toHaveLength(1);
		expect(errors[0]!.message).toContain('foreground references unresolved');
	});

	test('reports error for unresolved background', () => {
		const wcagPairs = {
			'bad-pair': {
				foreground: '{theme.color.onPrimary}',
				background: '{theme.color.missing}',
			},
		};

		const resolved = buildResolved({
			theme: {
				color: {
					onPrimary: { $type: 'color', $value: '#ffffff' },
				},
			},
		});

		const { pairs, errors } = extractDoctorPairs(wcagPairs, resolved);
		expect(pairs).toHaveLength(0);
		expect(errors).toHaveLength(1);
		expect(errors[0]!.message).toContain('background references unresolved');
	});

	test('reports error for non-color foreground target', () => {
		const wcagPairs = {
			'bad-pair': {
				foreground: '{theme.shadow.raised}',
				background: '{theme.color.primary}',
			},
		};

		const resolved = buildResolved({
			theme: {
				color: {
					primary: { $type: 'color', $value: '#000000' },
				},
				shadow: {
					raised: {
						$type: 'shadow',
						$value: {
							color: '#000',
							offsetX: 0,
							offsetY: 4,
							blur: 8,
							spread: 0,
						},
					},
				},
			},
		});

		const { pairs, errors } = extractDoctorPairs(wcagPairs, resolved);
		expect(pairs).toHaveLength(0);
		expect(errors).toHaveLength(1);
		expect(errors[0]!.message).toContain('foreground must be a color token');
	});

	test('reports error for invalid pair entry (not object)', () => {
		const wcagPairs = {
			'bad-pair': 'invalid',
		};

		const resolved = buildResolved({
			theme: {
				color: {
					primary: { $type: 'color', $value: '#000' },
				},
			},
		});

		const { pairs, errors } = extractDoctorPairs(wcagPairs, resolved);
		expect(pairs).toHaveLength(0);
		expect(errors).toHaveLength(1);
		expect(errors[0]!.message).toContain('must be an object');
	});
});
