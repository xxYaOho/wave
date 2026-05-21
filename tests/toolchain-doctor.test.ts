import { describe, expect, test } from 'bun:test';
import {
	runToolchainDoctor,
	type ToolchainDoctorOptions,
} from '../src/core/doctor/toolchain.ts';
import type {
	ToolRequirement,
	ToolResolution,
	ToolResolver,
} from '../src/core/tools/index.ts';

class FakeResolver implements ToolResolver {
	constructor(private readonly available: Set<string>) {}

	async resolveCapability(
		requirement: ToolRequirement,
	): Promise<ToolResolution> {
		const names = requirement.preferred ?? [];
		const candidates = names.map((name) => ({
			name,
			command: name,
			available: this.available.has(name),
			version: this.available.has(name) ? `${name} 1.0.0` : undefined,
			missingReason: this.available.has(name) ? undefined : 'not installed',
		}));
		return {
			requirement,
			selected: candidates.find((candidate) => candidate.available),
			candidates,
			missingReason: candidates.some((candidate) => candidate.available)
				? undefined
				: `Missing tool for ${requirement.capability}`,
		};
	}
}

describe('toolchain doctor', () => {
	test('reports WCP_TOOL_MISSING for missing compress tools', async () => {
		const options: ToolchainDoctorOptions = {
			module: 'compress',
			resolver: new FakeResolver(new Set()),
		};

		const result = await runToolchainDoctor(options);

		expect(result.ok).toBe(false);
		expect(
			result.issues.some((issue) => issue.code === 'WCP_TOOL_MISSING'),
		).toBe(true);
	});

	test('passes when motion tools are available', async () => {
		const result = await runToolchainDoctor({
			module: 'motion',
			resolver: new FakeResolver(new Set(['gifski', 'apngasm'])),
		});

		expect(result.ok).toBe(true);
		expect(result.issues).toHaveLength(0);
	});
});
