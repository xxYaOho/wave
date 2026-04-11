import { type DoctorRunResult, type DoctorThemeReport, type DoctorNamedPair, ExitCode } from '../../types/index.ts';
import { checkBuiltinResources, checkOutputDir, createConfigCheck } from '../validator/index.ts';
import { type DoctorCheck } from './runner.ts';
import { extractDoctorPairs } from './pair-extractor.ts';
import { evaluateContrast } from './contrast-evaluator.ts';
import type { ResolvedTokenGroup } from '../../types/index.ts';

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

async function checkBunVersion(): Promise<DoctorRunResult> {
  const currentVersion = Bun.version;
  const minVersion = '1.0.0';
  const passed = compareVersions(currentVersion, minVersion) >= 0;
  return {
    ok: passed,
    blockingErrors: passed
      ? []
      : [{
          level: 'error',
          message: `Bun version v${currentVersion} (requires >= v${minVersion})`,
        }],
    reports: [],
  };
}

function wrapLegacyCheck(
  result: { success: boolean; message: string }
): DoctorRunResult {
  return {
    ok: result.success,
    blockingErrors: result.success
      ? []
      : [{ level: 'error', message: result.message }],
    reports: [],
  };
}

function lookupResolved(tree: ResolvedTokenGroup, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = tree;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function createDoctorRegistry(options: {
  themefilePath?: string;
  outputPath?: string;
  themeMode?: boolean;
}): DoctorCheck[] {
  const checks: DoctorCheck[] = [
    { name: 'Bun Version', run: checkBunVersion },
    {
      name: 'Built-in Resources',
      run: async () => wrapLegacyCheck(checkBuiltinResources()),
    },
    {
      name: 'Config File',
      run: async () => {
        if (!options.themefilePath) {
          return {
            ok: true,
            blockingErrors: [],
            reports: [],
          };
        }
        const checkFn = createConfigCheck(options.themefilePath);
        const result = await checkFn();
        return wrapLegacyCheck(result);
      },
    },
    {
      name: 'Output Directory',
      run: async () => wrapLegacyCheck(checkOutputDir(options.outputPath)),
    },
  ];

  if (options.themeMode) {
    checks.push({
      name: 'Theme Contrast',
      run: async () => {
        // Context and pair data are injected by the CLI layer
        return { ok: true, blockingErrors: [], reports: [] };
      },
    });
  }

  return checks;
}

export async function runThemeContrastCheck(
  context: {
    resolvedTree: ResolvedTokenGroup;
    doctorConfig?: Record<string, unknown>;
  }
): Promise<DoctorRunResult> {
  if (!context.doctorConfig) {
    return { ok: true, blockingErrors: [], reports: [] };
  }

  const { pairs, errors } = extractDoctorPairs(context.doctorConfig, context.resolvedTree);

  if (errors.length > 0) {
    return { ok: false, blockingErrors: errors, reports: [] };
  }

  const reports: DoctorThemeReport[] = [];
  const blockingErrors: DoctorFinding[] = [];

  for (const pair of pairs) {
    const bgNode = lookupResolved(context.resolvedTree, pair.backgroundPath);
    const fgNode = lookupResolved(context.resolvedTree, pair.foregroundPath);
    const bgValue =
      typeof bgNode === 'object' && bgNode !== null
        ? (bgNode as Record<string, unknown>).$value
        : undefined;
    const fgValue =
      typeof fgNode === 'object' && fgNode !== null
        ? (fgNode as Record<string, unknown>).$value
        : undefined;

    const evalResult = evaluateContrast(bgValue, fgValue);
    if (!evalResult.success) {
      blockingErrors.push({
        level: 'error',
        message: evalResult.error || 'Contrast evaluation failed',
        pair,
      });
      continue;
    }

    reports.push({
      pair,
      ratio: evalResult.ratio!,
      scores: evalResult.scores!,
      findings: [],
    });
  }

  if (blockingErrors.length > 0) {
    return { ok: false, blockingErrors, reports };
  }

  return { ok: true, blockingErrors: [], reports };
}
