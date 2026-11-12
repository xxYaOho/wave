import * as yaml from 'js-yaml';
import type { DtcgTokenGroup, ParseError, ThemeYamlResult } from '../../types';
import {
	isTokenCache,
	makeTokenCacheKey,
	normalizeCachePath,
	sha256,
	type TokenCache,
} from '../pipeline/token-cache.ts';

export function parseThemeYaml(
	content: string,
	cacheOrSource?: TokenCache | string,
	sourcePathOrCache?: string | TokenCache,
): ThemeYamlResult | ParseError {
	const cache = isTokenCache(cacheOrSource)
		? cacheOrSource
		: isTokenCache(sourcePathOrCache)
			? sourcePathOrCache
			: undefined;
	const sourcePath =
		typeof cacheOrSource === 'string'
			? cacheOrSource
			: typeof sourcePathOrCache === 'string'
				? sourcePathOrCache
				: '<inline>';
	const cacheKey = cache
		? makeTokenCacheKey('parse', {
				parserVersion: 'theme-yaml-v1',
				sourcePath: normalizeCachePath(sourcePath),
				contentSha256: sha256(content),
			})
		: undefined;
	if (cache && cacheKey) {
		const cached = cache.get<ThemeYamlResult>('parse', cacheKey);
		if (cached) return cached;
	}

	let result: ThemeYamlResult | ParseError;
	try {
		if (content.trim() === '') {
			result = {
				line: 1,
				message: 'YAML 文件为空',
			};
			return result;
		}

		const parsed = yaml.load(content) as Record<string, unknown>;

		if (!parsed || typeof parsed !== 'object') {
			result = {
				line: 1,
				message: '无效的 YAML 格式：内容为空或不是对象',
			};
			return result;
		}

		result = {
			raw: parsed as DtcgTokenGroup,
		};
	} catch (error) {
		if (error instanceof yaml.YAMLException) {
			result = {
				line: error.mark?.line ? error.mark.line + 1 : 1,
				message: `YAML 语法错误: ${error.message}`,
			};
		} else {
			result = {
				line: 1,
				message: `解析错误: ${error instanceof Error ? error.message : '未知错误'}`,
			};
		}
	}
	if (cache && cacheKey && 'raw' in result) {
		return cache.set('parse', cacheKey, result);
	}
	return result;
}
