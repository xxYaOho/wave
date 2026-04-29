import { describe, expect, test } from 'bun:test';
import { parseThemefile } from '../src/core/parser/themefile.ts';

describe('parseThemefile GROUP directive', () => {
	test('no GROUP → groups is empty array', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
PARAMETER output ./build
`;
		const result = parseThemefile(content);
		expect('resources' in result).toBe(true);
		if ('resources' in result) {
			expect(result.groups).toEqual([]);
		}
	});

	test('GROUP { } (anonymous) → name is undefined', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP {
  PARAMETER platform css
}
`;
		const result = parseThemefile(content);
		expect('resources' in result).toBe(true);
		if ('resources' in result) {
			expect(result.groups).toHaveLength(1);
			expect(result.groups[0].name).toBeUndefined();
			expect(result.groups[0].PARAMETER).toEqual({ platform: 'css' });
		}
	});

	test('GROUP "css" { } (named) → name is "css"', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP "css" {
  PARAMETER platform css
  PARAMETER filterLayer 3
}
`;
		const result = parseThemefile(content);
		expect('resources' in result).toBe(true);
		if ('resources' in result) {
			expect(result.groups).toHaveLength(1);
			expect(result.groups[0].name).toBe('css');
			expect(result.groups[0].PARAMETER).toEqual({
				platform: 'css',
				filterLayer: '3',
			});
		}
	});

	test('multiple GROUPs → multiple entries', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP "css" {
  PARAMETER platform css
}
GROUP "sketch" {
  PARAMETER platform sketch
  PARAMETER output ./build/sketch
}
`;
		const result = parseThemefile(content);
		expect('resources' in result).toBe(true);
		if ('resources' in result) {
			expect(result.groups).toHaveLength(2);
			expect(result.groups[0].name).toBe('css');
			expect(result.groups[1].name).toBe('sketch');
			expect(result.groups[1].PARAMETER.output).toBe('./build/sketch');
		}
	});

	test('unclosed GROUP → error with name', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP "css" {
  PARAMETER platform css
`;
		const result = parseThemefile(content);
		expect('line' in result).toBe(true);
		if ('line' in result) {
			expect(result.message).toContain('Unterminated GROUP block');
			expect(result.message).toContain('css');
		}
	});

	test('unclosed anonymous GROUP → error with (anonymous)', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP {
  PARAMETER platform css
`;
		const result = parseThemefile(content);
		expect('line' in result).toBe(true);
		if ('line' in result) {
			expect(result.message).toContain('Unterminated GROUP block');
			expect(result.message).toContain('(anonymous)');
		}
	});

	test('stray } → error', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
}
`;
		const result = parseThemefile(content);
		expect('line' in result).toBe(true);
		if ('line' in result) {
			expect(result.message).toContain('Unexpected closing }');
		}
	});

	test('THEME inside GROUP → error', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP "css" {
  THEME other
}
`;
		const result = parseThemefile(content);
		expect('line' in result).toBe(true);
		if ('line' in result) {
			expect(result.message).toContain('Only PARAMETER is allowed inside GROUP');
		}
	});

	test('RESOURCE inside GROUP → error', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP "css" {
  RESOURCE palette other
}
`;
		const result = parseThemefile(content);
		expect('line' in result).toBe(true);
		if ('line' in result) {
			expect(result.message).toContain('Only PARAMETER is allowed inside GROUP');
		}
	});

	test('comments and empty lines inside GROUP are skipped', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP "css" {
  # this is a comment
  PARAMETER platform css

  PARAMETER filterLayer 2
}
`;
		const result = parseThemefile(content);
		expect('resources' in result).toBe(true);
		if ('resources' in result) {
			expect(result.groups).toHaveLength(1);
			expect(result.groups[0].PARAMETER).toEqual({
				platform: 'css',
				filterLayer: '2',
			});
		}
	});

	test('empty GROUP → empty PARAMETER', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
GROUP "empty" {
}
`;
		const result = parseThemefile(content);
		expect('resources' in result).toBe(true);
		if ('resources' in result) {
			expect(result.groups).toHaveLength(1);
			expect(result.groups[0].name).toBe('empty');
			expect(result.groups[0].PARAMETER).toEqual({});
		}
	});

	test('global PARAMETER mixed with GROUP PARAMETER', () => {
		const content = `
THEME test
RESOURCE palette leonardo
RESOURCE dimension wave
PARAMETER output ./build
PARAMETER colorSpace hex
GROUP "css" {
  PARAMETER platform css
  PARAMETER output ./build/css
}
`;
		const result = parseThemefile(content);
		expect('resources' in result).toBe(true);
		if ('resources' in result) {
			expect(result.PARAMETER).toEqual({
				output: './build',
				colorSpace: 'hex',
			});
			expect(result.groups).toHaveLength(1);
			expect(result.groups[0].PARAMETER).toEqual({
				platform: 'css',
				output: './build/css',
			});
		}
	});
});
