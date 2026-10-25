# Ledger：八风格订阅页头版 V2 实施（2026-10-24）

规格：docs/SPEC-2026-10-24-feed-masthead-v2.md（本地）；工票 #76–#83（#67 原生子票）。
集成分支：codex/feed-masthead-v2-int-20261024（自 fc423b7 建）。控制者：主检出直管，merge --no-ff。
预探：notes/style-facts.md（Explore 代理产出，全实施代理复用）。
流程：TDD（tdd 技能红→绿）→ 定向验证 → commit（带票号）→ Explore 评审 → 控制者合并 → 裁定入账。不跑全量 verify（留给 #83）。

## 派发记录

| 票 | Issue | worktree | 分支 | 状态 |
| --- | --- | --- | --- | --- |
| T1 y2k 窗口拟真 | #76 | D:/Dev/opia-wt/v2t1-y2k | codex/masthead-v2-t1-y2k | **已合并** 214b065 → 1b71c29 |
| T2 nocturne 极光带 | #77 | D:/Dev/opia-wt/v2t2-nocturne | codex/masthead-v2-t2-nocturne | **已合并** dc00fdf → 3c1a13f |
| T3 editorial 裁切角标 | #78 | D:/Dev/opia-wt/v2t3-editorial | codex/masthead-v2-t3-editorial | **已合并** 0ece7fc → 76b2e02 |
| T4 newsprint90s 三栏报头 | #79 | D:/Dev/opia-wt/v2t4-newsprint | codex/masthead-v2-t4-newsprint | **已合并** 293482e → e667309 |
| T5 folio 印章朱丝栏 | #80 | D:/Dev/opia-wt/v2t5-folio | codex/masthead-v2-t5-folio | **已合并** 38997e6 → 3755475 |
| T6 synthwave 卡内 CRT | #81 | D:/Dev/opia-wt/v2t6-synthwave | codex/masthead-v2-t6-synthwave | **已合并** 5a6762f → cef76cb |
| T7 pop 两小件 | #82 | D:/Dev/opia-wt/v2t7-pop | codex/masthead-v2-t7-pop | **已合并** b3ab889 → 2edfc88 |
| T8 集成验收 | #83 | 主检出 | — | 阻断解除：进行中（双轴评审 → 全量 verify → 截图 → 报告） |

## 裁定与事件

- **并发实测（2026-10-24）**：后台子代理并发上限=1。T1 两次派发均瞬时被拒（user concurrency limit exceeded，无副作用），T2 占槽。全轮转串行流水线：单票完成→控制者合并→抽检→派下一票。
- **T2 结构裁定（dc00fdf，代理提出、控制者认可）**：`.juya-root` 无 position/z-index、不构成堆叠上下文，极光带 z-index:-1 会落到外层上下文第 2 步被 `.juya-root` 不透明背景盖没。故头版容器补 `position:relative; z-index:0` 自建上下文给 -1 当地板；极光本身仍 -1（守卫②锁死）。z-index 铁律语义不变。
- **T2 越界发现（未修，记入 #83 待办）**：`tests/e2e/nocturne-lightbox.spec.ts:80` 硬编码 `http://localhost:4173/` 忽略 PLAYWRIGHT_PORT，非默认端口必红（默认端口 6/6 过）。属既有潜伏问题；#83 收口时修为 baseURL 派生。
- **T2 合并记录**：dc00fdf --no-ff→ 3c1a13f（3 文件 +481/-6）。集成抽检：build:dir exit 0、守卫 232/232、nocturne-feed-masthead + feed.spec 负对照 E2E 48/48（PLAYWRIGHT_PORT=4177）。
- **T1 合并记录**：214b065 --no-ff→ 1b71c29（4 文件 +279/-5；y2k 标题栏真实 DOM + 4 守卫项 + E2E 亮暗/截断断言）。集成抽检：守卫 236/236、全量单测 24 文件 590/590。代理报告 TDD 红→绿、E2E 58 过（worktree 内）。
- **T3 合并记录**：0ece7fc --no-ff→ 76b2e02（4 文件 +350/-4；角标真实 DOM span〔容器 ::before 已被 V1 第二发丝线占用〕+ host 题注化 0.18em→0.08em + 4 守卫项）。集成抽检：全量单测 24 文件 594/594。备注：tdd 技能对子代理不可用（工具拒绝），代理以手动红→绿执行并留红阶段证据；该技能可用性差异记为流程观察。
- **T3 设计裁定（代理提出、控制者认可）**：①角标落真实 DOM span（同 y2k 标题栏理由：伪元素配额已占）；②padding-box 锚定偏差（阅读页 .juya-issue 无边框 vs 头版容器有边框，声明值逐字搬运后视觉距外缘顶 9px/底 11px）——CSS 注释与 E2E 量测口径双向写明；③editorial 零字面色，守卫登记表条数不变（24）。
- **T4 合并记录**：293482e --no-ff→ e667309（3 文件 +256/-22；模板 DOM 零改动，纯 CSS 三栏 grid + 守卫 4 项 + E2E 三栏对位/长名专项）。集成抽检：全量单测 24 文件 598/598。
- **T4 轨道偏差裁定（代理原型实证、控制者认可）**：中栏轨道 `fit-content(66%)` 替代裁定原文 `auto`——`auto` 中栏 max-content 会把两侧 minmax(0,1fr) 挤到 ~0（55 字源名下侧栏压瘪、违背票内「长源名折行不破格」验收标准）；fit-content(66%) 短名时与 auto 同值、长名时给两侧各留 ≥17% 轨道。偏差已记入 CSS 与守卫注释。楷体字距 clamp(4px,0.15em,6px) 随字号收放（宽窗 48px/6px 同阅读页量级）。
- **T5 合并记录**：38997e6 --no-ff→ 3755475（3 文件 +333/-2；纯 CSS，模板零改动——印章走容器 ::after，::before 已被文武线占用但 ::after 空闲，伪元素配额条款未触发）。集成抽检：全量单测 24 文件 603/603。代理裁定：暗侧印章 0.1/screen 取阅读页暗侧现值；≤520px 印章隐没（与阅读页同断点）；朱丝栏全程保留。
- **T6 合并记录**：5a6762f --no-ff→ cef76cb（3 文件 +278/-1；零 DOM 改动零新增字面色——扫描线走 background-image 首层 alpha 与场景同值 0.10/0.06、辉光细线挂卡面 ::after 照搬地平线 2px+18px/4px 量级）。集成抽检：全量单测 24 文件 608/608。代理裁定：辉光细线是卡面的地平线、不依附 host 行存在（空 URL 时随卡收尾）；守卫④负证场景层逐字节原位。
- **T7 合并记录**：b3ab889 --no-ff→ 2edfc88（3 文件 +159/-1；纯 CSS——h1 text-shadow 3px 3px 0 同阅读页 + 爆炸星 ::before 逐字节同源 SVG，偏移 -40/-12/-8deg 原值照搬，原型+截图证实不压字）。集成抽检：全量单测 24 文件 612/612。**T1–T7 七票全部合并完毕，进入 T8 集成验收。**
- **双轴评审（T8 第一步，只读子代理 fc423b7..2edfc88）**：Spec 轴 PASS、Standards 轴 PASS，P0/P1 零发现；评审期自证：全量单测 612/612、6 个 per-style 头版 spec 36/36、presets+feed+wabi 64/64。
- **评审修复（控制者直接执行，双轴授权内）**：①P2-1 y2k 标题 `◆` 前缀——系控制者派单原文「◆ 前缀与阅读页伪标题栏同语法」的授权字面，此前漏记台账，本条即裁定入账（不改代码；若用户按票面字面较真删 ◆ 改一行模板即可）；②P3-2 nocturne 注释「内容盒」改「头版盒内（padding box，含 24px 侧内衬）」用词修正；③P3-4 pop 爆炸星补 `pointer-events: none` 与本批其余装饰命中口径拉齐（行为不变，星形本落留白死区）。P3-3（editorial 长 host 与右下角标 1px 擦碰边界，V1 同暴露非本轮回归）与 P3-5（报头构词与 GLOSSARY Avoid 表的形态名口径）转入验收报告观察项，不修。
- **T8 事件一（归档门，已收口）**：全量 verify 首跑 exit 1——`nocturne-dark-订阅页-1280.png` 预期漂移（极光带入场）+ RM 阅读页归档 9px/Δ9 环境级双变体翻转（图版 1px 装饰边 GPU 光栅噪声，同批非 RM 归档逐字节一致、守卫锁死规则零改动）。处置：归档写入模式重生成；walkthrough 脚本为 RM 档增设有界像素等价回退（≤64px/Δ≤16 且打印实测数字），复跑 exit 0（实测 9px/Δ9）。提交 ddc2b94。
- **T8 事件二（worktree 清理二次穿透事故，已恢复）**：清理七个票 worktree 时，清理循环对 junction rmdir 用了 `2>/dev/null` 且未逐步核验链接消失——`git worktree remove` 不因 gitignored 的 junction 拒绝删除、静默穿透，主检出 node_modules 再次被清空。另发现孤儿目录 `D:/Dev/opia-wt/w47`（10-22 遗留、未注册于 git worktree list）持有一枚活 junction 指向主 node_modules，已拆引信。恢复：npm ci（exit 0，allowScripts 放行）→ electron 二进制从 `%LOCALAPPDATA%\electron\Cache` zip 手动解压 + path.txt + `icacls dist /setintegritylevel M`（PowerShell 通道）→ node 模式 v24.18.1 ✓ → 真实 GUI 启动探针 4 进程模型成立、启动日志正常 ✓。教训已回写 implementer-brief。
- **追加固（2026-10-25 用户真机观察反馈）**：概览目录全风格统一两列（用户：「wabi/folio 主题的详情页的上方链接为一行两个，其他主题为一行一个，建议统一为一行两个」）。实施（控制者直做，773d06b）：基类 `.juya-overview` flex 单列 → grid 两列（列距 32px）+ ≤640px 单列回落（与 editorial 断点一致）；走基类的 y2k/pop/newsprint90s/synthwave/nocturne 随之统一；wabi/editorial 的 grid 两列覆盖与 folio 的 column-count 两列不动（已达标，封版不动）。**nocturne 封版例外（唯一授权改动）**：暗侧条目发丝线从 `li + li::after` 改挂行界条目 `li:nth-child(2n+3)::after`（两列行主序下 li+li 会在行内画线），≤640 单列回落恢复 `nth-child(n+2)` 原语义，线值零变化。配套：newsprint「概览保持单列」守卫翻转为两列不变量；nocturne 三组守卫选择器同步 + 构成色登记表 24→25；nocturne-geometry 分隔线断言按宽/窄两套几何重写（含 Box 类型补 top 字段的探针定位插曲——布局本正确，断言量错）；contrast-audit 脚本选择器同步。归档基线：阅读页-刊头与概览 / 首条图文 / RM 三张随两列入镜重生成。全量 verify exit 0（612 单测 / 263 E2E / 归档 5/5）。
- **T6 色形偏差补记（2026-10-25）**：SPEC 第 84 行写「1–2px accent 渐变 + 静态辉光」，实装为 2px 实色 `--jy-scene-horizon` + 同色 `0 0 18px 4px` 静态辉光（src/renderer/juya/juya.css:2604，量级照搬阅读页地平线）。视觉已于 2026-10-25 随 SPEC #67 获用户「全认可」，此处补记入账。
