# Sketch Typography Color Reference 设计

## 目标

让 Sketch 复合样式保留当前主题文档内可安全表达的 color token 关系。`$value.color` 直接引用当前 `theme.*` 中可输出的 color token 时，typography、普通 border 和 outline ring 的对应颜色字段输出 `@` 前缀的过滤后 key；其他颜色继续输出最终 HEX8。

## 输出合同

```yaml
theme:
  color:
    text:
      default:
        $type: color
        $value: "#0f172b"
  font:
    body:
      $type: typography
      $value:
        color: "{theme.color.text.default}"
```

在 Sketch pass 的 `filterLayer: 2` 下，输出：

```json
{
  "textStyle": {
    "textColor": "@text-default"
  }
}
```

- `textColor: "#RRGGBBAA"` 表示直接颜色。
- `textColor: "@<key>"` 表示同一输出版本的 color token 引用。`key` 始终为被引用 color token 经当前 Sketch pass `filterLayer` 处理后的 key；Wave 不添加版本前缀。
- 仅当前文档的 `theme.*` 直接引用可输出为 `@`。外部 namespace、resource 或其解析后的颜色一律输出 HEX8。
- 每个 emitted color token 都建立两种当前 resolver 支持的 DTCG `#/` alias：`#/theme/color/text/default` 和 `#/theme/color/text/default/$value`。alias 仅使用现有 parser 已支持的 `~0`、`~1` path-segment 转义，因而能无歧义地覆盖含 `.`、`/` 或 `~` 的 token key；本任务不扩展 URI percent-decoding 语义。
- 仅当 token path 没有含 `.` 的 segment，且拼接后的路径符合 resolver 的完整花括号 grammar `[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*` 时，才建立花括号别名，例如 `{theme.color.2x}`。含 `.`、`/` 或 `~` 的 key 不能从花括号别名匹配，必须使用 JSON Pointer；Wave 不会用 `path.join('.')` 伪造歧义别名。
- 颜色变量索引只从当前 Sketch pass 的实际 emission token 建立：被 `sketch.skip`、`includeRootKeys` 排除或没有 value 的 target 不能成为变量。
- 既有 `_colorReference` 继续服务 CSS 的引用保留，不改变其语义。Sketch 专用 `_sketchColorReference` 只代表无 override 的直接 source reference：花括号 color string，或 key 仅为 `$ref` 的 color object。`color: { $ref, alpha: ... }` 等覆盖 target 颜色或 alpha 的表达式不携带新元数据，继续输出最终 HEX8，避免丢失 alpha。
- 内部 `theme.*` 颜色引用没有对应 emitted color token 时，Sketch build 报错并包含 consumer token path；不静默降级为 HEX。
- 两个 emitted color token 经 `filterLayer` 产生同一个 `@key` 时，Sketch build 报错，即使它们通过不同 `sketch.path` 避开了 JSON path 冲突。任何别名也不得被不同 token 重复声明，避免 `Map` 覆盖掩盖歧义。
- 无 color 的 typography、CSS、JSON 与 JSONC 行为不变。
- color token 自身始终输出 HEX8 真值，不能输出 `@`。
- `@` 的复合 consumer 范围仅为 `textStyle.textColor`、普通 border 的 `value.color`，以及 outline 模拟的第一层 `shadow[0].color`。outline 的白色 gap layer 继续为 `#ffffffff`。
- 普通 border 的非 `@` color fallback 规范为 `#RRGGBBAA`，包括 literal、external reference 与 alpha override；这是 Sketch 输出合同的定向规范化，不改变 CSS/JSON/JSONC。
- shadow layer、gradient stop 和 inheritColor 继续输出 HEX8；它们可能包含派生 alpha、插值或运行时 sibling 语义，不能安全地缩约为单个 color variable。

## 实现边界

保留 resolver 的 `_colorReference` 合同以维持 CSS 行为，并新增仅供 Sketch 复合 color slot 使用的纯直接引用元数据 `_sketchColorReference`。修正 normalizer 对无 `/$value` JSON Pointer 加 alpha 的解析，必须保留最终 alpha。然后由 Sketch formatter 从排序后的实际 emission token 建立 `raw reference -> filtered key` 的 color-reference index，并由共享 slot formatter 消费。

每个纳入范围的 slot 选择顺序固定为：可信的 `_sketchColorReference` 命中当前主题索引时输出 `@<key>`；可信的内部引用没有 emitted target 时抛错；无该元数据的 composite、external reference 或 literal 保持现有 HEX8。`sketch.path` 只决定 JSON 输出层级，不能参与 `@` 标识符计算。

不修改 `app_sketch-sync-token`。`@` 的导入、同版本映射和缺失变量诊断由其后续实现负责。

本次验收只确认 Wave 生成该合同，不以当前 Sync Token 版本是否已消费 `@` 为门槛。用户已指定由 Sync Token 在 Wave 合同确认后独立跟进；因此本仓库不加入跨仓运行或发布顺序 gate。

## 验证

- resolver/normalizer 覆盖无 override 的两种 direct ref、无 `/$value` JSON Pointer 加 alpha，以及不会产生 `_sketchColorReference` 的 alpha override；CSS 继续通过 `_colorReference` 输出其既有 `var(...)` 引用。
- formatter 覆盖 typography、普通 border、outline ring 的安全花括号 ref、两种 JSON Pointer ref、literal HEX、external ref fallback、alpha override fallback、target skip、`includeRootKeys` 排除、alias 安全性与 key collision；shadow、gradient、inheritColor 保持 HEX8。
- 扩展 hermetic `orca-realistic` fixture，覆盖 resolver -> transformer -> formatter 的安全花括号、无 `$value` JSON Pointer、带 `$value` JSON Pointer、当前 parser 支持的 `.`/`~0`/`~1` special segment、external/literal 和 alpha override。其中 typography 分别得到 `@text-emphasis`、`@text-default`、`@text-subtlest`，普通 border 得到 `@primary-main`，outline ring 复用同一合同。
- 更新 manual 与 `docs/SPEC.md` 的 Typography/Sketch 行为快照。
- 运行 `pnpm check:ci` 和真实 Orca Sketch build；确认 `main.yaml` 哈希不变。final critic-gate 发现问题后的每次修复都必须重新执行这两项验证。
