import { describe, expect, test } from 'bun:test';
import {
	type CommandRunner,
	DefaultToolResolver,
	type PlannedCommand,
} from '../src/core/tools/index.ts';

class FakeRunner implements CommandRunner {
	constructor(private readonly available: Record<string, string>) {}

	async run(command: PlannedCommand) {
		const version = this.available[command.command];
		if (version) {
			return { exitCode: 0, stdout: version, stderr: '' };
		}
		return {
			exitCode: 127,
			stdout: '',
			stderr: `${command.command}: command not found`,
		};
	}
}

describe('ToolResolver', () => {
	test('selects the first available preferred candidate', async () => {
		const resolver = new DefaultToolResolver({
			runner: new FakeRunner({ mozjpeg: 'mozjpeg 4.1.1' }),
		});

		const resolution = await resolver.resolveCapability({
			capability: 'compress-jpg',
			mode: 'safe',
			preferred: ['jpegtran', 'mozjpeg'],
		});

		expect(resolution.selected?.name).toBe('mozjpeg');
		expect(resolution.candidates.map((candidate) => candidate.name)).toEqual([
			'jpegtran',
			'mozjpeg',
		]);
	});

	test('returns a missing reason when no candidate is available', async () => {
		const resolver = new DefaultToolResolver({
			runner: new FakeRunner({}),
		});

		const resolution = await resolver.resolveCapability({
			capability: 'compress-png',
			mode: 'safe',
			preferred: ['oxipng'],
		});

		expect(resolution.selected).toBeUndefined();
		expect(resolution.missingReason).toContain('compress-png');
		expect(resolution.candidates[0]?.missingReason).toContain(
			'command not found',
		);
	});
});
