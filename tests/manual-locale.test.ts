import { describe, expect, test } from 'bun:test';
import { localeFromPrimaryLanguage } from '../src/core/manual/locale.ts';
import type { Locale } from '../src/core/manual/types.ts';

describe('manual locale selection', () => {
	const cases: Array<[unknown, Locale]> = [
		['zh', 'zh'],
		['zh-CN', 'zh'],
		['zh-TW', 'zh'],
		['zh-Hans', 'zh'],
		['zh-Hant', 'zh'],
		['ZH', 'zh'],
		['zh-tw', 'zh'],
		['en', 'en'],
		['en-US', 'en'],
		['fr', 'en'],
		['', 'en'],
		[' zh-CN ', 'zh'],
		['zh_CN', 'en'],
		[null, 'en'],
		[undefined, 'en'],
		[42, 'en'],
	];

	test.each(cases)('maps %p to %s', (language, expected) => {
		expect(localeFromPrimaryLanguage(language)).toBe(expected);
	});

	test('uses only the primary language tag', () => {
		expect(localeFromPrimaryLanguage('en-US,zh-CN;q=0.9')).toBe('en');
	});
});
