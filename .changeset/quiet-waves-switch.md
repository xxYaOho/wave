---
"wave": minor
---

简化 CLI 公共接口，统一使用 `wave token`、`-f/--file` 与 `-o/--output`，移除旧命令别名、位置文件输入及快捷旗。将 token 创建、迁移与资源操作收入模块，平台选择由源文档配置管理，并统一覆盖保护与 `--force` 语义；提供逐层 Markdown 手册。

手册与 README 双语化：新增英文内容源 `manual/pages-en/` 与双语导航映射，CLI help 与 `-m` 固定输出英文（不受 `LANG` 影响），网页手册按浏览器主语言选择中文或英文，仓库默认中文 `README.md` 并提供互链的 `README.en.md`。
