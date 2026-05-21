import { TOOL_CANDIDATES, TOOL_VERSION_ARGS } from './catalog.ts';
import { BunCommandRunner } from './command-runner.ts';
import type {
	CommandRunner,
	ToolCandidate,
	ToolRequirement,
	ToolResolution,
	ToolResolver,
} from './types.ts';

export interface DefaultToolResolverOptions {
	runner?: CommandRunner;
}

export class DefaultToolResolver implements ToolResolver {
	private runner: CommandRunner;

	constructor(options: DefaultToolResolverOptions = {}) {
		this.runner = options.runner ?? new BunCommandRunner();
	}

	async resolveCapability(
		requirement: ToolRequirement,
	): Promise<ToolResolution> {
		const candidateNames = this.candidateNames(requirement);
		const candidates = await Promise.all(
			candidateNames.map((name) => this.inspectCandidate(name)),
		);
		const selected = candidates.find((candidate) => candidate.available);

		return {
			requirement,
			selected,
			candidates,
			missingReason: selected
				? undefined
				: `Missing tool for ${requirement.capability}: ${candidateNames.join(' or ')}`,
		};
	}

	private candidateNames(requirement: ToolRequirement): string[] {
		const base = TOOL_CANDIDATES[requirement.capability] ?? [];
		const preferred = requirement.preferred ?? [];
		if (preferred.length > 0) return preferred;
		return [
			...preferred,
			...base.filter((candidate) => !preferred.includes(candidate)),
		];
	}

	private async inspectCandidate(name: string): Promise<ToolCandidate> {
		const args = TOOL_VERSION_ARGS[name] ?? ['--version'];
		try {
			const result = await this.runner.run({ command: name, args });
			const output = `${result.stdout}\n${result.stderr}`.trim();
			if (result.exitCode === 0) {
				return {
					name,
					command: name,
					available: true,
					version: firstLine(output),
				};
			}
			return {
				name,
				command: name,
				available: false,
				missingReason: firstLine(output) || `exit ${result.exitCode}`,
			};
		} catch (error) {
			return {
				name,
				command: name,
				available: false,
				missingReason: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

function firstLine(text: string): string | undefined {
	const line = text
		.split(/\r?\n/)
		.map((part) => part.trim())
		.find(Boolean);
	return line || undefined;
}
