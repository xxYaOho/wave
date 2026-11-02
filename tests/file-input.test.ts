import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	expandMainYamlEntry,
	resolveExclusiveFileInput,
} from '../src/cli/file-input.ts';

describe('file-input helpers', () => {
	test('exclusive file input rejects both positional and -f', () => {
		const result = resolveExclusiveFileInput('a.yaml', 'b.yaml');
		expect(result.ok).toBe(false);
	});

	test('expandMainYamlEntry only expands directories that contain main.yaml', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-file-input-'));
		try {
			const workspace = path.join(dir, 'theme');
			await fs.mkdir(workspace);
			const main = path.join(workspace, 'main.yaml');
			await fs.writeFile(main, 'theme: {}\n');
			expect(await expandMainYamlEntry(workspace, dir)).toBe(main);

			const emptyDir = path.join(dir, 'empty');
			await fs.mkdir(emptyDir);
			expect(await expandMainYamlEntry(emptyDir, dir)).toBe(emptyDir);

			const weird = path.join(dir, 'nested', 'main.yaml');
			await fs.mkdir(weird, { recursive: true });
			expect(await expandMainYamlEntry(weird, dir)).toBe(weird);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});
});
