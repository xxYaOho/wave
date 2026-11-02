---
class: material
ingested: false
integrated: false
metadata:
  title: Wave Night 创建 CLI（scene / chroma / chroma-ev）
  date: 2026-11-02
---

# Wave Night 创建 CLI（scene / chroma / chroma-ev）

本材料固定 `wave night` 产品创建命令的终态合同：从 Day 主题经 settled pure color-rule 生成 Night overlay 草稿。不编译 wiki；只收录 raw。实现入口为 `src/cli/commands/night.ts` 与 `src/core/night/*`。

## 命令与输出

```
wave night [theme=cwd/main.yaml] [--scene] [--chroma|--chroma-ev]
```

| 项 | 合同 |
| --- | --- |
| 入口 | 指向 Day 的 `main.yaml`（参数或 `-f/--file`；二者互斥）。默认 `./main.yaml`。 |
| 产出 | 同目录 `<stem>@night.yaml`（例：`main@night.yaml`、`profiles/dark@night.yaml` 旁文件由构建路径消费，创建命令默认写在入口旁边）。 |
| 覆盖 | 默认可覆写已有 overlay；命令打印 `written` / `updated`、scene、chroma 来源、`themeId`/`baseId`/`mode`、mapped 角色数。 |
| Overlay 形状 | 仅 `theme.color` / `theme.state` 路径叶子 `$value`；**禁止**根 `$id`。注释头记录 source Day、scene、chroma、themeId/baseId/mode。 |
| Day 解析 | 走完整 Wave theme pipeline（resource / extends / 引用），颜色归一为 hex 后再 remap。`$config` 在 loader 中被剥除，night 段由 emit 重新读文件解析。 |

## Scene

英文产品 scene → `lightsLevel` 1–5（月光…晚霞）。默认 `night`（level 3 晚间）。

| `--scene` | lightsLevel | 中文预设 |
| --- | --- | --- |
| `moon` | 1 | 月光 |
| `night-light` | 2 | 夜灯 |
| `night` | 3 | 晚间 |
| `candle-light` | 4 | 烛光 |
| `sunset` | 5 | 晚霞 |

Scene 只驱动表面/中性/文本等 lights-linked tone 与 CCT 预设；**accent\*** 锚在晚间（见 color-rule 材料），不随 scene 被拉亮。

## Chroma 与 chroma-ev

产品 chroma 是 0..1 的强调色饱和度拨盘；`chroma=0.7` 锚定 accent `chromaScale=1.2`、`chromaFloor=16`（`accentChromaFromProduct`）。

命名档位 `--chroma-ev`：

| level | chroma |
| --- | --- |
| `minimal` | 0.5 |
| `low` | 0.6 |
| `medium` | 0.7 |
| `high` | 0.75 |
| `max` | 0.85 |

## 优先级

```
--chroma > --chroma-ev > $config.night.chroma > $config.night.chroma-ev|chromaEv > defaults
```

Scene 优先级：`--scene` > `$config.night.scene` > `night`。

`$config.night`（zod 可选）接受 `scene`、`chroma`、`chromaEv` / `chroma-ev`。非法 scene 或 chroma-ev → 参数错误非零退出；数值 chroma 钳制到 0..1。

## 用法示例

```bash
wave night
wave night ./themes/acme/main.yaml --scene candle-light --chroma-ev high
wave night -f main.yaml --scene moon --chroma 0.55
```

生成后由既有 `wave dt` / generate 的 night 检测路径消费 `*@night.yaml`（与本命令解耦：本命令只负责草稿写出）。

## 与身份、规则材料的边界

- Token Manage 的 `themeId` / `baseId` / `mode` 识别见同日材料 `2026-11-02-wave-night-token-manage-identity.md`（Day/Night 同 themeId；用 mode 区分）。
- Day→Night 映射与 brand-safe warm mix 见 `2026-11-02-wave-night-color-rule-notes.md`。
