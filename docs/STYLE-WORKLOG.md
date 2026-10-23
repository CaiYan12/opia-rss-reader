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

## synthwave（蒸汽梦核式）

需求文档：`docs/SPEC-2026-10-22-synthwave.md`（#34）。本轮风格实现、网格改造、边界回归与本机 A/B 已完成，实施验收基线 `77f245d`。2026-10-22 按用户要求封稿，以 PR 合并 main、同步远端并关闭本轮分支；集成记录以 GitHub PR 为准。未建 synthwave 截图归档基线（已决定不扩大维护范围），不进行发行包验收或新版本发行。

**范围与提交**

- 2026-10-22 一轮做完：SPEC #34 → 票据 #35–#41 → 双轴 code review 收口（`(#34 review)` 提交）。集成分支 `feat/synthwave` @ `43afb54`，review 分支 `fix/synthwave-review`，本轮未 push。
- #35 `baae5d3` 风格 id `dreamcore → synthwave`（`migrateLegacyJuyaStyleId` 读映射 / 写落新值，界面名不变）；#36 `f67d37a` 场景成立（夜空渐变 + 扫描线 + 10 道条纹落日 + 抬回视口的透视网格）；#37 `9bad7b7` 刊头字体栈 + 1px 描边 + 两条可访问性回退；#38 `5d1db94` 相关链接箭头改 lucide 图标 + 订阅页元信息图标；#39 `6cac403` 暗侧 0.62 卡面 / 18px 毛玻璃 / 概览底板 / 配图霓虹描边；#40 `6f43ef2` 订阅页场景插槽；#41 `5799e75` + `721a5bb` 亮侧洋红橙日间版（token / 日间天空 / 暂停清单 / 浅色地面）。
- 只动 synthwave 作用域与模板；共享层仅三处可选增补（`Scene` 场景插槽、链接箭头图标开关、元信息图标开关），不传时其余七个风格 DOM 与观感不变。

**关键决策（实算）**

- 暗侧 token（#34 review 起与 SPEC 逐项对齐）：标题 `#ffe6ff`、正文 `#f0dcff`、次要 `#c9b7e0`、链接 `#ff8ad0`、accent `#ff2d95`、accent 上文字 `#1a0010`；边框 `rgba(255,45,149,.32)`、导语底 `rgba(255,45,149,.12)`，两者都与 accent 同色相（#35 改名后残留的梦核紫 `#8f63ff / #c3a9ff / rgba(158,132,255,·) / rgba(124,92,255,·)` 已全部迁走）。
- 最不利合成底仍是「0.62 卡面压落日峰 `#ff9a3c`」= `#6d3f2e`：标题 7.50 / 正文 6.83 / 次要 4.72（过 AA 4.5）、accent 上文字对 accent 5.76。
- 落日三色 `#ffe14d → #ff9a3c → #ff2d95` 落在共享径向渐变的 0% / 34% / 62% 三站。中段是 #34 review 补的：SPEC 写三色，实现此前只有首尾两站，橙带整段缺失。
- 悬停：取消基础层的 −2px 上浮，只加深外发光（`0.12 → 0.28`）**并提亮边框**（`--jy-border-hover`，暗侧 alpha `.32 → .55`、亮侧 `.30 → .55`）。此前只改了 box-shadow，漏掉 SPEC「边框亮度」的一半。
- 刊头 1px 描边分变体（#34 review）：暗侧 `rgba(255,230,255,.45)`（＝暗侧 `--jy-heading` `#ffe6ff` 同 RGB），亮侧 `rgba(74,7,54,.28)`（＝亮侧 `--jy-heading` `#4a0736` 同 RGB）。原来单写的近白紫是给暗侧调的，压在白卡上几乎看不见。描边是装饰性轮廓（字身由不透明渐变填充），不套对比度门槛。
- 滚动条 thumb 与 accent 同步：暗侧 `#ff2d95`（对 `#0b0918` 5.68）、亮侧 `#e0006e`（对 `#ffe6cc` 3.97 / 对 `#ffd6e8` 3.65），均 ≥ 非文本件 3。

**与 SPEC 字面不同的三处（实施期确定，已回填 SPEC「Further Notes」）**

1. **亮侧地面 `#ffcadb`**：共享透视网格平面自带的 `#170a2a` 是给暗侧地面的。亮侧沿用会出现「亮粉天空 → 近黑地面」的硬断层，而且卡片压在网格区时 0.62 白卡合成出 `#a7a2ae` 中灰底，次要文字只有 2.78:1、链接 2.81:1（AA 不过）。亮侧只覆盖 `background-color`，几何（height / bottom / transform / perspective）仍归共享规则与 #40 的订阅页补偿。改浅后合成底 `#ffebf1`：正文 14.40 / 次要 6.07 / 链接 6.15。
2. **亮侧扫描线 alpha `0.06`**（SPEC「场景」段的 0.10 是暗侧基线）：白天不需要那么强的 CRT 压暗，0.10 会把字压灰。暗侧维持 0.10。
3. **焦点色未随调色板迁移改动**：暗侧 `#b89aff`、亮侧 `#7c4dff`。SPEC 未规定焦点色，改它属于设计决策（焦点环是功能件，不是装饰色），用户已裁决本轮保留，不再列为待裁决项。CSS 变体块内有明确注释锁这一点，守卫也断言这两个值。

**验证（2026-10-22）**

- `npm run typecheck` → exit 0。
- `npx vitest run` → 21 文件 508 过 / 11 skip（519）。
- `npm run build:dir && npx playwright test --workers=1` → 128 passed。
- `npm run verify` → exit 0（含 nocturne 对比度审计 + 5 张归档逐字节一致 + reduced-motion 证据全 PASS）。
- 首轮 `npm run verify` 曾撞到 `storeService.test.ts > prune > cutoff 为严格小于比较` 一次红灯（墙钟毫秒前移导致 `now` 落在 cutoff 之前），单跑该文件 36 过、重跑整链绿：属既有时间边界抖动，与本次 CSS/测试改动无关，测试文件也不在本次白名单内，未修。
- 守卫：新增「synthwave 暗侧调色板守卫」8 条（token 对齐 SPEC、焦点色未动、梦核紫字面值清零、三处外发光品红 + 悬停加深、悬停边框提亮分变体、落日三色三站、thumb 与 accent 同步 + 5.68、on-accent/标题/正文/次要实算）；字体组 ③ 改为「基础规则不再写单色描边」并新增 ⑦「描边分亮暗且各与 --jy-heading 同源」。E2E：阅读页新增暗侧 token / 落日三色 / 暗侧描边（亮侧描边并入 #41 用例），订阅页新增悬停边框提亮 + 发光加深 + 不上浮（亮暗两套值）。

**已知取舍 / 未验证**

- 链接 `#ff8ad0` 在最不利合成底 `#6d3f2e` 上只有 4.08（< 4.5）—— 这是 SPEC 指定值，且相关链接区块落在落日峰之下的卡面区（其余底 ≥ 6.70），故未改 token，也未给链接加最不利底的门槛。用户已裁决本轮保留，不列为待修项；不据此宣称任意底下均满足 AA。
- 焦点色仍是梦核紫，与品红调色板同屏时色相不统一（用户已裁决本轮保留）；另注：注册表 `juyaStyles.ts` 里 `synthwave-dark` 的 `focusColor` 是 `#b388ff`，与 CSS `--jy-focus #b89aff` 有既有漂移，两处都不在本轮范围。
- 2026-10-22 GPU 核查：已修复当前开发运行时三个 DLL 的 Low 完整性标签造成的软件合成回退，实际项目入口恢复 RTX 4070 / D3D11。当时仅有网格合成层临时原型，正式 CSS 尚未改；随后 #44 / #45 / #47 分别完成实现、边界回归与真实构建 A/B。该早期状态不再是当前待办；物理显示 FPS 与发行包验收仍不在本轮范围。环境复现矩阵、回调指标与证据边界见 [GPU 核查记录](GPU-AUDIT-2026-10-22.md)。
- 2026-10-22 网格合成层（#44，`2fa0c15`）：周期纹理迁到 `.juya-scene-grid.juya-scene-grid-persp::after`，关键帧只动 `transform`，`will-change` 随之下移；父层补 `background-image: none`，否则 y2k 地平网格的 1px/44px 纹理漏进透视平面叠成双网格；地平线 `::before` 提到 `z-index: 1` 压住纹理层。方向与相位用行亮度剖面实测校准（改动前后逐峰一致，无反向），三帧像素比较 `>8` 差异像素为 0。rAF 复测属 #45。
- 2026-10-22 边界回归与同批次对照（#45）：E2E 新增四组合（阅读页 / 订阅页 × 亮 / 暗）四条不变量 —— 网格底边在滚动口可视区内、纹理层两次采样 `translateY` 必须变化、纹理层上下缺口 ≤0（不露底）、左右 0 内缩且平面居中（不错位）；另覆盖 `uiZoom` 1.2（亮 / 暗，两个相位都验）、480/520 窄窗、`prefers-reduced-motion` 下 `::after` 为 `none` 且静止、`[data-app-hidden]` 下 `paused → running`、多标签 keep-alive 切回仍在动且每个根只有一个网格平面。性能用 `perf:probe --mode light` 同批次 3+3 跑两轮（默认 / `--pause-grid` 注入关断），中位关 / 开比值 1.86 与 1.04（同向、幅度不同），第二批两组均随时间变快，说明组间差异小于批内漂移（72.0–141.5Hz），故不据此主张收益、也没观察到负面证据。样本是合成文章、单机、不可跨批次比较；环境与 12 段原始数字见 [GPU 核查记录](GPU-AUDIT-2026-10-22.md)「合成层改造后的同批次对照」。
- 2026-10-22 旧 / 新真实构建 A/B（#47）：探针新增应用目录选择与父元素 / ::after 载体识别，两版分别构建、共用同一 Electron。正式 light 与 trace 各按旧→新→新→旧重复两轮；34 张合成图全部就绪后才采样。light 中位 21.8→80.3Hz，四对新减旧均为正，差值中位 +58.2Hz，大于组内最大跨度 18.6Hz；trace 呈现计数率中位 21.0→135.7Hz，DroppedFrame 单段计数中位 722→148。支持本机该合成阅读样本上有收益，不能推广为显示 FPS 或跨机器保证；与 GPU 初始化修复的收益分开。逐段数据、构建指纹、预热修正和边界见 [GPU 核查记录](GPU-AUDIT-2026-10-22.md)「旧 / 新真实构建 A/B」。这是 #45 措辞初版写错的地方：1.86 / 1.04 是同向的关 / 开比值，并非方向相反。
- 2026-10-22 文档与票据收口：统一两份 SPEC、GPU 核查记录、README 与本节的最终状态；撤销初版绝对 100Hz 目标与预设模糊降级顺序，将用户已接受的焦点色、链接 4.08:1 和悬停边框取舍明确为保留。最新代码验证仍引用 `77f245d` 的 572 单测 / 139 E2E / 对比度 70+14 / 5 张归档一致、exit 0，本次仅改文档；全量结果引用此前实测，另跑相关样式守卫 221 项通过，不冒称重跑全量。远端 #34 / #43 / #47 按用户授权回填完成证据并收口，关闭不代表代码已 push 或发行。
- 远端收口已回读确认（2026-10-22 21:11，UTC+8）：[#47](https://github.com/CaiYan12/opia-rss-reader/issues/47)、[#43](https://github.com/CaiYan12/opia-rss-reader/issues/43)、[#34](https://github.com/CaiYan12/opia-rss-reader/issues/34) 均为 CLOSED，完成证据与正文已同步，`ready-for-agent` 标签已移除。两张父票关闭前均已核对其原生子票全部关闭。
- 2026-10-22 封稿交付：用户授权提交、PR 合并 main、同步远端并关闭 synthwave 分支。本轮已接受的视觉取舍与测量边界保持不变，后续需求另行立项。移除临时工作区前，将其 out 证据完整复制至本检出的 `out/synthwave-seal-2026-10-22/`，其中 1026 个 out 文件逐文件 SHA256 校验一致；性能批次与验证日志的引用已改到该归档，原始 profile 仍只存本机、不提交。

### Editorial 集成验收（#50–#55，2026-10-23）

- #50–#54 的实施与分票报告见同目录 `out/editorial-implementation-2026-10-22/50-report.md` 至 `54-report.md`。#55 验收报告为 `out/editorial-implementation-2026-10-22/55-report.md`。本地 #50–#55 实施与验收已全部合入 `codex/editorial`，冻结候选为 `300cc02d9aa8e0f995f40004fcd315872b6e8ed3`；独立双轴评审已完成且无阻断，结果见 #55 报告附录。父票在该验收阶段保持 OPEN；用户随后确认封版，见下节。此前的验收不代表当时已封稿或发布。
- 改造前旧 renderer 源树 `113337cce6b0b0f4bb0644be0ea1f401e671145c` 与当前 renderer `0e111892b638b39d5558d1ee0fba81d57c8b4afd` 共享同一确定性样本进行 112 组测量（亮暗 × 阅读/订阅 × 7 宽度 × 2 缩放 × 前后）。这是初版写错的地方：当前 renderer 的 `src` 树哈希曾多写一个 `0`；已按 `git rev-parse 300cc02d9aa8e0f995f40004fcd315872b6e8ed3:src` 核对修正。当前 renderer 最大横向溢出 0px、图片比例最大误差 0.0000611；1280/100% 首条与后续正文宽均 567.265625px。641/120% 概览实测仍为两列（阈值为 640px），开篇图文堆叠、长 URL 5 行且滚动区无溢出。实际字形由 CDP 读得标题 Noto Serif SC、正文 Noto Sans SC。
- before/after 主矩阵截图、正文滚动位置、边界图与 hover/focus/reduced-motion 图保存在本机忽略目录；交互分类后当前 renderer 12 个状态无验收失败。旧 renderer feed hover 上移 2px 是改造前观察，不归为新增缺陷。原始几何采集的 20 项 `opening-layout` 误报源于把图片方向标签当成 CSS 列布局；按矩形复算后几何与比例 findings 均为空。
- 本机真实 Electron 使用已保存的 2026-10-22 RSS 文件经 loopback HTTP 驱动真实 provider/main/preload/IPC，并将 userData/sessionData/crashDumps 指向独立 profile；默认用户 profile 的前后只读 stat 无变化。前台限制生效前的第一次可见尝试保存 8 张真实 RSS 截图，但在报告清理时以 harness helper 未定义退出；焦点图当时处在过渡态。随后 hidden native runtime 保持窗口不可见，按实际系统缩放记录默认 bounds 1102×722 / viewport 1099×721、最小 bounds 723×482 / viewport 720×481（DPR 1.75），不硬凑 1100×720 或 720×480 精确外框。独立 hidden follow-up 稳定采样到 `:focus-visible` 环 `rgb(138, 47, 43)`，并由 bootstrap 捕获真实 `[main] initial refresh, added=10`。该 DOM 测量不证明 OS 前台焦点。
- 当前候选只运行一次 `npm run verify`：23 个 Vitest 文件／574 项、Playwright E2E 158 项、nocturne contrast text 70/70 与 UI 14/14 均通过；先执行 nocturne 归档写入再验证，五张归档 PNG 的字节数和 SHA256 均未变化。此记录不宣称所有风格逐字节一致，也不包含性能、发行包或 OS 前台焦点验收。
- wabi 最小负对照仅走现有确定性 helper 的 headless 订阅／阅读截图；两页均为 `wabi-light`，背景 token `#efede6`，实际标题字体 Noto Serif SC、正文 Noto Sans SC，横向溢出为 0。截图与 bundle 指纹保存在 `55/wabi-negative-control.json`；这不是 wabi 全面重新验收，wabi 独立全面体检尚未启动。

### Editorial 用户确认封版（2026-10-23）

- 用户明确表示当前风格已较为满意、可以封版。已接受的亮暗阅读／订阅版式作为本轮定稿；后续需求另行立项。
- 最后微调只在既有下沉首字规则新增 `font-weight: 700`，保留栏目首条导语范围，周围文字仍为 400。六个 headless 样本覆盖亮暗 × 中文／英文／引号开头，无横向溢出；没有启动可见应用或前台宏。
- 加粗后已重新实跑 `npm run verify` exit 0：23 个单测文件／574 项、158 项 E2E；既有 nocturne 归档先写入再验证，五张全部逐字节一致。原始日志、样本与截图在本机 `out/editorial-dropcap-bold-2026-10-23/`；封版文档更新不重复运行相同验证。
- 本地封版提交包含该字重与记录，不执行 push、PR、合并 main、tag 或发行；不删除历史分支和证据。
