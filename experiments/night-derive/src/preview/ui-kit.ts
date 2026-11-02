/** Lightweight shadcn-style control helpers for the Vite vanilla preview (CDN lucide + CSS kit). */

export type SliderNumberOpts = {
  min: number;
  max: number;
  step: number;
  value: number;
  /** Called after clamp/sync with the new numeric value. */
  onChange?: (value: number) => void;
};

function snap(v: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(v)) v = min;
  const clamped = Math.min(max, Math.max(min, v));
  if (!step || step <= 0) return clamped;
  const decimals = String(step).includes('.') ? (String(step).split('.')[1]?.length ?? 0) : 0;
  const snapped = Math.round((clamped - min) / step) * step + min;
  const rounded = Number(snapped.toFixed(Math.min(6, decimals)));
  return Math.min(max, Math.max(min, rounded));
}

/** Keep a range slider and a number input in sync; clamp to min/max/step. */
export function bindSliderNumber(
  range: HTMLInputElement,
  num: HTMLInputElement,
  opts: SliderNumberOpts,
): { setValue: (v: number) => void; getValue: () => number } {
  range.min = String(opts.min);
  range.max = String(opts.max);
  range.step = String(opts.step);
  num.min = String(opts.min);
  num.max = String(opts.max);
  num.step = String(opts.step);

  const apply = (raw: number, emit: boolean) => {
    const v = snap(raw, opts.min, opts.max, opts.step);
    range.value = String(v);
    num.value = String(v);
    if (emit) opts.onChange?.(v);
    return v;
  };

  apply(opts.value, false);

  range.addEventListener('input', () => apply(Number(range.value), true));
  num.addEventListener('change', () => apply(Number(num.value), true));
  num.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply(Number(num.value), true);
      num.blur();
    }
  });

  return {
    setValue: (v) => apply(v, false),
    getValue: () => snap(Number(range.value), opts.min, opts.max, opts.step),
  };
}

declare global {
  interface Window {
    lucide?: {
      createIcons: (opts?: { attrs?: Record<string, string>; nameAttr?: string }) => void;
      icons?: Record<string, unknown>;
    };
  }
}

/** Refresh lucide icons under root (data-lucide attributes). */
export function refreshIcons(root: ParentNode = document): void {
  try {
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': '1.75' } });
  } catch {
    /* CDN may be blocked offline — icons optional */
  }
}

/** Build a labeled slider+number field (shadcn-style markup). */
export function sliderFieldHtml(opts: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  numId?: string;
  rowClass?: string;
}): string {
  const numId = opts.numId ?? `n-${opts.id.replace(/^k-/, '')}`;
  return `
    <div class="ui-field ${opts.rowClass ?? ''}">
      <label class="ui-label" for="${opts.id}">${opts.label}</label>
      <div class="ui-control-row">
        <input type="range" class="ui-slider" id="${opts.id}" min="${opts.min}" max="${opts.max}" step="${opts.step}" value="${opts.value}" />
        <input type="number" class="ui-input ui-num" id="${numId}" min="${opts.min}" max="${opts.max}" step="${opts.step}" value="${opts.value}" />
      </div>
    </div>`;
}
