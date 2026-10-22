# 橘鸦风格逐轮修复工作日志

本文件是**逐轮施工记录**：每一轮改了什么、验了什么、还欠什么。`AGENTS.md` 只保留「改这个风格前必读本文件」的指针 —— 日常开工不需要这些历史，回溯某次为什么这么改时才读。

**现行约束以 `AGENTS.md` 为准**（变体覆盖选择器约定、绘制陷阱、分层硬约束、验证标准）。本文件记录的是**历史决策与实测数字**。

## nocturne（暗夜精修式）

需求文档：`docs/juyathemesworks/nocturne-dark.md`（含 §5 / §7.1 两段实施期校正）。
归档基线：`docs/juyathemesworks/nocturne-dark-*.png`（5 张，`scripts/nocturne-visual-walkthrough.mjs --verify` 逐字节校验）。

### 二轮打磨（2026-10-20 ~ 10-21，SPEC #10 / 票据 #11–#23）

12 票 T0–T12，一票一提交，集成分支 `feat/nocturne-round2`，PR #24 → merge `09c2246`（`--no-ff`，分支保留）。

**回退锚点**：施工前 HEAD `47538b1`（整轮 `git reset --hard 47538b1`，或按票 revert）。

**两个不同语义的历史提交（勿混写）**：

- `75dee1f` = **最后一次样式改动**（刊头极光带 —— 修掉「根本没有极光」的根因）
- `134372c` = **封版归档提交**（纯文档：冻结状态、覆盖范围、`start.bat` 新语义）

**施工前基线（实测）**：tsc 0 / vitest 20 文件 397 / Playwright 90 / 审计 exit 0（text 63 + ui 7）/ `--verify` exit 0。

**逐项结果**：

| 票 | 改动 | 实测数字 |
|---|---|---|
| T1 | `color-scheme: dark` 落 `.view-scroll:has(...)` | 订阅页+阅读页 scroller computed = dark；根置 light 后仍 dark |
| T2 | `--jy-lead-text: #adb0b8`；`#N` 转 accent | 导语 **7.0104:1**（旧 muted 4.4915，正文 8.8402）；编号对底 5.5953 |
| T3 | `brightness(.88)` + 发丝描边（`box-shadow 0 0 0 1px` + 极淡 accent 晕） | 图片内容色 (59,74,143)→(52,65,126)；几何零变化 |
| T4 | ≤640px 单列回落图宽 `100%` | 图列 508.00 == 内容列 508.00 |
| T5 | `--jy-ov-bleed: 8px` 驱动三处；暗侧 `.juya-entry` 水平内衬→0 | 三视口 **−2.00/+8.00 → 0.00/0.00** |
| T6 | 导语 `text-wrap: pretty`；`text-autospace: normal` 落 `.juya-issue`；拉丁在前字体栈 | 孤字 2→0 组；h1 Δ0（正对照 +5px）；`line-break: strict` 实测无差异故不加 |
| T7 | 导语竖线 border-box 渐变；栏目线横向渐变；移除导语外发光 | 两端 `rgb(34,34,40)`/`rgb(31,30,32)`（8% 白叠底，非裸底） |
| T8 | 远层品红 alpha **0.36 → 0.5** | 远层 R−G 16→22、Δ 32→41、压制比 1:4.8→1:3.7；字形改写 0 |
| T9 | dust 六层 **38/47/58/129/161/199**；概览焦点环 | 两两比值距整数最小 **0.2241**；焦点环 7.5058:1 |
| T10 | 原生 `<dialog>` lightbox（portal 到 body） | 裸图开 / 链接图不开；归档零像素变化 |
| T11 | `documentElement[data-app-hidden]` + 6 个动画载体逐个 paused | `getAnimations()` 无 running；只覆盖一半时剩余 running 恰为 `jy-noct-aurora-far` |
| T12 | 文档 + 全量验证 | tsc 0 / vitest 445 / Playwright 104 / 审计 0 / `--verify` 0 |

**收口双轴评审抓到的两处真缺陷**（已修）：

1. **亮侧被改**（Standards）：T10 的 `NocturneImage` 无条件包 `SafeLink`，使 `nocturne-light` 凭空多出 `<a>` 与可点行为。修法：`wrapLinks` 由 `variantId` 派生逐层透传；新增「亮侧零 `<a>`」渲染断言。反向验证：去掉门控 → 恰 1 红。
2. **守卫盲区**（Spec）：B4「导语不得有非 `inset` 外阴影」只扫了部分规则，暗侧 `.juya-lead` 有 3 条，第 3 条加外发光不转红。修法：按选择器前缀全量扫描。反向验证：注入到第 3 条 → 新断言红。

**另有测试稳定性修正**：`nocturne-pause` 的冻结断言原以「置标记瞬间」为基线，主线程忙时会把暂停落地延迟量进去（全量并行偶发失败，隔离 6/6 通过）。修法：置标记后等两帧再取基线；阈值未放宽。

**T11 的范围裁决（明确不做的事）**：只做 `document.hidden` 暂停。**不做动画 `filter`→`opacity` 重构** —— 理由：**无实测数据**支撑（headless 无法测真实 GPU 开销，也尚未在真实窗口用 `app.getAppMetrics()` 补数据；若要重开，需先把阈值定好再测）。同理 `scroll-margin-top` 不做（`SafeLink` 拦截，不发生页内跳转）。

**已知验证缺口（如实记录）**：

1. 「其他风格 / `nocturne-light` 归档逐字节不变」**无法用归档证伪** —— 仓库只有 nocturne-dark 的 5 张归档。替代证据是「全部改动为复合作用域 + 共享层零改动静态守卫 + 亮侧渲染产出断言」。要真正证伪需先给其他变体建基线归档。
2. T5 的宽屏只断言 plate **右缘**与概览线右缘（plate 左缘是图文两列分界，不是内容栏左缘）；窄窗（单列）才比左右两缘。
3. T6 / T5 / T3 的截图类验收存于 Playwright 附件与 `out/`（gitignore），未入仓；入仓的只有五张归档 PNG。

**待真机验收（无头覆盖不到）**：内容区滚动条与原生控件观感（T1）、最小化 / 隐藏 / Mini 切换时动画暂停（T11）。

### 首轮（2026-10-12，#1–#9 九票，merge `83a70d9`）

①Scene 新增 `dust`/`nebula` 预设（`dust` 靠平铺 `radial-gradient` 得一两千点量级，不生成 DOM 节点）；②三层 nebula 接线（alpha 0.07/0.04/0.025，中心区避让）；③字体三档（DengXian / Noto Sans SC / JetBrains Mono）；④刊头 neon 标题；⑤阅读窗 700px 覆写 + 24px 遮罩 alpha 0.3；⑥导语 `--jy-lead-bg` 0.08 + 左竖线外阴影发光、栏目线 0.22；⑦概览序号发光；⑧图文回流（右列限 2 张）；⑨收口守卫组 + 叠加态对比度全量实算 + 视觉走查归档。

验证：tsc 0 / vitest 388 / Playwright 90。

**归档图陈旧缺陷（合并时由 `--verify` 发现并修复）**：`3a63626` 改了 nebula n3 锚点却只重跑审计与字体探针、未重跑视觉走查，致 4 张阅读页归档仍是修正前的像素，`--verify` 返回 exit 1。重生后 exit 0。
**教训：改了影响渲染的 CSS 取值后必须重跑归档生成（写入模式）；`--verify` 只比对不写盘，正是暴露该缺陷的闸门，不可当工具噪声跳过。**

**封版（2026-10-12）→ 解冻（2026-10-20）**：用户确认可封版后该风格冻结；2026-10-20 用户指令「继续优化 nocturne 的风格表现」→ SPEC #10，冻结解除，改由票据范围约束。

## folio（纸感精读式）

四轮全部完成（2026-10-11）。验证 tsc 0 / vitest 291 / Playwright 85 / SDD 全流程评审 + 最终验收 PASS。

1. 横格下沉段落按行高对齐、条目去卡片透明、概览两列失效修复
2. 段首缩进 2em + 图文内容流排布（首图开卷 / 窄幅左右错位）
3. 变体覆盖死选择器修复 + muted 对比度 AA
4. 基层链接标签 / hover 修复 + h2 文武线 + 朱菱分隔符 + 订阅页纸面满屏

评审建议「印章压日期行」（`37e8feb`：日期行 padding-right 88px 右让印章、印章零改动）已实现，独立提交可回退。

## y2k（千禧网页式）

七项完成（2026-10-11，审计建议①–⑦）：中文字体栈落地；段首缩进 2em；EntrySplit 嵌套 h3 字号 17px（后由共享层统一）；亮侧铬字渐变末档深化 + 上白下暗双影（**`text-shadow` 在 `background-clip:text` 下会盖住渐变填充，禁用**）；星光砖 56→160px 双层错相；暗地平网格抬入视口 + 线 alpha 0.28→0.35；四处装饰伪内容改空 alt + `@supports not (background-clip: text)` 实色回退。

验证 tsc 0 / vitest 298 / Playwright 86。**待真机核对**：SimSun 高分屏渲染、160px 砖密度。

## pop（波普艺术式）

七项完成（2026-10-11，批准 ①a②b③④⑤⑥⑦；**未批不做：①b 字体栈、②a 纯 CSS 自由化四项**）：暗色减黄；暗 chip 覆盖（16.3:1）；爆炸星移出 h1 文字盒；h1 `text-shadow` 印刷感；两条 hover 包进 `prefers-reduced-motion: no-preference`；日期贴纸 `nowrap` + ≤520px 降级；期号 MM.DD 超大斜置大字（核实时发现 **`JuyaIssue` 无独立期号字段**，从头日期取）。

刊头多色矩形拼贴（第三批）：`.juya-masthead` 改 grid 拼贴（蓝沟槽 + 品红标题面板 + 荧光黄期号面板 + 黑底 Ben-Day 色带）；期号黑字对黄底 14.95:1；≤520px 期号面板整体隐藏。

验证 tsc 0 / vitest 314 / Playwright 86；窄窗 12px 列沟槽已修（`gap: 12px 0`），最终提交 `0e1c04a`。

## newsprint90s（90 年代报刊式）

2026-10-21 ~ 22 完成（体检 → grilling → SPEC #25 → 票据 #26–#31 → 收口 #32）。集成分支 `feat/newsprint90s-round3`；本轮未 push。

**范围与提交**

- 只动 `juya.css` 的 `jynews` 段与 `templates/newsprint90s.tsx`；共享层零改动。`git diff --name-only main...HEAD` 共 10 个文件：4 文档（GLOSSARY / SPEC / AGENTS / 本文件）+ 2 源码 + 4 测试。
- #27 `fd48846`/`2ce71b8`（旧纸面 + AA + 守卫）→ merge `2ce71b8`；#26 `35c0ec8`/`e7302d0`（三栏刊头 / 自定义 IssueView）→ merge `14d1392`；#28 `2338520`（条目记号）→ merge `eda4c34`；#30 `4dcc588`（订阅页头版）→ merge `f65f41f`；#31 `964ef37`（三态 / 空态）→ merge `898a6df`；#29 `372f0c7`（框线导读）→ merge `a736fb8`；#32 收口 `9da83b4`（docs）+ 7 个 code-review 修复提交 → merge `7ca66c4`。

**关键决策（实测）**

- 纸色：亮 `#ece2c6` / 暗 `#1e1913`；muted 亮 `#5f5747` / 暗 `#a2997b`，一个 token 同时覆盖日期线、来源、导语。纹理为 3px 横纹 + 两道错位纤维 + 轻暗角，全部背景层，零 DOM / 动画 / filter。
- AA 口径：以「全部纹理层叠后的最不利行」实算。亮 muted/纸 5.09、/卡片 5.79、/导语 4.55；暗 5.65 / 5.66 / 4.98；滚动条 thumb 6.62 / 3.92（≥3）。
- 字体：刊头 KaiTi；标题 / 栏目条 SimHei；正文 SimSun 优先（Noto Serif SC 回退）。
- 刊头：左日期 / 中期号 / 右星期，真实 `pubDate`；版心 800（内容 752）；38px / 6px，≤899 堆叠 30px / 4px（与双栏 `min-width:900` 互斥，#32 收口）；上 1px、下 4px double。
- 条目：2em 缩进 + 6px 段距；黑底栏目条；方角黑底徽章；导语上下细线；相关链接上沿细线 + 小标 + 墨色下划线；直角图版。
- 订阅页：card/grid 去卡片化 + 160×4:3 图版 + 18px SimHei 标题；compact 72×40 直角缩略图 + 14px；magazine 首条 3:2 + 26px；空态上下 1px 公告框（`strong` 15px + `span` 12px muted）；来源无框小字、未读点 4px 方形；hover 用中性 `--jy-feed-hover` 纸面微层（亮 0.045 墨 / 暗 0.045 暖白），不上浮。
- 链接：概览与相关链接常驻下划线；概览 / 相关链接 / 条目标题 hover 转 accent。条目标题链接刻意不加常驻下划线（标题静默、hover 才下划线，报刊惯例），见代码注释。
- 字体：新增 `--jy-font-masthead` 与既有 `--jy-font-heading` / `--jy-font-body` 全部走 token，不再在规则里写死字面栈。
- 导读：真实 DOM「导读」小标 + 上下框线，单列；共享 OverviewItems 原样复用。

**验证（2026-10-22）**

- `npm run verify` exit 0：tsc 0 / vitest 21 文件 481 / Playwright 119 / nocturne 审计与 5 张归档逐字节一致。
- 守卫新增 newsprint 组（token 字体栈、方角、缩进、AA、纹理只在背景层、纸色集合、订阅页尺寸）；reader/feed E2E 新增结构、计算样式、三视口与三态。
- 双轴 code review 发现 4 条硬项 + 3 条规格缺口；收口修复：字体栈全部改 token、刊头断点收成 ≤899、概览/相关链接常驻下划线 + 三处 hover accent、空态拆成 `strong`+`span`、hover 改中性纸面层、缩进断言改比例、删除读 tsx 的正则守卫。修复后 verify 仍 exit 0。
- 改前/改后完整矩阵：`screenshots/newsprint-audit/before-full|after-full`（亮/暗 × 阅读/订阅 × 1280/900/560，gitignored；非归档基线）。

**已知取舍 / 未验证**

- 宽窗双栏 + 短文本 + 多图仍有栏底参差（1280 最坏 190.6px，24.7%）；整组避断、图文 grid、有图单栏三种替代实测更差，保留并记录。
- 条目标题链接不加常驻下划线（概览/相关链接有），是「标题静默、hover 才下划线」的报刊惯例，属故意例外。
- 自定义 IssueView 复刻了工厂的 section/entry 映射；订阅页 grid/compact/featured 的去卡片、来源、未读点、hover 声明有重复；静态守卫仍读取 CSS 文本——均为本轮「共享层零改动」下的有意取舍，不在此轮重构。
- `base.tsx` 的 `mastheadExtra` 已无调用（共享层遗留），不在本轮范围。
- `GLOSSARY.md` 全量术语表是用户单独指令，不属于 #25–#32 票据范围。
- 本地夹具图片为坏链，双栏下会留下 26px 空图的两条边框；线上橘鸦图源正常时不可达。
- 真机窗口目视验收：用户 2026-10-22 确认效果满意；未建新归档基线（SPEC Q8=A）。
