# AGENTS

## About it (source of ideas)

进行日常设计工作时, 经常头疼该如何管理精心设计的设计样式. 另外发现部分设计处理在脚本中可以事半功倍.

## Vision

为 UI&UX 设计师提供一把小巧精致的瑞士军刀

## Stack

### Tech Stack

- **Style Dictionary**, 构建系统. 支持为不同平台或应用, 解析和转换 design token
  - Github: `https://github.com/style-dictionary/style-dictionary`
- **Bun**, 主要使用的包管理器. 其他还有 NPM.
- **TypeScript**, 安全类型的脚本, 要求百分百通过编译
- **YAML**, 比较习惯的配置文件格式

### Design

- **tailwindcss 4.0 color**, 内置基础色板
- **leonardo**, 内置基础色板, 由 ttao 设计

## Webook

阅读 `#webook/guid` 中的 "Webook Guid"

## Development Principles

阅读 `#webook/guid` 中的 "Development Principles (LIMIT)"

### Git Branch

main (稳定发布) ← dev (集成测试) ← feature/\* (功能开发)

- `main`：稳定版本，正式发布打 tag `vX.Y.Z`，**禁止直接 commit**
- `dev`：集成分支，可发布 `vX.Y.Z-beta.N`，测试通过后 merge 到 `main`
- `feature/<name>`：从 `dev` 创建，短横线命名如 `feature/add-auth`，临时分支

#### Workflow

```bash
# 1. 创建 feature
git checkout dev && git pull origin dev
git checkout -b feature/<name>

# 2. 开发完成 → 合入 dev（--no-ff 保留合并记录）
git checkout dev && git pull origin dev
git merge --no-ff feature/<name>

# 3. dev 测试通过 → 合入 main 并发布
git checkout main && git pull origin main
git merge --no-ff dev
git tag -a vX.Y.Z -m "release vX.Y.Z"
git push origin main --tags

# 4. 清理已完成的 feature 分支
git branch -d feature/<name>
git push origin --delete feature/<name>
```

#### Principle

1. 根据任务拆分(或按照计划书)创建 `feature/*` 分支，一个分支只做一件事
2. commit 遵循 Conventional Commits（`feat: ` / `fix: ` / `refactor: ` / `docs: ` / `chore:`)
3. 合并前必须 `git pull`，切换分支前必须 `git status` 确认工作区干净
4. 禁止跳过 dev 直接将 feature 合入 main
5. feature 分支在 dev 测试通过、合入 main 后再批量清理

> [!TIP]
> 如果是本地开发, 还没建立远程仓库. pull 和 push 操作可以适当忽略.
