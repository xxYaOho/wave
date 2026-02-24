# AGENTS

## About it (source of ideas)

进行日常设计工作时, 经常头疼该如何管理精心设计的设计样式. 另外发现部分设计处理在脚本中可以事半功倍.

## Vision

为 UI&UX 设计师提供一把小巧精致的瑞士军刀

## Stack

### Tech Stack

- **Style Dictionary**, 构建系统. 支持为不同平台或应用, 解析和转换 design token
  - [repo](https://github.com/style-dictionary/style-dictionary)
- **Bun**, 主要使用的包管理器. 其他还有 NPM.
- **TypeScript**, 安全类型的脚本, 要求百分百通过编译
- **YAML**, 比较习惯的配置文件格式

### Design

- **tailwindcss 4.0 color**, 内置基础色板
- **leonardo**, 内置基础色板, 由 ttao 设计

###

- **DTCG**(Design Tokens Community Group), 关于 design token 设计规范的社区讨论组
  - [community group](https://github.com/design-tokens/community-group/tree/main)
  - [format](https://www.designtokens.org/tr/2025.10/format/)
  - [resolver](https://www.designtokens.org/tr/2025.10/resolver/)

## Conventions

### Code or Develop

- 所有代码遵循 `dev-conventions` skill（LIMIT 原则）
- 密钥/Token 禁止硬编码、禁止打印到日志
- 提交前必须过快速检查清单
