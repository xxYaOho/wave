# Wave Color Lab

独立的色彩生成实验页，不接入 Wave 的 build、resource 或 night overlay 合同。

```bash
cd experiments/color-night
pnpm install
pnpm dev
```

页面使用 `@material/material-color-utilities@0.4.0` 的 `DynamicScheme`（2021 规范），从同一基础色生成 day 与 night 的角色色。可切换 Tonal Spot、Neutral、Vibrant，并调整 Material 的 `contrastLevel`。Night 的 `primary.main` 单独提供 T60–T80 明度实验控制，默认 T65；其他角色仍取自 Material。色值点击可复制；URL 保存当前输入。

50–950 是 Wave 的实验档位，对应 HCT tone 为 `98, 95, 90, 80, 70, 60, 50, 40, 30, 20, 10`。这不是 Material 官方的档位命名，也尚未确定为 Wave 的正式映射。

黄色种子额外展示一条候选色阶：把常见 Tailwind Yellow v3 固定色板的 HCT 色相、彩度和明度走势作为参考曲线，以输入色作为 500 锚点推导。这是 Wave 实验公式，不是 Tailwind 的生成算法，也不改变上方 Material 角色色。

当前页面用于比较算法效果；尚未生成 `@night.yaml`，也没有实现 `$helper`、`ag` 引用、profile 合并或设计师微调覆盖。
