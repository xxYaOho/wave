/**
 * CLI: read Day main.yaml → pure color-rule Night → write overlay draft + preview tokens.
 * Sandbox only — no Wave schema / pipeline changes.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  deriveNightColorTree,
  deriveStateTree,
  type Knobs,
  type MappedRole,
} from './derive.js';
import { DEFAULT_TRIAL_KNOBS, applyNightScene, type ColorRuleKnobs } from './color-rules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULT_DAY = '/Users/teatao/Projects/my-color/orca/main.yaml';
const DEFAULT_CORERAIN = '/Users/teatao/Projects/my-color/orca/custom/corerain.yaml';

function loadKnobs(): Knobs {
  const raw = JSON.parse(readFileSync(join(ROOT, 'knobs.json'), 'utf8')) as Record<string, unknown>;
  // Merge over defaults so partial knobs.json still works; strip $comment nests
  const merged: ColorRuleKnobs = {
    ...DEFAULT_TRIAL_KNOBS,
    ...raw,
    trialTone: {
      ...DEFAULT_TRIAL_KNOBS.trialTone,
      ...((raw.trialTone as object) ?? {}),
    },
    chromaScale: {
      ...DEFAULT_TRIAL_KNOBS.chromaScale,
      ...((raw.chromaScale as object) ?? {}),
    },
    chromaFloor: {
      ...DEFAULT_TRIAL_KNOBS.chromaFloor,
      ...((raw.chromaFloor as object) ?? {}),
    },
    cctHueShiftDeg: {
      ...DEFAULT_TRIAL_KNOBS.cctHueShiftDeg,
      ...((raw.cctHueShiftDeg as object) ?? {}),
    },
    hueShiftByRole: {
      ...DEFAULT_TRIAL_KNOBS.hueShiftByRole,
      ...((raw.hueShiftByRole as object) ?? {}),
    },
    dayRoleOverrides: {
      ...(DEFAULT_TRIAL_KNOBS.dayRoleOverrides ?? {}),
      ...((raw.dayRoleOverrides as object) ?? {}),
    },
  } as ColorRuleKnobs;
  // Align emit with preview: scene baseline (tones + cct + surface floor; accent anchored at 晚间)
  return applyNightScene(merged, merged.lightsLevel ?? 3);
}

function loadCorerainHex(path: string): Record<string, Record<string, string>> {
  const doc = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const root = (doc.corerain as Record<string, unknown>)?.color as Record<string, Record<string, unknown>>;
  const out: Record<string, Record<string, string>> = {};
  for (const [family, steps] of Object.entries(root ?? {})) {
    if (family.startsWith('$')) continue;
    out[family] = {};
    for (const [step, leaf] of Object.entries(steps as Record<string, unknown>)) {
      if (step.startsWith('$')) continue;
      const v = (leaf as { $value?: unknown }).$value;
      if (typeof v === 'string' && v.startsWith('#')) out[family][step] = v.toLowerCase();
      else if (v && typeof v === 'object' && typeof (v as { hex?: string }).hex === 'string') {
        out[family][step] = (v as { hex: string }).hex.toLowerCase();
      }
    }
  }
  return out;
}

function buildOverlay(nightColor: Record<string, unknown>, nightState: Record<string, unknown>, includeState: boolean) {
  const theme: Record<string, unknown> = { color: nightColor };
  if (includeState && Object.keys(nightState).length) theme.state = nightState;
  return { theme };
}

function main() {
  const dayPath = resolve(process.env.DAY_YAML ?? DEFAULT_DAY);
  const corerainPath = resolve(process.env.CORERAIN_YAML ?? DEFAULT_CORERAIN);
  const knobs = loadKnobs();
  const corerain = loadCorerainHex(corerainPath);
  const dayDoc = parseYaml(readFileSync(dayPath, 'utf8')) as Record<string, unknown>;
  const theme = dayDoc.theme as Record<string, unknown>;
  if (!theme?.color) throw new Error('Day YAML missing theme.color');

  const dayColor = theme.color as Record<string, unknown>;
  const dayState = theme.state as Record<string, unknown> | undefined;

  const { nightColor, mapped: colorMapped, dayFlat, nightFlat } = deriveNightColorTree(dayColor, knobs, corerain);
  const { nightState, mapped: stateMapped } = deriveStateTree(dayState, knobs);
  const mapped: MappedRole[] = [...colorMapped, ...stateMapped];

  const overlay = buildOverlay(nightColor, nightState, knobs.includeStateInOverlay);

  const outDir = join(ROOT, 'out');
  mkdirSync(outDir, { recursive: true });
  const nightYamlPath = join(outDir, 'orca@night.yaml');
  const yamlText =
    `# Night overlay draft — pure color-rule sandbox (NOT product default)\n` +
    `# Source Day: ${dayPath}\n` +
    `# Generated: ${new Date().toISOString()}\n` +
    `# Engine: resolve Day → hex, then HCT hue-keep + trial tone/chroma/CCT knobs\n` +
    `# Contract: theme.color / theme.state path-leaf only; no root $id\n` +
    `# Wave day/night ↔ macOS light/dark; Dark is a theme not a mode\n` +
    stringifyYaml(overlay, { lineWidth: 100 });

  writeFileSync(nightYamlPath, yamlText, 'utf8');

  writeFileSync(
    join(outDir, 'preview-tokens.json'),
    JSON.stringify({ day: dayFlat, night: nightFlat, mapped, knobs }, null, 2),
  );
  writeFileSync(join(outDir, 'mapped-roles.json'), JSON.stringify(mapped, null, 2));

  const publicDir = join(ROOT, 'public');
  mkdirSync(publicDir, { recursive: true });
  cpSync(join(outDir, 'preview-tokens.json'), join(publicDir, 'preview-tokens.json'));

  const sibling = join(dirname(dayPath), 'main@night.yaml');
  const copySibling = process.env.COPY_SIBLING === '1';
  if (copySibling) {
    if (existsSync(sibling)) {
      const bak = `${sibling}.bak-${Date.now()}`;
      cpSync(sibling, bak);
      console.log(`backed up existing ${sibling} → ${bak}`);
    }
    cpSync(nightYamlPath, sibling);
    console.log(`wrote sibling ${sibling}`);
  }

  console.log(`wrote ${nightYamlPath}`);
  console.log(`roles mapped: ${mapped.length} (pure color-rule)`);
  console.log(`preview tokens: ${join(outDir, 'preview-tokens.json')}`);
  console.log(copySibling ? 'sibling copy: yes' : 'sibling copy: skipped (set COPY_SIBLING=1 to write beside orca)');
}

main();
