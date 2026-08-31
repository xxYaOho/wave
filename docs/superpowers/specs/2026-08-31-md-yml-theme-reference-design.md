# md-yml Theme 内部引用设计

日期：2026-08-31

## 状态

已确认，作为 `md-yml` 已发布输出合同的增量修订。

## 目标

`md-yml` 面向 DESIGN.md frontmatter 的使用场景。它继续把 palette、dimension 和 custom resource 等外部资源引用解析为最终值，但保留 `theme` 内部 token 之间的直接引用。

例如：

```yaml
theme:
  font:
    $type: typography
    $extensions:
      typography:
        defaults:
          fontFamily: "{theme.font.font-family}"
    font-family:
      $type: fontFamily
      $value: "{wave.dimension.fontFamily}"
    heading:
      h1:
        $value:
          color: "{theme.color.text.emphasis}"
          fontSize: "{wave.dimension.rem.13}"
          fontWeight: 700
          lineHeight: 1.2
          letterSpacing: 0
```

在 `filterLayer: 1` 下输出：

```yaml
font:
  font-family:
    - system-ui
    - sans-serif
  heading-h1:
    color: "{color.text-emphasis}"
    fontFamily: "{font.font-family}"
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0px
```

`font.font-family` 的 source 指向外部 `wave` resource，因此自身输出最终字体数组。`heading-h1.fontFamily` 通过 typography defaults 继承同一文档中的 `theme.font.font-family`，因此输出投影后的内部引用。

## 引用保留合同

### 可保留引用

满足以下全部条件时，`md-yml` 把解析后的值恢复为 `{namespace.local-key}`：

1. reference target 是当前文档 `theme` 根下的 token；
2. reference 是该 value slot 的直接、等价引用；
3. target token 也存在于当前 md-yml emission 中；
4. target path 经当前 `filterLayer` 投影后可以形成无歧义的 `namespace.local-key`；
5. consumer 的 formatter-ready base value 与 target token 的 formatter-ready base value 严格相等。

覆盖范围包括：

- scalar 或完整 composite token alias；
- typography、border、shadow、gradient 等 composite 内的直接 value-slot reference；
- typography defaults 中的直接引用，以及 defaults materialize 到具体 typography token 后形成的继承引用；
- explicit composite child 的直接引用。

引用文本使用 target token 的实际 md-yml 输出路径生成，不直接改写 authored reference string。例如 `theme.color.text.emphasis` 在 `filterLayer: 1` 下成为 `{color.text-emphasis}`。

### 继续输出最终值

以下情况不保留引用：

- palette、dimension、custom resource 等文档外部引用；
- `$ref` 同时带 `alpha` 或其他 override；
- reference 只指向 token value 内的 property，而不是一个可独立输出的 token；
- `smoothShadow`、`smoothGradient` 或其他改变 value 数量、结构或语义的派生结果；
- `inheritColor` 等由 transformer 建立专用输出合同的值；
- 无法证明 transformed slot 与 source reference 仍等价的情况。

系统不能按最终值反向猜测引用。两个 token 值相同不代表它们存在引用关系。

### Typography defaults

Typography defaults 继续由 transformer materialize，以保持所有输出平台既有的完整 typography 合同。md-yml 只改变被 materialize 字段的表达：

- default field 是内部直接引用时，具体 typography token 输出该引用；
- default field 是 literal 或外部引用时，具体 token 输出最终值；
- token 显式声明同一 field 时，显式值覆盖 inherited default，也覆盖 inherited reference lineage；
- 更近的 typography group defaults 按现有 merge 顺序覆盖上层 defaults，reference lineage 使用相同顺序。

因此本修订不改为输出 source 的稀疏 authoring shape，也不删除 `heading-h1` 上物化出的 `fontFamily`。

## 路径与完整性

Formatter 先为当前 emission 的 direct token 和 explicit composite 建立 source token path 到 `namespace.local-key` 的索引，再投影 value。

Formatter 只回填满足全部条件的引用。Lineage 的 consumer slot 不再存在、target 不是独立 token、target 不在当前 emission，或 consumer 与 target 的 formatter-ready base value 不再相等时，formatter 保留 consumer 最终值。这是 computed reference 与 shape-changing transform 的统一 fallback，不会产生悬空引用。

一旦 formatter 生成 `{namespace.local-key}`，该 target 必须能在同一 payload 中找到。引用完整性属于输出后置条件，违反时明确失败。

既有 md-yml 路径规则继续生效：过滤后至少保留 namespace 和 local key，segment 不能包含 `.`，hyphen folding collision 必须在序列化前失败。引用 target 与普通 token 使用同一套投影和冲突判断。

## 架构

### Resolver provenance

Resolver 继续解析所有引用并返回 resolved tree。`ReferenceProvenance` 增加“是否为直接等价引用”的事实，区分 pure reference 与带 override 的计算表达式。该事实必须在解析 `$ref` object 时记录，不能在 formatter 中根据最终值推断。

Provenance 同时携带结构化 consumer 与 target locator。Object property 使用 string segment，array member 使用 number segment；JSON Pointer segment 按 RFC 6901 解码。现有 string path 只服务错误信息和兼容校验，后续层禁止通过 `split('.')` 或正则反推结构。

Internal resolver 的多轮解析不能覆盖 authored direct target。同一 consumer 第一次记录的 reference、target、scope、identity 和 structured locator 固定不变；后续轮次只更新 resolved target value kind，供现有 composite validation 使用。例如 `A -> B -> C` 始终保留 `A -> B` 与 `B -> C`，不能收缩成 `A -> C`。

`identity: false` consumer 是 computed-subtree barrier。记录该 consumer 时，resolver 删除已经记录在其 structured path 下的 descendant provenance；后续轮次也拒绝在该 path 或其 descendants 记录新 provenance。Prefix 判断按 structured segments 逐段比较，不能用 string prefix。这样 `$ref + alpha` 或 custom object `$ref + override` 的中间 resolved value 不会在下一轮伪装成 authored nested direct reference。

### Transformer lineage

Transformer 接收 resolver provenance，并把仍与 formatter-ready value slot 对齐的引用转换为内部 token reference lineage。Lineage 以 token value 内的结构化 slot path 指向 source target token path，并存入 transformer 模块私有的 `WeakMap<WaveToken, Lineage>`。它不是 `WaveToken` property，不进入导出类型、`Object.keys()`、`Reflect.ownKeys()`、spread、snapshot 或 JSON serialization。

Typography defaults 同时继承 value 和 lineage。materialize 时，显式 token field 使用自身 lineage；缺失 field 使用最终生效 default 的 lineage。

改变 value topology 或语义的 transformer 分支不得传播受影响 lineage：

- `smoothShadow` 与 `smoothGradient` 阻断整个 token lineage；
- standard gradient endpoint materialization 增加 stop 时阻断整个 gradient lineage；未增加 stop 时 index 保持稳定，再由 formatter-ready value equality 决定；
- `inheritColor` 阻断整个 token lineage；
- legacy `currentColor` 实际改写 color 或 shadow value 时阻断整个 token lineage；
- ordinary color-space、dimension、fontWeight、strokeStyle、border、typography normalization 不单独阻断，最终仍需通过 slot addressability 与 base-value equality。

JSON、JSONC、CSS 和 Sketch formatter 不能访问该 WeakMap。相同 resolved tree 分别在无 reference context 与有 reference context 下 transform 后，其可枚举 token shape、own keys、JSON serialization 和四个平台输出必须一致。

### md-yml formatter

md-yml formatter 是唯一通过内部 getter 消费 lineage 的 formatter。它分两阶段工作：先建立全部未符号化的 base entry graph 与 source-token index；再比较 base consumer slot 和 base target value，把符合合同的 slot 替换为投影引用字符串。Alias chain 始终与 target base value 比较，不能拿已经替换成引用字符串的 target 比较。Formatter 使用 prototype-safe clone-on-write，不修改 `WaveToken[]`、`token.value` 或 WeakMap lineage。

Object clone 保留原始 `Object.prototype` 或 null prototype、own enumerable string keys 和 values，但把 clone 上的属性统一规范化为 enumerable、writable、configurable data property；不能原样复制可能不可覆盖的 descriptor flags。Overlay write 使用 `Object.defineProperty()`，不能用普通 assignment；因此 `__proto__`、`constructor` 和 `prototype` value path 不改变 prototype 或静默丢失。Array clone 按 dense index 重建普通数组，让运行时管理规范的 `length` descriptor；不复制 source index 或 `length` 的 writable/configurable flags。Semantic equality 比较完整 own enumerable string key set，object key 顺序不影响相等性。

Candidate 先按 value path 长度升序，再按 canonical segment encoding 排序。相同 value path 与相同 target 去重；相同 value path 指向不同 target 属于 lineage 矛盾并失败。Eligible ancestor（包括 root）覆盖 descendant；ancestor 不 eligible 时继续检查 descendant。结果不能依赖 resolver Map 插入顺序。

禁止以下实现：

- formatter 重新读取或解析 `main.yaml`；
- 按值相等反推引用；
- 使用 `_colorReference` 或 `_sketchColorReference` 代替通用 lineage；
- 为 md-yml 改变 resolver 的 resolved tree；
- 改变其他 platform 的 formatter 输入或输出。

## 错误处理

新增错误均属于 md-yml platform format error：

- 已生成的 `{namespace.local-key}` 找不到同一 payload target；
- target 参与 md-yml path projection 时触发现有空 segment、dot segment 或 collision 错误；
- 相同 consumer value path 出现不同 direct target 等 lineage 矛盾，无法安全判断 reference 是否等价。

Consumer slot 不存在、target 不是独立 token、target 未 emission、值不相等、外部引用、computed reference 和明确被 transformer 消费的 lineage 不触发错误，它们按合同输出最终值。

## 验收标准

### Hermetic tests

- direct scalar alias 输出 `{namespace.local-key}`；
- typography、border、shadow 和 gradient 的内部 direct slot reference 被保留；
- typography defaults 的 `fontFamily: "{theme.font.font-family}"` materialize 为每个未 override token 上的 `{font.font-family}`；显式 override 不继承该 lineage；
- `theme.font.font-family -> wave.dimension.fontFamily` 自身输出外部资源最终值；
- `$ref + alpha`、smoothShadow、smoothGradient、gradient endpoint insertion、inheritColor、legacy currentColor 和 target property reference 输出最终值；
- shape-preserving custom object `$ref + override` 建立 computed-subtree barrier，中间解析产生的 nested reference 不得输出；
- multi-hop `theme A -> theme B -> external resource` 输出 `A -> {B}`，B 输出最终值；
- multi-hop `A -> B -> C -> external resource` 不被 resolver 多轮处理收缩，输出 `A -> {B}`、`B -> {C}`，C 输出最终值；
- missing/non-emitted target、slot missing 和 value mismatch 输出最终值，不生成 dangling reference；实际 emission 的不可投影或 collision target 按既有合同明确失败；
- 同一 resolved tree 分别以无 reference context 和有 reference context transform，断言 token own keys、JSON serialization、JSON、JSONC、CSS 和 Sketch 输出字节一致；md-yml 前后顺序不修改输入。
- null-prototype object 与 `__proto__`、`constructor`、`prototype` value path 在 overlay 后保持 prototype、own keys 和 value，且不污染任何 accumulator prototype。
- source 使用 non-configurable enumerable data property 时，clone 仍可安全 overlay；array index 与 `length` descriptor 不阻断写入。

### Real Orca smoke

使用 `/Users/teatao/Projects/my-color/orca/main.yaml`：

```bash
pnpm dev -- dt build \
  -f /Users/teatao/Projects/my-color/orca/main.yaml \
  --platform md-yml \
  --out <task-temp-dir>
```

解析唯一生成的 `orca2md.yml`，至少断言：

- `font.font-family` 是解析后的字体数组；
- `font.heading-h1.fontFamily` 等于 `{font.font-family}`；
- `font.heading-h1.color` 等于 `{color.text-emphasis}`；
- `font.heading-h1.fontSize` 是解析后的 dimension；
- 所有 `{namespace.local-key}` target 都能在同一 payload 中找到；
- 无 YAML anchor/alias、`[object Object]` 或 frontmatter delimiter；
- Orca source 文件 hash 前后不变。

最终运行 focused tests、`pnpm typecheck`、`bun test` 和 `pnpm check:ci`。

## 范围外

- 修改 JSON、JSONC、CSS 或 Sketch 的引用合同；
- 保留外部 resource reference；
- 为 computed reference 设计新的 YAML expression object；
- 输出 group `$extensions.typography.defaults`；
- 从 md-yml 反向恢复完整 DTCG authoring source；
- 修改 DESIGN.md 或自动写入 frontmatter。

## 成功条件

md-yml 输出保留可在同一 payload 中解析的 theme 内部直接引用，同时保持外部资源解析、transformer 规范化、typography defaults 完整性和其他 platform 行为不变。
