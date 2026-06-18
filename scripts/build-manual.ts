import * as path from 'node:path';
import { $ } from 'bun';
import { buildManualData } from '../src/core/manual/build.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const outDir = path.join(rootDir, 'dist/manual-app');
const appDir = path.join(rootDir, 'src/manual-app');

await $`rm -rf ${outDir}`;
await $`vite build ${appDir} --outDir ${outDir} --emptyOutDir`;
await buildManualData({ rootDir, outDir });

console.log(`Built Wave manual app at ${outDir}`);
