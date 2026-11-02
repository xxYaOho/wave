import './styles.css';
import {
  remapFlatDayToNight,
  DEFAULT_TRIAL_KNOBS,
  applyNightScene,
  clampLightsLevel,
  LIGHTS_LINKED_KEYS,
  ACCENT_ANCHOR_TONES,
  DEFAULT_LIGHTS_LEVEL,
  LIGHTS_LEVEL_MAX,
  nightSceneName,
  NIGHT_SCENE_NAMES,
  type ColorRuleKnobs,
  type TrialToneKnobs,
} from '../color-rules';
import { bindSliderNumber, refreshIcons, sliderFieldHtml } from './ui-kit';
import {
  PRIMARY_FAMILY_IDS,
  PRIMARY_FAMILY_LABELS,
  PRIMARY_FAMILY_ACCENT_MAIN_HINT,
  detectPrimaryFamilyFromOverrides,
  primaryDayHexFor,
  primaryDayOverridesFor,
  type PrimaryFamilyId,
} from '../palettes';

type Tokens = {
  day: Record<string, string>;
  night: Record<string, string>;
  mapped?: Array<{ path: string; strategy: string; dayHex?: string | null; nightHex?: string | null }>;
  knobs?: ColorRuleKnobs;
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

const holdings = [
  { name: '华夏成长混合', code: '000001', qty: '1,200', cost: '1.842', price: '2.156', pnl: '+17.05%', up: true },
  { name: '易方达蓝筹精选', code: '005827', qty: '860', cost: '1.120', price: '1.053', pnl: '-5.98%', up: false },
  { name: '招商中证白酒', code: '161725', qty: '2,400', cost: '0.986', price: '1.124', pnl: '+14.00%', up: true },
  { name: '南方固收增强', code: '004997', qty: '5,000', cost: '1.021', price: '1.038', pnl: '+1.67%', up: true },
  { name: '嘉实新能源车', code: '011052', qty: '640', cost: '1.455', price: '1.289', pnl: '-11.41%', up: false },
];

const watch = [
  { name: '上证指数', price: '3,128.46', chg: '+0.62%' },
  { name: '深证成指', price: '9,842.15', chg: '+0.41%' },
  { name: '创业板指', price: '1,986.33', chg: '-0.28%' },
  { name: '恒生科技', price: '3,654.20', chg: '+1.15%' },
  { name: '美元兑人民币', price: '7.1245', chg: '-0.06%' },
];

const kpis = [
  { label: '总资产 (CNY)', value: '¥ 2,486,320.18', hint: '较昨日', delta: '+1.24%', up: true },
  { label: '当日盈亏', value: '¥ 30,412.66', hint: '已实现+浮盈', delta: '+0.87%', up: true },
  { label: '可用资金', value: '¥ 186,540.00', hint: '含在途', delta: '—', up: true },
  { label: '持仓市值', value: '¥ 2,299,780.18', hint: '12 只标的', delta: '+1.31%', up: true },
];

const SWATCH_PATHS = [
  'primary.main',
  'primary.on-main',
  'primary.container',
  'secondary.main',
  'success.main',
  'error.main',
  'neutral.main',
  'surface.default',
  'container.default',
  'text.default',
];

const TONE_KEYS: Array<{ key: keyof TrialToneKnobs; label: string }> = [
  { key: 'accentMain', label: 'accentMain' },
  { key: 'accentOnMain', label: 'accentOnMain' },
  { key: 'accentContainer', label: 'accentContainer' },
  { key: 'accentOnContainer', label: 'accentOnContainer' },
  { key: 'neutralMain', label: 'neutralMain' },
  { key: 'neutralOnMain', label: 'neutralOnMain' },
  { key: 'neutralContainer', label: 'neutralContainer' },
  { key: 'neutralOnContainer', label: 'neutralOnContainer' },
  { key: 'textEmphasis', label: 'textEmphasis' },
  { key: 'textDefault', label: 'textDefault' },
  { key: 'textSubtle', label: 'textSubtle' },
  { key: 'textSubtlest', label: 'textSubtlest' },
  { key: 'surfaceDefault', label: 'surfaceDefault' },
  { key: 'surfaceBright', label: 'surfaceBright' },
  { key: 'surfaceDim', label: 'surfaceDim' },
  { key: 'containerLowest', label: 'containerLowest' },
  { key: 'containerLow', label: 'containerLow' },
  { key: 'containerDefault', label: 'containerDefault' },
  { key: 'containerHigh', label: 'containerHigh' },
  { key: 'containerHighest', label: 'containerHighest' },
  { key: 'inverseSurface', label: 'inverseSurface' },
];

function sparkPath(seed: number, up: boolean): string {
  const pts: string[] = [];
  let y = 28;
  for (let i = 0; i < 24; i++) {
    const wobble = Math.sin((i + seed) * 0.55) * 8 + Math.cos((i + seed) * 0.21) * 4;
    y = Math.min(40, Math.max(8, y + (up ? -0.35 : 0.25) + wobble * 0.15));
    pts.push(`${i * 8},${y.toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

function deepCloneKnobs(k: ColorRuleKnobs): ColorRuleKnobs {
  return JSON.parse(JSON.stringify(k)) as ColorRuleKnobs;
}

const sceneSegmentHtml = NIGHT_SCENE_NAMES.map((name, i) => {
  const level = i + 1;
  const checked = level === DEFAULT_LIGHTS_LEVEL;
  return `<button type="button" role="radio" data-level="${level}" aria-checked="${checked ? 'true' : 'false'}" tabindex="${checked ? '0' : '-1'}"${checked ? ' class="is-selected"' : ''}>${name}</button>`;
}).join('\n                ');

const primarySegmentHtml = PRIMARY_FAMILY_IDS.map((id, i) => {
  const checked = id === 'cyan';
  return `<button type="button" role="radio" data-primary="${id}" aria-checked="${checked ? 'true' : 'false'}" tabindex="${checked ? '0' : '-1'}"${checked ? ' class="is-selected"' : ''}>${PRIMARY_FAMILY_LABELS[id]}</button>`;
}).join('\n                ');

app.innerHTML = `
  <div class="shell" data-mode="day">
    <aside class="nav" aria-label="侧栏导航">
      <div class="brand">
        <span class="brand-mark">浪</span>
        <div>
          <strong>雅图资产</strong>
          <small>Night Derive 预览</small>
        </div>
      </div>
      <nav>
        <a class="active" href="#">总览</a>
        <a href="#">持仓</a>
        <a href="#">交易</a>
        <a href="#">自选</a>
        <a href="#">研报</a>
        <a href="#">设置</a>
      </nav>
      <div class="nav-foot">
        <span class="pill">sandbox</span>
        <span class="muted">纯色彩规则 · 非正式默认</span>
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <div>
          <p class="eyebrow">可视化验收 · 金融看板</p>
          <h1>账户总览</h1>
        </div>
        <div class="top-actions">
          <label class="toggle" title="Day / Night">
            <span>日间</span>
            <input id="mode" type="checkbox" />
            <span>夜间</span>
          </label>
          <button type="button" class="ghost" id="copy-mode">复制当前色板摘要</button>
          <button type="button" class="ghost primary-ish" id="toggle-debug" aria-expanded="true" aria-controls="debug-panel">调试面板</button>
        </div>
      </header>

      <section class="ticker" aria-label="行情条">
        ${watch.map((w) => `
          <div class="tick">
            <span>${w.name}</span>
            <strong>${w.price}</strong>
            <em class="${w.chg.startsWith('-') ? 'down' : 'up'}">${w.chg}</em>
          </div>`).join('')}
      </section>

      <section class="kpis" aria-label="关键指标">
        ${kpis.map((k, i) => `
          <article class="kpi">
            <div class="kpi-head"><span>${k.label}</span><em class="${k.up ? 'up' : 'down'}">${k.delta}</em></div>
            <strong>${k.value}</strong>
            <svg class="spark" viewBox="0 0 184 48" aria-hidden="true">
              <path d="${sparkPath(i * 3, k.up)}" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
            <small>${k.hint}</small>
          </article>`).join('')}
      </section>

      <section class="grid-2">
        <article class="panel chart-panel">
          <div class="panel-head">
            <h2>净值走势</h2>
            <div class="seg">
              <button type="button" class="on">近 1 月</button>
              <button type="button">近 3 月</button>
              <button type="button">今年</button>
            </div>
          </div>
          <div class="chart">
            <svg viewBox="0 0 640 220" role="img" aria-label="示意折线图">
              <defs>
                <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--primary-main)" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="var(--primary-main)" stop-opacity="0" />
                </linearGradient>
              </defs>
              <path class="gridline" d="M40 40H620M40 90H620M40 140H620M40 190H620" />
              <path fill="url(#fill)" d="M40 160 C120 150, 180 120, 240 130 S360 80, 420 95 S540 60, 620 70 L620 190 L40 190 Z" />
              <path fill="none" stroke="var(--primary-main)" stroke-width="3" d="M40 160 C120 150, 180 120, 240 130 S360 80, 420 95 S540 60, 620 70" />
              <circle cx="420" cy="95" r="5" fill="var(--primary-main)" />
            </svg>
            <div class="chart-meta">
              <span>单位净值 <strong>1.2864</strong></span>
              <span>累计净值 <strong>2.0418</strong></span>
              <span class="up">区间 +8.36%</span>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-head"><h2>自选盯盘</h2><span class="muted">延迟行情 · 示意</span></div>
          <ul class="watch">
            ${watch.map((w) => `
              <li>
                <div><strong>${w.name}</strong><small>关注中</small></div>
                <div class="watch-right">
                  <strong>${w.price}</strong>
                  <em class="${w.chg.startsWith('-') ? 'down' : 'up'}">${w.chg}</em>
                </div>
              </li>`).join('')}
          </ul>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>持仓明细</h2>
          <button type="button" class="ghost">导出 CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名称</th><th>代码</th><th>份额</th><th>成本</th><th>现价</th><th>浮动盈亏</th>
              </tr>
            </thead>
            <tbody>
              ${holdings.map((h) => `
                <tr>
                  <td><strong>${h.name}</strong></td>
                  <td class="mono">${h.code}</td>
                  <td class="mono">${h.qty}</td>
                  <td class="mono">${h.cost}</td>
                  <td class="mono">${h.price}</td>
                  <td class="mono ${h.up ? 'up' : 'down'}">${h.pnl}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <footer class="foot">
        <span id="mode-label">当前：Day（日间）</span>
        <span class="muted">纯色彩规则 · 顶栏「调试面板」可调 knobs 并实时 Night 重映射 · 落盘请改 knobs.json 后 pnpm derive</span>
      </footer>
    </div>
    <aside id="debug-panel" class="debug-panel" aria-label="Night 推导调试面板">
      <div class="debug-head">
        <div>
          <strong>Night 调试 / Knobs</strong>
          <p class="muted">纯色彩规则函数 · 旋钮为 <em>trial</em> 占位，非产品默认（旧 Lab T65 观察点未批准）</p>
        </div>
        <div class="debug-actions">
          <button type="button" class="ui-btn ui-btn-outline" id="apply-live">
            <i data-lucide="refresh-cw"></i><span>实时重映射</span>
          </button>
          <button type="button" class="ui-btn ui-btn-outline" id="reset-knobs">
            <i data-lucide="rotate-ccw"></i><span>重置</span>
          </button>
          <button type="button" class="ui-btn ui-btn-outline" id="copy-knobs">
            <i data-lucide="clipboard"></i><span>复制 knobs JSON</span>
          </button>
        </div>
      </div>

      <div class="debug-grid">
        <section class="ui-card debug-card lights-card">
          <div class="ui-card-head">
            <i data-lucide="moon"></i>
            <h3>光场场景 / Night scenes</h3>
          </div>
          <p class="ui-muted">场景联动表面与色温；accent 锚定晚间，细调滑杆使用绝对值。</p>
          <div class="ui-field lights-field">
            <div class="ui-label" id="lights-scene-label-wrap">
              <i data-lucide="lamp-desk"></i>
              <span id="lights-scene-label">晚间 · lightsLevel</span>
            </div>
            <div class="ui-segment" role="radiogroup" aria-labelledby="lights-scene-label" id="k-lights-segment">
              ${sceneSegmentHtml}
            </div>
          </div>
        </section>

        <section class="ui-card debug-card primary-family-card">
          <div class="ui-card-head">
            <i data-lucide="paintbucket"></i>
            <h3>Primary 色彩倾向</h3>
          </div>
          <p class="ui-muted">切换 Day primary 家族（Tailwind-like 600/50/100）后重跑 Night；暖场 Lab mix 仍不染 brand/primary。切换时软预设 accentMain：indigo/blue/rose → 55（50–60 带）；cyan/teal/olive → 75、amber → 78（70–80 带）；不改全局默认 75，可再拧。</p>
          <div class="ui-field primary-family-field">
            <div class="ui-label" id="primary-family-label-wrap">
              <i data-lucide="palette"></i>
              <span id="primary-family-label">cyan · primary family</span>
            </div>
            <div class="ui-segment ui-segment-wrap" role="radiogroup" aria-labelledby="primary-family-label" id="k-primary-segment">
              ${primarySegmentHtml}
            </div>
          </div>
        </section>

        <section class="ui-card debug-card accent-main-card">
          <div class="ui-card-head">
            <i data-lucide="sun-moon"></i>
            <h3>Primary Night 明度</h3>
          </div>
          <p class="ui-muted">trialTone.accentMain · 默认 <strong>75</strong>（当前 Day/Night primary.main 距离，保留）。下调可临时拉近 Night；场景切换不覆盖此旋钮；重置恢复 75。accentOnMain / <code>primary.on-main</code> / <code>--color-primary-on-main</code> 由 Night primary.main 亮度动态生成（WCAG-ish：T100 vs T10，优先 ≥4.5:1）。</p>
          <div id="accent-main-control"></div>
        </section>

        <section class="ui-card debug-card">
          <div class="ui-card-head">
            <i data-lucide="sliders-horizontal"></i>
            <h3>规则旋钮</h3>
          </div>
          <div class="ui-switch-row">
            <label class="ui-label" for="k-hueKeep">hueKeep</label>
            <input type="checkbox" class="ui-switch" id="k-hueKeep" checked />
          </div>
          <div class="ui-field">
            <label class="ui-label" for="k-cctBias">cctBias</label>
            <select class="ui-select" id="k-cctBias">
              <option value="neutral">neutral</option>
              <option value="warm">warm</option>
              <option value="cool">cool</option>
            </select>
          </div>
          <div class="ui-switch-row">
            <label class="ui-label" for="k-onInvert">onRoleUseInvert</label>
            <input type="checkbox" class="ui-switch" id="k-onInvert" />
          </div>
          <div id="chroma-floor-controls" class="ui-stack"></div>
        </section>

        <section class="ui-card debug-card">
          <div class="ui-card-head">
            <i data-lucide="pipette"></i>
            <h3>trialTone（HCT 0–100）</h3>
          </div>
          <p class="ui-muted">可滚动 · Container 在 Surface 下方 · 表面受场景驱动 · accent 锚定晚间 · 滑杆旁可精输</p>
          <div class="tone-grid" id="tone-controls"></div>
        </section>

        <section class="ui-card debug-card">
          <div class="ui-card-head">
            <i data-lucide="palette"></i>
            <h3>Day → Night 样例色板</h3>
          </div>
          <div class="swatches" id="swatches"></div>
        </section>

        <section class="ui-card debug-card">
          <div class="ui-card-head">
            <i data-lucide="file-json"></i>
            <h3>策略摘要</h3>
          </div>
          <pre class="strategy-dump" id="strategy-dump"></pre>
        </section>
      </div>
    </aside>
  </div>
  <div class="toast" id="toast" hidden></div>
`;

function applyTokens(tokens: Record<string, string>) {
  const root = document.documentElement;
  const map: Record<string, string> = {
    '--surface-default': tokens['surface.default'] ?? '#f5f7fa',
    '--surface-bright': tokens['surface.bright'] ?? '#fafbfc',
    '--surface-dim': tokens['surface.dim'] ?? '#eef1f5',
    '--container-default': tokens['container.default'] ?? '#ffffff',
    '--container-high': tokens['container.high'] ?? '#ffffff',
    '--container-low': tokens['container.low'] ?? '#ffffff',
    '--container-lowest': tokens['container.lowest'] ?? '#ffffff',
    '--text-default': tokens['text.default'] ?? '#0f172a',
    '--text-subtle': tokens['text.subtle'] ?? '#334155',
    '--text-subtlest': tokens['text.subtlest'] ?? '#64748b',
    '--text-emphasis': tokens['text.emphasis'] ?? '#020617',
    '--border-default': tokens['neutral.main'] ?? '#1e293b',
    '--primary-main': tokens['primary.main'] ?? '#1872f0',
    '--primary-on-main': tokens['primary.on-main'] ?? '#ffffff',
    '--color-primary-on-main': tokens['primary.on-main'] ?? '#ffffff',
    '--primary-container': tokens['primary.container'] ?? '#eff8ff',
    '--primary-on-container': tokens['primary.on-container'] ?? '#1872f0',
    '--secondary-main': tokens['secondary.main'] ?? '#2cd9ff',
    '--success-main': tokens['success.main'] ?? '#16a34a',
    '--error-main': tokens['error.main'] ?? '#ef4444',
    '--warning-main': tokens['warning.main'] ?? '#f97316',
    '--inverse-surface': tokens['inverse.surface'] ?? '#0f172a',
    '--inverse-on-surface': tokens['inverse.on-surface'] ?? '#ffffff',
    '--scrim': tokens['scrim'] ?? '#000000',
    '--shadow': tokens['shadow'] ?? '#0f172a',
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v);
}

function toast(msg: string) {
  const el = document.querySelector<HTMLElement>('#toast')!;
  el.hidden = false;
  el.textContent = msg;
  setTimeout(() => { el.hidden = true; }, 1800);
}

function mergeKnobs(raw?: ColorRuleKnobs): ColorRuleKnobs {
  const base = deepCloneKnobs(DEFAULT_TRIAL_KNOBS);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    trialTone: { ...base.trialTone, ...(raw.trialTone ?? {}) },
    chromaScale: { ...base.chromaScale, ...(raw.chromaScale ?? {}) },
    chromaFloor: { ...base.chromaFloor, ...(raw.chromaFloor ?? {}) },
    cctHueShiftDeg: { ...base.cctHueShiftDeg, ...(raw.cctHueShiftDeg ?? {}) },
    hueShiftByRole: { ...base.hueShiftByRole, ...(raw.hueShiftByRole ?? {}) },
    dayRoleOverrides: { ...(base.dayRoleOverrides ?? {}), ...(raw.dayRoleOverrides ?? {}) },
  };
}

async function boot() {
  const res = await fetch('/preview-tokens.json');
  if (!res.ok) throw new Error('缺少 public/preview-tokens.json，请先 pnpm derive');
  const data = (await res.json()) as Tokens;
  const shell = document.querySelector<HTMLElement>('.shell')!;
  const modeInput = document.querySelector<HTMLInputElement>('#mode')!;
  const modeLabel = document.querySelector<HTMLElement>('#mode-label')!;
  const debugPanel = document.querySelector<HTMLElement>('#debug-panel')!;
  const toneBox = document.querySelector<HTMLElement>('#tone-controls')!;
  const swatchBox = document.querySelector<HTMLElement>('#swatches')!;
  const strategyDump = document.querySelector<HTMLElement>('#strategy-dump')!;

  let baseKnobs = mergeKnobs(data.knobs);
  let liveKnobs = deepCloneKnobs(baseKnobs);
  let liveDay: Record<string, string> = { ...data.day };
  let liveNight = { ...data.night };
  let liveStrategies: Record<string, string> = Object.fromEntries(
    (data.mapped ?? []).map((m) => [m.path, m.strategy]),
  );
  let primaryFamily: PrimaryFamilyId = detectPrimaryFamilyFromOverrides(liveKnobs.dayRoleOverrides);

  // —— Chroma / floor fields (slider + number) ——
  const chromaHost = document.querySelector<HTMLElement>('#chroma-floor-controls')!;
  const scaleFields = [
    { id: 'k-c-accent', label: 'chroma · accent', min: 0, max: 1.5, step: 0.05, get: () => liveKnobs.chromaScale.accent, set: (v: number) => { liveKnobs.chromaScale.accent = v; } },
    { id: 'k-c-surface', label: 'chroma · surface', min: 0, max: 2, step: 0.05, get: () => liveKnobs.chromaScale.surface, set: (v: number) => { liveKnobs.chromaScale.surface = v; } },
    { id: 'k-c-neutral', label: 'chroma · neutral', min: 0, max: 1.5, step: 0.05, get: () => liveKnobs.chromaScale.neutral, set: (v: number) => { liveKnobs.chromaScale.neutral = v; } },
    { id: 'k-c-text', label: 'chroma · text', min: 0, max: 1.5, step: 0.05, get: () => liveKnobs.chromaScale.text, set: (v: number) => { liveKnobs.chromaScale.text = v; } },
    { id: 'k-f-accent', label: 'floor · accent', min: 0, max: 40, step: 1, get: () => liveKnobs.chromaFloor.accent, set: (v: number) => { liveKnobs.chromaFloor.accent = v; } },
    { id: 'k-f-surface', label: 'floor · surface', min: 0, max: 16, step: 0.5, get: () => liveKnobs.chromaFloor.surface, set: (v: number) => { liveKnobs.chromaFloor.surface = v; } },
    { id: 'k-f-neutral', label: 'floor · neutral', min: 0, max: 16, step: 0.5, get: () => liveKnobs.chromaFloor.neutral, set: (v: number) => { liveKnobs.chromaFloor.neutral = v; } },
  ] as const;

  chromaHost.innerHTML = scaleFields
    .map((f) =>
      sliderFieldHtml({
        id: f.id,
        label: f.label,
        min: f.min,
        max: f.max,
        step: f.step,
        value: f.get(),
      }),
    )
    .join('');

  type Binder = { setValue: (v: number) => void; getValue: () => number };
  const scaleBinders: Record<string, Binder> = {};
  for (const f of scaleFields) {
    const range = document.querySelector<HTMLInputElement>(`#${f.id}`)!;
    const num = document.querySelector<HTMLInputElement>(`#n-${f.id.replace(/^k-/, '')}`)!;
    scaleBinders[f.id] = bindSliderNumber(range, num, {
      min: f.min,
      max: f.max,
      step: f.step,
      value: f.get(),
      onChange: () => liveRemap(),
    });
  }

  // —— Primary Night 明度 host (binder wired after toneBinders) ——
  const accentMainHost = document.querySelector<HTMLElement>('#accent-main-control')!;
  accentMainHost.innerHTML = sliderFieldHtml({
    id: 'k-accentMain',
    label: 'accentMain tone · Primary Night 明度',
    min: 0,
    max: 100,
    step: 1,
    value: liveKnobs.trialTone.accentMain,
  });

  // —— Tone sliders (grouped) with number inputs ——
  const toneGroups: Array<{ title: string; prefix: (k: string) => boolean }> = [
    { title: 'Accent', prefix: (k) => k.startsWith('accent') },
    { title: 'Surface', prefix: (k) => k.startsWith('surface') },
    { title: 'Container（表面容器阶梯）', prefix: (k) => k.startsWith('container') },
    { title: 'Neutral', prefix: (k) => k.startsWith('neutral') },
    { title: 'Text', prefix: (k) => k.startsWith('text') },
    { title: 'Inverse', prefix: (k) => k.startsWith('inverse') },
  ];
  const used = new Set<string>();
  const parts: string[] = [];
  const pushTone = (key: TrialToneKnobs extends never ? string : string, label: string) => {
    const v = liveKnobs.trialTone[key as keyof TrialToneKnobs];
    parts.push(`
    <div class="ui-field tone-row" data-tone-field="${key}">
      <label class="ui-label" for="tone-${key}">${label}</label>
      <div class="ui-control-row">
        <input type="range" class="ui-slider" id="tone-${key}" data-tone="${key}" min="0" max="100" step="1" value="${v}" />
        <input type="number" class="ui-input ui-num" data-tone-num="${key}" min="0" max="100" step="1" value="${v}" />
      </div>
    </div>`);
  };
  for (const g of toneGroups) {
    const keys = TONE_KEYS.filter(({ key }) => g.prefix(key));
    if (!keys.length) continue;
    keys.forEach(({ key }) => used.add(key));
    parts.push(`<div class="tone-group-title">${g.title}</div>`);
    for (const { key, label } of keys) pushTone(key, label);
  }
  for (const { key, label } of TONE_KEYS) {
    if (used.has(key)) continue;
    pushTone(key, label);
  }
  toneBox.innerHTML = parts.join('');

  const toneBinders = new Map<string, Binder>();
  let accentMainBinder: Binder;
  for (const { key } of TONE_KEYS) {
    const range = toneBox.querySelector<HTMLInputElement>(`input[data-tone="${key}"]`);
    const num = toneBox.querySelector<HTMLInputElement>(`input[data-tone-num="${key}"]`);
    if (!range || !num) continue;
    toneBinders.set(
      key,
      bindSliderNumber(range, num, {
        min: 0,
        max: 100,
        step: 1,
        value: liveKnobs.trialTone[key],
        onChange: (v) => {
          if (key === 'accentMain') accentMainBinder.setValue(v);
          liveRemap();
        },
      }),
    );
  }

  const accentMainRange = document.querySelector<HTMLInputElement>('#k-accentMain')!;
  const accentMainNum = document.querySelector<HTMLInputElement>('#n-accentMain')!;
  accentMainBinder = bindSliderNumber(accentMainRange, accentMainNum, {
    min: 0,
    max: 100,
    step: 1,
    value: liveKnobs.trialTone.accentMain,
    onChange: (v) => {
      toneBinders.get('accentMain')?.setValue(v);
      liveRemap();
    },
  });

  const hueKeep = document.querySelector<HTMLInputElement>('#k-hueKeep')!;
  const cctBias = document.querySelector<HTMLSelectElement>('#k-cctBias')!;
  const onInvert = document.querySelector<HTMLInputElement>('#k-onInvert')!;
  const lightsSegment = document.querySelector<HTMLElement>('#k-lights-segment')!;
  let lightsLevelUi = clampLightsLevel(liveKnobs.lightsLevel ?? DEFAULT_LIGHTS_LEVEL);
  const primarySegment = document.querySelector<HTMLElement>('#k-primary-segment')!;


  function syncAccentOnMainFromDerive(primaryOnTone: number | null | undefined) {
    if (primaryOnTone == null || !Number.isFinite(primaryOnTone)) return;
    liveKnobs.trialTone.accentOnMain = primaryOnTone;
    toneBinders.get('accentOnMain')?.setValue(primaryOnTone);
  }

  function updatePrimaryFamilyLabel(id: PrimaryFamilyId) {
    const label = document.querySelector<HTMLElement>('#primary-family-label');
    if (label) label.textContent = `${PRIMARY_FAMILY_LABELS[id]} · primary family`;
  }

  function syncPrimarySegment(id: PrimaryFamilyId) {
    primaryFamily = id;
    for (const btn of Array.from(primarySegment.querySelectorAll<HTMLButtonElement>('button[data-primary]'))) {
      const on = btn.dataset.primary === primaryFamily;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
      btn.classList.toggle('is-selected', on);
    }
    updatePrimaryFamilyLabel(primaryFamily);
  }

  function applyPrimaryFamily(id: PrimaryFamilyId, opts: { toast?: boolean } = {}) {
    const hex = primaryDayHexFor(id);
    const overrides = primaryDayOverridesFor(id);
    liveDay = { ...liveDay };
    liveDay['primary.main'] = hex.main;
    liveDay['primary.container'] = hex.container;
    liveDay['primary.on-container'] = hex.onContainer;
    liveDay['inverse.primary'] = hex.inverse;
    // theme follow-refs flattened to primary.main at emit time
    if (liveDay['outline.default']) liveDay['outline.default'] = hex.main;
    if (liveDay['outline.ring']) liveDay['outline.ring'] = hex.main;
    liveKnobs = readKnobsFromControls();
    liveKnobs.dayRoleOverrides = {
      ...(liveKnobs.dayRoleOverrides ?? {}),
      ...overrides,
    };
    // Soft per-family accentMain preset (user can still dial); does not rewrite knobs.json global default.
    const hint = PRIMARY_FAMILY_ACCENT_MAIN_HINT[id];
    liveKnobs.trialTone.accentMain = hint;
    accentMainBinder.setValue(hint);
    toneBinders.get('accentMain')?.setValue(hint);
    syncPrimarySegment(id);
    const { night, strategies, primaryOnTone } = remapFlatDayToNight(liveDay, liveKnobs);
    liveNight = night;
    liveStrategies = strategies;
    syncAccentOnMainFromDerive(primaryOnTone);
    if (!modeInput.checked) modeInput.checked = true;
    paint();
    if (opts.toast) {
      toast(`Primary → ${PRIMARY_FAMILY_LABELS[id]}（accentMain≈${hint}；on.main 已按亮度重算）`);
    }
  }

  function updateSceneLabel(level: number) {
    const label = document.querySelector<HTMLElement>('#lights-scene-label');
    if (label) label.textContent = `${nightSceneName(level)} · lightsLevel`;
  }

  function syncLightsSegment(level: number) {
    lightsLevelUi = clampLightsLevel(level);
    for (const btn of Array.from(lightsSegment.querySelectorAll<HTMLButtonElement>('button[data-level]'))) {
      const on = Number(btn.dataset.level) === lightsLevelUi;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
      btn.classList.toggle('is-selected', on);
    }
    updateSceneLabel(lightsLevelUi);
  }

  function syncControlsFromKnobs() {
    hueKeep.checked = !!liveKnobs.hueKeep;
    cctBias.value = String(liveKnobs.cctBias ?? 'neutral');
    onInvert.checked = !!liveKnobs.onRoleUseInvert;
    syncPrimarySegment(detectPrimaryFamilyFromOverrides(liveKnobs.dayRoleOverrides));
    scaleBinders['k-c-accent']?.setValue(liveKnobs.chromaScale.accent);
    scaleBinders['k-c-surface']?.setValue(liveKnobs.chromaScale.surface);
    scaleBinders['k-c-neutral']?.setValue(liveKnobs.chromaScale.neutral);
    scaleBinders['k-c-text']?.setValue(liveKnobs.chromaScale.text);
    scaleBinders['k-f-accent']?.setValue(liveKnobs.chromaFloor.accent);
    scaleBinders['k-f-surface']?.setValue(liveKnobs.chromaFloor.surface);
    scaleBinders['k-f-neutral']?.setValue(liveKnobs.chromaFloor.neutral);
    const level = clampLightsLevel(liveKnobs.lightsLevel ?? DEFAULT_LIGHTS_LEVEL);
    syncLightsSegment(level);
    for (const { key } of TONE_KEYS) {
      toneBinders.get(key)?.setValue(liveKnobs.trialTone[key]);
    }
    accentMainBinder.setValue(liveKnobs.trialTone.accentMain);
  }

  function readKnobsFromControls(): ColorRuleKnobs {
    const next = deepCloneKnobs(liveKnobs);
    next.lightsLevel = clampLightsLevel(lightsLevelUi);
    next.hueKeep = hueKeep.checked;
    next.cctBias = cctBias.value;
    next.onRoleUseInvert = onInvert.checked;
    next.chromaScale.accent = scaleBinders['k-c-accent'].getValue();
    next.chromaScale.surface = scaleBinders['k-c-surface'].getValue();
    next.chromaScale.neutral = scaleBinders['k-c-neutral'].getValue();
    next.chromaScale.text = scaleBinders['k-c-text'].getValue();
    next.chromaFloor.accent = scaleBinders['k-f-accent'].getValue();
    next.chromaFloor.surface = scaleBinders['k-f-surface'].getValue();
    next.chromaFloor.neutral = scaleBinders['k-f-neutral'].getValue();
    for (const { key } of TONE_KEYS) {
      const b = toneBinders.get(key);
      if (b) next.trialTone[key] = b.getValue();
    }
    // Prominent Primary Night 明度 dial is source of truth for accentMain (keeps dual controls in sync).
    next.trialTone.accentMain = accentMainBinder.getValue();
    return next;
  }

  function renderSwatches() {
    swatchBox.innerHTML = SWATCH_PATHS.map((path) => {
      const day = liveDay[path] ?? '#ccc';
      const night = liveNight[path] ?? '#333';
      return `
        <div class="swatch">
          <div class="swatch-pair">
            <span class="chip" style="background:${day}" title="day ${day}"></span>
            <span class="chip" style="background:${night}" title="night ${night}"></span>
          </div>
          <code>${path}</code>
          <small>${day} → ${night}</small>
        </div>`;
    }).join('');
  }

  function renderStrategy() {
    const lines = SWATCH_PATHS.map((p) => `${p}: ${liveStrategies[p] ?? '—'}`);
    strategyDump.textContent =
      `engine: pure-color (resolve Day hex → HCT rule → Night hex)\n` +
      `primaryFamily=${primaryFamily} day.primary.main=${liveDay['primary.main'] ?? '—'}\n` +
      `scene=${nightSceneName(liveKnobs.lightsLevel)} lightsLevel=${liveKnobs.lightsLevel} (1月光…${LIGHTS_LEVEL_MAX}晚霞; surface+cct follow scene; accent@晚间)\n` +
      `cctBias=${liveKnobs.cctBias} hueKeep=${liveKnobs.hueKeep} onInvert=${liveKnobs.onRoleUseInvert}\n` +
      `trialTone.accentMain=${liveKnobs.trialTone.accentMain} (Primary Night 明度 dial; scene-preserved; default 75)\n` +
      `dynamic on.main: accentOnMain=${liveKnobs.trialTone.accentOnMain} night.primary.on-main=${liveNight['primary.on-main'] ?? '—'} (WCAG-ish T100/T10 vs primary.main; prefer ≥4.5)\n` +
      `surface.default=${liveKnobs.trialTone.surfaceDefault} (trial)\n` +
      lines.join('\n');
  }

  const paint = () => {
    const night = modeInput.checked;
    shell.dataset.mode = night ? 'night' : 'day';
    applyTokens(night ? liveNight : liveDay);
    modeLabel.textContent = night
      ? '当前：Night（夜间 · 可由调试面板实时重映射）'
      : '当前：Day（日间）';
    renderSwatches();
    renderStrategy();
    refreshIcons(document);
  };

  function liveRemap(opts: { toast?: boolean } = {}) {
    liveKnobs = readKnobsFromControls();
    const { night, strategies, primaryOnTone } = remapFlatDayToNight(liveDay, liveKnobs);
    liveNight = night;
    liveStrategies = strategies;
    syncAccentOnMainFromDerive(primaryOnTone);
    if (!modeInput.checked) modeInput.checked = true;
    paint();
    if (opts.toast) toast('已实时重映射 Night（仅浏览器；落盘请 pnpm derive）');
  }

  function applyLightsMaster(levelRaw: number) {
    const level = clampLightsLevel(levelRaw);
    syncLightsSegment(level);
    liveKnobs = readKnobsFromControls();
    liveKnobs = applyNightScene(liveKnobs, level);
    updateSceneLabel(level);
    // Sync linked surface/text/neutral tones
    for (const key of LIGHTS_LINKED_KEYS) {
      toneBinders.get(key)?.setValue(liveKnobs.trialTone[key]);
    }
    // Pin other accent* + inversePrimary to 晚间 anchor; accentMain preserved by applyNightScene
    for (const key of Object.keys(ACCENT_ANCHOR_TONES) as Array<keyof typeof ACCENT_ANCHOR_TONES>) {
      toneBinders.get(key)?.setValue(liveKnobs.trialTone[key]);
    }
    accentMainBinder.setValue(liveKnobs.trialTone.accentMain);
    // Sync cct + surface/neutral floor/scale sliders from scene
    cctBias.value = String(liveKnobs.cctBias ?? 'neutral');
    scaleBinders['k-f-surface']?.setValue(liveKnobs.chromaFloor.surface);
    scaleBinders['k-f-neutral']?.setValue(liveKnobs.chromaFloor.neutral);
    scaleBinders['k-c-surface']?.setValue(liveKnobs.chromaScale.surface);
    scaleBinders['k-c-neutral']?.setValue(liveKnobs.chromaScale.neutral);
    const { night, strategies, primaryOnTone } = remapFlatDayToNight(liveDay, liveKnobs);
    liveNight = night;
    liveStrategies = strategies;
    syncAccentOnMainFromDerive(primaryOnTone);
    if (!modeInput.checked) modeInput.checked = true;
    paint();
  }

  lightsSegment.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest?.('button[data-level]');
    if (!btn || !lightsSegment.contains(btn)) return;
    applyLightsMaster(Number((btn as HTMLButtonElement).dataset.level));
  });

  lightsSegment.addEventListener('keydown', (ev) => {
    let level = lightsLevelUi;
    switch (ev.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        level = level % NIGHT_SCENE_NAMES.length + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        level = (level + NIGHT_SCENE_NAMES.length - 2) % NIGHT_SCENE_NAMES.length + 1;
        break;
      case 'Home':
        level = 1;
        break;
      case 'End':
        level = NIGHT_SCENE_NAMES.length;
        break;
      default:
        return;
    }
    ev.preventDefault();
    applyLightsMaster(level);
    lightsSegment.querySelector<HTMLButtonElement>(`button[data-level="${level}"]`)?.focus();
  });

  primarySegment.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest?.('button[data-primary]');
    if (!btn || !primarySegment.contains(btn)) return;
    const id = (btn as HTMLButtonElement).dataset.primary as PrimaryFamilyId;
    if (!PRIMARY_FAMILY_IDS.includes(id)) return;
    applyPrimaryFamily(id);
  });

  primarySegment.addEventListener('keydown', (ev) => {
    const idx = PRIMARY_FAMILY_IDS.indexOf(primaryFamily);
    let next = idx;
    switch (ev.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (idx + 1) % PRIMARY_FAMILY_IDS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (idx + PRIMARY_FAMILY_IDS.length - 1) % PRIMARY_FAMILY_IDS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = PRIMARY_FAMILY_IDS.length - 1;
        break;
      default:
        return;
    }
    ev.preventDefault();
    applyPrimaryFamily(PRIMARY_FAMILY_IDS[next]);
    primarySegment.querySelector<HTMLButtonElement>(`button[data-primary="${PRIMARY_FAMILY_IDS[next]}"]`)?.focus();
  });

  syncControlsFromKnobs();
  modeInput.addEventListener('change', paint);
  paint();

  document.querySelector('#toggle-debug')?.addEventListener('click', () => {
    const hidden = debugPanel.classList.toggle('collapsed');
    document.querySelector('#toggle-debug')?.setAttribute('aria-expanded', String(!hidden));
    refreshIcons(document);
  });

  document.querySelector('#apply-live')?.addEventListener('click', () => liveRemap({ toast: true }));

  for (const el of [hueKeep, cctBias, onInvert]) {
    el.addEventListener('change', () => liveRemap());
    el.addEventListener('input', () => liveRemap());
  }

    document.querySelector('#reset-knobs')?.addEventListener('click', () => {
    liveKnobs = deepCloneKnobs(baseKnobs);
    liveDay = { ...data.day };
    const fam = detectPrimaryFamilyFromOverrides(liveKnobs.dayRoleOverrides);
    const hex = primaryDayHexFor(fam);
    liveDay['primary.main'] = hex.main;
    liveDay['primary.container'] = hex.container;
    liveDay['primary.on-container'] = hex.onContainer;
    liveDay['inverse.primary'] = hex.inverse;
    if (liveDay['outline.default']) liveDay['outline.default'] = hex.main;
    if (liveDay['outline.ring']) liveDay['outline.ring'] = hex.main;
    syncControlsFromKnobs();
    const { night, strategies, primaryOnTone } = remapFlatDayToNight(liveDay, liveKnobs);
    liveNight = night;
    liveStrategies = strategies;
    syncAccentOnMainFromDerive(primaryOnTone);
    paint();
    toast('已重置为 derive 时 knobs');
  });


  document.querySelector('#copy-knobs')?.addEventListener('click', async () => {
    liveKnobs = readKnobsFromControls();
    const payload = {
      $comment: 'TRIAL knobs copied from preview — NOT product defaults',
      ...liveKnobs,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast('已复制 knobs JSON（可粘贴覆盖 knobs.json）');
  });

  document.querySelector('#copy-mode')?.addEventListener('click', async () => {
    const night = modeInput.checked;
    const pack = night ? liveNight : liveDay;
    const summary = SWATCH_PATHS.map((k) => `${k}: ${pack[k] ?? '—'}`).join('\n');
    await navigator.clipboard.writeText(summary);
    toast('已复制色板摘要');
  });
}


boot().catch((err) => {
  app.innerHTML = `<pre class="boot-error">${String(err)}\n\n请在 experiments/night-derive 运行：pnpm install && pnpm derive && pnpm preview:only</pre>`;
});
