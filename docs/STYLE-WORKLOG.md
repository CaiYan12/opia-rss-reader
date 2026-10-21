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
