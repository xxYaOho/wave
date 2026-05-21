import {
	DefaultToolResolver,
	getToolRequirements,
	type ToolModule,
	type ToolResolution,
	type ToolResolver,
} from '../tools/index.ts';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';
export type DoctorIssueSeverity = 'error' | 'warning';

export interface DoctorIssue {
	code: string;
	title: string;
	description: string;
	fix?: string;
	affects?: string[];
	severity: DoctorIssueSeverity;
	module: ToolModule;
	path?: string;
	line?: number;
}

export interface CheckResult {
	id: string;
	name: string;
	status: CheckStatus;
	message: string;
	details?: string[];
	issues: DoctorIssue[];
	durationMs?: number;
}

export interface ToolchainDoctorResult {
	ok: boolean;
	module: ToolModule;
	checks: CheckResult[];
	issues: DoctorIssue[];
}

export interface ToolchainDoctorOptions {
	module: ToolModule;
	resolver?: ToolResolver;
}

export async function runToolchainDoctor(
	options: ToolchainDoctorOptions,
): Promise<ToolchainDoctorResult> {
	const resolver = options.resolver ?? new DefaultToolResolver();
	const definitions = getToolRequirements(options.module);
	const checks: CheckResult[] = [];

	for (const definition of definitions) {
		const started = performance.now();
		const resolution = await resolver.resolveCapability(definition.requirement);
		const check = toCheckResult({
			module: definition.module,
			requiredFor: definition.requiredFor,
			resolution,
			durationMs: performance.now() - started,
		});
		checks.push(options.module === 'core' ? downgradeToWarning(check) : check);
	}

	const issues = checks.flatMap((check) => check.issues);
	return {
		ok: !issues.some((issue) => issue.severity === 'error'),
		module: options.module,
		checks,
		issues,
	};
}

function downgradeToWarning(check: CheckResult): CheckResult {
	if (check.status !== 'fail') return check;
	return {
		...check,
		status: 'warn',
		issues: check.issues.map((issue) => ({
			...issue,
			severity: 'warning',
		})),
	};
}

function toCheckResult(input: {
	module: ToolModule;
	requiredFor: string;
	resolution: ToolResolution;
	durationMs: number;
}): CheckResult {
	const selected = input.resolution.selected;
	const details = input.resolution.candidates.map((candidate) => {
		const status = candidate.available ? 'available' : 'missing';
		const suffix = candidate.version ?? candidate.missingReason;
		return `${candidate.name}: ${status}${suffix ? ` (${suffix})` : ''}`;
	});

	if (selected) {
		return {
			id: `${input.module}:${input.resolution.requirement.capability}`,
			name: input.requiredFor,
			status: 'pass',
			message: `${input.requiredFor}: ${selected.name}`,
			details,
			issues: [],
			durationMs: input.durationMs,
		};
	}

	const issue = createMissingToolIssue(input);
	const status = issue.severity === 'warning' ? 'warn' : 'fail';
	return {
		id: `${input.module}:${input.resolution.requirement.capability}`,
		name: input.requiredFor,
		status,
		message: `${input.requiredFor}: missing`,
		details,
		issues: [issue],
		durationMs: input.durationMs,
	};
}

function createMissingToolIssue(input: {
	module: ToolModule;
	requiredFor: string;
	resolution: ToolResolution;
}): DoctorIssue {
	const prefix = input.module === 'motion' ? 'WMG' : 'WCP';
	const commands = input.resolution.candidates
		.map((candidate) => candidate.name)
		.join(' or ');
	return {
		code: `${prefix}_TOOL_MISSING`,
		title: `Missing tool for ${input.requiredFor}`,
		description:
			input.resolution.missingReason ??
			`Install ${commands} to enable ${input.requiredFor}.`,
		fix: `Run wave ${input.module} install --check for the recommended tool list.`,
		affects: [input.requiredFor],
		severity: input.module === 'core' ? 'warning' : 'error',
		module: input.module,
	};
}
