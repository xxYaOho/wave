import { plugin } from 'bun';

// Replace a real lazy import, without changing production source or its loader.
plugin({
	name: 'cli-action-failure-injection',
	setup(build) {
		build.onLoad({ filter: /\/commands\/build-action\.ts$/ }, () => {
			const mode = process.env.WAVE_INJECT_FAILURE;
			if (mode === 'load') {
				return {
					loader: 'js',
					contents: `throw new Error('injected module rejection'); export function createDesignTokenBuildCommandAction() {}`,
				};
			}
			return {
				loader: 'js',
				contents: `export function createDesignTokenBuildCommandAction() {
					return async () => {
						console.log('business-start');
						${mode === 'business' ? "throw new Error('injected business rejection');" : "console.error('business-invalid'); process.exitCode = 5;"}
					};
				}`,
			};
		});
	},
});
