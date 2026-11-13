# STRICT 台账 — C2 SPEC

## FULL-1 发现存档（FAIL 6F/7M/0m，2026-11-12）

对 C2 SPEC v1（5a6a730，fresh reviewer max）。全部引用经主代理核验属实（wcag 真身 doctor-action.ts:225 私有 runDesignTokenContrastCheck；randomBytes(16) @ dt-new-profile-action:142；show 分支 :282-358）。核心失误：初版勘测漏委托链（dt-action 薄层 → wcag 编排在 doctor-action）。v2 消解：

| ID | 级别 | 发现 | v2 消解 |
| --- | --- | --- | --- |
| F-1 | FATAL | wcag 非薄层：doctor-action.ts:225-347/581-589 私有编排；写边界禁该文件 → 点名 wcag 失败 | wcag 回归下沉：core/doctor/wcag-service.ts；doctor-action 入边界（仅 wcag 段） |
| F-2 | FATAL | InspectResult 无形状/union | InspectQueryResult union 四分支全形状（含 yaml rawFileContent） |
| F-3 | FATAL | CreateProfileResult 无 input/exitCode 语义 | 显式 input 形状 + ok/exitCode/message union + randomSource |
| F-4 | FATAL | randomBytes 随机 $id → 字节等价不可满足 | $id 规范化等价方法 + randomSource 注入（生产不变） |
| F-5 | FATAL | 命令名错（实为 token new profile）；无基线/脚本 | 命令修正；主代理开工基线预捕获 + diff 对脚本 + 矩阵全列举 |
| F-6 | FATAL | 只读声明与 loadResource restore 行为冲突 | 只读策略诚实化（透传现状语义，定义限定为不改产物状态） |
| M-1 | MAJOR | flatten/原始字节边界未定 | yaml → rawFileContent；其余 → parsed（Decisions 1） |
| M-2 | MAJOR | create 分支覆盖缺口 | 全分支列举 + 测试绑定（Decisions 2/6） |
| M-3 | MAJOR | cache 合同矛盾 | 两服务统一 cache? 尾参 + hits 断言 |
| M-4 | MAJOR | 测试覆盖不可审计 | 绑定清单（Decisions 6） |
| M-5 | MAJOR | build 核验不可复现 | 可证伪化（grep 断言 + 行数阈值，Decisions 5）；wcag 转下沉 |
| M-6 | MAJOR | workspacePath 不闭合 | CLI 解析 → 服务收已解析路径（Decisions 1） |
| M-7 | MAJOR | 边界 vs 路线图冲突 | wcag 落位 core/doctor/；doctor-action 入边界 |

v2 后 fresh FULL-2。
