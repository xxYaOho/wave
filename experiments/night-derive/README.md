# Wave Night Derive（独立 sandbox）

Validate-first 的 **Day → Night** 推导沙盒。主路径是 **纯色彩规则函数**：把 Day 角色解析成 hex / HSL / HCT，再按 hue-keep + trial tone/chroma/CCT 旋钮生成 Night hex 叶子，写出 Wave overlay 合同下的 `@night.yaml`，并用金融看板 + **调试面板**做日/夜对照。

- **不**改 Wave CLI schema / pipeline  
- **不**把 palette step 翻转当主故事（已移除主路径）  
- **不**把 Material `DynamicScheme(isDark)` 或旧 Lab T65 伪装成产品默认  
- **不**自动 `git commit`

## 怎么跑

```bash
cd experiments/night-derive
pnpm install
pnpm derive          # 读 Day → out/orca@night.yaml + preview tokens
pnpm dev             # derive 后启动预览 http://127.0.0.1:5191/
# 或已生成过 tokens 时：
pnpm preview:only
```

预览页顶部有 **Night 调试 / Knobs** 面板：拖旋钮即实时重映射 Night；落盘请把复制的 JSON 写回 `knobs.json` 再 `pnpm derive`。

默认 Day 源：`/Users/teatao/Projects/my-color/orca/main.yaml`  
覆盖：`DAY_YAML=… CORERAIN_YAML=… pnpm derive`  
可选旁路副本：`COPY_SIBLING=1 pnpm derive`

## 产出

| 路径 | 说明 |
| --- | --- |
| `out/orca@night.yaml` | overlay 草稿（hex 叶子） |
| `out/preview-tokens.json` | Day/Night hex + knobs + mapped |
| `out/mapped-roles.json` | 每角色策略（`color-rule:…`） |
| `public/preview-tokens.json` | Vite 预览副本 |
| `knobs.json` | trial 旋钮 |
| `src/color-rules.ts` | 纯规则函数 |
| `NOTES.md` | 映射 / 旋钮 / 验收 |

## Overlay 合同

- 仅 `theme.color` / `theme.state` path-leaf  
- 与 Day 相同公开路径  
- **无**根级 `$id`  
- Wave **day/night** ↔ macOS light/dark；**Dark 是主题不是 mode**
