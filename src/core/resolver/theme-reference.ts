export type { UnresolvedReference } from './errors.ts';
export {
	CircularReferenceError,
	ExtendsCycleError,
	UnresolvedReferenceError,
} from './errors.ts';
export { expandExtends } from './extends.ts';
export {
	type ReferenceResolutionResult,
	resolveReferences,
} from './reference-resolution.ts';
