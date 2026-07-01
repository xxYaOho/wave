import { ExitCode } from '../../types/index.ts';

export class CircularReferenceError extends Error {
	public readonly exitCode = ExitCode.INVALID_PARAMETER;
	constructor(public readonly path: string[]) {
		super(`Circular reference detected: ${path.join(' -> ')}`);
		this.name = 'CircularReferenceError';
	}
}

export interface UnresolvedReference {
	ref: string;
	location: string;
}

export class UnresolvedReferenceError extends Error {
	public readonly exitCode = ExitCode.INVALID_PARAMETER;
	constructor(public readonly references: UnresolvedReference[]) {
		const details = references
			.map((r) => `  - ${r.ref} at ${r.location}`)
			.join('\n');
		super(`Unresolved theme references found:\n${details}`);
		this.name = 'UnresolvedReferenceError';
	}
}

export class ExtendsCycleError extends Error {
	public readonly exitCode = ExitCode.INVALID_PARAMETER;
	constructor(public readonly path: string[]) {
		super(`Circular $extends detected: ${path.join(' -> ')}`);
		this.name = 'ExtendsCycleError';
	}
}
