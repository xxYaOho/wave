export type EnvOverrides = Record<string, string | undefined>;

export async function withEnv<T>(
	overrides: EnvOverrides,
	fn: () => Promise<T>,
): Promise<T> {
	const previous = new Map<string, string | undefined>();
	for (const key of Object.keys(overrides)) {
		previous.set(key, process.env[key]);
		const next = overrides[key];
		if (next === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = next;
		}
	}

	try {
		return await fn();
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}
