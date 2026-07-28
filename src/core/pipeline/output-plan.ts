import { planTokenOutputs } from '../generator/index.ts';

export interface BuildPassOutputInput {
	id: string;
	themeName: string;
	outputDir: string;
	platforms: string[];
}

export type BuildOutputPlanResult =
	| {
			ok: true;
			passes: Array<{
				id: string;
				outputs: Extract<
					ReturnType<typeof planTokenOutputs>,
					{ ok: true }
				>['outputs'];
			}>;
	  }
	| { ok: false; error: string };

export function planBuildOutputs(
	inputs: BuildPassOutputInput[],
): BuildOutputPlanResult {
	const ownerByPath = new Map<string, string>();
	const passes: Extract<BuildOutputPlanResult, { ok: true }>['passes'] = [];

	for (const input of inputs) {
		const plan = planTokenOutputs({
			themeName: input.themeName,
			outputDir: input.outputDir,
			platform: input.platforms,
		});
		if (!plan.ok) return plan;

		for (const output of plan.outputs) {
			// filePath is deliberately lexical: no realpath, case folding, or Unicode normalization.
			const owner = ownerByPath.get(output.filePath);
			if (owner !== undefined) {
				return {
					ok: false,
					error: `Output path collision: "${output.filePath}" is produced by passes "${owner}" and "${input.id}"`,
				};
			}
			ownerByPath.set(output.filePath, input.id);
		}
		passes.push({ id: input.id, outputs: plan.outputs });
	}

	return { ok: true, passes };
}
