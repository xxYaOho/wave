# Handoff Kanban

> [!IMPORTANT]
> 从下方全局动态及关联文档恢复工作状态，并派遣子代理（Explore）对照工作区复验。
> 向用户简要说明当前状态与下一步；存在课题组时，列出代号及一句话描述。若引用的 commit、分支或文件已失效，或工作区存在文档未记录的改动，明确指出差异。
> 汇报后等待用户安排，不要自行开工。

最后更新：2026-11-01（Night Mode 设计草案待 Human 审阅）

## 全局动态

- **Night Mode 设计草案已落盘，待 Human 审阅**：命名（day/night vs Dark-as-theme）、复用 `@night` 的「生成草稿 → 手调 → merge」、从 Day 推导的意图原则与开放旋钮、v1 非目标及批准后施工切片，见[设计草案](.tmp/handoff/261101180800-wave-night-mode-design-draft.md)。**批准前不改 schema / CLI / pipeline，不提交。**
- **颜色自动生成仍处实验与需求收敛**（未废止，被上述草案重新框定）：Lab 认知可用，但 Night≡Material isDark **不得**升格为产品合同；详细实验事实见[上轮交接](.tmp/handoff/261009201925-auto-generate-color.md)。
- **工作区状态**：实验页、Simple Wiki 笔记与本轮 handoff 草案多为未提交改动；接手后先复验现场，等待用户审阅草案后再谈实现。

## 关联文档与现场

- **本轮设计草案（优先读）**：`.tmp/handoff/261101180800-wave-night-mode-design-draft.md`
- 上轮实验交接：`.tmp/handoff/261009201925-auto-generate-color.md`
- 实验页：`experiments/color-night/README.md`；预览需在该目录 `pnpm dev`（服务是否在跑需现场确认）。
- 讨论小结：`docs/simple-wiki/wiki/wave-auto-generate-color-discussion.md`；raw：`docs/simple-wiki/raw/2026-10-09-auto-generate-color-discussion.md`
- 已上线 `@night` 合同：`docs/simple-wiki/wiki/wave-dt-profile-model.md`
