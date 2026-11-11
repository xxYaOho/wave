import type { Locale } from './types.ts';

/** Resolve one browser primary-language tag to the manual locale. */
export function localeFromPrimaryLanguage(language: unknown): Locale {
	if (typeof language !== 'string') return 'en';

	const normalized = language.trim().toLowerCase();
	return normalized === 'zh' || normalized.startsWith('zh-') ? 'zh' : 'en';
}

// Keep the language decision in one implementation while exposing a concise
// name for consumers that do not need to mention the browser input detail.
export const resolveLocale = localeFromPrimaryLanguage;
