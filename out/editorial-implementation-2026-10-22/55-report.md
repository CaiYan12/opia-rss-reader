# GitHub #55：editorial 集成验收记录

本票验收与记录已完成。代码验收基于 `codex/editorial-t6` 的 `dcc622aa4fe50a7245cb41bb6580032d3f9a7a8c`；该提交的 `src` tree 为 `0e111892b638b39d5558d1ee0fba81d57c8b4afd`。本票没有改产品源码。#50–#54 已按集成记录合入并关闭；父票 #49 仍为 OPEN，等待父代理双轴审查及用户后续决定。本记录不表示用户已封稿，也未执行 push、PR、issue 关闭、发行或性能验收。

## 浏览器集成矩阵与截图

使用 `tests/e2e/helpers.ts` 中的确定性 editorial T4 阅读样本与 T5 订阅样本，对改造前旧 renderer 和当前 renderer 在同一 Playwright Chromium、相同字体环境下测量。DPR 固定为 1，viewport 高 900px；宽度为 1280、900、560、480、520、640、641px；内容区缩放为 100% 与 120%；阅读／订阅页、亮／暗各覆盖。共 112 组测量，每个 renderer 56 组。

旧 renderer 取自 `out/synthwave-seal-2026-10-22/ab47/out/renderer/`，其源树 `113337cce6b0b0f4bb0644be0ea1f401e671145c` 与 `bfcf329` 的 `src` tree 一致。当前 renderer 为 `out/renderer/`。两端 bundle 指纹、全部实测值和分类结果记录在 [visual-metadata-classified.json](55/visual-metadata-classified.json)。改造前后主图共 24 张：亮／暗 × 阅读／订阅 × 1280／900／560px，文件分别按 `screenshots/before/{reader|feed}/` 与 `screenshots/after/{reader|feed}/` 的 `{light|dark}-{width}-zoom100-default.png` 命名。1280px 阅读页正文滚动位置另有亮／暗前后 4 张 `*-body.png`；当前 renderer 另有亮／暗 641px、120% 的 2 张边界图。

矩阵几何结果：当前 renderer 的最大横向溢出为 0px，图片显示比例最大误差为 0.0000611。1280px／100% 阅读页中，首条与后续正文宽度亮暗两侧均为 567.265625px，差值为 0。641px／120% 时，阅读内容布局宽 534px、缩放后视口宽 641px；开篇图文上下堆叠；概览为 2 列，布局宽 486px、缩放后矩形宽 583.40625px；长 URL 分 5 行，所在滚动区无横向溢出。这里的 2 列与 CSS 在 640px 以上维持两列的断点一致，不判为缺陷。滚动区的 `scrollWidth` 是缩放前布局值，元素矩形是缩放后的 CSS 像素，报告没有把这两个口径直接相除。

CDP `CSS.getPlatformFontsForNode` 实读当前 renderer 的字形字体：阅读／订阅、亮／暗的标题均为 Noto Serif SC，正文均为 Noto Sans SC。`getComputedStyle().fontFamily` 仅作为声明栈信息，不替代此实际字体证据。

交互图位于 `screenshots/interaction-tracer/{before|after}/{reader|feed}/`，覆盖亮／暗 × hover／键盘焦点／减少动态悬停，共 24 张。当前 renderer 的 12 个状态验收失败数为 0。旧版订阅 hover 两侧实测均上移 2px，这是改造前预期行为；分类记录在 [interaction-tracer-classified.json](55/interaction-tracer-classified.json)。主截图脚本在主图写入后因交互 selector 不适用于旧 DOM 而退出非零；测量采集随后独立完成。首次原始 20 项几何断言误把 `data-image-layout="landscape"`（图片方向）当成 CSS 列布局；分类器改按实际矩形计算，当前 renderer 的几何、比例和验收失败集合均为空。没有因截图脚本误报改动产品代码。

截图索引：

- 主图对照：`screenshots/{before|after}/{reader|feed}/{light|dark}-{1280|900|560}-zoom100-default.png`。
- 阅读正文滚动图：`screenshots/{before|after}/reader/{light|dark}-1280-zoom100-body.png`。
- 当前边界图：`screenshots/after/reader/{light|dark}-641-zoom120-edge.png`。
- 交互图：`screenshots/interaction-tracer/{before|after}/{reader|feed}/{light|dark}-1280-zoom100-{hover|focus|reduced-motion-hover}.png`。
- 当前 wabi 负对照图：`screenshots/negative-control/wabi-{feed|reader}-1280.png`，SHA256 与 computed style / 实际字体见 [wabi-negative-control.json](55/wabi-negative-control.json)。

## 真实 RSS 与 Electron

补充视觉样本来自本机保存的 2026-10-22 RSS（622,701 bytes，SHA256 `B1638031CFF8467FA1699D53818887F03F0B63072CBD368A7A2BD6498B102031`），由 loopback HTTP 服务交给真实 `RssProvider`。当前 hidden native run 的本地服务收到 2 次请求；真实主进程／preload／IPC 页面出现 10 条订阅、6 个栏目、32 条正文、34 张图和 32 个概览项。开篇图自然尺寸为 640×360，展示比例为 1.77777779；原生阅读滚动条 thumb 实测 `rgb(138, 47, 43)`。应用真实设置交互将主题切到暗色，并通过 Zoom 控件设置 120%。本机真实期号截图保存在 `screenshots/native-real-rss/`，作为本地 RSS 补充目视材料，不与合成样本前后图作逐像素比较。

原生证据分三段保存，未混为一次 PASS：

1. 前台限制生效前的第一次真实 Electron 尝试生成了 8 张真实期号截图并完成 UI 走查；随后报告清理因 harness 的 `snapshotRealProfile` 未定义而退出非零。截图仅作历史视觉证据；其中焦点截图在 CSS 过渡中，不能用于稳定焦点颜色结论。原始日志为 `55/logs/native-acceptance-attempt-1.log`。
2. 后续主 native run 从创建起保持隐藏，真实 `BrowserWindow` 的 `show()` 被外部测试 bootstrap 记录并拦截；`isVisible()` 三个阶段均为 false。隔离 profile 下实际执行 main/preload/IPC、RSS 刷新、主题与缩放交互。该主 hidden run 的 DPR 为 1.75；默认尺寸请求 1100×720，实测 bounds 1102×722、viewport 1099×721；最小约束 `[720,480]`，实测 bounds 723×482、viewport 720×481。实测尺寸均满足配置下限，作为配置值与系统缩放／窗口框的测量差异记录，不视为产品缺陷。原始结果保存在 [native-acceptance-attempt-2.json](55/native-acceptance-attempt-2.json)，exit 1 的 5 项分别是：把 1100×720 初始尺寸当作精确外框、把最小外框和 viewport 当作精确 720×480、焦点在过渡中途测量，以及 launch 返回后才开始读 stdout。这些原始失败保留，不回写成当次通过。
3. 为上述采集缺口做了一次最小隐藏 follow-up，没有截图、没有 `show/focus/bringToFront` 或 OS 输入。真实窗口仍隐藏；该 follow-up 只补充稳定焦点与主进程日志采集，没有重新测量窗口尺寸。稳定焦点与日志结果见下文及 [native-focus-followup.json](55/native-focus-followup.json)。

稳定焦点采样在 700ms 后连续观察到 3 个相同状态：`:focus-visible=true`、`document.hasFocus()=true`、`outlineStyle=solid`、最终 `outlineColor=rgb(138, 47, 43)`、`outlineWidth=1.71429px`（DPR 1.75 的设备像素量化）。该键盘事件由 Playwright/CDP 在隐藏窗口 renderer 内发送；它证明稳定 DOM 焦点样式，不证明 OS 前台焦点行为。真实 main 控制台在 `require(out/main/index.js)` 之前由 bootstrap 包装 `console.log/warn/error` 并保留原调用；[main-console.log](55/native/run-2026-10-23T09-57-15-747Z/main-console.log) 捕获到插件加载与 `[main] initial refresh, added=10`。follow-up 结果 [native-focus-followup.json](55/native-focus-followup.json) 与退出码 0 可复查。

隔离运行的 userData/sessionData 均解析到本票专用 profile；运行前后对三个默认 profile 路径作只读 stat 比较，变化为空，未读取真实 profile 正文。没有额外注入全局 `--no-sandbox` 参数；现有 `src/main/window.ts` 配置 `webPreferences.sandbox: false` 保持原样。本票没有改安全配置或真实用户 profile。

## 回归与视觉边界

- nocturne 归档写入模式 exit 0；写入前后 5 张归档 PNG 的字节数和 SHA256 全部一致，没有刷新基线。完整记录为 `55/logs/nocturne-archive-before.json`、`nocturne-archive-after.json` 与 `nocturne-archive-write.log`。
- 在产品 candidate 未再变化时只运行一次 `npm run verify`，exit 0：TypeScript 检查通过；Vitest 23 个文件／574 项通过；Playwright E2E 158 项通过；nocturne 文字对比度 70/70、UI 对比度 14/14；五张归档逐字节一致。完整 stdout 与退出码在 `55/logs/verify.log`、`verify.exit-code`。这次全量 E2E 也覆盖既有通用回退及 wabi 模板接线；不据此声称所有风格逐字节不变。
- T1 对 editorial 纸纹叠色的既有守卫以复合纸面 `#f8f6f0`（亮）／`#1a1916`（暗）计算 WCAG 对比度。T1 报告记录正文 13.0661:1／9.6012:1、次要文字 5.0002:1／4.7877:1、焦点环 7.7045:1／6.3735:1；本次 `npm run verify` 重跑了对应静态守卫及全套测试。T1 完整结果见 `50-report.md`。
- wabi 负对照使用现有确定性 helper、headless Chromium 1280×900／DPR1，不下载图片；阅读与订阅均为 `wabi-light`，背景 token `#efede6`，CDP 实际标题字体 Noto Serif SC、正文 Noto Sans SC，横向溢出为 0，3 项检查通过。两张截图与 renderer bundle hash 见 `55/wabi-negative-control.json`。该对照不是 wabi 全面重新验收。

## 边界与文件

本票没有重新测试发行包、公开站点的当日在线内容、物理显示 FPS，也没有声称原生 OS 前台焦点验收通过；受前台保护约束，后续 Electron run 均保持隐藏。所有 `out/editorial-implementation-2026-10-22/55/` 图片、JSON、脚本和日志均为本机忽略证据，未加入 Git；本仓记录文件为本报告、`docs/SPEC-2026-10-22-editorial.md`、`docs/STYLE-WORKLOG.md`、`AGENTS.md` 和 `.design-flow.json`。父代理的全分支双轴 review 已完成且无阻断；本地 #50–#55 已合入 `codex/editorial`，#49 仍 OPEN，等待用户选择后续发布／封稿；wabi 全面体检未启动。

独立双轴评审针对基线 `bfcf32928481a805f5c5f45bde26f5607d60d062` 与冻结候选 `300cc02d9aa8e0f995f40004fcd315872b6e8ed3` 完成，只读且未重跑测试。以下结果保持 Standards 与 Spec 两轴；本次文档收口不改变产品、测试或共享代码。

## Standards

- 硬性违规：0。
- 两条可选低优先级重复建议，均无正确性影响：`src/renderer/juya/templates/editorial.tsx:31-42,55-57` 的图像／懒加载／题注结构部分重复（首图另有布局 `onLoad`）；`tests/e2e/helpers.ts:284-310` 的 editorial T1–T4 亮暗 fixture 配置重复。本轮遵守最小变更，不做产品或测试重构。

## Spec

- 缺失要求：0；范围外扩：0；有证据错误：0。
- 依据 `docs/SPEC-2026-10-22-editorial.md` 的开篇、`blocks` 顺序与原图比例、订阅页 `FeedShell` 约束及图片交互排除项；核对路径包括 `src/renderer/juya/templates/editorial.tsx` 与 `tests/e2e/helpers.ts`。评审确认实现符合上述要求，未发现阻断问题。

汇总：Standards 为 0 项硬违规、2 条可选低优先级建议（该轴最严重问题无阻断）；Spec 的缺失／范围外扩／证据错误均为 0（该轴最严重问题无阻断）。
