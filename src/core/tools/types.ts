export type ToolMode = 'safe' | 'quality' | 'encode';

export type ToolCapability =
	| 'compress-png'
	| 'compress-jpg'
	| 'compress-svg'
	| 'compress-gif'
	| 'encode-gif'
	| 'encode-apng';

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

export interface PlannedCommand {
	command: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
}

export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface CommandRunner {
	run(command: PlannedCommand): Promise<CommandResult>;
}

export interface ToolResolver {
	resolveCapability(requirement: ToolRequirement): Promise<ToolResolution>;
}

export type ToolModule = 'core' | 'compress' | 'motion';

export interface ToolRequirementDefinition {
	module: ToolModule;
	requirement: ToolRequirement;
	requiredFor: string;
}
