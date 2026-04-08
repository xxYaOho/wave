# SPEC for wave

> 本文件由 `/release` 流程自动维护，位于 `docs/SPEC.md`，记录当前版本的系统行为快照。

---

## Mental Model（agent 必读）

wave 是面向 UI/UX 设计师的 CLI 工具集，当前核心能力是 design token 生成。

**当前 token 生成的数据流：**

```
themefile（声明数据源 + 输出参数）
    + main.yaml（定义 token 内容，DTCG 格式）
    ↓
引用解析（RESOURCE 声明的数据源作为依赖字典）
    ↓
颜色转换（colorSpace 在输出阶段介入）
    ↓
输出文件（.json / .jsonc / .css）
```

**认知边界：**

- themefile：声明"用什么数据源、怎么输出"，不定义 token 内容
- main.yaml：唯一的 token 内容来源
- RESOURCE：只提供引用解析数据，不直接输出
- colorSpace 转换发生在输出阶段，不影响引用解析过程

**常见误区：**

- ❌ 不要在资源文件里加输出逻辑
- ❌ 不要绕过 main.yaml 直接从资源生成 token
- ❌ 新增 wave 子命令时，不要复用 token 生成的内部模块，除非明确适用

---

## CLI 命令

- `wave theme`：读取当前目录 `themefile` 文件生成 token
- `wave theme [path]`：指定 themefile 路径生成
- `wave theme -f <path>`：使用 `-f` 指定 themefile 文件
- `wave doctor`：健康检查
- `wave help`：显示帮助
- `wave --version`：显示版本号

### list 命令

- `wave list`：列出所有内置调色板（palettes）和尺寸系统（dimensions）

### show 命令

- `wave show <name>`：显示指定内置资源的详细内容
  - `--format flat-json`（默认）：扁平化的 key-value 格式
  - `--format json`：嵌套 JSON 格式
  - `--format yaml`：原始 YAML 文件内容

**参数选项：**

- `--list`：列出内置资源（调色板和尺寸系统）
- `--no-night`：禁用 night 模式生成
- `--no-variants`：禁用 variants 生成
- `--variants [names]`：指定变体（逗号分隔）
- `--platform <list>`：指定输出平台（逗号分隔）：`json`、`jsonc`、`css`、`sketch`
- `--init`：创建主题模板（生成 themefile、main.yaml、manual.md）
- `-o, --output <dir>`：指定输出目录

---

## Themefile 配置

**必需字段：**

- `THEME`：主题名称

**资源声明（推荐）：**

```
RESOURCE <kind> <ref>
```

- `kind`：资源类型，支持 `palette`、`dimension`、`custom`
- `ref`：资源引用，内置资源写名称，自定义资源写相对或绝对路径

**示例：**

```
THEME my-theme
RESOURCE palette leonardo
RESOURCE dimension wave
RESOURCE custom ./tokens/brand.yml
```

**旧语法（兼容但已弃用）：**

- `PALETTE`：调色板引用
- `DIMENSION`：尺寸引用

旧语法会在内部自动转换为对应的 `RESOURCE` 声明。一旦使用 `RESOURCE`，禁止混用旧语法。

**可选参数 (PARAMETER)：**

- `platform`：输出格式，`json`（默认）、`jsonc`、`css`、`sketch`，支持逗号分隔多平台（如 `json,css,sketch`）
- `filterLayer`：过滤层级（数字），输出扁平化 KV 结构
- `output`：输出目录路径
- `night`：Night 模式，`auto`（默认）或 `false`
- `variants`：变体列表（逗号分隔）
- `brand`：品牌名
- `colorSpace`：全局输出色彩空间，`hex`（默认）、`oklch`、`srgb`、`hsl`

**完整示例：**

```
THEME my-theme
RESOURCE palette leonardo
RESOURCE dimension wave
RESOURCE custom ./brand-colors.yml

PARAMETER platform json
PARAMETER colorSpace oklch
PARAMETER filterLayer 1
PARAMETER output ./dist
```

---

## 资源解析

**内置资源路径：** `src/resources/`

- Palette: `palettes/leonardo.yaml`, `palettes/tailwindcss4.yaml`
- Dimension: `dimensions/wave.yaml`

**解析规则：**

1. 按 themefile 中 `RESOURCE` 声明顺序读取
2. 每个资源文件解析后得到 `{ namespace, data }`
3. 拒绝重复 namespace（直接报错，不覆盖）
4. 资源来源元数据保留（用于错误定位）

**引用查找顺序：**

1. 内置资源名（如 `leonardo`）
2. 相对路径（相对于 themefile 目录）
3. 绝对路径

**custom 资源限制：**

- 仅限 `.yml`、`.yaml`、`.json` 文件
- 文件结构与其他资源一致：根对象必须恰好有一个顶层 key（namespace）

**内置主题：**

- `BUILTIN_THEMES` 已清空为 `{}`
- `isBuiltinTheme()` 恒返回 `false`
- 用户必须通过 themefile 指定资源

---

## 引用解析

### 外部引用

- `{leonardo.xxx}`：引用 leonardo palette 颜色
- `{wave.xxx}`：引用 wave dimension 尺寸
- `{namespace.xxx}`：引用任意 dependency namespace

### 内部引用（v0.3.0+）

支持 `{theme.path.to.token}` 格式的文件内部嵌套引用：

```yaml
theme:
  color:
    text:
      default: "{leonardo.global.color.deepGray.light.800}"
      disabled:
        $value:
          color: "{theme.color.text.default}"
          alpha: "{wave.global.dimension.alpha.400}"
```

**循环引用检测：**

- 检测循环引用并在构建时报错
- 错误信息示例：`Circular reference detected: theme.color.a -> theme.color.b -> theme.color.a`
- 退出码：5

**未解析引用提示：**

- 无法解析的 `{theme.xxx}` 引用会显示详细信息
- 错误信息示例：`Unresolved theme references found: - {theme.color.nonexistent} at theme.color.text.missing`
- 退出码：5

**跨依赖引用限制：**

- 资源文件（dependency）之间禁止互相引用
- 检测到跨依赖引用时报错：`Cross-dependency reference detected`

**性能：** 10 层嵌套以内 < 0.001ms/次，无深度限制

### DTCG $ref 引用（v0.4.0+）

支持 DTCG 规范的 JSON Pointer 格式引用，用于嵌套对象中的 token 引用。

**语法格式：** `$ref: "#/source/path/$value"`

**示例：**

```yaml
theme:
  color:
    shadow:
      $value: "#2b3248"
    gradient-mask:
      $type: gradient
      $value:
        - color:
            $ref: "#/theme/color/shadow/$value"
            alpha: 0.5
          position: 0
```

**特性：**

- JSON Pointer 格式（RFC 6901）
- 支持属性合并（`$ref` + `alpha`/`color`）
- 支持嵌套对象和数组
- 兼容外部源（`#/leonardo/...`, `#/wave/...`, `#/{任意 namespace}/...`）
- 自动循环引用检测

**解析顺序：**

1. Pass 1：解析外部引用（`#/leonardo/*`, `#/wave/*`, `#/{任意 namespace}/*`）
2. Pass 2：解析内部主题引用（`#/theme/*`）

**属性合并规则：**

- 标量值 + `alpha`/`color` → `{ color: 值, alpha: x }`
- 标量值 + 其他属性 → `{ value: 值, ...其他 }`
- 对象值 + 属性 → `{ ...原对象, ...新属性 }`（新属性覆盖）

**与花括号引用的对比：**

| 特性 | 花括号 `{...}` | DTCG `$ref` |
|------|---------------|-------------|
| 格式 | `{source.path}` | `$ref: "#/source/path/$value"` |
| 适用场景 | 简单值替换 | 嵌套对象中的引用 |
| 属性合并 | 不支持 | 支持 |
| 标准符合 | Wave 特有 | DTCG 规范 |
| 未知 namespace | 保留原字符串 | 解析失败报错 |

---

## DTCG 色彩空间支持

### 支持的格式

- OKLCH：`oklch(L% C H)`，示例 `oklch(70% 0.3 328)`
- sRGB：`rgb(R G B)`，示例 `rgb(255 0 255)`
- HSL：`hsl(H S% L%)`，示例 `hsl(330 100% 50%)`

### Token 定义格式

```yaml
theme:
  color:
    primary:
      $value:
        colorSpace: "oklch"
        components: [0.7, 0.3, 328]
        alpha: 1
```

### 色彩空间检测优先级

1. DTCG colorSpace 对象：`{colorSpace: "oklch", components: [...], alpha?: number}`
2. color+alpha 复合对象：`{color: "#xxx", alpha: 0.5}`
3. 纯字符串：hex 字符串、palette 引用等

### PARAMETER colorSpace 全局配置

```
PARAMETER colorSpace oklch
```

配置后所有颜色按指定格式输出，无需在每个 token 中单独指定。

### Alpha 通道处理

- alpha = 1：省略 alpha 通道
- alpha ≠ 1：使用 CSS Color Level 4 语法，如 `oklch(L% C H / alpha)`

### 输出精度

- OKLCH：L 1位小数，C 3位小数，H 2位小数
- HSL：全部 0 位小数
- sRGB：整数

### 特殊值处理

- 灰度颜色（黑、白、透明）色相 NaN → 输出 0
- 0 值优化：`0.0%` → `0%`，`0.200` → `0.2`

### 错误处理

- 不支持的来源格式 → 原样输出
- 不支持的 colorSpace → 原样输出
- components 格式错误 → 原样输出
- alpha 值超出范围（0-1）→ 原样输出

---

## Wave 扩展

### smoothGradient（v1）

为标准 `gradient` token 增加平滑过渡能力。通过在 token 上附加 `$extensions.smoothGradient`，transformer 会在输出前自动将 2 个端点扩展为按 cubic-bezier 曲线采样后的 stops 列表。

**声明格式：**

```yaml
theme:
  overlay:
    $type: gradient
    hero:
      $value:
        - color: "#ff0000"
          position: 0
        - color: "#0000ff"
          position: 1
      $extensions:
        smoothGradient:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 5
```

`cubicBezier` 也支持引用 wave dimension 中的预定义曲线（resolver 会自动解析 `$extensions` 中的引用）：

```yaml
      $extensions:
        smoothGradient:
          cubicBezier: "{wave.dimension.cubicBezier.easeInCubic}"
          step: 9
```

**规则：**

- `cubicBezier`：长度为 4 的数组 `[x1, y1, x2, y2]`，与 CSS cubic-bezier 控制点语义一致；支持直接写数组或引用 dimension 资源
- `step`：总节点数（包含起点和终点），必须为整数且 `>= 2`
- 输入 gradient 必须恰好包含 **2 个 stop**，否则报错
- 所有生成 stop 的 `position` 线性等距分布，输出时保留 **2 位小数**
- `alpha` 按曲线采样值在两端点 alpha 之间插值，并 `clamp` 到 `[0, 1]`
- v1 **不做中间颜色插值**：生成 stop 的颜色只使用端点原色
- `$extensions` 在 transform 阶段被消费，**不会泄漏**到最终 json / css / sketch 输出

**与标准 gradient 的关系：**

`smoothGradient` 不改变 token 的 `$type`，输出仍然是标准 gradient 数组。CSS formatter 会沿用现有 `gradientToCss` 逻辑，无需在 generator 层做任何修改。

### smoothShadow（v1）

为标准 `shadow` token 增加平滑过渡能力。通过在 token 上附加 `$extensions.smoothShadow`，transformer 会在输出前自动将单个 shadow layer 扩展为按 cubic-bezier 曲线采样后的 layers 数组。

**声明格式：**

```yaml
theme:
  shadow:
    $type: shadow
    raised:
      $value:
        color: "#000000cc"
        offsetX: 0
        offsetY: 6
        blur: 12
        spread: 0
      $extensions:
        smoothShadow:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 3
```

`cubicBezier` 也支持引用 wave dimension 中的预定义曲线（resolver 会自动解析 `$extensions` 中的引用）：

```yaml
      $extensions:
        smoothShadow:
          cubicBezier: "{wave.dimension.cubicBezier.easeInCubic}"
          step: 3
```

**规则：**

- `cubicBezier`：长度为 4 的数组 `[x1, y1, x2, y2]`，与 CSS cubic-bezier 控制点语义一致；支持直接写数组或引用 dimension 资源
- `step`：可见层数，必须为整数且 `>= 1`
- 输入 shadow 必须是**单个 layer 对象**（非数组），否则报错
- 内部采样逻辑：按 `step + 1` 采样并舍去最后一个零层（`offset/blur/spread/alpha = 0`），只输出 N 个可见层
- **从小到大排列**：第 0 层最接近零层，最后一层保持原始 base 值，与 CSS `box-shadow: small, medium, large` 的书写顺序一致
- `offsetX`、`offsetY`、`blur`、`spread` 线性衰减至 0
  - `number` 类型取整输出（默认 `px`）
  - `rem` 字符串保留 **3 位小数**
  - 其他单位字符串取整输出
- `alpha` 按曲线采样值从 `0` 到 `baseAlpha` 插值，保留 **2 位小数**
- `inset: true` 会被复制到所有派生层
- `$extensions` 在 transform 阶段被消费，**不会泄漏**到最终 json / css / sketch 输出

**与标准 shadow 的关系：**

`smoothShadow` 不改变 token 的 `$type`，输出仍然是标准 shadow 数组。CSS formatter 沿用现有 `shadowToCss` 逻辑，支持带单位的数值，无需在 generator 层做额外修改。

---

## 输出格式

- `json`（默认）：输出 `{theme}.json`，扁平化 KV，kebab-case 键名
- `jsonc`：输出 `{theme}.jsonc`，带描述注释的 JSON
- `css`：输出 `{theme}.css`，CSS 变量，带描述注释
- `sketch`：输出 Sketch API 兼容格式 `{theme}2sketch.json`
- 多平台：`json,jsonc,css,sketch` 可同时输出多种格式

**备注位置（v0.3.0+）：**

- 单行 `$description`：显示在 token 同一行末尾
- 多行 `$description`：保持在 token 上方

**排序保持（v0.3.0+）：** 输出 token 顺序与 `main.yaml` 定义顺序一致

---

## 检测机制

**Night 模式：**

- 检测 `{themeDir}/main@night.yaml` 是否存在
- 存在时生成 `{theme}-night` 主题
- 可通过 `--no-night` 禁用

**Variants：**

- 检测 `{themeDir}/variants/*.yaml` 文件
- 为每个变体生成 `{theme}-{variant}` 主题
- `@night` 后缀变体生成 `{theme}-{variant}-night`
- 可通过 `--no-variants` 禁用

---

## 错误处理（Fail-Fast）

- 若 `main.yaml` 存在但解析失败（引用错误、格式错误等），直接返回非 0 退出码，**不再 fallback 到依赖直出**
- 同样适用于 `main@night.yaml` 和 `variants/*.yaml`

---

## 退出码

- `0`：SUCCESS
- `1`：GENERAL_ERROR
- `2`：INVALID_COMMAND
- `3`：THEME_NOT_FOUND
- `4`：MISSING_PARAMETER
- `5`：INVALID_PARAMETER（含循环引用、未解析引用、不支持的色彩空间）
- `10`：FILE_NOT_FOUND
- `11`：PERMISSION_DENIED
- `12`：FORMAT_ERROR
- `13`：INVALID_RESOURCE
- `14`：MISSING_BRAND
- `15`：BRAND_FORMAT_ERROR

---

## 测试固件系统

### 目录结构

```
tests/
├── fixtures/themes/    # 标准主题模板
├── integration/        # 集成测试
└── utils/              # 测试工具
```

### Fixture 加载工具

`tests/utils/fixture-loader.ts` 提供：

- `loadTestTheme(name)` - 加载 `fixtures/themes/{name}/` 下的标准主题
- `createTempTheme(config)` - 动态创建临时主题（用于边界测试）
- `cleanupTempTheme(theme)` - 清理临时目录
- `expectOutputToMatch(actual, expected)` - 断言输出匹配

### 标准主题固件

| 固件名称 | 用途 |
|----------|------|
| `standard` | 标准主题（颜色、阴影、dimension 引用） |
| `ref-test` | $ref 引用测试（内部/外部/属性合并） |

### 添加新测试

```typescript
import { loadTestTheme, createTempTheme } from '../utils/fixture-loader.ts';

test('应处理 xxx', async () => {
  const theme = await loadTestTheme('standard');
  // 或使用临时主题
  const temp = await createTempTheme({
    name: 'test',
    tokens: { color: { /* ... */ } }
  });
});
```

---

## 范围边界（明确不做）

- 内置主题：已移除，不再支持 `wave theme beluga`
- Windows/Linux 平台：未测试
- 嵌套引用条件判断：`{theme.x ? a : b}` 格式不支持
- 跨 variants 引用：Variant A 不能引用 Variant B 的 token
- RGB 格式：仅支持 sRGB 组件格式
