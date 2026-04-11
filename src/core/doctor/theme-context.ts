import * as path from 'node:path';
import {
  type DoctorFinding,
  type DtcgTokenGroup,
  type ReferenceDataSources,
  type ResolvedTokenGroup,
  type ParsedThemefile,
  ExitCode,
} from '../../types/index.ts';
import { parseThemeYaml } from '../parser/theme-yaml.ts';
import {
  expandExtends,
  resolveReferences,
} from '../resolver/theme-reference.ts';
import { validateThemeSchema } from '../schema/theme.ts';
import {
  loadThemefile,
  buildDependencyDictionary,
  type DependencyDict,
} from '../pipeline/theme-pipeline.ts';

export interface ThemeDoctorContext {
  themeDir: string;
  themefilePath: string;
  parsed: ParsedThemefile;
  dict: DependencyDict;
  expandedTree: DtcgTokenGroup;
  resolvedTree: ResolvedTokenGroup;
}

export type ThemeDoctorContextResult =
  | { ok: true; context: ThemeDoctorContext }
  | { ok: false; findings: DoctorFinding[]; exitCode: number };

function isParseError(result: unknown): result is { line: number; message: string } {
  return typeof result === 'object' && result !== null && 'line' in result && 'message' in result;
}

export async function createThemeDoctorContext(
  themefilePath?: string
): Promise<ThemeDoctorContextResult> {
  const loadResult = await loadThemefile(themefilePath);
  if ('error' in loadResult) {
    return {
      ok: false,
      findings: [{
        level: 'error',
        message: loadResult.error.message,
      }],
      exitCode: ExitCode.FILE_NOT_FOUND,
    };
  }

  const { parsed, themeDir, themefilePath: resolvedThemefilePath } = loadResult;
  const dictResult = await buildDependencyDictionary(parsed, themeDir);
  if ('error' in dictResult) {
    return {
      ok: false,
      findings: [{
        level: 'error',
        message: dictResult.error.message,
      }],
      exitCode: ExitCode.FORMAT_ERROR,
    };
  }

  const { dict } = dictResult;
  const mainYamlPath = path.join(themeDir, 'main.yaml');
  const content = await Bun.file(mainYamlPath).text();
  const yamlParsed = parseThemeYaml(content);

  if (isParseError(yamlParsed)) {
    return {
      ok: false,
      findings: [{
        level: 'error',
        message: `Theme YAML parse error: ${yamlParsed.message}`,
      }],
      exitCode: ExitCode.FORMAT_ERROR,
    };
  }

  const schemaResult = validateThemeSchema(yamlParsed.raw);
  if (!schemaResult.valid) {
    const errorMessages = schemaResult.issues
      .filter((i) => i.level === 'error')
      .map((i) => `  [${i.path}] ${i.message}`)
      .join('\n');
    return {
      ok: false,
      findings: [{
        level: 'error',
        message: `Theme schema validation failed:\n${errorMessages}`,
      }],
      exitCode: ExitCode.FORMAT_ERROR,
    };
  }

  const sources: ReferenceDataSources = {};
  for (const [namespace, entry] of Object.entries(dict)) {
    sources[namespace] = entry.data;
  }

  try {
    const rootKeys = new Set(Object.keys(yamlParsed.raw).filter((k) => !k.startsWith('$')));
    if (rootKeys.size === 0) rootKeys.add('theme');
    const expanded = expandExtends(yamlParsed.raw, rootKeys);
    const resolved = resolveReferences(expanded, sources);

    return {
      ok: true,
      context: {
        themeDir,
        themefilePath: resolvedThemefilePath,
        parsed,
        dict,
        expandedTree: expanded,
        resolvedTree: resolved,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let exitCode = ExitCode.GENERAL_ERROR;
    if (message.toLowerCase().includes('circular')) {
      exitCode = ExitCode.INVALID_PARAMETER;
    } else if (message.toLowerCase().includes('unresolved')) {
      exitCode = ExitCode.INVALID_PARAMETER;
    }
    return {
      ok: false,
      findings: [{
        level: 'error',
        message,
      }],
      exitCode,
    };
  }
}
