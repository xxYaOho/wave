# Future Evaluations

本文档记录需要后续 spike 或评估的技术方向，作为团队决策的备忘。

---

## 提议三：评估退出 Style Dictionary 的可行性

### 背景

Wave 当前以 Style Dictionary 作为核心构建系统，负责设计令牌的解析、转换和平台输出。随着 Wave 的产品边界逐渐清晰（面向 UI/UX 设计师的轻量 CLI），Style Dictionary 的部分能力开始出现"过度设计"的迹象：

- 配置层与 Wave 的 themefile 模型存在概念重叠
- 大量内置转换器（size、time、font）在 Wave 场景中从未使用
- 输出格式可控性受限，部分细节（注释位置、排序、kebab-case 规则）需要通过 hack 实现

### 潜在收益

1. **体积**：移除 Style Dictionary 及其依赖，安装包和启动时间显著减少
2. **可控性**：输出逻辑完全自定义，可实现更精细的格式控制
3. **错误定位**：解析、引用、输出三段统一报错，无需穿透 Style Dictionary 的抽象层
4. **DTCG 对齐**：未来可直接基于 DTCG 规范实现 resolver 和 formatter，不再受限于 Style Dictionary 的内部 token 模型

### 潜在代价

1. **维护成本**：需要自行维护所有输出格式（JSON、JSONC、CSS），以及未来可能增加的平台（Swift、Android XML 等）
2. **生态隔离**：无法直接复用 Style Dictionary 社区的 transform 和 filter 插件
3. **稳定性风险**：自行实现的输出逻辑需要更长时间的打磨才能达到同等健壮性

### 评估标准

建议在以下时机启动 spike：

- Wave 支持的平台类型超过 3 个
- 再次出现因 Style Dictionary 限制而无法实现的产品需求
- 启动耗时或包体积成为用户明显痛点

### 建议的 spike 范围

1. 用 1-2 天时间原型化一个最小可用输出器（仅支持 JSON/JSONC/CSS）
2. 跑通现有 fixture 的 diff 对比，量化格式差异
3. 评估平台扩展所需的工作量

**结论**：暂不退出的前提下，保持架构层对 Style Dictionary 的弱依赖（如当前 pipeline 拆分后的 `generateTokens` 接口），为 future 替换预留切口。
