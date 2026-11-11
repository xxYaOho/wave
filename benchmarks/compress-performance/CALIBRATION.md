# Compress M2 校准记录

记录时间：2026-11-12T01:26:45+08:00。实施起点 `ac3ea71`；串行基线 `2e4248a`。本记录只消费 P2 Milestone-2、结果冻结合同与授权性能合同；不修改计划或 MAJOR 台账。

## 可复跑方式

```sh
mise exec -- bun benchmarks/compress-performance.ts --baseline-ref 2e4248a --iterations 16 --warmup 2 --work-dir .tmp/p2/m2-performance-delivery --output .tmp/p2/m2-evidence/performance.json
```

消费脚本从 Git 机械提取基线 compress 与 Q0 域 runner，仅调整快照中的 import 路径。Q0 的 `benchmarks/domains/compress.ts`、操作合同、fixture 与输出政策均未修改。两侧使用同一依赖、工具版本和宿主；每对样本交替执行先后顺序。每场景 2 对 warmup，随后 16 对测量；全部测量样本记录状态、耗时、产物摘要与资源峰值，失败样本会保留并导致拒绝收益结论。

- Q0 fixture：隔离 worker 内按既有 runner 的 `iterations=32` 重复同一双素材操作，单个样本使用其每操作平均耗时。单次操作约 1–3 ms，短于资源采样周期，重复用于获得可观察的稳定父进程 RSS。早期单次 cold 操作没有显著加速证据，不与该稳态数据混用。
- 真实编码器：8 个固定 1x1 PNG 与 8 个固定 32x32 SVG（80 个 rect），使用真实 `oxipng` / `svgo`；两侧采用相同的显式 fixture resolver，以隔离编码阶段。两侧分别使用串行基线 runner 和受管并行 runner。每次验证全部产物路径、字节数和 SHA256 等价。
- 配对比值为串行耗时 / 并行耗时，95% 区间由固定种子的 2000 次配对 bootstrap 得到。消费脚本的中位数与 p95 比值使用线性插值分位数；域自带 stats 保留既有算法。

## 资源口径和拒绝判据

独立观察者用 `/bin/ps` 读取 worker 父进程及所有可见后代，包括编码器的后代；观察者自身与 ps 不属于 worker 树。每次 ps 完成后间隔 15 ms，保留每个样本的观测峰值；逐点轨迹留在 work-dir 各样本的 `resource-trace.json`。

RSS 是进程树各进程 RSS KiB 的求和；CPU 是 ps 的进程生命周期平均 `%CPU` 求和后的采样最大值。资源采样覆盖 worker 的准备、编码与产物检查；操作耗时按域的原计时边界计算。短生命周期进程的峰值可能漏采，因此这些数值是同口径的观测值，不是内核保证的绝对峰值，也不能外推至大图或其他工具版本。

正式采样前在脚本中固定以下判据：配对中位加速的 95% 下界 > 1.05；并行 p95 耗时 / 串行 p95 耗时 ≤ 1.10；进程树 RSS 的 p95 比值 ≤ 2；任一样本观测 RSS ≤ 512 MiB；任一样本观测 CPU ≤ 350%；测量失败数为 0。任一项不满足则拒绝该场景的保留结论。若真实编码场景没有显著收益或越过资源边界，则将并发机制撤回到 1 并重测；失败与退化不得从分布中排除。

## 结果与终值

宿主：darwin / arm64，14 核，Bun 1.3.6；工具 oxipng 10.1.1、SVGO 4.0.1。

| 场景 | 串行均值 | 并行均值 | 配对中位加速 | 中位加速 95% 区间 | 树 RSS p95 比值 |
| --- | --- | --- | --- | --- | --- |
| q0-fixture | 1.272 ms | 1.072 ms | 1.201x | 1.129–1.250x | 1.042x |
| real-encoders | 944.873 ms | 497.764 ms | 1.902x | 1.891–1.912x | 1.512x |

真实编码场景：串行 / 并行观测峰值 RSS 为 136.81 / 205.31 MiB，树 CPU 峰值为 40.1% / 78.1%；树内最大进程数为 2 / 3。wrapper 实测最大在途编码数为 1 / 2。两场景各 16 对测量均零失败，全部产物等价，资源与耗时判据均通过。

- 并发终值 **2**：真实编码场景有显著收益，树 RSS 仍在实测边界内；保留现值，不按宿主核数放大。Q0 fixture 的并发数未额外注入观测，编码在途证据来自真实编码 wrapper 与独立回归测试。
- 单个 compress 外部命令超时终值 **120000 ms**：本批单命令最大观测耗时 128.00 ms，约保留 938 倍余量，避免用小素材的速度激进限制实际任务；卡死进程仍有结束边界。API 测试使用缩短后的同一超时机制证明 `WCP_TIMEOUT` 会逐项聚合、健康项完成。
- 终止宽限终值 **200 ms**：先 TERM，再对同一独立 POSIX 进程组 KILL；领进程退出后仍执行升级，等待进程与 stdout/stderr 的 close。额外的本地管道关闭兜底为宽限后 **1000 ms**。测试包含忽略 TERM 与领进程退出后后代持管道，以及后代重定向自己的 stdio；SIGKILL 后另有最多 1000 ms 的进程组消失核验，超限在错误消息中如实报告，核对全部 fixture PID 已退出。
- 取消收益以有界终止和提交顺序性验证：提交前检查取消；copyFile 一旦发起则等待 settle，force 成功覆盖与写入失败均如实报告。取消终态 JSON 保留已派发项和 `cancelled: true`，CLI 退出 130。

没有新增 resolver 缓存或其他待评估性能机制；并发、取消和超时均保留。受管进程实现采用 POSIX 进程组，本次平台验证为 macOS；主动脱离进程组的守护进程不属于本次编码器样本。

## 验证证据

- 调整后完整四门 `pnpm typecheck && bun test --timeout 15000 && pnpm build && pnpm check:style`：exit 0，1224 pass / 0 fail，4 snapshots，9439 assertions。15 秒测试参数来自主代理既有裁决，未修改仓库测试时限。
- 新增 18 项回归：预取消、忽略信号、后代持管道、逐项超时、6 个取消/force/copyFile 边界、JSON/receipt 的 130、Motion 与 install 默认 runner。
- 全量日志：`.tmp/p2/m2-evidence/ci.log`；性能原始分布随本记录保存于 [calibration.json](./calibration.json)。主代理仍需独立核验和 gate，并负责关闭 M1/M2/M4/M5 台账。
