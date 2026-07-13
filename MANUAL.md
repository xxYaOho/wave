# Wave 用户手册

完整使用手册由本仓库的 `manual/` 目录维护。运行本地文档页面：

```bash
wave manual
```

开发环境中可运行：

```bash
pnpm manual:build
pnpm dev -- manual
```

Design Token 详细正文统一维护在 `manual/pages/design-token.md`，通过 `wave manual` 查看。常用入口：

```bash
wave dt init
wave dt build
wave dt build --profile mobile
wave dt build --profiles all
wave dt build --night
```

内部行为快照见 `docs/SPEC.md`。实现蓝图见 `docs/SWISS_KNIFE_REFACTOR.md`。变更记录见 `CHANGELOG.md`，`docs/CHANGELOG.md` 只保留 v0.15.0 及更早版本历史。
