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

Design token profile 构建：

```bash
wave dt build
wave dt build --profile mobile
wave dt build --profiles all
wave dt build --night
wave dt build --profile mobile --night
wave dt build --profiles all --night
```

使用 `main.yaml` 作为 default profile，使用 `profiles/<name>.yaml` 作为 named profile。Night Mode 文件使用 `main@night.yaml` 和 `profiles/<name>@night.yaml`。

`variants/`、`--variant` 和 `--variants` 不支持。

`theme.dimension` 不再作为 public output root。将交互强度迁移到 `theme.state`，shadow token 迁移到 `theme.shadow`，gradient mask 迁移到 `theme.gradient`，radius token 迁移到 `theme.radius`。运行 `wave dt doctor -f ./main.yaml` 查看迁移建议。

CSS 输出 `color`、`state`、`shadow`、`gradient`、`border`、`radius` 和 `font` roots。Typography token 会输出字段变量和 shorthand 变量；outline border 会输出 outline value 和 offset companion。Sketch 输出 typography text shared style payload，并用两层 shadow 模拟 outline。

内部行为快照见 `docs/SPEC.md`。实现蓝图见 `docs/SWISS_KNIFE_REFACTOR.md`。
