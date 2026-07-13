# Typography、虚线边框与 Sketch 跳过输出设计

## 目标

解决 orca 实例暴露的四个 design-token 输出缺口：减少 typography 中重复的 `fontFamily`，支持 DTCG `dashArray`，让 Sketch 正确计算倍率行高，并允许 token 随身声明仅跳过 Sketch 输出。

## 输入契约

### Typography defaults

Typography group 可以声明：

```yaml
theme:
  font:
    $type: typography
    $extensions:
      typography:
        defaults:
          fontFamily: "{wave.dimension.fontFamily}"
          letterSpacing: 0
    body:
      $value:
        fontSize:
          value: 14
          unit: pt
        fontWeight: 400
        lineHeight: 1.5
```

规则：

- `typography.defaults` 只允许出现在 group，且 group 展开 `$extends` 后的有效 `$type` 必须是 `typography`。raw schema 对尚未展开且没有本地 `$type` 的 `$extends` group 延后此项判断，resolver 后的 resolved schema 必须再次验证。
- `defaults` 是闭合对象，只支持 `fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`。token typography `$value` 支持这五个字段及可选 legacy `color`；其他字段报错。
- legacy `color` 保留在 materialized value 与 JSON/JSONC 中，CSS/Sketch typography formatter 明确忽略，不进入 shorthand 或 textStyle。
- `fontFamily` 为 trim 后非空且不含 C0、C1、DEL 控制字符的字符串或非空字符串数组；`fontSize` 为有限正 dimension；`fontWeight` 为有限正 number 或 numeric string；`lineHeight` 为有限正 multiplier 或 dimension；`letterSpacing` 为有限 number 或 dimension，允许负值。typography dimension 只接受无单位、`px`、`pt`。
- 所有 numeric string 先 trim，再统一匹配 `^-?(?:0|[1-9]\d*)(?:\.\d+)?$`；不接受 `+`、科学计数法、`NaN` 或 `Infinity`。字段再按正值/可负值规则验证。
- defaults 与 token `$value` 合并后的 materialized typography 必须包含 `fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing` 五个字段。resolved schema 按继承规则检查完整性；缺字段直接报 token path，不生成残缺 shorthand。
- raw schema 允许上述字段使用 token 引用；resolver 后的 resolved schema 验证最终值，引用解析为负数、非法对象或非有限值时构建失败。
- defaults 按祖先到子组浅合并；子组覆盖祖先，token 自身 `$value` 覆盖 defaults。
- defaults 中的外部引用和内部引用都必须在进入 transformer 前解析。
- 合并生成完整的内部 `WaveToken.value`，因此 CSS、Sketch、JSON、JSONC 都输出 materialized typography 值。resolved token tree 保持原始 token `$value`，但生成物不保留“缺省前”的不完整值。
- 普通祖先/子 group 按字段继承 defaults。`$extends` 保持现有 extension namespace 整体覆盖语义：derived group 一旦声明 `typography` extension，就整体替换 base 的 `typography` extension；不为本功能改变全局 `$extends` merge 规则。

### Sketch skip

```yaml
theme:
  border:
    width:
      $extensions:
        sketch:
          skip: true
      sm:
        $type: dimension
        $value: "{wave.dimension.px.0}"
      keep:
        $type: dimension
        $value: "{wave.dimension.px.1}"
        $extensions:
          sketch:
            skip: false
```

规则：

- `sketch.skip` 必须是 boolean，可用于 group 或 token。
- group 值向后代继承；更深 group 或 token 可用显式 `true` / `false` 覆盖。
- 只有 Sketch formatter 过滤 `_sketch.skip === true`；CSS、JSON、JSONC 不受影响。
- `sketch.path` 继续只表达路径，不接受 `skip` 作为特殊路径值。
- `$extends` 保持现有 `$extensions.sketch` 整体覆盖语义。derived group 声明任一 `sketch` 字段时，base 的 `path`、`property`、`skip` 均不会自动深合并；展开后的普通 group 继承再按 path/skip 字段处理。
- skip token 不发射到 Sketch JSON，但仍保留在 formatter 的完整 token 集合中，供 `inheritColor.siblingSlot` 等依赖查询使用。

### Border stroke style

Border `style` 同时接受现有字符串与 DTCG stroke-style 对象：

```yaml
$value:
  color: "{theme.color.border.default}"
  width: "{theme.border.width.sm}"
  style:
    dashArray:
      - value: 4
      - value: 8
```

规则：

- `dashArray` 必须是非空数组，成员为有限、非负的 dimension：number、`{ value, unit? }`、引用，或解析后的 CSS length 字符串。raw schema 允许引用，resolved schema 验证引用解析后的最终值。
- number、纯数字字符串和无 `unit` 的 `{ value }` 在 CSS 中按 px 输出；零输出为 `0`。dashArray 的显式单位接受 `px`、`pt`、`rem`、`em`、`%` 并保留，允许同一数组混用，不进行单位换算；不接受科学计数法。数组中必须至少有一个大于 0 的成员。
- CSS 主变量使用可用的 shorthand fallback：`1px dashed <color>`。
- CSS 额外输出同名前缀变量：`--border-antline-dash-array: 4px 8px`，保留真实 dash pattern。
- 若 companion variable 名称与另一个真实 token 的输出 key 冲突，CSS formatter 明确报错，不输出重复自定义属性。
- Sketch 保留 border value 内的结构化 `style.dashArray`，不把对象字符串化。
- 无效 stroke-style 在 schema 阶段报错，不静默退化。

## 输出契约

### CSS font family

- `fontFamily` 为数组时输出合法 font stack，以 `, ` 连接。
- 符合简单 CSS identifier（`^-?[_a-zA-Z][_a-zA-Z0-9-]*$`）的 family 不加引号；其他 family 使用双引号并转义。
- 已是字符串的值保持现有输出，避免破坏用户自行书写的 font stack。
- 数组成员必须是非空字符串；按 family name 处理，去除一层已有配对引号后再统一转义反斜杠和双引号。非法成员明确报错。
- CSS-wide keywords `inherit`、`initial`、`unset`、`revert`、`revert-layer` 按大小写不敏感匹配，即使符合 identifier 语法也必须加引号，避免 custom property 的特殊级联语义。
- font family 禁止 U+0000-U+001F、U+007F-U+009F；引号输出统一转义反斜杠和双引号，因此不会把换行带入 CSS string。
- typography 字段按语义序列化：unitless `fontSize` 和非零 `letterSpacing` 补 `px`，零 letterSpacing 输出 `0`；`lineHeight` 保留 unitless multiplier；`fontWeight` 保持无单位数值。

示例：

```css
--font-body-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", sans-serif;
```

### Sketch font family

Sketch 不尝试解析 `system-ui` 或 `-apple-system` 到运行机器的实际字体。数组选择顺序为：

1. 若存在 `PingFang SC`，使用 `PingFang SC`。
2. 否则选第一个非 system alias、非 generic family 的具体字体。
3. 若没有具体字体，则不输出 `fontFamily`，不写入不可靠别名。

忽略集合按大小写不敏感匹配，至少包含：`system`、`system-ui`、`-apple-system`、`BlinkMacSystemFont`、`sans-serif`、`serif`、`monospace`、`cursive`、`fantasy`、`ui-sans-serif`、`ui-serif`、`ui-monospace`、`ui-rounded`。

字符串 `fontFamily` 保持现有行为；只有数组执行候选选择。

### Sketch line height

- 无单位 number 或纯数字字符串表示倍率：`fontSize * lineHeight`。
- `{ value, unit }` 或带单位字符串表示绝对行高，值必须有限且大于 0；Sketch 输出其数值部分。
- 倍率计算使用 defaults 合并后的 `fontSize`。fontSize 接受有限正 number、纯数字字符串、带单位字符串或 `{ value, unit? }`，Sketch 取数值部分。
- 倍率必须为有限正数。无法解析 fontSize 时 Sketch formatter 抛出带 token path 的错误，不静默省略或输出错误绝对值。
- 结果四舍五入到 3 位小数，避免浮点噪声；`14pt * 1.5` 输出 `21`。
- CSS 保留原语义：倍率仍输出 `1.5`，绝对值仍输出带单位值。

## 分层职责

- schema：raw tree 验证基本形状和 `$extends`；resolver 后的 resolved tree 再验证有效 type、解析后的 `typography.defaults`、`sketch.skip` 和 border stroke-style 最终输入形状。build 与 doctor 必须复用同一阶段顺序。
- resolver：让 group `$extensions` 与 token `$extensions` 一样参与 external pass、internal 多轮 pass、残留引用扫描，并保留完整错误路径。
- transformer：继承并合并 typography defaults 和 Sketch skip；不承担平台单位决策。
- typography domain helper：schema 与 transformer 共用同一 defaults 浅合并、token override、必填字段检查函数，避免 materialized value 判定漂移。
- CSS formatter：序列化 font stack 和 stroke-style fallback/companion variable。
- Sketch formatter：过滤 skip、选择具体字体、计算最终数值行高；结构化 border 默认原样保留。
- token generator：先在内存中格式化全部目标平台，所有 formatter 成功后再开始写文件，避免后一个平台失败时写入或覆盖部分输出文件。上层可以提前创建空输出目录；文件系统写入失败的跨文件事务不在本次范围内。

## 兼容边界

- 原有 typography token 不使用 defaults 时字段集合不变；此前无效的 unitless fontSize/非零 letterSpacing CSS 会规范化为 px。使用 defaults 后所有生成格式都得到 materialized value。
- 原有字符串 border style 输出不变。
- 原有 `sketch.path` / `sketch.property` 继承和 token override 保持不变。
- 不新增 config-level exclude，不修改 resource 内容，不自动修改 orca 的源文件。
- 不实现跨单位换算；Sketch 只取绝对值的数值部分，沿用当前 px/pt 数值输出语义。CSS dashArray 保留显式单位。

## 验证

- schema 单测覆盖合法/非法 defaults、skip、dashArray。
- resolver 单测覆盖 group extension 的外部与内部引用。
- transformer 单测覆盖 defaults 合并、token override、skip true/false 继承。
- CSS/Sketch formatter 单测覆盖 font family、line height、dash array、Sketch-only skip。
- 使用持久 `orca-realistic` fixture 验证 defaults、倍率行高和 skip；使用真实 orca `main.yaml` 构建，确认 CSS 不再出现 `[object Object]`。
- 运行相关测试、`pnpm typecheck`、Biome 检查和 manual build/test。
