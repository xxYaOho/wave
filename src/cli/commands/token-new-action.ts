import type { Command } from 'commander';
import { runDesignTokenInit, type TokenInitOptions } from './dt-init-action.ts';

export function createTokenNewCommandAction() {
	return async (_options: TokenInitOptions, current: Command) => {
		const options = current.optsWithGlobals<TokenInitOptions>();
		if (options.manual) return;
		await runDesignTokenInit(options);
	};
}
