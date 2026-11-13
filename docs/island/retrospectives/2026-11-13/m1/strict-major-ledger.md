# STRICT 台账 — M1 SPEC

## FULL-1 发现存档（FAIL 3F/6M/1m，2026-11-12）

对 M1 SPEC v1（506e70b，fresh reviewer max）。核心引用经主代理核验属实（index.ts:48-59 Commander 前拦截、manual-markdown.ts:335-336、registry -m 递归注入、build-cli.ts:33 WAVE_MANUAL_DATA define、manual-data.ts 单 JSON、App.tsx 前 8 条小写搜索）。核心失误：初版漏查 -m 全局上游机制（SPEC 的「无 -m」事实基面错误）与编译 CLI 内嵌消费面。v2 消解：

| ID | 级别 | 发现 | v2 消解 |
| --- | --- | --- | --- |
| F-01 | FATAL | `manual -m` 被 index.ts 预解析拦截（渲染命令页后退出），SPEC 三模式接线不可达；改造需触 C1 冻结面，事实基面漏报 | -m 事实重定位（全局机制已存在）；接线点 = index.ts manual 分支 + manual-markdown.ts 页面读取扩展（路线图「Markdown 打包链路」边界）；语义变化仅限 manual 命令自身，其他命令零变化断言兜底（Constraints 显式声明 + Decisions 3） |
| F-02 | FATAL | 产物只增与懒加载互相未冻结（单 JSON/App 依赖/build 时序/无 manifest 与回退合同） | 产物双轨契约冻结：legacy manual-data.json 零修改 + 新增路由块/索引只增 + 运行时回退合同（路由块缺失 → legacy 全量）+ 生成时序保持（Constraints + Decisions 1/2） |
| F-03 | FATAL | -m 三模式不可判定（匹配对象/大小写/多词/locale/顺序/摘要/流未定义） | 三模式可判定合同冻结：精确相等定义（归一化后 title/route）、zh 优先、歧义列表 exit 1、命中列表前 8 条格式、多词 argv 单空格连接、stdout/stderr 分工、产物缺失提示（Decisions 3） |
| M-01 | MAJOR | server 回归保护不可执行（无测试实体） | tests/m1-manual-server.test.ts 实体化（spawn --no-open/URL/端口默认与回退/SIGINT）（Decisions 5） |
| M-02 | MAJOR | 编译 CLI 消费面漏报（build-cli.ts WAVE_MANUAL_DATA 内嵌、仓库外可用要求） | define 内嵌零修改 + 命令页机制不回归（既有 build-cli 测试零断言变更兜底）；页面内容/索引显式依赖 dist 产物，缺失报错引导构建（Decisions 4） |
| M-03 | MAJOR | 分包门禁不可证伪（任意 vendor split 可过） | 四条固定断言（每路由独立 chunk/正文标记串不入入口 chunk/路由块计数 = config×2/索引一致）（Decisions 6） |
| M-04 | MAJOR | 索引口径未冻结（shape/归一化/locale/排序/截断/摘要） | 索引记录形状 + NFKC/小写/空白折叠归一化 + 子串匹配 + config 序 + 前 8 截断全部冻结（Decisions 1） |
| M-05 | MAJOR | 勘测交接不完整（无 schema/必含字段/漏查清单） | 勘测报告固定小节 + 必含字段逐文件消费点清单（含 index/manual-markdown/registry/build-cli 及测试）+ Task-2 机械消费验收（Task-1/Task-2） |
| M-06 | MAJOR | manual:dev 开发链验证缺失（路线图 Testing Decision 6） | manual:dev 冒烟脚本入核验基线（Decisions 7） |
| m-01 | MINOR | Task-2 边界过宽（含视觉文件） | 收窄至 manual-data/App/路由模块 + styles.css/BrandMark 负向门禁（Constraints/Task-2） |

v2 后 fresh FULL-2。

## FULL-2 发现存档（FAIL 1F/8M/1m + 1 ESCALATE，2026-11-12）

FATAL 强收敛（3→1）。v3 消解：F-01 架构修正（metadata shell ≤50KB 无正文；正文只在路由块 runtime fetch；legacy 退出首屏仅降级回退——User Story 2 达成路径重构）；M-01 索引字段与现状 searchText 同源（搜索语义零变更，`wave install --help` 类命中保持）；M-02 legacy digest 基线 + 字段级比对 + fallback 一致性矩阵；M-03 runtime fetch 合同（vite import 与生成时序矛盾消除）+ 双链路写入位勘测定案；M-04 rawMarkdown 原文/snippet 60 字符规则/流分工冻结；M-05 纯英文裁决消解双语排序；M-06 勘测表 `.tmp/m1/survey-task1.md` 固定路径 + 行协议 + 逐行核对验收；M-07 dev 冒烟脚本实体化（就绪判定含路由块/索引可达）；M-08 编译 CLI 仓库外三模式回归；m-01 体积硬阈值（50KB/100KB，超限 gate FAIL）。ESCALATE（locale）Human 裁决：终端纯英文（docs/SPEC 零变化）+ SPA 浏览器/系统语言优先。v3 后 fresh FULL-3。

## FULL-3 发现存档（FAIL 1F/4M/2m，2026-11-12）

F-01 v3 过度修正（索引 en-only 与 SPA zh 视图冲突）→ v4 **索引双语全量**（SPA 按 locale 消费；-m 纯英文以消费侧筛选实现，裁决不变）；M-01 路由块补页头字段全量；M-02 运行时 fetch 断言入门禁⑥（初始零正文/单路由单请求/降级一致）；M-03 dev/built 双链路写入位 + 冒烟四端点断言；M-04 边界补 legacy 基线 JSON/public 产物/manual-app 测试协议升级；m-01 dynamic import 残留清理；m-02 rawMarkdown 末尾换行规范。v4（53fdc82 + 残留清理）后 fresh FULL-4。

## FULL-4 发现存档（FAIL 2F/6M/3m，2026-11-12）

F-01 v4 内部残留（Constraints/Task-1/Testing 仍有 en-only 口径）→ v5 全文统一唯一双语合同（消费侧筛选）；F-02 Task-2 dynamic import 残留（核查发现已在 b407743 修复——reviewer 快照滞后，现状 runtime fetch ✓）；M-01 生成钩子冻结（build.ts 双写 public/+dist，dev 零改动可达 + 四端点内容解析断言）；M-02 metadata schema 冻结 + 负向断言（无正文键）+ 未压缩字节口径；M-03 路由块页头字段必需化（loader/页头实测消费，可选即崩溃）；M-04 rawMarkdown 提取点冻结（绕过 markdown.ts:56 trim 的原始切片 + 字节级断言）；M-05 编译布局查找顺序（随包 manual-app/ → dist → 报错）+ 夹具实跑；M-06 WAVE_MANUAL_DATA 全量内嵌现状澄清（保留零修改，新直读不新增内嵌）；MINOR-01 台账编号 v4-* 前缀；MINOR-02 locale 切换措辞降级（navigator.language 现状）；MINOR-03 slash-route 嵌套映射 + 字节口径统一。**v5 = 原生命周期修正轮 4/4（最后一轮），fresh FULL-5。**

## FULL-5 发现存档（FAIL 1F/2M/2m，2026-11-13）→ 硬停 → Human 裁决机械扫除 + 新生命周期

F-01 第三度复发（Decision 1 顺序条款 + Task-1 验收行 en-only 残留——合同多处复述下编辑覆盖不全）→ v6 机械扫除（grep 全文逐处修正 + 逐处验证）：Decision 1 改各 locale 独立 config 序、Task-1 改双语覆盖断言；M-01 metadata shell 纳入 sections/nav config 透传；M-02 Decision 7/Testing 统一四端点逐一 200 + 内容解析；MINOR-01 状态头 FULL-6 新生命周期；MINOR-02 m-01 标签唯一化（V5-VIS/V5-SIZE）。v6（72e58ae）。

## FULL-6（PASS | FATAL 0 / MAJOR 1 / MINOR 2，2026-11-13）——M1 SPEC 冻结

PASS 携带 carry：MAJOR×1 + MINOR×2（明细待台账补全，施工 gate 前闭合）。**M1 SPEC v6 冻结（72e58ae），Milestone-1 施工派遣。**

## M1 闸门（PASS，2026-11-13）

主代理独立复验：check:ci 1315 pass 0 fail（基线 1304 + 11 新测试，既有零断言变更）；manual:build exit 0；-m 三模式实测（catalog en / 命中列表截 8 / 精确页 markdown 原文 exit 0；零命中 exit 1）；其他命令 -m 零变化（token -m 命令页照旧）；server/text-reader 测试 5 pass；dev 冒烟 ok:true 五端点；编译 CLI 仓库外回归 exit 0（随包布局合同）；边界零越界（pages 内容/styles/BrandMark 零 diff）；分包门禁测试含于全量。**M1 闸门通过，集成 main。**
