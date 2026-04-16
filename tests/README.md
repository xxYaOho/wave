# Wave 测试套件

## 目录结构

```
tests/
├── fixtures/           # 测试固件
│   ├── themes/         # 标准主题模板
│   │   ├── standard/   # 标准主题（颜色、阴影、dimension）
│   │   └── ref-test/   # $ref 引用测试主题
│   └── expectations/   # 预期输出快照
├── integration/        # 集成测试
│   └── theme-service.test.ts
├── utils/              # 测试工具
│   ├── fixture-loader.ts      # 固件加载工具
│   └── fixture-loader.test.ts # 工具自测
└── README.md
```

## 运行测试

```bash
# 运行所有测试
bun test

# 运行特定测试文件
bun test tests/integration/theme-service.test.ts

# 运行工具自测
bun test tests/utils/fixture-loader.test.ts
```

## 测试固件

### 标准主题 (fixtures/themes/standard/)

包含完整的主题结构：
- 颜色令牌（含 $description）
- 复合值（color + alpha）
- 阴影令牌（含 $ref 引用）
- dimension 引用

### $ref 测试主题 (fixtures/themes/ref-test/)

专门测试引用系统：
- 内部引用（同一文件）
- 外部引用（RESOURCE）
- 属性合并（$ref + alpha）
- 链式引用

### Doctor Contrast 测试主题 (fixtures/themes/doctor-contrast-*/)

测试 `wave doctor --theme` 的 WCAG 对比度评分（基于独立 `doctor.wcagPairs` rootKey）：

- `doctor-contrast-pass/`：高对比度 pair，输出全绿，退出码 0
- `doctor-contrast-report/`：低对比度 pair，输出红色评分，退出码 0（评分失败不阻断）
- `doctor-contrast-invalid/`：非法 wcagPairs（引用未解析 token），返回非零退出码
- `doctor-contrast-empty/`：无 `doctor` key，提示”无可检查配对”，退出码 0

对应测试文件：
- `tests/doctor-pairs-schema.test.ts` — doctor section schema 校验
- `tests/doctor-contrast-score.test.ts` — contrast ratio 计算与评分矩阵
- `tests/doctor-runner.test.ts` — runner 阻塞/报告分离
- `tests/doctor-theme-context.test.ts` — theme doctor context 创建与 doctor key 剥离
- `tests/pair-extractor.test.ts` — wcagPairs pair 提取与校验
- `tests/cli-doctor.test.ts` — CLI 输出与退出码

### Sketch Component 格式测试 (tests/sketch-component-format.test.ts)

测试 `sketchFormat` 对 composite token 的 Sketch Style 输出：

- composite 组件属性映射（background、foreground、border、radius）
- swatch 变量关联（`_swatchName` 传播）
- inheritColor + siblingSlot 颜色继承
- shadow 和 gradient 组件属性输出

## 测试工具 API

### loadTestTheme(name)

加载 fixtures/themes/ 下的标准主题：

```typescript
const theme = await loadTestTheme('standard');
// theme.themefile, theme.mainYaml, theme.dir
```

### createTempTheme(config)

从配置动态创建临时主题：

```typescript
const theme = await createTempTheme({
  name: 'my-test',
  palette: 'tailwindcss4',
  tokens: {
    color: {
      $type: 'color',
      primary: { $value: '#0066cc' }
    }
  }
});
```

### cleanupTempTheme(theme)

清理临时主题目录（只删除 temp 目录）：

```typescript
await cleanupTempTheme(theme);
```

## 添加新测试

1. 如需新主题固件，在 `fixtures/themes/` 创建目录
2. 编写测试文件，使用 `describe` 和 `test` 组织
3. 使用工具函数加载主题，调用业务逻辑，断言结果
