# STRICT FULL-2 发现存档 — C2 SPEC（FAIL 5F/7M/4m，2026-11-12）

对 C2 SPEC v2（c51feff，fresh reviewer max）。轨迹：FULL-1 6F/7M → v2 → FULL-2 5F/7M/4m（FATAL 缓收，新细化 FATAL 出现——早停警戒一轮已用）。主代理裁决：E1 create 等价覆盖 stdout+stderr+退出码+文件四项；E2 服务参数 = entry(绝对路径)+cwd(绝对目录) 显式组合，服务零 process.cwd 依赖。

| ID | 级别 | 发现 | v3 方向 |
| --- | --- | --- | --- |
| F1 | FATAL | （转达自首条，与 inspect/cwd 相关） | spike 后落契约 |
| F2 | FATAL | CreateProfileResult 缺 plan.overwrites/dry-run 计划/外部输出路径提示——CLI 输出无法由结果重建 | spike 捕获 create 实际 stdout/文件行为 → 结果形状按重建需求反推 |
| F3 | FATAL | WcagResult 无 ok=true 分支字段（displayThemeName/reports/blockingErrors/night 跳过/report-only exit 0） | spike 捕获 wcag 实际输出 → 成功分支全形状 |
| F4 | FATAL | inspect/wcag 合同隐含 process.cwd（show 无 -f；loadResource/loadDesignTokenSource 依赖 cwd） | E2 裁决：entry+cwd 显式；cwd 语义进服务合同 |
| F5 | FATAL | Inspect union 漏单参资源名回退分支（token show tailwindcss → showResource） | union 补单参-名回退模式 |
| M1 | MAJOR | $id 规范化无字段/算法/占位值/失败判定 | 冻结：仅 $id 字段、36-hex → `<id>`、diff 前处理 |
| M2 | MAJOR | show 矩阵缺无参/单参非法 format（入口 vs showResource 校验差异） | 矩阵补全（含非法 format 分支） |
| M3 | MAJOR | create 等价缺 stdout/stderr 对照 | E1 裁决四项全比 |
| M4 | MAJOR | wcag 测试绑定缺无 Night/跳过/context 失败/reports+blockingErrors 并存分支 | 绑定清单补全（spike 后精确化） |
| M5 | MAJOR | build 核验非机器可判定 | 核验脚本化（固定期望输出 + 失败退出） |
| M6 | MAJOR | Task-1/2 单闸门滞后暴露 | Task-1 交付即做中间核验（gate 增加 Task-1 检查点） |
| M7 | MAJOR | ExitCode 是运行时常量非 TS 类型（实际 ExitCodeType） | 契约改 exitCode: ExitCodeType |
| m1-m4 | MINOR | 字面量约束/matches 数组语义/缺省 cache 生命周期/静态检查盲区 | 逐条收窄 |
| U1 | UNVERIFIED | c2-equivalence 基线目录不存在 | 派遣前主代理预捕获（已在计划） |
| U2 | UNVERIFIED | 比较脚本与三测试文件未存在 | 施工产物，U 属预期 |
| U3 | UNVERIFIED | 未运行构建/测试 | 静态审查限界 |

v3 = spike 先行（P1b 同款裁决延伸）：实跑 show/create/wcag 全变体捕获真实输出 → 事实清单 → 契约冻结 → fresh FULL-3。
