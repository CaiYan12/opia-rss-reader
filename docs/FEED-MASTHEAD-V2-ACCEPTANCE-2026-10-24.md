# 验收报告：八风格订阅页头版 V2 丰富化

**日期**：2026-10-24（Asia/Shanghai）。
**规格**：[SPEC-2026-10-24-feed-masthead-v2.md](SPEC-2026-10-24-feed-masthead-v2.md)（本地）；工票 [#76](https://github.com/CaiYan12/opia-rss-reader/issues/76)–[#83](https://github.com/CaiYan12/opia-rss-reader/issues/83)。
**集成 tip**：`codex/feed-masthead-v2-int-20261024` @ `ddc2b94`（自 `fc423b7` = V1 收口点起算）。

## 状态四栏

| 栏 | 状态 |
| --- | --- |
| 实现状态 | **完成**——T1–T7 七票全部 TDD 红→绿、双轴评审双 PASS、T8 全量门 exit 0。 |
| 功能验证 | **通过**——单测 24 文件 612/612；E2E 263/263（含 per-style 头版、presets、feed 场景负对照、wabi 保留行为）；`verify:nocturne` exit 0（归档 5/5 一致，RM 证据成立）。 |
| 设计自评 | **成立**——八风格各得一个签名件 + 支撑细节；抽检四张亮/暗截图（y2k 窗口、nocturne 极光带、newsprint 三栏、folio 印章）签名件全部在场且与文案主次分明；wabi 零改动维持工艺封面基准。 |
| 用户视觉认可 | **已认可（2026-10-25）**——用户真机复看后明确表示「全认可」，覆盖八风格 V2 头版与同批的概览目录全风格两列统一（773d06b）。SPEC #67 据此收口。 |

## 票项映射与合并记录

| 票 | 风格 | 签名件 | 实现提交 | 合并 | 定向验证（代理实跑） |
| --- | --- | --- | --- | --- | --- |
| #76 T1 | y2k | 系统窗口标题栏（真实源名 `.EXE — 运行中`）+ `_ □ ×` | 214b065 | 1b71c29 | 守卫 236 红→绿；E2E 58 |
| #77 T2 | nocturne | 极光带静帧（RM 钉定 0.81/0.76）+ 渐变发丝线 + h1 冷辉光 | dc00fdf | 3c1a13f | 守卫 232 红→绿；E2E 62；单测 575 |
| #78 T3 | editorial | L 形裁切角标 + host 题注化 | 0ece7fc | 76b2e02 | 守卫 240 红→绿；E2E 58；typecheck 0 |
| #79 T4 | newsprint90s | 三栏报头 grid（kicker/楷体源名/host） | 293482e | e667309 | 守卫 244 红→绿；E2E 59 |
| #80 T5 | folio | 印章水印 + 朱丝栏 | 38997e6 | 3755475 | 守卫 249 红→绿；E2E 58；typecheck 0 |
| #81 T6 | synthwave | 卡内扫描线 + 霓虹辉光细线 | 5a6762f | cef76cb | 守卫 254 红→绿；E2E 59；typecheck 0 |
| #82 T7 | pop | h1 印刷硬影 + 爆炸星 | b3ab889 | 2edfc88 | 守卫 258 红→绿；E2E 56 |
| #83 T8 | 集成验收 | 全量门 + 截图 + 负对照 + 本报告 | 87d87df / 6300eb8 / ddc2b94 | 主检出直做 | 见下「最终门」 |

wabi 不动裁决的落实：V2 全量 diff（fc423b7..ddc2b94）零 wabi 文件改动；`wabi-feed.spec.ts` 8 项在最终 E2E 内全过；`out/wabi-art-65/after/feed-*.png` 为当前 HEAD 下的 wabi 头版现势截图（V1 形态不变），已归入 evidence/wabi 作负对照。

## 最终门（T8，主检出实跑）

- `npm run build:dir` exit 0（重建后 out/renderer 为集成 tip 现势）。
- `npm run verify`：typecheck ✓ → 单测 24 文件 **612/612** ✓ → E2E **263/263** ✓ → `verify:nocturne` 首跑 exit 1（见下）→ 修复后 **exit 0**。
- 首跑失败根因：`nocturne-dark-订阅页-1280.png` 归档漂移——T2 极光带进入头版后订阅页归档**应当**变化（预期结果），另 RM 阅读页归档出现 9px/最大通道差 9 的环境级双变体翻转（全部落在图版 1px 装饰边右缘 3px 竖条；同批次非 RM 含图版归档逐字节一致、守卫锁死阅读页规则零改动 ⇒ 判定 GPU 光栅化噪声）。处置：归档写入模式重生成（订阅页 + RM 基线更新）；walkthrough 脚本为 RM 档增设**有界像素等价回退**（字节不等且 diff≤64px、maxΔ≤16 时判噪声通过并打印实测数字），复跑 exit 0（回退实测 diff=9px/maxΔ=9）。
- 跨风格负对照：E2E 既有断言（各风格头版互不串件、synthwave 订阅页场景补偿、未接线风格 DOM 不变）全过；八风格截图归集 `out/feed-masthead-v2-implementation-2026-10-24/evidence/`（34 张）。

## 双轴评审与裁定

- 双轴评审（只读子代理，范围 fc423b7..2edfc88）：**Spec 轴 PASS、Standards 轴 PASS，P0/P1 零发现**。评审期自证单测 612/612、per-style 头版 36/36、presets+feed+wabi 64/64。
- 已认可偏差（详见 ledger `out/feed-masthead-v2-implementation-2026-10-24/ledger.md`）：T4 中栏 `fit-content(66%)`（原型实证 `auto` 压瘪侧栏）；T5 暗侧印章 0.1/screen 与 `::after` 伪元素；T6 辉光细线挂卡面 `::after`；T7 星形偏移原值照搬；T3 角标 DOM span 与 padding-box 锚定；T2 容器自建堆叠上下文（z-index:-1 地板）；y2k 标题 `◆` 前缀（控制者派单授权字面，台账补记）。
- 评审修复（87d87df）：nocturne 注释「内容盒」→「头版盒内（padding box）」；pop 爆炸星补 `pointer-events: none` 拉齐本批装饰命中口径。
- lightbox 端口硬编码修复（6300eb8）：`nocturne-lightbox.spec.ts` 页内导航断言改从 baseURL 派生（T2 发现的既有潜伏问题，非默认端口必红），修复后非默认端口 6/6 通过。

## 观察项（未修，留档）

1. editorial 右下角标与超长未断行 host（约 60+ 字符 @720px）存在 1px 擦碰边界——V1 对长 host 同样溢出，非本轮回归；后续如立项可复用 folio 的 Range 相交断言补样本。
2. 「三栏报刊报头」作为形态名沿用「报头」构词（V1 既有测试同），与 GLOSSARY 订阅页头版 Avoid 表的「报头」指代刊头义不同——验收行文统一作「订阅页头版（三栏报头形态）」。
3. Mimosa 安全扫描在提交钩子中多次给出部分扫描警告（library_source/callgraph partial）；全量安全审计仍未运行，与 V1 状态一致。
4. RM 归档协议现在容忍 ≤64px/Δ≤16 的光栅噪声（仅 RM 档、仅字节不等时回退、必须打印实测数字）——若未来该图出现超容差漂移，门照常拦下。

## 收口记录

- #76–#82：验收标准逐条达成，已关闭（证据附本报告）。
- #83：最终门 exit 0 + 报告成稿，已关闭。
- SPEC #67：用户于 2026-10-25 真机复看后「全认可」（覆盖 V1 推广、V2 丰富化与概览两列统一），据此关闭。
- 追加固：概览目录全风格统一两列（用户真机观察反馈，773d06b，全量 verify exit 0）；nocturne 封版例外（发丝线挂行界条目）见 ledger。
- 本轮未 push、未开 PR、未合并 main、未 tag、未发行。
- 补记（2026-10-25）：上句为本地收口时点状态。此后经用户指令 push 并开 PR：#84 于 2026-10-25 10:20（+08）合并入 main（`2ddc670`），main 同步至 `7d25a7f` 且与 `origin/main` 一致；本地分支与 worktree 已清理。未 tag、未发行仍成立。
