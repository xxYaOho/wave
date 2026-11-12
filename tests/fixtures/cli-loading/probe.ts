import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../../', import.meta.url));

// Register before the CLI is imported: Commander may call process.exit for help.
process.on('exit', () => {
	const modules = Object.keys(require.cache)
		.filter((file) => file.startsWith(root))
		.map((file) => file.slice(root.length))
		.sort();
	console.error(
		`WAVE_MODULE_CACHE:${JSON.stringify({ bun: Bun.version, modules })}`,
	);
});

// A test-side positive control, with no production observer or environment hook.
if (process.env.WAVE_PROBE_POSITIVE === '1') {
	await import('../../../src/core/pipeline/theme-service.ts');
}
