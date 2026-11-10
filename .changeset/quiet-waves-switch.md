---
"wave": minor
---

简化 CLI 公共接口，统一使用 `wave token`、`-f/--file` 与 `-o/--output`，移除旧命令别名、位置文件输入及快捷旗。将 token 创建、迁移与资源操作收入模块，平台选择由源文档配置管理，并统一覆盖保护与 `--force` 语义；提供逐层 Markdown 手册。
