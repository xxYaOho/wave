---
class: material
ingested: false
integrated: false
metadata:
  title: Wave Night settled color-rule 笔记
  date: 2026-11-02
---

# Wave Night settled color-rule 笔记

本材料记录从 `experiments/night-derive` 提升进产品路径的 **settled** Day→Night 纯函数约定。实现真源：`src/core/night/color-rules.ts`（规则）+ `derive-overlay.ts` 的 `buildProductKnobs`（产品旋钮装配）。旧 Lab T65 等试验观测不是批准默认。

## 管道位置

1. Day 主题经 Wave pipeline 解析 → `theme.color` / `theme.state`。
2. 叶子颜色 `normalizeColorValue(..., 'hex')` 展平。
3. `buildProductKnobs(resolvedParams)`：`DEFAULT_TRIAL_KNOBS` + 产品 chroma 映射 + `applyNightScene(lightsLevel)`。
4. `remapFlatDayToNight` → overlay 树（alpha 折回 hex/hex8）；`state` 默认 passthrough 写入 overlay。

## 角色策略（摘要）

- 路径分类为 accent / neutral / text / surface / layout-container / inverse / border / outline / shadow / scrim / transparent / other。
- **Hue keep** 为默认；cool CCT 可对表面类做小幅 HCT 色相偏移；warm **不是**绝对旋到棕色。
- **Brand-safe warm mix**：仅 warm scene（烛光 / 晚霞）对 **surface charcoal chrome** 做弱 Lab 混合（朝同 tone 的琥珀极，`cctWarmMix` × falloff）。Accent、on-\*、accent container、inverse.primary、text、brand-adjacent neutrals **永不** warm-mix。
- Accent container 填充用更软 chroma（相对 accentMain）；owl-eyes 对比靠深 surface，不靠拉高 accent chroma。
- `onRoleUseInvert` 产品默认 **false**；产品路径用动态 `on.main` 目标 tone 槽，而不是简单 `100 - dayTone` 作为默认策略开关打开态。
- Near-achromatic Day 源靠 **chromaFloor** 避免 Night 塌成灰泥；accent 产品锚 floor=16（在 chroma=0.7）。

## Scene 与 accent 锚

`applyNightScene`：

- 更新 lights-linked surface/container/neutral/text tones（level 1 月光近黑 … level 5 晚霞抬升但仍是 Night）。
- 写入 scene 的 `cctBias` / `warmMix` / surface·neutral chroma floor·scale。
- **Accent\* 与 inversePrimary 钉在晚间锚**（`ACCENT_ANCHOR_TONES`）；`accentMain` 默认 75，scene 切换保留调用方 dial，不被 scene 覆写。

产品英文 scene → level 映射与 CLI 材料一致：`moon`…`sunset` → 1…5。

## 产品 chroma 拨盘

`accentChromaFromProduct(chroma)` 以 `0.7` 为锚：

- `scale = clamp(1.2 * (chroma/0.7), 0.2, 2.4)`
- `floor = clamp(16 * (chroma/0.7), 0, 40)`

装配时只改 knobs 的 accent `chromaScale` / `chromaFloor`；再交给 `applyNightScene`。

## Overlay 合同提醒

- 只发射已存在的 color（及可选 state）叶子；不发明新 token 路径。
- 无根 `$id`；消费方身份见 Token Manage 材料。
- transparent 等特殊叶子可 passthrough；无法 remap 的叶子带原 Day hex（策略标记），不阻断写出。

## 非目标

- 不把 sandbox 全部 trial 滑杆暴露为 CLI。
- 不把 Dark profile 当成 Night mode。
- 不在本材料展开完整 HCT 公式表；以源码 `dayHexToNightHex` / `applyWarmLabMix` 为准。
