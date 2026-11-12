import { createHash } from 'node:crypto';
import * as path from 'node:path';

/** The cache policy is intentionally versioned so key changes cannot collide. */
export const TOKEN_CACHE_POLICY_VERSION = 'p1a-cache-v1';
export const TOKEN_CACHE_CAPACITY = 1024;

export const TOKEN_CACHE_LAYERS = [
	'loadResource',
	'dictionary',
	'parse',
	'color',
] as const;

export type TokenCacheLayer = (typeof TOKEN_CACHE_LAYERS)[number];

export interface TokenCacheStats {
	hits: number;
	misses: number;
	degraded: number;
}

export type TokenCacheStatsMap = Record<TokenCacheLayer, TokenCacheStats>;

/**
 * A deterministic, type-tagged JSON representation used by every cache key.
 * Objects are sorted recursively while arrays retain authored order and mark
 * sparse slots explicitly, so authored values cannot collide with sentinels.
 */
export function canonicalSerialize(value: unknown): string {
	function encode(input: unknown, ancestors: WeakSet<object>): unknown {
		if (input === undefined) return ['undefined'];
		if (input === null) return ['null'];
		if (typeof input === 'string') return ['string', input];
		if (typeof input === 'boolean') return ['boolean', input];
		if (typeof input === 'number') {
			if (Number.isNaN(input)) return ['number', 'NaN'];
			if (input === Number.POSITIVE_INFINITY) return ['number', '+Infinity'];
			if (input === Number.NEGATIVE_INFINITY) return ['number', '-Infinity'];
			if (Object.is(input, -0)) return ['number', '-0'];
			return ['number', String(input)];
		}
		if (typeof input === 'bigint') return ['bigint', input.toString()];
		if (typeof input === 'function') return ['function', String(input)];
		if (typeof input === 'symbol') return ['symbol', String(input)];

		if (ancestors.has(input)) {
			throw new TypeError('Cannot canonicalize a cyclic value');
		}
		ancestors.add(input);
		try {
			if (Array.isArray(input)) {
				return [
					'array',
					input.map((item, index) =>
						Object.hasOwn(input, index) ? encode(item, ancestors) : ['hole'],
					),
				];
			}
			const object = input as Record<string, unknown>;
			return [
				'object',
				Object.keys(object)
					.sort()
					.map((key) => [key, encode(object[key], ancestors)]),
			];
		} finally {
			ancestors.delete(input);
		}
	}
	return JSON.stringify(encode(value, new WeakSet<object>()));
}

/** Alias kept explicit for callers that describe keys as canonical JSON. */
export const canonicalJson = canonicalSerialize;

export function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeCachePath(value: string, cwd = process.cwd()): string {
	const expanded = value.startsWith('~/')
		? path.join(process.env.HOME ?? cwd, value.slice(2))
		: value;
	return path.normalize(
		path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded),
	);
}

export function isTokenCache(value: unknown): value is TokenCache {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as TokenCache).get === 'function' &&
		typeof (value as TokenCache).set === 'function' &&
		typeof (value as TokenCache).stats === 'function'
	);
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (value === null || typeof value !== 'object') return value;
	if (seen.has(value)) return value;
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor && 'value' in descriptor) {
			deepFreeze(descriptor.value, seen);
		}
	}
	return Object.freeze(value);
}

interface LayerState {
	entries: Map<string, unknown>;
	stats: TokenCacheStats;
	degraded: boolean;
}

export interface TokenCache {
	readonly policyVersion: string;
	get<T>(layer: TokenCacheLayer, key: string): T | undefined;
	set<T>(layer: TokenCacheLayer, key: string, value: T): T;
	memoize<T>(layer: TokenCacheLayer, key: string, producer: () => T): T;
	memoizeAsync<T>(
		layer: TokenCacheLayer,
		key: string,
		producer: () => Promise<T>,
	): Promise<T>;
	stats(layer: TokenCacheLayer): TokenCacheStats;
	stats(): TokenCacheStatsMap;
}

class TokenCacheImpl implements TokenCache {
	readonly policyVersion = TOKEN_CACHE_POLICY_VERSION;
	private readonly layers: Record<TokenCacheLayer, LayerState> = {
		loadResource: createLayerState(),
		dictionary: createLayerState(),
		parse: createLayerState(),
		color: createLayerState(),
	};

	get<T>(layer: TokenCacheLayer, key: string): T | undefined {
		const state = this.layers[layer];
		if (state.degraded) {
			state.stats.degraded += 1;
			return undefined;
		}
		if (!state.entries.has(key)) {
			state.stats.misses += 1;
			return undefined;
		}
		state.stats.hits += 1;
		return state.entries.get(key) as T;
	}

	set<T>(layer: TokenCacheLayer, key: string, value: T): T {
		const state = this.layers[layer];
		if (!state.degraded && !state.entries.has(key)) {
			const frozen = deepFreeze(value);
			state.entries.set(key, frozen);
			if (state.entries.size >= TOKEN_CACHE_CAPACITY) state.degraded = true;
			return frozen;
		}
		return value;
	}

	memoize<T>(layer: TokenCacheLayer, key: string, producer: () => T): T {
		const cached = this.get<T>(layer, key);
		if (cached !== undefined) return cached;
		const value = producer();
		return this.set(layer, key, value);
	}

	async memoizeAsync<T>(
		layer: TokenCacheLayer,
		key: string,
		producer: () => Promise<T>,
	): Promise<T> {
		const cached = this.get<T>(layer, key);
		if (cached !== undefined) return cached;
		const value = await producer();
		return this.set(layer, key, value);
	}

	stats(layer: TokenCacheLayer): TokenCacheStats;
	stats(): TokenCacheStatsMap;
	stats(layer?: TokenCacheLayer): TokenCacheStats | TokenCacheStatsMap {
		if (layer) return { ...this.layers[layer].stats };
		return Object.fromEntries(
			TOKEN_CACHE_LAYERS.map((name) => [name, { ...this.layers[name].stats }]),
		) as TokenCacheStatsMap;
	}
}

function createLayerState(): LayerState {
	return {
		entries: new Map(),
		stats: { hits: 0, misses: 0, degraded: 0 },
		degraded: false,
	};
}

export function createTokenCache(): TokenCache {
	return new TokenCacheImpl();
}

export function makeTokenCacheKey(
	layer: TokenCacheLayer,
	payload: unknown,
): string {
	return canonicalSerialize({
		policyVersion: TOKEN_CACHE_POLICY_VERSION,
		layer,
		payload,
	});
}

export function resourceContentHash(content: string): string {
	return sha256(content);
}

export function memoizeParsed<T>(
	cache: TokenCache | undefined,
	sourcePath: string,
	content: string,
	parserVersion: string,
	producer: () => T,
	isCacheable: (value: T) => boolean = (value) => value !== undefined,
): T {
	if (!cache) return producer();
	const key = makeTokenCacheKey('parse', {
		parserVersion,
		sourcePath: normalizeCachePath(sourcePath),
		contentSha256: sha256(content),
	});
	const cached = cache.get<T>('parse', key);
	if (cached !== undefined) return cached;
	const value = producer();
	if (!isCacheable(value)) return value;
	return cache.set('parse', key, value);
}
