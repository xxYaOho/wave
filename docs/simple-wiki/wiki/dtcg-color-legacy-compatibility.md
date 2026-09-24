---
title: DTCG Color Legacy Compatibility
type: concept
created: 2026-08-31
updated: 2026-08-31
sources: [raw/dtcg-color-legacy-compatibility.md, raw/2026-06-29-dtcg-color-support.md, raw/2026-07-09-wave-dt-manual-test-fixes.md, raw/2026-07-29-dtcg-standard-types-retrospective.md, raw/handoff.md]
topic: DTCG 类型与转换
tags: [DTCG, color, compatibility, transformer, legacy]
context: 2
status: current
---

# DTCG Color Legacy Compatibility

## 首选形状与兼容边界

Wave 的首选颜色输入是 DTCG Color Module 风格对象，例如包含 `colorSpace`、`components`、`alpha` 和可选 `hex` 的 `$value`。Hex 字符串、`{ color, alpha }` 旧对象、带 `_swatchName` 的完整 token wrapper，以及按颜色空间包裹的历史对象仍可在 color context 中被接受；这些是兼容输入，不是新增的公共 authoring syntax。[DTCG Color Legacy Compatibility](../raw/dtcg-color-legacy-compatibility.md)

6/29 的 DTCG Color 合同要求 `colorSpace` 与 `components`，`alpha` 可省略且默认 `1`，`hex` 只能作为合法的六位 `#RRGGBB` fallback；只有 `{ hex: "#..." }` 的对象不是 DTCG Color，也不是 Wave 新语法。标准 component 是 `number | "none"`。Wave 接受标准色彩空间的对象形状，但当前可计算输出空间是 `hex`、`oklch`、`srgb`、`hsl`；其他空间或含 `none` 的组件必须提供合法 fallback，否则构建失败。带 legacy percent string 的组件只走内部 fallback 兼容路径，不扩张公共 DTCG component 类型。[DTCG Color Support Implementation Plan](../raw/2026-06-29-dtcg-color-support.md)

颜色 fallback 的 alpha 不写入 `hex` 字段；归一化后再按目标平台生成带 alpha 的值。直接颜色、`border.color`、`shadow.color`、`gradient.color` 以及 current/inherit color 路径都必须经过同一 transformer 归一化，不能由各 formatter 重新解释 DTCG object。[DTCG Color Support Implementation Plan](../raw/2026-06-29-dtcg-color-support.md)

## 责任归属

兼容语义属于 transformer：`color-value.ts` 负责把已支持的形状归一化为最终输出字符串，`theme-transformer.ts` 只负责识别 scalar color、`shadow.color` 和 `gradient.color` 等颜色上下文。parser、resource loader、resolver 不决定颜色输出语义；CSS、JSON、JSONC、Sketch 和 doctor 应接收归一化值，或在对象泄漏时快速失败。[DTCG Color Legacy Compatibility](../raw/dtcg-color-legacy-compatibility.md)

这条边界与 [DTCG 标准类型优化复盘](dtcg-standard-types-retrospective.md) 的分层规则一致。不要把历史颜色形状扩散到 generator；否则兼容语义会被平台格式实现各自复制，后续移除会更难。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)

## 当前耦合与债务判断

归一化规则集中在 `color-value.ts`，颜色上下文门控仍在 `theme-transformer.ts`，因此删除兼容形状需要同时检查两个模块。该耦合目前为 medium-low：已知失败模式有 unit、integration、Quality Harness 和真实 source smoke 覆盖，现阶段没有仅为清理债务而立刻删除的用户收益。[DTCG Color Legacy Compatibility](../raw/dtcg-color-legacy-compatibility.md)

handoff 中记录的 border composite 颜色回归提供了相邻证据：引用颜色若停留在 border `$value.color` 内部，CSS 可能退回 `currentColor`、Sketch 可能得到黑色；修复点是 transformer 的 nested color normalization，且 CSS/Sketch 需一起回归。这个证据说明了边界的重要性，但不应被误读为一种新的用户引用语法。[Wave DT Research Handoff](../raw/handoff.md)

7/9 manual-test-fixes 进一步把这个失败模式收敛为验证护栏：border、shadow、gradient 的嵌套 color 和 length 必须在 transformer 阶段物化，CSS/Sketch formatter 遇到未归一化 object 应失败或明确格式化，禁止静默产生 `[object Object]`、意外 `currentColor` 或 Sketch 黑色 fallback。编译二进制的 resource lookup 和 doctor 默认入口是相邻但独立的边界，不能靠修 formatter 掩盖。[Wave DT Manual Test Fixes Implementation Plan](../raw/2026-07-09-wave-dt-manual-test-fixes.md) [Wave DT Research Handoff](../raw/handoff.md)

## 逐步移除顺序

只有真实 source 不再使用某种形状时，才按以下顺序逐一移除：

1. 先为历史颜色空间 wrapper 和不带 `/$value` 的 token wrapper 增加 warning/debug trace，并保持标准 DTCG 对象安静。
2. 将颜色可归一化判断收敛到 `color-value.ts` 的单一 helper，让 transformer 只决定当前位置是否为 color context。
3. 以 Orca fixtures 与真实 smoke 测量实际用量。
4. 依次移除颜色空间 wrapper、token `$value` wrapper、`{ color, alpha }` 对象；Hex 仅在未来 major contract 明确替代后再移除。
5. 每次移除都添加清晰失败测试，禁止回到静默的 `[object Object]` 输出。[DTCG Color Legacy Compatibility](../raw/dtcg-color-legacy-compatibility.md)

## 验证合同

颜色兼容改动至少保留 color-value、theme-transformer、CSS、Sketch、theme-service 的 focused tests，随后运行 typecheck 和完整 test suite；若 Orca source 可用，再做 CSS/Sketch 双平台 smoke，并对 `[object Object]`、意外 `currentColor` 和 Sketch 黑色 fallback 做负向断言。6/29 与 7/9 文件包含实施步骤和未勾选任务，不能单凭其标题宣称当前发布状态；可复用的发布/运行时结论应以仓库 fixture、真实 smoke 和 handoff 证据为准。[DTCG Color Support Implementation Plan](../raw/2026-06-29-dtcg-color-support.md) [Wave DT Manual Test Fixes Implementation Plan](../raw/2026-07-09-wave-dt-manual-test-fixes.md) [Wave DT Research Handoff](../raw/handoff.md)
