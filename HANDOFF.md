# Handoff Kanban

> [!IMPORTANT]
> 从下方全局动态及关联文档恢复工作状态，并派遣子代理（Explore）对照工作区复验。
> 向用户简要说明当前状态与下一步；存在课题组时，列出代号及一句话描述。若引用的 commit、分支或文件已失效，或工作区存在文档未记录的改动，明确指出差异。
> 汇报后等待用户安排，不要自行开工。

最后更新：2026-09-24（本次会话交付 Sketch swatch `$ref` 撤回）

## 全局动态

- **sketch-swatch-ref-retirement（本日新增，已交付）**：Sketch payload 不再把 layer 颜色位置映射成 `{ "$ref": "<uuid>" }`，一律输出 HEX8 具体值；绑定能力、`_sketchColorReference` 元数据链路、颜色别名索引与「目标未入账即 build 报错」整体移除，`SKETCH_SWATCH_REF_MODE` 开关不复存在。计划 `docs/island/plans/2026-09-24-sketch-swatch-ref-retirement.md`（全部步进已勾选）；提交 `ba99038` → `4aab419`（含 changeset `.changeset/sketch-hex-color-snapshots.md`，minor）；simple-wiki 单页决策已入库。真实消费者 canary：`$ref` 1 → 0，除 ring 层颜色外产物与基线逐字节一致。
- **wave-id-and-payload-v2（前序计划，`state: 已对齐`）**：M1-M5 的实现已按组落地，进度以 git 为准（计划 checkbox 从未维护）。M1 源侧身份契约 `75a05fc`/`cfe002a`/`19e1111`/`cf3082d`/`ff47fab`；M2 `$extensions` 重设计与迁移 `ae79069`/`214cd9a`/`10cf139`；M3 ids 手术式写回 `9fb3c0f`/`98752fb`；M4 sketch payload v2 `2797bfe`/`2c8b770`/`33664c0`；M5 CSS typography shorthand 移除 `b934e4b`。
- **M6 收尾待办**：真实主题验收（`tests/fixtures/themes/orca-test/main.yaml` 的 `--profiles all` 受控构建 + 产物断言）尚无执行记录；`my-color` 本体迁移按计划留 Human 在交付末尾自行执行；治理候选（见审计报告）待 Human 授权。
- **M6 验收标准已部分失效**：该标准的 sketch 产物断言要求检查 `$ref`；本日撤回后 Sketch payload 不再出现任何 `$ref`，该条应改为「无 `$ref` 且 outline ring 层为 HEX8」。旧计划正文进入冻结期不改写，修正以新计划为源。
- **质量审计**：`docs/island/report/2026-09-23-wave-quality-audit.md` 已交付并 strict 复核 PASS（输出提交原子性、compress symlink 策略为最高优先候选）。
- **仓库状态**：HEAD 工作区干净。`pnpm check:ci` 会在 test 步失败，原因是 `tests/cli-motion.test.ts` 的 2 个 TTY 用例（`mg without format checks current directory before prompting`、`mg without format in TTY selects APNG by default and uses fps option`）在本日改动之前即为红，非本次回归；typecheck / build / check:style 均通过。
- **路由纪律**：chatgpt 路由限额勿跑长任务；子代理收尾后不可续跑（0.1.7），续接一律新实例注入上下文。

## 关联文档与现场

- 本日计划与切片：`docs/island/plans/2026-09-24-sketch-swatch-ref-retirement.md`
- 前序计划：`docs/island/plans/2026-09-23-wave-id-and-payload-v2.md`；切片目录 `.tmp/plans-2026-09-23-wave-id-and-payload-v2/`；M1 Gate 记录 `.tmp/handoff/260924075558-wave-id-v2-m1-gate.md`
- 真实实例 canary 工作区：`/Users/teatao/Downloads/20260924-test-v1/main.yaml`（其 `theme/` 下产物是**撤回前**的，含 1 处 `$ref`；如需基线请先复制到受控目录再比对，不要覆盖源目录）
- 知识库：`docs/simple-wiki/`（已入库；`wiki/INDEX.md` 为导览）
