/** Minimal resolvers for sandbox preview — not Wave resource runtime. */

export const TW3: Record<string, Record<string, string>> = {
  slate: {
    '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1',
    '400': '#94a3b8', '500': '#64748b', '600': '#475569', '700': '#334155',
    '800': '#1e293b', '900': '#0f172a', '950': '#020617',
  },
  red: {
    '50': '#fef2f2', '100': '#fee2e2', '200': '#fecaca', '300': '#fca5a5',
    '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c',
    '800': '#991b1b', '900': '#7f1d1d', '950': '#450a0a',
  },
  orange: {
    '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74',
    '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c',
    '800': '#9a3412', '900': '#7c2d12', '950': '#431407',
  },
  yellow: {
    '50': '#fefce8', '100': '#fef9c3', '200': '#fef08a', '300': '#fde047',
    '400': '#facc15', '500': '#eab308', '600': '#ca8a04', '700': '#a16207',
    '800': '#854d0e', '900': '#713f12', '950': '#422006',
  },
  green: {
    '50': '#f0fdf4', '100': '#dcfce7', '200': '#bbf7d0', '300': '#86efac',
    '400': '#4ade80', '500': '#22c55e', '600': '#16a34a', '700': '#15803d',
    '800': '#166534', '900': '#14532d', '950': '#052e16',
  },
  blue: {
    '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd',
    '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8',
    '800': '#1e40af', '900': '#1e3a8a', '950': '#172554',
  },
  cyan: {
    '50': '#ecfeff', '100': '#cffafe', '200': '#a5f3fc', '300': '#67e8f9',
    '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490',
    '800': '#155e75', '900': '#164e63', '950': '#083344',
  },
  // Tailwind-like amber / teal / indigo / rose (v3 defaults)
  amber: {
    '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d',
    '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309',
    '800': '#92400e', '900': '#78350f', '950': '#451a03',
  },
  teal: {
    '50': '#f0fdfa', '100': '#ccfbf1', '200': '#99f6e4', '300': '#5eead4',
    '400': '#2dd4bf', '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e',
    '800': '#115e59', '900': '#134e4a', '950': '#042f2e',
  },
  indigo: {
    '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '300': '#a5b4fc',
    '400': '#818cf8', '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca',
    '800': '#3730a3', '900': '#312e81', '950': '#1e1b4b',
  },
  rose: {
    '50': '#fff1f2', '100': '#ffe4e6', '200': '#fecdd3', '300': '#fda4af',
    '400': '#fb7185', '500': '#f43f5e', '600': '#e11d48', '700': '#be123c',
    '800': '#9f1239', '900': '#881337', '950': '#4c0519',
  },
  // Custom olive ramp (TW3 has no olive) — muted yellow-green, mid chroma
  olive: {
    '50': '#f7f8ef', '100': '#eef0db', '200': '#dde3b5', '300': '#c5cf84',
    '400': '#a9b457', '500': '#8c9840', '600': '#6f7a32', '700': '#555e28',
    '800': '#454c24', '900': '#3b4121', '950': '#1f230f',
  },
};

export const WHITE = '#ffffff';
export const BLACK = '#000000';

export type PaletteIndex = Record<string, Record<string, Record<string, string>>>;

export function loadCorerain(hexByFamily: Record<string, Record<string, string>>): void {
  // filled by emit from YAML
  void hexByFamily;
}

const REF = /^\{([a-zA-Z0-9_-]+)\.color\.([a-zA-Z0-9_-]+)\.(\d+)\}$/;
const THEME_REF = /^\{theme\.color\.([a-zA-Z0-9_.-]+)\}$/;

export function parsePaletteRef(value: string): { root: string; family: string; step: string } | null {
  const m = value.match(REF);
  if (!m) return null;
  const [, root, family, step] = m;
  if (!root || !family || !step) return null;
  return { root, family, step };
}

export function rewritePaletteStep(value: string, newStep: string): string | null {
  const p = parsePaletteRef(value);
  if (!p) return null;
  return `{${p.root}.color.${p.family}.${newStep}}`;
}

export function isWhiteRef(value: unknown): boolean {
  return value === '{tailwindcss.color.white}' || value === '#fff' || value === '#ffffff' || value === '#FFFFFF';
}

export function isBlackRef(value: unknown): boolean {
  return value === '{tailwindcss.color.black}' || value === '#000' || value === '#000000';
}

export { REF, THEME_REF };


/** Preview sandbox: Day primary family → Tailwind-like steps (parallel cyan mapping). */
export type PrimaryFamilyId = 'cyan' | 'amber' | 'teal' | 'indigo' | 'rose' | 'olive' | 'blue';

export const PRIMARY_FAMILY_IDS: PrimaryFamilyId[] = [
  'cyan', 'amber', 'teal', 'indigo', 'rose', 'olive', 'blue',
];

export const PRIMARY_FAMILY_LABELS: Record<PrimaryFamilyId, string> = {
  cyan: 'cyan',
  amber: 'amber',
  teal: 'teal',
  indigo: 'indigo',
  rose: 'rose',
  olive: 'olive',
  blue: 'blue',
};


/**
 * Suggested Night accentMain (Primary Night 明度) when switching primary family.
 * Does NOT overwrite the global knobs default (75) on load — only applied as a
 * soft preset on segment switch (user can still dial).
 * indigo/blue/rose brand often needs 50–60; cyan/teal/amber/olive sit nearer 70–80 (cyan ~75).
 */
export const PRIMARY_FAMILY_ACCENT_MAIN_HINT: Record<PrimaryFamilyId, number> = {
  cyan: 75,
  teal: 75,
  amber: 78,
  olive: 75,
  indigo: 55,
  blue: 55,
  rose: 55,
};

/** Steps mirror knobs dayRoleOverrides for cyan: 600 / 50 / 600 / 100. */
export function primaryDayOverridesFor(family: PrimaryFamilyId): Record<string, string> {
  return {
    'primary.main': `{tailwindcss.color.${family}.600}`,
    'primary.container': `{tailwindcss.color.${family}.50}`,
    'primary.on-container': `{tailwindcss.color.${family}.600}`,
    'inverse.primary': `{tailwindcss.color.${family}.100}`,
  };
}

export function primaryDayHexFor(family: PrimaryFamilyId): {
  main: string;
  container: string;
  onContainer: string;
  inverse: string;
} {
  const ramp = TW3[family];
  if (!ramp) throw new Error(`missing TW3 family ${family}`);
  const main = ramp['600'];
  const container = ramp['50'];
  const inverse = ramp['100'];
  if (!main || !container || !inverse) throw new Error(`missing TW3 step for ${family}`);
  return {
    main,
    container,
    onContainer: main,
    inverse,
  };
}

export function detectPrimaryFamilyFromOverrides(
  overrides: Record<string, string> | undefined,
): PrimaryFamilyId {
  const ref = overrides?.['primary.main'] ?? '';
  const m = ref.match(/tailwindcss\.color\.([a-z]+)\.(\d+)/);
  const id = (m?.[1] ?? 'cyan') as PrimaryFamilyId;
  return PRIMARY_FAMILY_IDS.includes(id) ? id : 'cyan';
}
