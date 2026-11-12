/**
 * Public compatibility surface for the terminal manual reader.
 *
 * The implementation lives with the CLI manual renderer so ordinary command
 * help paths do not eagerly load a core/manual module. Consumers that import
 * this domain-facing path retain the same API.
 */
export type {
	ManualTextRequest,
	ManualTextResult,
} from '../../cli/manual-markdown.ts';
export {
	ManualTextReaderError,
	normalizeManualText,
	readManualText,
	resolveManualTextAppDir,
	resolveManualTextRequest,
} from '../../cli/manual-markdown.ts';
