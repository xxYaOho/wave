# Typography 输出修正设计

## 目标

修正 typography 首轮实现暴露的三个输出问题：Sketch 倍率行高保留小数、CSS 重复输出完整 font family、typography color 没有进入 CSS 与 Sketch 交付物。

## 输出合同

### Line height

- 只有 Sketch 中由无单位倍率计算得到的行高使用 `Math.ceil(fontSize * lineHeight)`。
- `px`、`pt` 绝对行高保持原数值，不额外取整。
- CSS 继续保留原始倍率或绝对单位。

### Typography color

- typography `$value.color` 继续是可选字段。
- Wave 在内部保留直接颜色引用的来源，但不把内部元数据写入 JSON/JSONC。
- CSS 遇到指向已输出 `theme.color.*` token 的直接引用时，输出独立变量，例如 `--heading-h1-color: var(--color-text-emphasis)`。颜色不进入 `font` shorthand，因为 CSS font shorthand 不包含 color。
- Sketch 输出最终 HEX8 值到 `textStyle.textColor`，本轮不输出或保存 Sketch 颜色变量引用关系。
- `app_sketch-sync-token` 接受可选 `textColor`，校验 HEX 后写入 Sketch style 的 `textColor` 属性。

### Font family 去重

- CSS formatter 对已输出的 `fontFamily` token 建立规范化值索引。
- typography 的 font family 与索引中的 token 等值时，不输出局部 `--*-family`，shorthand 直接引用全局变量。
- 没有等值 token 时保留现有局部 family 变量，保证独立字体配置不退化。
- 多个 token 值相同时按稳定输出顺序选择第一个。

## 非目标

- 不定义 Sketch 颜色变量或 swatch 引用合同。
- 不改变 JSON/JSONC typography 的 authoring value 结构。
- 不对绝对 line height 做取整。
- 不对 fontSize、fontWeight、letterSpacing 做去重。

## 验证

- formatter 单元测试覆盖倍率向上取整、绝对值不取整、CSS color 引用、font family 命中与 fallback。
- integration 测试验证 Orca 风格 typography 的 CSS 与 Sketch 输出。
- `app_sketch-sync-token` 测试验证 textColor 解析、校验和新增/更新 shared text style。
- 两仓分别运行 typecheck、测试和格式检查；最后运行真实 Orca 构建并检查输出。
