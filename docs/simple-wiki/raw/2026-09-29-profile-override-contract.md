---
class: material
ingested: true
integrated: true
metadata:
  title: Profile 差量与平铺 Typography 合同
  date: 2026-09-29
---

# Profile 差量与平铺 Typography 合同

本材料固定已批准并完成 M1–M4 的终态合同，供 profile、typography、Sketch 与 helper 知识页编译。它取代旧 standalone profile 与嵌套 typography defaults 形态，不改写旧材料的历史正文。

## 来源与实现边界

决策来源是 [profile-override Plan](../../island/plans/2026-09-29-profile-override.md) 的 Solution、Constraints、Implementation Decisions 与 Further Notes。M1–M4 已由上层独立 gate 核验并关闭；以下 SHA 为稳定实现依据，而不是计划 checkbox 或待办状态：

| 实现 | Commit SHA | 独立 gate 结论 |
| --- | --- | --- |
| M1 synthetic 输入类型补漏 | `c0ecea3a08651ec55cb1bc77b59c9cc38b562d69` | 随 M1 集成核验 |
| M1 profile 差量、双身份与 fixture/runner 迁移 | `9df7d3a8514ddc14226f381fcfddbc49179c5b20` | 首审发现来源路径漏传；下行修正后 PASS |
| M1 profile 错误来源路径修正 | `70ba4b686418dc02320798d6b63df4435a30e894` | M1 修正 gate PASS |
| M2 六字段平铺与基准引用模式 | `e93069461658d4e48be93ddc3da3b308056fed91` | M2 gate PASS |
| M3 new-profile 快照命令 | `9a7698b10b92c6635820f8092162e9303d3aaf77` | 随 M3 集成 gate PASS |
| M3 根保留命名空间索引边界 | `d56b709cd3fdb808ad8646eb84b6f4e7fb23934d` | M3 gate PASS |
| M4 文档槽位、profile 健康检查与两处身份 fixture 迁移 | `53498c9dcd17c27ab5f08f60cea118ae631a6348` | M4 gate PASS |

本文不包含施工清单、临时输出或终验日志。用户真实 Orca 项目的迁移属于用户侧交付后动作；仓库里的 Orca fixtures 是 example-derived 实例，不等同于已验证用户真实工作区。

## 系列模型与身份

base 是 `main.yaml` 承载的默认主题；profile 是 `profiles/<name>.yaml` 差量层；一个 base 与全部 profiles 构成一个系列。结构分歧应另建 base 目录，而不是复制完整主题到 profile。

main-only 入口合同不变：入口必须是名为 `main.yaml` 的普通文件、YAML object 根且含有效闭合 `$config`。profile、resource、night 或目录不能作为入口。默认 build 只构建 main；`--profile <name>` 单选；`--profiles all` 构建 main 与全部 profiles。发现布局仍固定为 profiles 平层，名称转小写、ASCII 空格转 `_`，归一化冲突与嵌套目录拒绝。

profile 根消费 `$schema`、自身 `$id`、`$config`、`$override`，非 `$` root key 是新 token 树。未知 `$` 前缀根键（含 `$helper` 与文档级 `$extensions`）跳过。文档身份与 token 身份是两个命名空间：根 `$id` 不进入 token 路径权威、冲突图或 override 索引。

profile `$config` 只接受必填 `base` 与可选 `resource`、`parameter`、`parameterGroup`，禁止 `theme` 与未知字段。`base` 是非空字符串，逐字等于原始 main 文档 `$id`，不是路径或 token ID。main 没有已入账文档身份、base 缺失或不匹配均拒绝。resource 追加、parameter 按字段覆盖、同名 parameterGroup 合并与 CLI 最后覆盖的既有语义不变。

main/profile 文档 `$id` 可省略；构建时若声明必须是非空字符串。profile 当前主题身份来自自身文档，不再继承 main 的主题身份。Sketch payload `meta` 为 `{ themeId: string | null, baseId: string | null, version: 2 }`：main 的 `baseId` 为 null；profile 的 `baseId` 为 main 身份；自身未入账时 `themeId` 为 null。版本保持 2，但新增字段会影响拒绝额外字段的旧 plugin，消费端需要同步允许 baseId。

## 值覆盖与新增 token

`$override` 按 base token `$id` 定位，每项必须恰好是 `{ $value: ... }`。未命中（包括把根文档 ID 当 token ID）、缺少 `$value` 或附带 `$id`、`$type`、`$extensions` 等其他字段均拒绝。对象、数组与 composite 的整个源 `$value` 替换，不深合并；引用与 `$ref` 留到合并后的树正常解析。重复 token ID 的源文档序首个命中，与既有降级语义一致。

新 token 不能撞已有 token 路径，不能把已有 token/group 换形。已有 group 只接受新成员，任何 `$` 元数据重声明均拒绝，包括相同 `$type`、`$extensions`、`$description`、`$extends`。新路径允许完整定义；新 token 类型必须能在 profile 文件自身确定（显式类型或 profile 内新建 group 的类型继承），不能只依赖 main group 类型。

合并发生在 YAML 文档层，先克隆 base、按 token ID 替换源值、嫁接新增树，然后做 `$extends`、引用、转换与输出。profile 格式错误为 `FORMAT_ERROR`，保留 profile 来源路径与 token/id 定位；合成文档行号可指向合成内容。一般 profile 不要求 base 所有 token 已入账；只有 override 目标必须已入账。

无 profile 删除 token、改类型、改已有扩展的机制，也无旧 standalone profile 兼容或迁移命令。既有 fixture 的 `smoothShadow.target`、`platform.sketch.path`、`inheritColor.property.opacity` 分歧已按批准裁决舍弃，继承 base 扩展；真实需求依赖这些差异时应新建 base，而不是放宽值覆盖模型。

## 平铺 Typography 与 rem 基准

`$extensions.typography` 是有效 typography group 的非空闭合 object，只有六个平铺兄弟字段：`baseFontSize`、`fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`。旧 `defaults:` 嵌套硬拒绝，不提供兼容层。五个 composite 兜底字段仍按祖先到子 group 浅合并，token `$value` 最后覆盖，materialized value 仍须补齐五字段。

`fontSize` 是 composite 字段兜底，`baseFontSize` 是 rem 换算基准，二者不同。基准仅允许放在 `theme.font`，是有限正 number（CSS px）或解析为该 number 的引用；默认 16。dimension 基准与 iOS pt / Android dp 投影不在合同内。CSS/Sketch 的既有非负值、字体与 weight 等平台拒绝矩阵保持不变，不提升为输入 schema 限制。

需要按系列调整基准时，在 base 定义已入账 number token，例如 `theme.font.base-size`，使 `theme.font.$extensions.typography.baseFontSize` 引用它；profile 通过该 token ID 的 `$override` 改数值。不能在已有 font group 重声明扩展。五个兜底字段也可持有引用。扩展 metadata 被消费；下沉的 number token 本身仍正常输出。

CSS 保留 rem 并仅在选中 typography 使用 rem 时输出有效 root font-size。Sketch 按有效基准换算 rem fontSize、绝对 lineHeight 与 letterSpacing；fontSize/letterSpacing 最多保留三位小数，最终 lineHeight 向上取整。payload v2 不恢复已退役 textColor/Swatch 绑定；颜色位置仍是 HEX8 快照。

## Night 与 Sketch skip 的不变边界

night 仍是 day-local 路径式叶子覆盖，不使用 `$override`，合并在 profile 合并后的 day tree 上；只可覆盖已存在 `theme.color`/`theme.state`，不改字体基准。night 根禁止 `$id`，themeId/baseId 随 day；token 身份继承 day，不得换发。缺失或一般非法 overlay warning + skip；根文档身份或 token 身份违规则 `FORMAT_ERROR`，不是普通 skip。

Sketch 的最近 group/token skip 继承、显式覆盖与输出过滤不变。被跳过 token 仍可供引用/依赖查询；验证 payload 必须先核对实际 skip，再对被跳过项作负向断言，不能要求所有源 token 都有资产记录。

## 显式命令与诊断

`wave dt new-profile <name>` 需要 main 文档及全部源 token 已入账，并拒绝重复 token ID；这是快照生成器额外前提，不是所有 profile 的通用格式规则。生成自身新文档 ID、base 关联与全量源值 override，引用原样保留，结构元数据不复制。名称/碰撞拒绝与前提失败零写入；不覆盖既有文件。删除冗余快照项后，该值才能随 base 演进。

`wave dt ids` 默认 dry-run，显式 `--write` 才维护 main/profile 文档根槽位与 token 身份，night 和 `$override` 不在身份写回目标内。main/profile 根的 missing/null/blank 可维护；已入账字符串（含 YAML 字符串 alias）永不重铸；非法根 map/sequence/boolean/number 阻塞全 workspace 写入。base 关联先与原始 main 身份核对，不能用拟生成的 main ID 修复坏关联。token 路径权威与 all-or-nothing 冲突语义不变。

普通 workspace doctor 默认健康扫描 main 与全部 profiles，`--profile` 隔离所选路径。text、JSON、status 共用 findings 和退出状态；结构/base/override/身份错误非零。与 base 源值深等值的冗余 override 只给一条 `info` 汇总 x/y，不先解析引用。严格 resource 校验仍只检查默认 main 或所选单 profile 的合并声明，不因 workspace 健康扫描扩为全 profile resource 扫描。WCAG 选择合同不变。

`$helper` 仍是根部 documentation-only 的暂行约定，没有引用 namespace、合并执行或导出语义；新的 profile 格式不会把它登记成 token 或 override 目标。需要可引用、可覆写的基准应使用真正的已入账 token，不能用 helper 躲过 token 合同。
