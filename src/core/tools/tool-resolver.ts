import type { CommandRunner } from './command-runner.ts';

export type ToolCapability = 'encode-gif' | 'encode-apng';
export type ToolMode = 'safe' | 'quality' | 'encode';

export interface ToolCandidate {
	name: string;
	command: string;
	available: boolean;
	version?: string;
	missingReason?: string;
}

export interface ToolRequirement {
	capability: ToolCapability;
	mode?: ToolMode;
	preferred?: string[];
}

export interface ToolResolution {
	requirement: ToolRequirement;
	selected?: ToolCandidate;
	candidates: ToolCandidate[];
	missingReason?: string;
}

export interface ToolResolver {
	resolveCapability(requirement: ToolRequirement): Promise<ToolResolution>;
}

const DEFAULT_CANDIDATES: Record<ToolCapability, string[]> = {
	'encode-gif': ['gifski'],
	'encode-apng': ['apngasm'],
};

export class LocalToolResolver implements ToolResolver {
	constructor(private readonly runner: CommandRunner) {}

	async resolveCapability(
		requirement: ToolRequirement,
	): Promise<ToolResolution> {
		const names = requirement.preferred?.length
			? requirement.preferred
			: DEFAULT_CANDIDATES[requirement.capability];
		const candidates = await Promise.all(
			names.map((name) => this.resolveCandidate(name)),
		);

		const selected = candidates.find((candidate) => candidate.available);

		return {
			requirement,
			selected,
			candidates,
			missingReason: selected
				? undefined
				: `Missing tool for ${requirement.capability}: ${names.join(' or ')}`,
		};
	}

	private async resolveCandidate(name: string): Promise<ToolCandidate> {
		const versionResult = await this.runner.run({
			command: name,
			args: ['--version'],
		});
		if (versionResult.exitCode === 0) {
			return {
				name,
				command: name,
				available: true,
				version:
					firstLine(versionResult.stdout) ??
					firstLine(versionResult.stderr) ??
					'available',
			};
		}

		return {
			name,
			command: name,
			available: false,
			missingReason:
				firstLine(versionResult.stderr) ??
				firstLine(versionResult.stdout) ??
				'not found',
		};
	}
}

function firstLine(value: string): string | undefined {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);
}
