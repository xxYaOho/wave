---
date: 2026-09-23
state: 已对齐
dispatch: ~
---

# wave-id-and-payload-v2 Plan

## Problem Statement

当前 design token 以"路径"充当唯一身份：token 改名或移动时，所有消费方（sync-token 插件、Sketch 资产）只能将其识别为"删除旧 + 新增新"，资产失联、图层绑定断裂，需要靠手工命令（rename-slot）补救。sketch payload 以嵌套树用位置编码身份，解析器需要树遍历与 JSON Pointer 编解码，改名或 filterLayer 调整都会伪装成批量增删；theme 产物没有自描述身份，slot 换源时无法区分"同主题换模式"与"更换了主题"。

插件仓 2026-09-22 重构议题已决策（议题 10：引入 wave 生成的稳定 id，name 降级为显示属性；议题 2.5：textStyle 合同移除 textColor，规避 Sketch `textSwatch` 写入不持久化的平台缺陷），插件侧在等 wave 协议落地。此外 `$extensions` 现有家族（sketch 三键、outline、typography）归属零碎，需要归拢。

## Solution

为 wave 引入两层稳定身份与自描述 payload：

- 文档级 `$id`：主题身份，main.yaml 独有，随既有 config 合并流入所有 profile 构建
- token 级 `$id`：first-class Wave 方言参数，缺省即无身份，wave 显式命令负责填充与同步
- sketch payload v2：从嵌套树改为资产清单（meta + assets），每条记录显式 uuid / name / kind；textColor 随 v2 自然退役
- `$extensions` 归拢为 `platform.sketch` 家族 + `typography` 顶层

build 保持只读；身份的生成与写回只发生在显式命令。插件照 v2 合同实现，发版不耦合。

## User Stories

1. 作为设计师，我希望 token 的 key 改名后身份保持不变，以便 Sketch 同步时资产原地更新、图层绑定不断裂
2. 作为设计师，我希望新增、删除或临时注释 token 都不需要维护额外状态，以便日常调参与调试不产生身份事故
3. 作为设计师，我希望构建产物是自描述的资产清单且一行一资产，以便人工审阅与 git diff 直接可读
4. 作为 sync-token 插件的实现者，我希望每条资产记录携带稳定 uuid 与显式 kind，以便同步匹配键从 name 切换到 uuid 并支持改名原地更新
5. 作为 sync-token 插件的实现者，我希望 payload 携带主题身份，以便区分"同主题换模式"与"更换主题"并给出精确诊断而非误报撞名
6. 作为 wave 维护者，我希望 Wave 方言与 DTCG 标准的边界显式成文，以便超集姿态长期可持续（加法、不改标准语义）

## Constraints

- DTCG 超集原则：只做加法、不改标准语义。`$` 属性命名空间被 DTCG 预留给未来规范属性（Format 2025.10 §5.1.1），token 级 `$id` 因此是显式 Wave 方言，必须登记进 SPEC 方言清单，并保留"若 DTCG 未来标准化身份属性则迁移对齐"的承诺
- build 只读：任何身份生成与源文件写回只发生在显式命令
- 手术式写回：保留注释与排版，不重排既有键
- 身份永不静默重分配：身份冲突一律报错，任何修复动作必须在命令报告中可见
- profile 模型事实：named profile 的 config 以 main 为基底合并，token 树各 profile 相互独立；共享路径的 token id 以 main.yaml 为权威
- DTCG 规范合同：`$value` 与子节点混居的 token/group 混合体必须报错（§6.1 MUST）；类型经引用解析与组继承仍不可判定时必须报错且禁止猜测（§5.2.2 MUST）
- 跨仓时序：插件在等协议，不做双格式过渡；payload v2 规格是跨仓交付物
- 既有护栏：类型/引用合同变更沿 schema -> resolver -> transformer -> formatter 全链路检查；Orca 全 profile canary 使用 `--profiles all --out` 受控临时目录，保留互斥 parameter groups，断言前检查 `sketch.skip`；真实实例暴露的缺口提炼为 hermetic fixture

## Implementation Decisions

1. **两层身份**：文档级 `$id` = 主题身份（仅 main.yaml，profile 声明即报错，与 `$config.theme` 同待遇）；token 级 `$id` = token 身份（缺省即无身份；显式写空值表示预声明槽位待填）。两者均为 first-class 显式 Wave 方言，登记 SPEC 方言清单。
2. **id 形态**：32 位小写 hex（`crypto.randomBytes(16).toString('hex')`，等价 `openssl rand -hex 16`），形态固定；合同为"非空 + theme 内唯一"，不锁编码语义。
3. **入账范围**：全部 theme token；group 无身份；资源与外部 namespace 不参与。
4. **维护命令**：命名暂定 `wave design-token-id`（别名 `wave dt-id`，挂载细节实施期定）。build 只读；显式命令职责 = 填充空槽位、为新增 token 生成 id、把 main 权威 id 同步进各 profile 的共享路径节点、跨文件同路径 id 冲突报错（绝不静默重排）与单文件重复 id 修复（文档序首个保留、副本重发并报告）。**安全语义**：默认（无参）= dry-run 仅输出报告；显式 `--write` 才执行写回，写回前要求 git 工作区清洁（不清洁需显式确认参数）。节点式下"悬空"状态类不存在，无清理职责。
5. **校验阶梯**：
   - build 报错：token/group 混合体；组级 `$id`（身份仅存在于文档根与 token 节点两级，组不持有身份）；类型不可判定；引用悬空/循环
   - build 降级：单 pass 内重复 uuid 时按文档序首个保留、其余本 pass 无 id 并告警；未入账 token 的 payload 记录省略 uuid
   - doctor 与显式命令：跨文件同路径不同 id（身份冲突，报错）；未入账清单、空 `$id` 槽位、id 非生成形态提示（合同不锁编码，仅提示核对是否手误）；疑似笔误的空节点（无 `$value` 且无子节点）
   - 单 pass 构建只校验本 pass 可见范围，跨文件一致性归显式命令与 doctor
6. **sketch payload v2**（对齐插件协议 10a/10b，见 2026-09-22 议题反馈）：根部为 `meta`（`themeId`、`version: 2`）与 `assets` 数组；记录为 `{ uuid?, name, kind, <载荷> }`；kind 取 `color` / `text` / `layer`。text 载荷为 5 个纯字体字段（`fontFamily` / `fontSize` / `fontWeight` / `lineHeight` / `kerning`），textColor 退役；`fontWeight` 仅接受 100–900 整百刻度——该限制**仅作用于 sketch payload 构建**（formatter 层平台合同，不上升为 token 输入限制，CSS/JSON 等平台不受影响，对齐 AGENTS.md「平台限制留在 formatter」护栏），非整百值在 sketch pass build 报错（wave 侧 fail-fast，不等插件 preflight）。layer 载荷为可组合字段：`fills` / `shadows` / `gradient` / `opacity` / `corners`（`borders` 为协议预留，wave 当前无生产者——color token 走 `kind: color`），单记录同类 key 至多一次、`fills` 与 `gradient` 互斥；一个 wave token 仍只映射一个字段。swatch 引用：颜色值位置写 `{ "$ref": "<uuid>" }` = 绑定同清单 color 记录产生的 Swatch（取代旧 `@/路径` 字符串合同；layer `$ref` 为试用期，插件实测 update 不稳则降级 hex 快照 + notice，wave formatter 保留低成本切换实现）。含 alpha override 的颜色保持 HEX8。payload 范围 = 可同步资产（普通 border、generic dimension、transition 退出 payload）。硬切换：wave 只产 v2；`meta` 始终存在，`themeId` 可为 `null`（未跑身份命令的新主题），与 uuid 缺失同待遇——插件 notice 提示补登记（wave 侧已决策）。
7. **name 整形**：`filterLayer` 与 `$extensions.platform.sketch.path` 的语义平移为 name 生成规则（斜杠连接）；记录排序按源顺序，保持 diff 稳定；name 在单份 payload 内唯一，重复 = build 报错（name 是插件 duplicate/认养回退键，继承 v1 `assertUniqueSketchOutputPaths` 的硬报错语义）。
8. **其它格式**：json / jsonc / css / md-yml 不携带任何 id。
9. **`$extensions` 重设计**：`platform.sketch.{ path, property, skip, outline }` + `typography.baseFontSize`（跨平台语义基准，保持顶层）；group 级继承语义不变；提供一次性迁移命令，不留兼容层。
10. **直接 v2**：不做双发；本计划的 payload v2 规格即插件仓实现依据（跨仓交付物）。
11. **认养规则（跨仓合同注记）**：记录 uuid 对插件关系表未知且 name 命中未登记资产时，插件按 name 认养并补登记；name 命中已登记于其它 uuid 的资产时，duplicate 零写入。
12. **生成与填充**：id 生成仅发生在显式命令；写回为手术式插入/填充，规范展示位置不进协议（文档示例中 `$id` 位于 `$description` 与 `$value` 之间仅为惯例）。
13. **CSS typography shorthand 移除**：删除每 typography token 的聚合行（`--<key>: var(--<key>-weight) var(--<key>-size) / ...`），仅保留字段变量。依据：shorthand 在字段缺失时引用未定义变量（计算值阶段失效）；color 本就独立于 font 简写；实际使用皆按字段取用。输出按 CSS 最佳实践执行，后续排查其它类似的非最佳实践输出。

## Testing Decisions

- 以外部行为为测试对象：build 产物断言（v2 结构、kind、引用、范围收窄、重复降级）、命令输出断言（ids 报告、迁移结果）、错误信息断言（校验阶梯）
- 沿用 hermetic fixture 模式（`tests/fixtures/themes/*`）：新增身份相关 fixture；现有 sketch 断言全量迁移为 v2 形态
- 迁移命令：幂等断言、注释与排版保留断言、混合形态文件处置断言
- Orca 真实 canary：`--profiles all --out` 受控临时目录，保留互斥 parameter groups，`sketch.skip` 负向断言保留；main.yaml 哈希不变（豁免：显式身份写入与 `migrate-extensions` 迁移）
- 插件侧行为测试归插件仓；本仓以 payload v2 规格文档为合同边界
- **验收基线**：`tests/fixtures/themes/orca-test/`（`my-color/orca` 真实快照，含 profiles）实例生成跑通，sketch 产物符合 payload v2 合同；CSS 产物无 typography 聚合变量

## Out of Scope

- 插件侧实现（关系表、slot 存储迁移、认养与诊断行为）——插件仓议题
- 主题轴化重设计（typography 语义层级重组）——独立讨论，尚未拍板；CSS shorthand 移除已拍板纳入本计划（决策 13）
- 双格式过渡（已决定直接 v2）
- CSS / JSON / JSONC / md-yml 输出携带 id；Figma / code 等新平台扩展
- quick.sketchcloud heading-h1 一次性状态修复——插件仓议题 2.5 附属项

## Further Notes

- 节点式身份使"悬空条目"状态类不存在：删除或注释 token 时 `$id` 随节点走，注释恢复则身份无缝回归；账本式（已否决）需要的三义判定与永不自动清理规则随之作废
- 保留命名空间风险显式接受（DTCG §5.1.1）；文档级 `$schema` 为同型先例
- 规范依据：DTCG Format 2025.10 §5.1 / §5.2.2 / §5.2.3 / §6.1 / §6.4 / §6.5——§6.5 已核对原文：「Objects without a `$value` property are interpreted as groups by definition... Tools SHOULD provide clear error messages when an object appears to be an incomplete token rather than an intentional empty group」——doctor 疑似笔误检查即此 SHOULD 的落实；null 标量值为 wave 容忍的退化形态（按空组处理——null 并非 DTCG 定义的组，组必须是对象）
- `$helper`（orca/main.yaml 存量）为 `$` 前缀根键，被 schema 与 transformer 双双跳过，无行为影响；是否清理由作者随手决定，不设验收项
- **night overlay 语义（已裁定，2026-09-23 阳桃）**：维持现行行为——night 中 base 不存在的路径跳过（不新增 token），可写范围限 `theme.color` / `theme.state`；override 携带与 base 不同的非空 `$id` = build 报错。若未来放开 night 新增 token，需补充 night 新增节点的 id 归属设计与合并行为变更（不在本计划内）
- 现行 sketch 合同由 `docs/SPEC.md`（composite color-slot 与 typography 节）与 simple-wiki 2026-07-13 系列定义，v2 落地时需同步改写并标注取代关系
- 插件重构议题来源：`app_sketch-plugins/docs/simple-wiki/raw/2026-09-22-sync-token-refactor-agenda.md`（议题 2.5 / 议题 10）

## Draft Plan

- 结构总览：
  - 数据流：`main/profiles/@night yaml` -> loader（文档级 `$id` 读取、profile 拒绝声明）-> schema 合法性阶梯 -> resolver -> pass 树 -> transformer（`$id` 透传为 `WaveToken.id`，单 pass 重复降级）-> generator（sketch 输出 v2 清单，其余格式不变）
  - 命令面：`wave dt ids`（全 pass 加载 -> 空槽/新增/跨文件冲突 diff -> 生成/同步 -> 手术式写回 -> 报告）；`wave dt migrate-extensions`（一次性机械重命名）；doctor 增补报告项
  - 模块职责：schema 层承接 `$id` 与 token 合法性规则；transformer 承载 id 透传与降级；sketch formatter 重写为清单输出（name 整形复用 filterLayer 与 sketch.path 逻辑，kind 判定，`@uuid` 引用解析）；doctor 增加未入账/空槽位/疑似笔误空节点报告
- 关键契约：
  - 源侧：token 节点 `$id` 三态——缺省键 = 未入账（无身份）、键存在但空值/纯空白 = 预声明空槽（doctor 分列这两种状态）、非空字符串 = 身份（格式不限，生成形态 32-hex）；文档根 `$id?: string`（仅 main.yaml）；profile 文件仅根级 `$id` 报错——profile token 节点的 `$id` 由 ids 命令按 main 权威同步（物理复制），非作者手写
  - `WaveToken` 新增公开字段 `id?: string`；night overlay 身份规则：override 节点未携带 `$id`（或与 base 相同）时继承 base id，携带不同非空 `$id` = build 报错；night 独有路径被现行 merge 跳过（不新增 token ），是否放开为 ESCALATE 待 Human 裁定
  - payload v2 原型（来自本对话定稿，与 `my-color/orca` 示例一致）：

    ```json
    {
      "meta": { "themeId": "<32-hex>", "version": 2 },
      "assets": [
        { "uuid": "<32-hex>", "name": "v2/color/primary-main", "kind": "color", "color": "#1872f0ff" },
        { "name": "v2/color/transparent", "kind": "color", "color": "#00000000" },
        { "uuid": "<32-hex>", "name": "v2/display/text-body", "kind": "text",
          "text": { "fontFamily": "PingFang SC", "fontSize": 12.25, "fontWeight": 400, "lineHeight": 18, "kerning": 0 } },
        { "uuid": "<32-hex>", "name": "v2/state/hover", "kind": "layer", "opacity": 0.08 },
        { "uuid": "<32-hex>", "name": "v2/shadow/elevation-low", "kind": "layer",
          "shadows": [{ "x": 0, "y": 0, "blur": 2, "spread": 1, "color": "#0f172a05" }] },
        { "uuid": "<32-hex>", "name": "v2/radius/md", "kind": "layer", "corners": { "radii": 8 } },
        { "uuid": "<32-hex>", "name": "v2/outline/ring", "kind": "layer",
          "shadows": [
            { "x": 0, "y": 0, "blur": 0, "spread": 4, "color": { "$ref": "<primary-main uuid>" } },
            { "x": 0, "y": 0, "blur": 0, "spread": 2, "color": "#ffffffff" }
          ] }
      ]
    }
    ```

    注：`v2/shadow/elevation-low` 的 `shadows` 数组为 smoothShadow step-4 展开的 5 个插值层，示例截断至首层。

  - 引用形态：layer 颜色值位置可写 `{ "$ref": "<uuid>" }`，解析目标为同清单 `kind: color` 记录；目标不存在 = build 报错；含 alpha override 保持 HEX8
  - ids 命令报告：新增 N、同步 M、警告 K（重复降级、跨文件冲突明细）
- 文件结构：
  - 修改：`src/core/schema/theme.ts`（`$id` 与 token 合法性规则）、`src/core/pipeline/profile-resolver.ts` 与 workspace 加载（文档级 `$id`、profile 拒绝）、`src/core/transformer/theme-transformer.ts`（id 透传、重复降级）、`src/types/index.ts`（`WaveToken.id`、payload v2 类型）、`src/core/generator/formats/sketch.ts`（v2 清单重写）、`src/cli/commands/dt.ts`（子命令挂载）、`src/core/doctor/*`（新报告项）、`docs/SPEC.md` 与用户手册（方言登记、合同快照、取代标注）
  - 创建：ids 命令模块（CLI 挂载 + 核心逻辑）、migrate-extensions 命令模块、payload v2 组装逻辑（formatter 内或独立模块）、身份/迁移/payload v2 的 hermetic fixtures 与测试
- 风险与未决：
  - YAML 手术式写回需保留注释与排版，需以 CST 级方案（parseDocument 原位插入）做一次 spike 验证往返无损
  - sketch formatter v2 重写面大：现有 sketch 断言全量迁移，SPEC 与手册同步，Orca canary 必须通过
  - 认养规则的最终语义（uuid 未知且 name 命中已登记资产之外的分支）需插件仓复核，本计划给出的是建议合同
  - 迁移命令对半新半旧混合形态文件的处置需定义（建议：报错并指引先跑迁移，不做猜测式合并）
  - **`$extends` 已知风险（挂起，2026-09-23 阳桃裁定后置）**：DTCG §6.4 全文审计发现的方言裁定未实施——① override 整体替换丢失 token 级 `$type`（规范自相矛盾），拟按"继承 base 解析类型 + doctor 警告"处理；② 本地与继承 `$type` 冲突的约束检查；③ `$extensions` 组属性随扩展复制的传播问题（拟裁定 `platform` 不传播）；④ wave 既有 `$extends` 与 §6.4 的差距审计（合并次序/循环检测/约束）。payload v2 与身份工作均不依赖这些，落地前 `my-color/orca` 若未使用 `$extends` 则无实际影响
  - 发版时序：旧插件遇到 v2 文件会静默空同步（非报错）——wave v2 输出上线与插件 v2 发版需同批操作
  - 插件协议 erratum 待其修正：议题 10a 示例 layer 记录用 `shadow`，10b key 表为 `shadows`，以 10b 为准
  - 未决：ids 命令最终命名；`wave dt build --ids` 语法糖是否提供（低优，可后补）
  - **已登记真实实例缺口（orca-test 快照实测，2026-09-23）**：`--profiles all` 构建失败——`Duplicate Sketch output path "shadow" conflicts with "shadow/elevation-high" at theme.shadow.elevation.high`。单 main 构建通过，失败出现在 profile pass；与审计 CRITICAL-1（output-plan 前缀冲突）及 group `sketch.path` 继承投影相关，root-cause 归 M4 范围，以 orca-test 为复现入口
- 里程碑草案：
  - M1 源侧身份契约：`$id` schema/加载/校验阶梯 + id 透传（验证主题：身份随解析链流动、阶梯报错与降级正确）
  - M2 ids 命令与手术式写回（验证主题：生成/同步/报告正确，写回不破坏注释排版）
  - M3 sketch payload v2（验证主题：清单结构、kind、`$ref` 引用、范围收窄、textColor 退役、fontWeight 刻度）
  - M4 `$extensions` 重设计 + 迁移命令（验证主题：机械迁移幂等、继承语义不变）
  - M5 文档、SPEC、Orca canary（验证主题：真实实例 `--profiles all` 通过、文档快照一致）

## Implement Plan

实施总览：

- 推进顺序：Milestone-1（源侧身份）→ Milestone-2（`$extensions` 重设计与迁移）→ Milestone-3（ids 命令与写回）→ Milestone-4（sketch payload v2）→ Milestone-5（CSS shorthand 移除）→ Milestone-6（文档与真实主题验收）。依赖边：M2 依赖 M1；M3 依赖 M1 + M2（复用其 CST 写回机制）；M4 依赖 M1 + M2（formatter 按 `platform.sketch` 新形态读取，且执行迁移后的 fixture）；M6 依赖全部。M5 仅动 `css.ts`，独立可随时并行插入（不受 M4 闸门约束）。
- 与草案差异说明：草案 M2/M4 顺序对调——`$extensions` 迁移是 sketch formatter 读取形态的前置，编号以本节为准。
- 通用约束（每个 Task 收尾执行）：`pnpm typecheck` 通过；`bun test` 全绿（新增 + 存量零回归）；原子提交，Conventional Commits；fresh-agent 开工前先读 `AGENTS.md` 与 `docs/SPEC.md` 心智模型节；真实主题构建一律 `--out` 指向受控临时目录，禁止写入源仓库。

## Milestone-1

源侧身份契约（`$id` 校验阶梯与透传）

- 验证主题：`$id` 在文档根 / token 节点两级被正确识别并透传到 `WaveToken.id`（含 resolver 重建路径与 night overlay 合并继承）；组级 `$id`、混合体、类型不可判定按阶梯报错；重复 uuid 与未入账按降级与告警处理；doctor 输出五项报告
- 核验基线：`pnpm typecheck` 通过；`bun test` 全绿（含新增身份测试，存量零回归）；`pnpm dev -- dt build -f tests/fixtures/themes/standard/main.yaml` 产物与改造前一致；Orca canary 受控执行一次（目标 `tests/fixtures/themes/orca-test/main.yaml`，orca 真实快照）——**red/绿皆归因记录（清单可为空）**：orca 未类型化 token 的 `$value` 多为引用（§5.2.2 引用优先可判定类型），预期大概率零 red；校验阶梯的有效性由 Task-5 hermetic 负向断言保证（含人造无类型引用 token 的报错用例），不由 canary red 项背书
- 来源：US-1 / US-2 / US-6；决策 1 / 3 / 5

### Task-1

schema 层 `$id` 与 token 合法性规则（来源：决策 1 / 3 / 5；DTCG §5.2.2 / §6.1）

- 验收标准：组节点出现 `$id` 报错（消息含组路径）；token 节点 `$id` 键存在时——null、空串或纯空白 = 预声明空槽（合法，doctor 报告，ids 填充），非空字符串 = 身份（格式不限，不锁编码），其它类型（number 等）报错；`$value` 与子节点混居报错；类型经引用与组继承仍不可判定时报错。新增单测覆盖全部报错、空槽与通过分支
- 可动文件范围：`src/core/schema/theme.ts` 及其测试
- 依赖：无
- 固有风险：存量 fixture 可能踩新校验——以报错信息为准修 fixture，不得放宽校验

- [ ] 实现 schema 校验规则（含空槽语义）
- [ ] 新增/修复测试，`bun test` 全绿

### Task-2

文档级 `$id` 加载与 profile 拒绝（来源：决策 1）

- 验收标准：main.yaml 根部 `$id` 被读取并进入文档元数据通道（与 `$config` 剥离同级处理）；`profiles/*.yaml` 与 `*@night.yaml` 出现根级 `$id` 报错（消息与 `$config.theme` 同风格）；无 `$id` 时构建照常（themeId 空语义）。**行为变更注记**：night/profile 根级 `$id` 此前随 `$` 前缀根键被静默跳过，本变更为报错，随方言登记公告
- 可动文件范围：`src/core/pipeline/profile-resolver.ts`、workspace 加载链路及其测试
- 依赖：Task-1
- 固有风险：`$id` 与 `$config` 的剥离次序——必须先取后剥，避免进入 token 树

- [ ] 实现 root `$id` 读取与 profile 拒绝
- [ ] 测试：main 有/无 `$id`、profile 含 `$id` 报错

### Task-3

`WaveToken.id` 透传与单 pass 降级（来源：决策 1 / 5）

- 验收标准：`WaveToken` 新增公开 `id?: string`；`$id` 经 resolver 全路径透传进入 `WaveToken.id`——**含 `reference-token-internal.ts` / `reference-token-external.ts` 的重建白名单**（现仅拷贝 `$value/$type/$description/$deprecated/$extensions`，须加入 `$id`）与组遍历路径；night overlay 合并（`mergeNightOverlay`）身份规则：override 节点未携带 `$id` 或与 base 相同时继承 base id，**override 携带与 base 不同的非空 `$id` = build 报错**（身份永不静默重分配；night 独有路径被现行 merge 跳过、不新增 token——产品裁定见 Further Notes ESCALATE-3）；单 pass 内重复 uuid 按文档序首个保留、其余置空并产出告警
- 可动文件范围：`src/types/index.ts`、`src/core/transformer/theme-transformer.ts`、`src/core/resolver/reference-token-internal.ts`、`src/core/resolver/reference-token-external.ts`、`src/core/pipeline/profile-resolver.ts`（mergeNightOverlay）
- 依赖：Task-1
- 固有风险：派生展开体（smoothShadow / inheritColor）跟随源 token id 且不单独成记录，因此不参与单 pass uuid 唯一性判定（降级仅作用于源级定义节点）；被引用 token 的重建体 id 保持与源一致

- [ ] 类型与透传实现（含 resolver 白名单与引用重建路径）
- [ ] night override 身份冲突报错 + 继承实现
- [ ] 重复降级实现 + 派生 token id 语义测试

### Task-4

doctor 报告项（来源：决策 5）

- 验收标准：doctor 输出五项——未入账清单（含路径）、空 `$id` 槽位、id 非生成形态提示（不锁编码仅提示）、疑似笔误空节点（**定义为无 `$value` 且无子节点的对象节点**；null 标量值（如 `layout: ~`）为 wave 容忍的退化形态——非 DTCG 组定义——不计入）；跨文件 id 冲突在 doctor 中报错
- 可动文件范围：`src/core/doctor/*`
- 依赖：Task-1 ~ Task-3
- 固有风险：doctor 需要 multi-pass 数据，注意与单 pass build 的数据边界

- [ ] 五项报告实现
- [ ] doctor 测试

### Task-5

Milestone-1 收口（来源：Testing Decisions）

- 验收标准：身份 hermetic fixture（`tests/fixtures/themes/` 新增）覆盖全部阶梯分支；**存量 fixture 全量审计**（脚本枚举，非抽样）：逐一确认无混合体、无类型不可判定节点，存在的按整改清单处理；`pnpm typecheck` + `bun test` 全绿
- 可动文件范围：`tests/fixtures/themes/*`、测试文件
- 依赖：Task-1 ~ Task-4
- 固有风险：无

- [ ] fixtures 与断言
- [ ] 存量 fixture 全量审计
- [ ] 全量验证

> [!IMPORTANT]
> Milestone-1 闸门：身份在解析链中流动正确、校验阶梯报错/降级与设计一致，未通过不进入 Milestone-2。

## Milestone-2

`$extensions` 重设计与迁移

- 验证主题：`platform.sketch.{ path, property, skip, outline }` 与 `typography` 新形态被 schema/解析/formatter 全链路接受；`migrate-extensions` 一次性完成旧 → 新机械重命名且幂等；group 级 `platform.sketch.path` 继承语义与迁移前一致
- 核验基线：迁移后存量 fixture 全部通过 `bun test`；迁移命令二次执行零差异；`pnpm typecheck`
- 来源：决策 9

### Task-1

YAML 手术式写回 spike 与库选型（来源：决策 9 / 12）

- 验收标准：以 `yaml` 库 Document API（或等价 CST 方案）在真实 fixture 上原位插入/填充 `$id`、执行扩展键重命名，验证注释、空行、缩进、键序零变化；产出结论：可行路径、限制与库选型建议，写入本计划附注。**依赖决策点**：仓库现用 `js-yaml`（无 CST 能力）——spike 需评估引入 `yaml` npm 包（新增依赖）或替代方案，结论含依赖变更建议与体积影响
- 可动文件范围：spike 脚本（临时）、`package.json`（若采纳新依赖）、结论附注
- 依赖：Milestone-1
- 固有风险：CST 往返对 anchor/alias/多行字符串的边界——spike 必须覆盖；结论同时服务 M2 迁移与 M3 ids 写回，避免双实现

- [ ] spike 执行与结论（含依赖变更建议）

### Task-2

`wave dt migrate-extensions` 命令（来源：决策 9）

- 验收标准：对旧形态文件执行机械重命名（`sketch.* → platform.sketch.*`、`outline → platform.sketch.outline`），保留注释排版；二次执行幂等零差异；半新半旧混合形态文件报错并指引（不做猜测式合并）
- 可动文件范围：新增 CLI 命令模块 + 核心迁移逻辑（复用 Task-1 机制）
- 依赖：Task-1
- 固有风险：spike 否决 CST 路线时的替代实现需二次评审

- [ ] 迁移实现
- [ ] 幂等与混合形态测试

### Task-3

新形态解析——瞬态双接受（来源：决策 9）

- 验收标准：`$extensions.platform.sketch.*`（path / property / skip / outline）与 `$extensions.typography.baseFontSize` 全链路可解析，行为与旧形态完全一致；**瞬态双接受**：旧形态（`$extensions.sketch.*` / `$extensions.outline`）在本 Task 仍可解析（行为不变）——双接受是本里程碑内的瞬态状态，由 Task-5 删除，**不是兼容层**
- 可动文件范围：`src/core/schema/*`、`src/core/transformer/sketch-extension.ts` 等消费点
- 依赖：Milestone-1
- 固有风险：双接受期间新旧键同时出现的文件——按「新键优先」解析并在测试中锁定

- [ ] 新形态解析实现
- [ ] 新旧行为一致性测试（旧 fixtures 保持全绿）

### Task-4

存量 fixture 迁移（来源：决策 9；dogfooding）

- 验收标准：用 Task-2 命令迁移 `tests/fixtures/themes/*` 全部旧形态文件（含 `sketch-extensions` / `profile-model` / `orca-realistic` / `orca-test` 快照）；迁移前已固化行为快照测试（group 继承、outline 模拟、property 白名单），迁移后快照逐字段不变（新形态解析已于 Task-3 就位，本 Task 收尾全绿）
- 可动文件范围：`tests/fixtures/themes/*`、测试文件
- 依赖：Task-2 / Task-3
- 固有风险：fixture 中非 `sketch` 家族的旧键（如 `outline`）遗漏——以 grep 清点 `$extensions` 使用为起点，不接受抽样

- [ ] 迁移前快照测试（Task-3 已就位的保持）
- [ ] 执行迁移并验证快照不变

### Task-5

旧形态拒绝（来源：决策 9）

- 验收标准：旧形态（`$extensions.sketch.*` / `$extensions.outline`）不再被解析，遇到即报错并指引 `wave dt migrate-extensions`（**负向断言**：每种旧形态键各一条报错测试；此时 fixtures 已迁移，全绿）
- 可动文件范围：`src/core/schema/*`、`src/core/transformer/sketch-extension.ts` 等消费点
- 依赖：Task-3 / Task-4
- 固有风险：消费点遗漏——grep `sketch.path` / `sketch.property` / `sketch.skip` / `outline` 全部消费方逐一确认

- [ ] 旧形态负向断言
- [ ] 继承语义回归测试

> [!IMPORTANT]
> Milestone-2 闸门：迁移后 `bun test` 全绿且二次迁移零差异，未通过不进入 Milestone-3。
>
> **迁移范围说明（2026-09-23 阳桃裁定）**：orca 真实快照已拷贝入仓 `tests/fixtures/themes/orca-test/`（约 107 处 `sketch:` + 19 处 `outline:`，跨 main 与 profiles；`$extends` 零使用，挂账风险无实际影响面），随 M2 Task-3 一并迁移——canary 全程使用仓内快照。`my-color` 本体的迁移由 Human 在交付末尾自行执行，不阻塞任何里程碑。M1 canary 的类型 red 项预期为空（未类型化引用 token 经 §5.2.2 引用解析可判定类型）；若实测出现 red 项，按清单整改。

## Milestone-3

ids 命令与手术式写回

- 验证主题：`wave dt ids` 完成空槽填充、新增生成、跨文件共享路径同步与冲突报错；写回不破坏注释与排版；报告（新增 N / 同步 M / 警告 K）准确
- 核验基线：ids 命令测试全绿；对 fixture 执行前后 diff 仅新增/变更 `$id` 行；`pnpm typecheck`
- 来源：US-1 / US-2；决策 2 / 4 / 12

### Task-1

命令核心（来源：决策 2 / 4）

- 验收标准：全 pass 加载 → 路径/槽位 diff → 空槽填充、新增生成（`crypto.randomBytes(16).toString('hex')`）、共享路径 main 权威同步；跨文件同路径不同 id 报错且零写入；报告输出新增/同步/警告明细。**安全语义**：默认（无参）= dry-run 仅输出报告；显式 `--write` 才执行写回，且写回前要求 `git status` 干净，不干净时需显式 `--allow-dirty`。**night 归属**：night override 携带与 base 不同的非空 `$id` 在 load 期即由 Milestone-1 报错，ids 不重复处理；ids 范围不含 night 新增 token（该状态不存在，见 Further Notes ESCALATE-3）
- 可动文件范围：新增 CLI 子命令模块 + 核心逻辑
- 依赖：Milestone-1；Milestone-2（复用其 CST 写回机制）
- 固有风险：跨文件一致性需要全部 profile pass 数据——与单 pass build 的数据边界共用 Milestone-1 Task-4 的结论

- [ ] diff 与分配逻辑
- [ ] 默认 dry-run / `--write` / git 清洁检查实现
- [ ] 报告实现

### Task-2

写回实现与测试（来源：决策 12）

- 验收标准：空槽填充、新增插入、跨文件传播三种写回路径各有测试；执行两次零差异；git diff 检查仅 `$id` 行变化
- 可动文件范围：写回实现、测试
- 依赖：Task-1；Milestone-2 Task-1（CST 机制）
- 固有风险：并发运行两个 wave 进程的写回竞争——首版不做文件锁，文档化"单进程使用"约束

- [ ] 写回实现
- [ ] 测试与全量验证

> [!IMPORTANT]
> Milestone-3 闸门：ids 命令全部分支正确且写回无损，未通过不进入 Milestone-4。

## Milestone-4

sketch payload v2

- 验证主题：产物符合协议 10a/10b——meta/assets 结构、kind 三分、layer 组合字段、`$ref` 引用、fontWeight 刻度、范围收窄、未入账省略 uuid
- 核验基线：sketch 相关 `bun test` 全绿；`pnpm dev -- dt build -f <身份 fixture>` 产物逐字段断言通过；`pnpm typecheck`
- 来源：US-3 / US-4 / US-5；决策 6 / 7 / 10 / 11

### Task-1

payload v2 类型与组装器（来源：决策 6）

- 验收标准：`meta`（themeId 可空、version: 2）与 `assets[]` 组装；记录契约 `{ uuid?, name, kind, <载荷> }`；kind ∈ color / text / layer；未入账记录省略 uuid；**themeId 管道全链路贯通并有测试**：文档元数据 → pass options → sketch formatter（当前该管道不存在，属新建）
- 可动文件范围：`src/types/index.ts`、新增 payload 组装模块、`src/core/generator/formats/sketch.ts`、pass options 组装点（`theme-service` / `token-generator`）
- 依赖：Milestone-1 / Milestone-2
- 固有风险：组装器与旧格式生成的切换边界——硬切换，删除旧路径（无兼容开关）；themeId 管道涉及 pass options 形状变更，需确认不影响其余格式

- [ ] 类型 + 组装器
- [ ] themeId 管道贯通与测试
- [ ] 单元测试

### Task-2

name 整形与 kind 判定（来源：决策 7）

- 验收标准：name = sketch.path 前缀 + filterLayer 裁剪路径的斜杠连接（与现有 `buildOutputPath` 语义一致）；**name 在单份 payload 内唯一，重复 = build 报错**（对齐 v1 `assertUniqueSketchOutputPaths` 硬报错语义）；color / text / layer 判定覆盖全部可同步 token 形态（含 `$extensions.platform.sketch.property` 的 opacity/corners、outline ring）；普通 border、generic dimension、transition 不产出记录
- 可动文件范围：`src/core/generator/formats/sketch.ts`
- 依赖：Task-1
- 固有风险：`$root` 形态（wave 现不支持）不在范围；inheritColor 等派生形态的 kind 归类需逐个断言

- [ ] name/kind 实现（含唯一性断言）
- [ ] 形态覆盖测试

### Task-3

载荷映射与 `$ref` 引用（来源：决策 6；swatch 引用合同见协议 10b）

- 验收标准：color → HEX8；text → 5 字段（fontWeight 非 100–900 整百在 **sketch pass** build 报错，CSS/JSON 等平台不受影响——附对照测试；fontFamily 缺失按 defaults 回退）；shadow/gradient/opacity/corners → layer 组合字段；outline ring → shadows 双层且 ring 层颜色为 `{ "$ref": "<同清单 color uuid>" }`；`$ref` 目标不存在 build 报错；alpha override 保持 HEX8；**`$ref` / hex 快照为组装器单点切换**（试用期降级预案），双模式各有测试
- 可动文件范围：`src/core/generator/formats/sketch.ts`、组装模块
- 依赖：Task-1 / Task-2
- 固有风险：smoothShadow 展开的 layer 映射数值——以现有 sketch 输出为对照基准逐层断言

- [ ] 载荷映射与 `$ref`
- [ ] fontWeight 作用域测试（sketch 报错 / 其它平台通过）
- [ ] `$ref` 降级切换点与双模式测试
- [ ] smoothShadow 对照测试

### Task-4

存量断言迁移与合同自检（来源：Testing Decisions）

- 验收标准：全部 sketch 相关 fixture 断言迁移为 v2 形态；对照检查表（10a/10b 逐条）自检通过并记录
- 可动文件范围：`tests/**`、fixture
- 依赖：Task-1 ~ Task-3
- 固有风险：遗漏断言——以 grep 清点旧断言为起点，不接受抽样

- [ ] 断言迁移
- [ ] 协议对照自检表

> [!IMPORTANT]
> Milestone-4 闸门：v2 产物逐字段符合协议，存量测试零回归，未通过不进入 Milestone-6（Milestone-5 为独立并行工作，不受本闸门约束）。

## Milestone-5

CSS typography shorthand 移除

- 验证主题：每个 typography token 仅输出字段变量，无聚合行；family 去重、color 引用保留、rem 保留语义不变
- 核验基线：CSS 相关 `bun test` 全绿；fixture 产物断言无 `--<key>: var(--<key>-weight)` 形态行；`pnpm typecheck`
- 来源：决策 13

### Task-1

移除聚合行与断言更新（来源：决策 13）

- 验收标准：`typographyLines` 不再输出聚合变量；存量 CSS 断言更新；新增"无聚合行"负向断言；SPEC 对应行为快照改写
- 可动文件范围：`src/core/generator/formats/css.ts`、CSS 测试、`docs/SPEC.md` 对应节
- 依赖：无（可与 Milestone-2 ~ Milestone-4 并行）
- 固有风险：下游若有消费者依赖聚合变量——属破坏性变更，随 v2 硬切换公告

- [ ] 移除实现
- [ ] 断言与 SPEC 更新

## Milestone-6

SPEC / 手册 / 真实主题验收

- 验证主题：文档与真实实例一致——SPEC 方言登记（`$id` / payload v2 / `$extensions` 新形态）、行为快照改写并标注取代关系；`tests/fixtures/themes/orca-test` 全 profile 生成符合合同
- 核验基线：`pnpm check:ci`（或等价全量验证）；`tests/fixtures/themes/orca-test/main.yaml` 的 `--profiles all` 受控构建通过，sketch 产物逐条符合 payload v2 合同，CSS 产物无聚合变量
- 来源：US-6；Constraints 验收基线；决策 10 / 13

### Task-1

SPEC 与手册（来源：US-6）

- 验收标准：`docs/SPEC.md` 完成 `$id` 方言登记（含保留命名空间与迁移承诺注记）、payload v2 合同快照、`$extensions` 新形态；用户手册同步；旧合同标注取代关系
- 可动文件范围：`docs/SPEC.md`、手册文档
- 依赖：Milestone-1 ~ Milestone-5
- 固有风险：文档遗漏——以决策 1-13 逐条对照检查

- [ ] SPEC 与手册更新

### Task-2

真实主题验收（来源：Constraints 验收基线）

- 前置：orca-test 快照已随 M2 Task-3 迁移至新形态（仓内完成，无需外部授权）；M1 canary 若有类型 red 项已按清单整改（预期为空）；`$helper` 无需处置（schema/transformer 对 `$` 前缀根键双双跳过，无行为影响；是否清理由作者随手决定，不设验收项）；`my-color` 本体迁移由 Human 在交付末尾自行执行
- 验收标准：`pnpm dev -- dt build --profiles all -f tests/fixtures/themes/orca-test/main.yaml --out <受控临时目录>` 成功；sketch 产物断言（meta、assets 结构、`v2/*` name 形态、`$ref`、无 textColor）；CSS 产物断言（无聚合行、引用保留）
- 可动文件范围：验收脚本/命令、记录
- 依赖：Task-1；全部前序里程碑；上述 my-color 迁移完成
- 固有风险：真实数据暴露的缺口——按护栏提炼为 hermetic fixture 内化，不就地打补丁

- [ ] my-color 迁移确认（前置）
- [ ] 受控构建与产物断言
- [ ] 缺口内化与收尾清账

> [!IMPORTANT]
> Milestone-6 闸门：文档与真实实例双验收通过，整个计划交付；遗留 MAJOR 清账（RESOLVED / ACCEPTED）。
