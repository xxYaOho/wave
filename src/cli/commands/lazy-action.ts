/** The loader alone owns module-load failures; handler rejections stay command failures. */
export class CommandLoadError extends Error {
	constructor(command: string, cause: unknown) {
		super(
			`Failed to load command ${command}: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ cause },
		);
		this.name = 'CommandLoadError';
	}
}

/**
 * Forward Commander positional arguments, options and the live Command, in their
 * original order and with their original receiver. Return the handler result;
 * only a rejected loader is wrapped. Business failures are never reclassified.
 */
export function lazyAction<Args extends unknown[], Result>(
	command: string,
	load: () => Promise<(...args: Args) => Result>,
): (this: unknown, ...args: Args) => Promise<Awaited<Result>> {
	return async function (...args: Args): Promise<Awaited<Result>> {
		let action: (...args: Args) => Result;
		try {
			action = await load();
		} catch (cause) {
			throw new CommandLoadError(command, cause);
		}
		return await action.apply(this, args);
	};
}
