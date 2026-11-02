import {
  Contrast,
  Hct,
  SchemeNeutral,
  SchemeTonalSpot,
  SchemeVibrant,
  argbFromHex,
  hexFromArgb,
  lstarFromArgb,
  type DynamicScheme,
} from '@material/material-color-utilities';
import './styles.css';

type Variant = 'tonal' | 'neutral' | 'vibrant';
type Role = { label: string; key: keyof DynamicScheme; against?: keyof DynamicScheme };

const presets = [
  { name: '蓝', hex: '#276dcb' },
  { name: '黄', hex: '#f5c842' },
  { name: '绿', hex: '#2f886e' },
  { name: '红', hex: '#c64b58' },
  { name: '灰', hex: '#596979' },
];

// The labels are Wave experiment steps; Material's source palette uses HCT tone 0..100.
const steps = [
  { label: 50, tone: 98 },
  { label: 100, tone: 95 },
  { label: 200, tone: 90 },
  { label: 300, tone: 80 },
  { label: 400, tone: 70 },
  { label: 500, tone: 60 },
  { label: 600, tone: 50 },
  { label: 700, tone: 40 },
  { label: 800, tone: 30 },
  { label: 900, tone: 20 },
  { label: 950, tone: 10 },
] as const;

// Tailwind Yellow v3 is a reference palette, not a generation formula.
const yellowReference = [
  '#fefce8', '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308',
  '#ca8a04', '#a16207', '#854d0e', '#713f12', '#422006',
].map((color) => Hct.fromInt(argbFromHex(color)));

const roleGroups: { title: string; roles: Role[] }[] = [
  {
    title: '表面与容器',
    roles: [
      { label: 'surface', key: 'surface' },
      { label: 'surface.dim', key: 'surfaceDim' },
      { label: 'surface.bright', key: 'surfaceBright' },
      { label: 'container.low', key: 'surfaceContainerLow' },
      { label: 'container.default', key: 'surfaceContainer' },
      { label: 'container.high', key: 'surfaceContainerHigh' },
    ],
  },
  {
    title: '文字与描边',
    roles: [
      { label: 'text.default', key: 'onSurface', against: 'surface' },
      { label: 'text.subtle', key: 'onSurfaceVariant', against: 'surface' },
      { label: 'border.default', key: 'outline' },
      { label: 'border.subtle', key: 'outlineVariant' },
    ],
  },
  {
    title: '重点色',
    roles: [
      { label: 'primary.main', key: 'primary' },
      { label: 'primary.on-main', key: 'onPrimary', against: 'primary' },
      { label: 'primary.container', key: 'primaryContainer' },
      { label: 'primary.on-container', key: 'onPrimaryContainer', against: 'primaryContainer' },
    ],
  },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing app root');

const query = new URLSearchParams(location.search);
const initialHex = normalizeHex(query.get('color') ?? '') ?? '#276dcb';
const initialVariant = query.get('variant');
const state: { hex: string; variant: Variant; contrast: number; nightTone: number } = {
  hex: initialHex,
  variant: initialVariant === 'neutral' || initialVariant === 'vibrant' ? initialVariant : 'tonal',
  contrast: clamp(Number(query.get('contrast') ?? 0), -1, 1),
  nightTone: clamp(Number(query.get('nightTone') ?? 65), 60, 80),
};

app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">W</span><span>Wave <strong>Color Lab</strong></span></div>
    <span class="topbar-meta">Material Color Utilities · HCT</span>
  </header>
  <main class="workspace">
    <aside class="controls" aria-label="色彩设置">
      <div class="panel-heading"><span class="eyebrow">色彩实验</span><h1>基础色</h1></div>
      <label class="field-label" for="hex-input">HEX</label>
      <div class="color-field"><input id="color-picker" type="color" aria-label="选择基础色" /><input id="hex-input" type="text" inputmode="text" spellcheck="false" maxlength="7" aria-describedby="hex-error" /><span class="field-swatch" id="field-swatch"></span></div>
      <p class="field-error" id="hex-error" role="status"></p>
      <div class="presets" id="presets" aria-label="基础色样本"></div>
      <div class="control-divider"></div>
      <div class="field-label">生成风格</div>
      <div class="segmented" id="variants" role="group" aria-label="生成风格">
        <button type="button" data-variant="tonal">柔和</button>
        <button type="button" data-variant="neutral">中性</button>
        <button type="button" data-variant="vibrant">鲜明</button>
      </div>
      <div class="slider-heading"><label class="field-label" for="contrast">对比度</label><output id="contrast-value"></output></div>
      <input id="contrast" type="range" min="-1" max="1" step="0.1" />
      <div class="slider-ends"><span>柔和</span><span>标准</span><span>增强</span></div>
      <div class="slider-heading night-tone-heading"><label class="field-label" for="night-tone">Night 主色明度</label><output id="night-tone-value"></output></div>
      <input id="night-tone" type="range" min="60" max="80" step="1" />
      <div class="slider-ends"><span>浓郁</span><span>Material T80</span></div>
      <div class="control-note"><strong>算法</strong><span>Material DynamicScheme 2021 + Night 主色实验</span></div>
    </aside>
    <div class="results">
      <div class="results-heading"><div><span class="eyebrow">模式对照</span><h2>Day / Night</h2></div><span class="seed-meta" id="seed-meta"></span></div>
      <div class="modes" id="modes"></div>
      <section class="scale-section" aria-labelledby="scale-title">
        <div class="section-heading"><div><span class="eyebrow">HCT 色阶</span><h2 id="scale-title">基础色的延展</h2></div><span>Wave 实验档位 · 数字下方为 HCT tone</span></div>
        <div id="scales"></div>
      </section>
    </div>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const hexInput = get<HTMLInputElement>('#hex-input');
const picker = get<HTMLInputElement>('#color-picker');
const contrastInput = get<HTMLInputElement>('#contrast');
const nightToneInput = get<HTMLInputElement>('#night-tone');

function get<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
}

function normalizeHex(value: string): string | null {
  const clean = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return `#${[...clean].map((part) => part + part).join('').toLowerCase()}`;
  }
  return /^[0-9a-f]{6}$/i.test(clean) ? `#${clean.toLowerCase()}` : null;
}

function scheme(isDark: boolean): DynamicScheme {
  const source = Hct.fromInt(argbFromHex(state.hex));
  const Algorithm = state.variant === 'neutral' ? SchemeNeutral : state.variant === 'vibrant' ? SchemeVibrant : SchemeTonalSpot;
  return new Algorithm(source, isDark, state.contrast);
}

function hex(value: number): string {
  return hexFromArgb(value).toLowerCase();
}

function roleValue(colors: DynamicScheme, key: keyof DynamicScheme, isNight = false): number {
  if (isNight && key === 'primary') return colors.primaryPalette.tone(state.nightTone);
  const value = colors[key];
  if (typeof value !== 'number') throw new Error(`Unknown color role: ${String(key)}`);
  return value;
}

function ratio(first: number, second: number): number {
  return Contrast.ratioOfTones(lstarFromArgb(first), lstarFromArgb(second));
}

function roleRows(colors: DynamicScheme, isNight: boolean): string {
  return roleGroups.map((group) => `
    <div class="role-group"><h4>${group.title}</h4>${group.roles.map((role) => {
      const value = roleValue(colors, role.key, isNight);
      const color = hex(value);
      const pair = role.against ? ratio(value, roleValue(colors, role.against, isNight)) : null;
      return `<button type="button" class="role-row copy-color" data-color="${color}" title="复制 ${color}"><span class="role-name">${role.label}</span><span class="role-swatch" style="background:${color}"></span><span class="role-hex">${color}</span><span class="role-ratio${pair !== null && pair < 4.5 ? ' low-contrast' : ''}">${pair === null ? '' : `${pair.toFixed(2)}:1`}</span></button>`;
    }).join('')}</div>
  `).join('');
}

function modePanel(colors: DynamicScheme, label: 'Day' | 'Night'): string {
  const isNight = label === 'Night';
  const surface = hex(colors.surface);
  const container = hex(colors.surfaceContainer);
  const containerHigh = hex(colors.surfaceContainerHigh);
  const text = hex(colors.onSurface);
  const subtle = hex(colors.onSurfaceVariant);
  const border = hex(colors.outlineVariant);
  const primary = hex(roleValue(colors, 'primary', isNight));
  const onPrimary = hex(colors.onPrimary);
  const primaryContainer = hex(colors.primaryContainer);
  const onPrimaryContainer = hex(colors.onPrimaryContainer);

  return `<section class="mode" aria-label="${label} 配色">
    <div class="mode-title"><span class="mode-symbol">${label === 'Day' ? '☀' : '☾'}</span><div><h3>${label}</h3><p>${label === 'Day' ? '亮色角色' : '暗色角色'}</p></div></div>
    <div class="ui-preview" style="--surface:${surface};--container:${container};--container-high:${containerHigh};--text:${text};--subtle:${subtle};--border:${border};--primary:${primary};--on-primary:${onPrimary};--primary-container:${primaryContainer};--on-primary-container:${onPrimaryContainer}">
      <div class="preview-top"><span class="preview-logo">O</span><span>项目概览</span><span class="preview-dots">•••</span></div>
      <div class="preview-body"><div class="preview-kicker">本周进度</div><div class="preview-total">24 <span>项设计交付</span></div><div class="preview-line"><span>设计系统</span><strong>已更新</strong></div><div class="preview-line"><span>组件规范</span><span>进行中</span></div><div class="preview-actions"><span class="preview-action">查看详情</span><span>最后更新于今天</span></div></div>
    </div>
    <div class="role-list">${roleRows(colors, isNight)}</div>
  </section>`;
}

function yellowCandidate(seed: Hct, index: number): number {
  const reference = yellowReference[index];
  const anchor = yellowReference[5];
  const tone = index < 5
    ? seed.tone + (100 - seed.tone) * (reference.tone - anchor.tone) / (100 - anchor.tone)
    : seed.tone * reference.tone / anchor.tone;
  const chroma = seed.chroma * reference.chroma / anchor.chroma;
  return Hct.from(seed.hue + reference.hue - anchor.hue, chroma, tone).toInt();
}

function yellowCandidateRow(): string {
  const seed = Hct.fromInt(argbFromHex(state.hex));
  if (seed.hue < 75 || seed.hue > 105) return '';
  return `<div class="scale-row"><div class="scale-name">黄色候选 <small>Tailwind 参考曲线</small></div><div class="scale-track">${steps.map(({ label }, index) => {
    const value = yellowCandidate(seed, index);
    const color = hex(value);
    return `<button type="button" class="scale-step copy-color" data-color="${color}" title="复制黄色候选 ${label}: ${color}"><span class="scale-color" style="background:${color}"></span><span class="scale-label">${label}</span><span class="scale-tone">T${Math.round(lstarFromArgb(value))}</span></button>`;
  }).join('')}</div></div>`;
}

function scaleRows(colors: DynamicScheme): string {
  const palettes = [
    { name: 'Primary', palette: colors.primaryPalette },
    { name: 'Neutral', palette: colors.neutralPalette },
    { name: 'Neutral variant', palette: colors.neutralVariantPalette },
  ];
  return palettes.map(({ name, palette }) => `
    <div class="scale-row"><div class="scale-name">${name}</div><div class="scale-track">${steps.map(({ label, tone }) => {
      const color = hex(palette.tone(tone));
      return `<button type="button" class="scale-step copy-color" data-color="${color}" title="复制 ${name} ${label}: ${color}"><span class="scale-color" style="background:${color}"></span><span class="scale-label">${label}</span><span class="scale-tone">T${tone}</span></button>`;
    }).join('')}</div></div>
  `).join('');
}

let toastTimer: number | undefined;
function showToast(message: string): void {
  const toast = get<HTMLDivElement>('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function render(syncHexInput = true): void {
  const day = scheme(false);
  const night = scheme(true);
  if (syncHexInput) hexInput.value = state.hex;
  picker.value = state.hex;
  contrastInput.value = String(state.contrast);
  nightToneInput.value = String(state.nightTone);
  get<HTMLOutputElement>('#contrast-value').value = state.contrast.toFixed(1);
  get<HTMLOutputElement>('#night-tone-value').value = `T${state.nightTone}`;
  get<HTMLSpanElement>('#field-swatch').style.background = state.hex;
  get<HTMLSpanElement>('#seed-meta').textContent = `Seed ${state.hex}`;
  get<HTMLDivElement>('#presets').innerHTML = presets.map((preset) => `<button type="button" class="preset" data-hex="${preset.hex}" title="${preset.name} ${preset.hex}" aria-label="${preset.name} ${preset.hex}" style="--preset:${preset.hex}"></button>`).join('');
  get<HTMLDivElement>('#modes').innerHTML = modePanel(day, 'Day') + modePanel(night, 'Night');
  get<HTMLDivElement>('#scales').innerHTML = scaleRows(day) + yellowCandidateRow();
  document.querySelectorAll<HTMLButtonElement>('[data-variant]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.variant === state.variant));
  });
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.hex?.toLowerCase() === state.hex));
  });
  const params = new URLSearchParams({ color: state.hex, variant: state.variant, contrast: String(state.contrast), nightTone: String(state.nightTone) });
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

hexInput.addEventListener('input', () => {
  const valid = normalizeHex(hexInput.value);
  get<HTMLParagraphElement>('#hex-error').textContent = valid || hexInput.value.trim() === '' ? '' : '请输入 3 位或 6 位 HEX 色值';
  if (valid) {
    state.hex = valid;
    render(false);
  }
});
hexInput.addEventListener('blur', () => {
  hexInput.value = state.hex;
  get<HTMLParagraphElement>('#hex-error').textContent = '';
});
picker.addEventListener('input', () => {
  state.hex = picker.value;
  render();
});
contrastInput.addEventListener('input', () => {
  state.contrast = clamp(Number(contrastInput.value), -1, 1);
  render();
});
nightToneInput.addEventListener('input', () => {
  state.nightTone = clamp(Number(nightToneInput.value), 60, 80);
  render();
});
document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const variantButton = target.closest<HTMLButtonElement>('[data-variant]');
  if (variantButton) {
    state.variant = variantButton.dataset.variant as Variant;
    render();
    return;
  }
  const preset = target.closest<HTMLButtonElement>('[data-hex]');
  if (preset?.dataset.hex) {
    state.hex = preset.dataset.hex;
    render();
    return;
  }
  const copy = target.closest<HTMLButtonElement>('.copy-color');
  if (copy?.dataset.color) {
    try {
      await navigator.clipboard.writeText(copy.dataset.color);
      showToast(`已复制 ${copy.dataset.color}`);
    } catch {
      showToast(copy.dataset.color);
    }
  }
});

render();
