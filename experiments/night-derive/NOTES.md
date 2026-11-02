# Night Derive — 短记

日期：2026-11-01（Asia/Shanghai） · sandbox 切片，非正式产品默认。

## 规则函数（主路径）

**纯色彩规则**，不是 palette step 翻转：

```
Day 角色叶子 → 解析为 hex（palette ref / HSL / hex）
            → dayHexToNightHex(path, knobs)   // HCT：保色相 + trial tone/chroma/CCT
            → Night hex 叶子写入 @night.yaml
```

实现：`src/color-rules.ts`（`dayHexToNightHex` / `remapFlatDayToNight`），`src/derive.ts` 负责走树与落盘。

- `paletteStepMap` **已退出主路径**（可选 debug 标志 `debugPaletteStepFallback`，默认 false，未接线）。
- 旧 Lab 观察点 **T65 不是产品默认**；`trialTone.*` 均为手调占位。

## 开放旋钮（`knobs.json`）

| 旋钮 | 含义 |
| --- | --- |
| `hueKeep` | 是否保留 Day 色相（可加 `hueShiftByRole`） |
| `trialTone.*` | 各角色 HCT tone 目标 0–100（**trial**） |
| `chromaScale.accent/neutral/surface/text` | 彩度倍率 |
| `chromaFloor.*` | 彩度下限（防 Day 近白塌成灰泥） |
| `dayRoleOverrides` | 推导前改写 Day 角色叶子（本 sandbox：primary→Tailwind cyan） |
| `lightsLevel` | Night 关灯程度 1–5（1 最暗）；拖动重写联动 trialTone 基线，细调滑杆事后绝对值覆盖 |
| `cctBias` + `cctHueShiftDeg` | 中性/表面相关色温偏移（neutral/warm/cool） |
| `onRoleUseInvert` | on-* 用 `100−dayTone` 代替 trial 槽位 |
| `includeStateInOverlay` / `state` | state 是否写入；默认 passthrough |

## 调试面板（预览页）

打开 `http://127.0.0.1:5191/` 后，看板**顶部下方**有醒目的 **「Night 调试 / Knobs」** 面板（顶栏按钮「调试面板」可折叠）：

- 调 hueKeep / cctBias / chroma / trialTone → **实时重映射** Night
- Day→Night 样例色板（含 `primary.main`）
- 策略摘要 dump
- 「复制 knobs JSON」可粘贴回 `knobs.json`；**落盘**仍需 `pnpm derive`

## 如何视觉验收

1. `pnpm derive && pnpm preview:only` → `http://127.0.0.1:5191/`
2. 确认调试面板可见；切 **夜间** 或拖旋钮（会自动切夜）
3. 看侧栏 / KPI / 行情 / 净值线 / 涨跌色是否仍像 orca 家族
4. Diff：`out/orca@night.yaml`；策略：`out/mapped-roles.json`

## 2026-11-01 偏灰修订（trial）

- 诊断：surface/container tone 偏中段 + surface chromaScale 过低 + Day 近白 chroma≈0 → Night 灰雾。
- 对策：加深 `trialTone.surface*` / `container*`；抬 `chromaScale`；加 `chromaFloor`；`cctBias=warm` 做墨色倾向。
- 仍走纯 `dayHexToNightHex`，未复活 paletteStepMap。

## 2026-11-01 续：accentContainer + cyan primary

- `trialTone.accentContainer` → **9**（与更深 Night 容器层级对齐；**不是** accentMain）。
- `dayRoleOverrides`：Day `primary.*` / `inverse.primary` → Tailwind **cyan** 后再跑 `dayHexToNightHex`。
  - `primary.main` / `on-container` → `cyan.600` `#0891b2`
  - `primary.container` → `cyan.50` `#ecfeff`
  - `inverse.primary` → `cyan.100` `#cffafe`
  - `primary.on-main` 仍为 white
- outline/ring 经 `{theme.color.primary.main}` 跟随新 Day primary。


## Preview UI (shadcn-style + lucide CDN)

- **lucide**: `unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js` in `index.html`; `refreshIcons()` → `lucide.createIcons()`.
- **shadcn-ui**: no React island — CSS primitives (`.ui-slider` / `.ui-input` / `.ui-switch` / `.ui-select` / `.ui-btn` / `.ui-card`) matching shadcn tokens; helpers in `src/preview/ui-kit.ts`.
- Every range control has a synced number input (clamp min/max/step).

## lightsLevel / 光场场景（2026-11-02）

- 默认 **3 = 晚间**（中性夜；`cctBias=neutral`）。
- 五档命名预设（非单轴更亮=更艳）：**月光 / 夜灯 / 晚间 / 烛光 / 晚霞**。
- 联动表面：surface*、container*、neutral*（chrome）、text*、inverseOnSurface + `cctBias` + mild `chromaFloor.surface/neutral`。
- **不**联动 accent* / inversePrimary（锚定晚间 L3 owl-eyes）；也不联动 inverseSurface、shadow、scrim；accent chromaFloor/scale 固定。
- 语义：`applyNightScene` 写场景基线；细调 = 绝对值覆盖，直到再次切换场景。
- 暖光（烛光/晚霞）**brand-safe**：`cctWarmMix` 只染 **surface / layout-container** 炭灰 chrome（弱 Lab→琥珀极）。**primary/secondary/state 及 `*.container` 永不 warm-mix**，跨场景保持 Day→Night 品牌色相（BMW 蓝测）。月光 cool；晚间 neutral。
- accent `*.container`：tone≈18 + 软 chroma（scale 0.75 / floor 6）减轻洞穴感；**不做**向 surface 的暖混（避免污染品牌填充）。`*.main` 仍晚间 owl-eyes。

## Human 路径

```
Wave sandbox:  /Users/teatao/Projects/cli_wave/experiments/night-derive/
草稿:          .../out/orca@night.yaml
Day 源:        /Users/teatao/Projects/my-color/orca/main.yaml
预览:          http://127.0.0.1:5191/
```

默认 **不**写 `orca/main@night.yaml`；旁路：`COPY_SIBLING=1 pnpm derive`。

## 2026-11-02 续：暖光再降 + 双场 falloff

- Warm dialed again: 烛光 `warmMix` 0.08→**0.035**，晚霞 0.09→**0.04**；`cctWarmPoleChroma` 18→**12**；chromaFloorSurface 烛光 3.8→**3.55** / 晚霞 4.0→**3.6**（贴近晚间，暖意靠 mix）。
- Dual-field falloff（仅 surface / layout-container，`wantsWarmMix` 未改）：**烛光** local pool（container high/highest 1.0 → surface dim 0.15）；**晚霞** global veil（uniform 1.0）。strategy tag 写 effectiveMix。

## 2026-11-02 · Primary Night 明度 dial（t98u / t99u）

- **默认不变**：`trialTone.accentMain` / `ACCENT_ANCHOR_TONES.accentMain` 仍为 **75**（当前 Day/Night `primary.main` 距离保留；Day cyan.600 HCT≈55.6，Night T75 为既有 owl-eyes）。
- **旋钮**：右栏调试面板「Primary Night 明度」→ `accentMain tone`（slider+number），临时下调可拉近 Night；与 trialTone Accent 组内 `accentMain` 双向同步。
- **场景保留**：`applyNightScene` 仍 pin 其他 accent* / inversePrimary 到晚间 anchor，但 **PRESERVE** 调用方的 `accentMain`，切 月光…晚霞 不覆盖此 dial。
- 重置 / knobs.json 默认恢复 75。

## 2026-11-02 · Dynamic on.main（t101u）

**问题**：accentMain 降到 ~50–60（indigo/blue/rose 常见）时，固定 `accentOnMain=21` 深墨叠在偏深的 `primary.main` 上对比不足（chip「近 1 月」）。

**规则（模拟生产对比行为）**：
1. 先按既有 color-rule 算出 Night `*.main`（**品牌色相保留在 primary.main**）。
2. 对每个 accent 根的 `*.on-main`，用 Night fill 算 WCAG 对比：近白 **T100** vs 近深墨 **T10**。优先选能达到 **≥4.5:1** 的一侧；两侧都不够则取更高者；再平则 `Y &lt; 0.179` → 近白。
3. 写回 `primary.on-main`（及 secondary/error/… on-main）、策略串 `dynamic-on-main|…`，并反射 `trialTone.accentOnMain`；预览 CSS：`--primary-on-main` + `--color-primary-on-main`。
4. live remap / accentMain 滑杆 / primary family segment / 场景切换 均走 `remapFlatDayToNight` → 自动刷新 on.main。

**Per-family accentMain 软预设**（切 segment 时写入 dial，**不**改 knobs 全局默认 75；用户仍可拧）：

| family | hint |
| --- | --- |
| indigo / blue / rose | **55**（50–60 带） |
| cyan / teal / olive | **75** |
| amber | **78**（70–80 带） |

---

## NOT YET — product `night create` CLI（仅笔记，勿实现）

后续产品计划（Human / t101u defer）：

1. Open `night create`：读 `$config` → 写出 `@night.yaml`；缺参 → 默认 scene=`night` + chroma=`0.7`
2. Params：`scenes` = `moon` | `night-light` | `night` | `candle-light` | `sunset`；`chroma` 0–1
3. chroma-ev 固定台阶：`minimal` / `low` / `medium` / `high` / `max` → `0.5` / `0.6` / `0.7` / `0.75` / `0.85`

（本 sandbox 仍用 knobs + `pnpm derive`；无 product CLI。）
