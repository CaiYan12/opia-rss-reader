# Wabi 视觉验收：#66（#63 收口）

> 本记录把实现、自动验证、隐藏 Electron 验收、设计自评和用户视觉认可分开。机器与代理结果不能替代用户确认。**用户视觉认可已由用户于 2026-10-24 明确给出（「当前wabi可判定封版」），wabi 判定封版**；封版后新需求另行立项。

## 候选与范围

- 候选分支：`codex/wabi-art-66-20261024`，在本轮以 fast-forward 合入集成提交 `97d81952b1e2c0b4c816d1697d48dd44e222a7a6` 后完成纠正验收。
- #64 与 #65 已关闭且无阻断；其集成后功能测试与页面报告作为本票证据的一部分，不冒称为本票新跑的结果。
- 本票产品修改仅在 `src/renderer/juya/juya.css`：订阅页陶拓由软椭圆／斜线改为粗粒、断裂的固定种子印痕，按亮暗调整陶拓密度；窄屏下标题上限从 `68px` 校准到 `60px`，最小值从 `52px` 校准到 `42px`；阅读页陶拓宽度收至 `calc(100% - 40px)`，给日期留出干净纸面。来源、文章日期、标题文本和编号语义未改。标题在 1280px 保持原尺寸，480px／120% 样本中仍是刊头主视觉。
- 订阅页最后 28 reader 变化前的 24 feed 稳定样本继续有效：reader 变更只匹配 `.wabi-reading-craft-rubbing`，不会影响 feed、off 或 editorial。负对照包记录的旧 renderer SHA 与最终 bundle SHA 分列见下文。
- 没有改共享解析器、通用主题、依赖、IPC 契约或 Mini 行为；没有推送、建 PR、发布或改写 issue 状态。

### 候选和输入指纹

| 对象 | SHA-256 |
| --- | --- |
| `src/renderer/juya/juya.css` | `5c15d00c2d5e60c8c801cdd8e4b6887c93cf68e40e32255cb0c9edd8a5746ee0` |
| `src/renderer/juya/templates/wabi.tsx` | `666e30e9222eeff00ae468d40175cf5bb84bac56e9cebb87dcd94565fb997199` |
| `src/renderer/juya/templates/wabi-feed-craft.tsx` | `a6c73027742c2d51b536a1ef1e9d0474c9f0511024e176d2633c89ae4c20c784` |
| `tests/fixtures/juya-content.html` | `e0e2414941ff60096630d11eca3a0114e4969abe53eaf29466386ecbf9f8f810` |
| `tests/e2e/helpers.ts` | `0ca143c15a4eabb267d31bde600c0f0443840950791b9d03bf119c4952d0e9d4` |
| `tests/e2e/setup.ts` | `ad02241ae01bea0402f895cf994a3c3b19a108320ac722958593533e2e82101d` |
| `tests/e2e/wabi-reading-craft.spec.ts` | `ee67c34899aaa89ac4185a99a34710f32d5af7e3a54f0cf47bab2c900e370aaf` |
| `tests/e2e/wabi-feed.spec.ts` | `3751cd6c1bd705d98c48d21d285ed1df5c39db7bc484756b0356f8581accbee0` |
| `tests/e2e/platform-fonts.ts` | `5f0fea4f7dccc656e839803efdff9ad98ca8a4a678d2226b073917c56fbd25b1` |
| `tests/unit/juyaCssGuard.test.ts` | `4c4ec4c2e45b220791d36bddc5e810a3206f438f27c6d563bacb44bf43d515de` |
| `playwright.config.ts` | `80d197fb767aac88ade03ed26307b28454700ac770043e4b88c5de1ae61ab635` |

| Built output | SHA-256 |
| --- | --- |
| `out/renderer/index.html` | `484437f899e3c97492ea655ab11dad6667a3aeaf2daaa7aaaaf65b03769b7517` |
| `out/renderer/assets/index-BZpVzmoR.css` | `d2494b934ee53f5ce0ddaebbe42023349cb9f24671bd2bcba73cb65f969234e5` |
| `out/renderer/assets/index-BztfHOyg.js` | `d5d70c27c70190c391296f5278209169b69c7c7b04b873157b773864706423e9` |
| `out/main/index.js` | `2fe8f8c9dcfe60716a4831149ca7ff9e9468bde530e3b0fbdfc7fe58bbb18f11` |
| `out/preload/index.js` | `005bb949641384e4a9e1fc151c967372fe1f3ba84a9a1ad12d3f694fb6b90f2e` |

| Additional input | SHA-256 |
| --- | --- |
| `tests/e2e/wabi-paper.spec.ts` | `e780586dea6fecdc01e45087a34920780a8aaf4bbe1a8f4549f8ef007af10597` |
| `tests/e2e/wabi-overview.spec.ts` | `4038fda7044d81eb73617ed0bc8d2d7ec57064d803ecfa54cf9711ae7183a422` |
| `tests/e2e/wabi-figures.spec.ts` | `fcee2b1431930f7cfa8e9f0cffbc47564678de4ce95c34b981b73b785dd7e55c` |
| `package.json` | `c8974796711ef43bb6dcfae18155545294f697cb1dc5edc2f411f9bdaae2fd5ad` |
| `package-lock.json` | `2223339a72354275113c3071086df1c2c11f466043782f3cc306336074fa1186` |
| `tickets/66/matrix.spec.ts` | `9b4536213cfbcfa2020ca808b6b348c64b5982ef7656cb61b91c40346b8fb0d0` |
| `tickets/66/contrast.spec.ts` | `62e6e2a82e454ba330a7c4ae5583c52a8091ecfc419ca7f5ddbBFD65a3e178ed` |
| `tickets/66/fonts.spec.ts` | `bf709e5371b89b371cba10699e6760bad64ae2140362a70cc58dbd20e6b781b5` |
| `tickets/66/matrix-playwright.config.ts` | `30034e9971faa69b2d6104663d41734caf8420a4017c2789b722d0852600659d` |
| `tickets/66/native/native.mjs` | `0cfb3cd18cb835bb3ec847a064977594603a0a75d4ef4ac750feffc15ae88ed9` |
| `tickets/66/native/native-bootstrap-source.mjs` | `c64d7caeb69d5899dc130d1b61733e0f11132381970832c719cb03ec15715e8f` |
| `tickets/66/native/helpers.mjs` | `a006e18f87059dfaa4a13a18204a42109c43f4ae3a979bbc9ade876289e3cec8` |

The native RSS fixture SHA-256 is `b1638031cff8467fa1699d53818887f03f0b63072cbd368a7a2bd6498b102031` (622,701 bytes); it was served only from loopback. Probe file paths omit their common ignored-output prefix `out/wabi-art-implementation-2026-10-24/66/` in the table.

## A1–A7 验收结果

| Gate | Result | Evidence and boundary |
| --- | --- | --- |
| A1 跨页视觉 | 通过 | 亮暗阅读／订阅样本共用行楷展示字、宋体题签和真实日期、纸／炭层次及粗陶拓痕；feed 源身份仍显示为 `橘鸦AI早报`，host 为 `daily.juya.uk`。五维自评与截图路径见下文。 |
| A2 首屏、几何与缩放 | 通过 | 40 主矩阵状态加 12 个真实 CSS 断点边缘状态，共 52 个亮暗／阅读与订阅／视口／缩放组合。最终几何合成口径为：28 个 reader 状态用最后的 reader CSS 重跑；24 个 feed 状态使用其后唯一修改 reader scoped CSS 之前的稳定图像和记录。全部水平溢出为 0，标题与日期／来源保留，mark 非交互。 |
| A3 内容与交互 | 通过 | #64 targeted run 的 32 项是 reader+feed 合并套件，其中包含 #65 单独报告的 15 项 feed 检查；两个计数不可相加成 47 个不同测试。本票隐藏 Electron 另经真实 IPC 读取 10 篇 feed 项和 32 项概览。最终 `npm run verify` 通过 190 项 E2E。 |
| A4 字体与对比度 | 通过，滚动条有像素边界 | 当前候选实测平台字体 4/4 通过。配对 PNG 文字／焦点分析 34 条中 32 条达到阈值、0 条失败；两张滚动条截图没有检测到实色 thumb 像素，故仍标为像素证明未取得。透明 track 上从实际滚动槽截图取样，thumb 计算对比为亮 3.825:1、暗 4.749:1，均超过 3:1。 |
| A5 原生边界 | 通过，限隐藏运行 | 真实 Electron main/preload/IPC 在独立 userData、sessionData 和 crashDumps 路径运行；初始刷新加入 10 篇，真实 preload API 返回 settings/source/article/history。默认与最小窗口、亮暗及 100%／120% 均记录，默认资料目录前后 stat 相同。窗口始终 hidden/unfocused；DOM 焦点不作为 OS 前台焦点证明。 |
| A6 最终门 | 通过 | 冻结 CSS 后先写入 Nocturne 既有 5 张归档，再执行唯一一次 `npm run verify`。574 个 Vitest、190 个 Playwright、Nocturne 70/70 文本与 14/14 UI 对比度检查通过；5 张 PNG 逐字节相同。 |
| A7 证据与认可边界 | 通过记录，用户认可已确认 | 保存原始命令日志、退出码、候选／输入指纹、逐样本 PNG／JSON 和初始失败。用户视觉认可于 2026-10-24 由用户本人明确给出，未由代理或自动测试代签；未测 OS 前台行为也未声称通过。 |

纠正合并后的最终全量门日志：`out/wabi-art-implementation-2026-10-24/tickets/66/npm-run-verify-final-corrective.log`。该日志对应本轮共享字体 helper 和两处调用测试的最终 SHA。此前 `tickets/66/npm-run-verify-final.log` 是 helper 抽取前、同样通过的原始输入记录；不覆盖前一份结果。滚动条对比是从实际渲染后的滚动槽像素取底色，不是拿局部纸色 token 代替；由于 Chromium 截图没有呈现实色 thumb，报告保留这两项为 pixel-unproven，而不是把计算值称为像素命中证明。

## 矩阵、前后样本与失败保留

基线同内容 reader 样本及 #64 原始页面报告在 `out/wabi-art-implementation-2026-10-24/tickets/64/REPORT.md`、`tickets/64/before-images-routed/`；feed 基线与 #65 报告在 `tickets/65/evidence/REPORT.md`、`tickets/65/before/`。旧的 #64／#65 after 样本也保留，但本票最终几何以 #66 当前稳定样本为准。

最终 52 状态证据由这些记录合成：当前 reader 28 状态位于 `tickets/66/reader-date-clearance/main40/` 与 `tickets/66/reader-date-clearance/breakpoints/`；feed 亮色稳定样本位于 `tickets/66/final-settled/main40/` 与 `breakpoints/`，feed 暗色稳定样本位于 `tickets/66/final-settled-v2/main40/` 与 `breakpoints/`。每个状态都留有 JSON 几何和同名 PNG。reader 日期间距修复之后唯一的源码改动是 `.wabi-reading-craft-rubbing` 宽度；因此早一版 feed 稳定记录仍适用于最终 feed。未把第一轮中途入场动画的 feed 截图当作稳定视觉证据。

早期 `tickets/66/matrix-playwright.log` 保留了 52 状态中的 6 个 mark／标题实际包围盒碰撞失败。没有放松矩形断言：订阅页改为局部可用宽度和窄屏布局校准，阅读页将陶拓收窄到日期前；之后按作用域重跑。稳定 feed 的第一次单轮 animation drain 还留下暗色 12 项失败（新增 transition 在下一帧启动）；循环 drain 修正后暗色 12/12 通过，且保存 opacity `1`、transform `none`。日志分别在 `matrix-feed-settled-playwright.log` 与 `matrix-dark-settled-playwright.log`。最终 reader 28 项日志是 `matrix-reader-date-clearance-playwright.log`，28/28 通过。

首次 full-52 截图中的卡片在入场动画帧采样，已由上述稳定 feed 图替换为最终视觉来源；几何数据仍留在 `matrix-final-playwright.log`。早期 contrast 全 vertical Range 矩形给 reader light date 读出 4.163:1，像素落在垂直字符单元空白而非字形；原始结果保留在 `contrast-pixel-analysis.log`。后续按 code point 字形像素分析，此值在间距修改前为 6.536:1，间距修改后最终为 11.128:1；暗色最终为 11.831:1。读字对比最终截图和逐样本颜色记录位于 `contrast-captures-glyph/`，逐像素结果为 `contrast-glyph-pixel-results.json`。

初始 focus 采样序列、字体 repaint 时序和原生脚本 asset-path preflight 失败均保留为各自日志；相应修正后的记录分别是 `contrast-capture-playwright-r2.log`、`platform-fonts-final-playwright.log` 和 `native-run-final-r2.log`。首次原生样本曾将暗色默认页留在 120%；最终 r2 先重置到 100%，再另测 120%。不把这些失败回写成成功。

## 字体、对比度和原生结果

当前候选 CDP 字形审计 `tickets/66/platform-fonts-final-playwright.log` 4/4 通过：reader/feed 两页亮暗显示字实际使用 `STXingkai`；日期／题签／编号使用 `SimSun`；正文与摘要使用 `Noto Sans SC`（拉丁字母可回退至 Segoe UI）；feed host 与卡片标题分别落到 `Noto Serif SC` 及其粗体变体。把首选行楷名故意改成不存在的 face 后，四种情形均回退到 `KaiTi`，文字与矩形仍存在。测试 fixture 没有图注，图注字形和颜色以独立 inline-SVG 图注样本验证。

最终 PNG 配对对比使用 CSS 前景色与同状态“文字透明”背景图，仅统计可见字形像素（逐字符 Range），因此叠加陶拓、纤维和纸底会进入背景采样。普通文字阈值为 4.5:1，大文本为 3:1，焦点为 3:1。最终最低项为 feed light 源名 4.833:1；reader overview focus 为 4.077:1 light／6.358:1 dark，feed card focus 为 3.825:1 light／6.506:1 dark。受控图注为 5.644:1 light／5.677:1 dark。无项低于阈值。实际滚动槽包含透明 track；用截图像素采样该槽背景后，计算 thumb/track 比率为 3.825:1 light、4.749:1 dark，但因截图没有实色 thumb 像素，本票不声称 thumb 的直接栅格命中已证明。

隐藏 native 完整记录：`tickets/66/native/run-2026-10-24T04-55-06-704Z/native-report.json`，原始输出 `tickets/66/native-run-final-r2.log`。Electron 进程清除了 `ELECTRON_RUN_AS_NODE`、`ELECTRON_RENDERER_URL`、`ELECTRON_CLI_ARGS`、`NODE_OPTIONS`；启动 bootstrap 在 real main 前将 `userData`、`sessionData`、`crashDumps` 指向本次独立目录，未额外传入 `--no-sandbox`。两种 scheme 的默认窗口约 1102×722、最小设置 720×480 下实际 bounds 723×482；四个 reader 状态均保留 32 项概览、120% 状态无横向溢出。`window.opia` 的 settingsGet/feedSources/feedList/historyGet 均经真实 preload/main 返回数据。`show` 被抑制 1 次；`showInactive` 和 `focus` 为 0；无截图、无 OS 键鼠、无 OS 前台焦点声称。11 个远程图片请求被测试路由阻止；RSS 仅 loopback，默认资料目录前后统计一致。

off/editorial 负对照在最终 reader-only CSS 校正前，用独立端口 4268 的冻结 renderer 完成：4 个 light/dark × off/editorial 情形、feed+reader 共 8 张图，5/5 Playwright 通过；样本零溢出、零页面错误、稳定动画后状态全空。证据 `tickets/66/negative-controls/REPORT.md`、`hashes.json`。所测 renderer hash 为 HTML `e608e3a6…`、CSS `9d52f398…`、JS `d5d70c27…`。之后的唯一变更是 Wabi reader 自有 CSS selector；据此复用其他样式负对照，不冒称其截图来自最终 CSS bundle。#64／#65 原始报告和证据根路径分别为 `tickets/64/` 和 `tickets/65/`。

Nocturne write pass `tickets/66/nocturne-walkthrough-write.log` 在 full verify 前运行，5 张 PNG 写入前后的 SHA 均未变化，指纹保存在 `nocturne-archive-before.json` 与 `nocturne-archive-after-write.json`。write-mode 输出中仍有一条既有说明文字称 RM 帧与 frozen top 帧不同；该对比没有失败断言，5 个单图写入比对均一致。最终 `npm run verify` 的 `--verify` 再次确认 5 张 PNG 逐字节一致且 RM 断言全 PASS。没有因该信息行改动不相关的 Nocturne 规则或归档。

## 五维设计自评

- **字样：**刊头使用真实平台行楷，失配时回退楷体；日期、题签和原编号用宋体，正文维持无衬线。展示层级在 42px 窄屏下仍高于 16px 正文；宽屏标题没有缩小。
- **刊头：**reader 日期竖排且保留文章真实 `pubDate`；窄屏陶拓缩短后留在标题下方，实际可见颗粒与日期栏分开。feed 保留大标题、真实 host、对应卡片日期，标题和 host 不互压。
- **背景：**亮色为浅和纸与稀疏纸纤维，暗色为炭纸与低频边缘磨损；陶拓边界破碎，有粗粒／密度变化。装饰层 `aria-hidden`、`pointer-events:none`，不占焦点。
- **正文：**正文基线 16px、行高 1.85、左轴一致；32 项概览、原条目编号、文章顺序、图像比例与图注位置由 #64 targeted E2E 和当前全量 E2E 验证。body 保持低饱和，不与刊头争夺主层级。
- **整体：**跨亮暗和两页共享纸／墨／陶拓语汇；真实 source/日期语义可识别，容器无水平溢出。当前 #66 视觉证据为自评，**用户已于 2026-10-24 亲自确认并判定封版**。

## 独立评审

- **规范轴：**`out/wabi-art-implementation-2026-10-24/reviews/standards.md` 未发现硬性规范违反。唯一低风险启发式问题是 reader/feed 测试重复 CDP 字体查询设置；本轮通过 `tests/e2e/platform-fonts.ts` 窄 helper 消除该重复。
- **SPEC 轴：**`out/wabi-art-implementation-2026-10-24/reviews/spec.md` 为 0 项发现。
- **视觉轴：**`out/wabi-art-implementation-2026-10-24/reviews/visual.md` 独立检查 4 张代表帧：reader 亮宽、reader 暗窄 120%、feed 亮宽、feed 暗窄 120%。评审对所见帧报告 0 项新增可操作视觉缺陷；此范围不是人工逐帧检查全部矩阵。
- **纠正后的验证：**新 helper 与 reader/feed 调用点定向 E2E 为 24/24 通过，原始日志 `tickets/66/targeted-font-helper-playwright.log`；随后唯一一次纠正后 `npm run verify` 574 单测、190 E2E、Nocturne 审计和归档比较均通过，见上方最终门日志。
- **用户确认：**以上独立评审都不替用户确认视觉方向；用户已于 2026-10-24 明确给出视觉认可并判定封版。

当前最终几何代表帧：reader light wide `reader-date-clearance/main40/reader-light-1280-100.png`，reader light narrow `reader-date-clearance/main40/reader-light-480-120.png`；窄断点 light `reader-date-clearance/breakpoints/reader-light-641-100.png`。feed 稳定代表帧为 `final-settled/main40/feed-light-1280-100.png` 和 `final-settled-v2/main40/feed-dark-480-120.png`。feed 录屏／PNG 中的卡片封面是确定性几何 SVG，不是实际线上封面内容审美证明。

## 用户故事 1–38 映射

下表按 #63 原始 38 条逐项对应；短描述保留原故事的验收含义，不重新编号或把相邻故事合并。

| # | 验收摘要 | 结果与证据 |
| ---: | --- | --- |
| 1 | 默认首屏有鲜明侘寂日杂身份 | 通过；亮暗 reader/feed 首屏样本与五维自评。 |
| 2 | 特殊字样、刊头、背景形成统一工艺语言 | 通过；52 状态样本、稳定 feed 图和独立四帧评审。 |
| 3 | 强表现集中在刊头页缘，正文仍适合连续阅读 | 通过；16px／1.85 正文记录、当前 reader matrix 与 contrast 输出。 |
| 4 | 展示字有手写墨字性格 | 通过；平台字形审计实际命中 `STXingkai`。 |
| 5 | 栏目名为宋体题签并与展示字区分 | 通过；平台字形审计题签为 `SimSun`，截帧显示角色分工。 |
| 6 | 原始编号呈陶印形态且可读 | 通过；reader E2E、32 项概览 DOM 和最终 reader 图；没有生成新编号。 |
| 7 | 标题、编号、日期等真实信息完整保留 | 通过；reader/feed DOM、native IPC 文章内容及 fallback 用例。 |
| 8 | 大字偏左、日期竖排、拓痕有主次留白 | 通过；final reader wide/narrow 几何、日期间距截图和视觉评审。 |
| 9 | reader 日期来自对应文章真实内容 | 通过；`pubDate`/`datetime` 对照和缺日期用例。 |
| 10 | 缺日期或长标题时自然排版 | 通过；missing-date fallback 与 480px／120% 长标题 E2E。 |
| 11 | 阅读页、订阅页共享同一 Wabi 视觉语言 | 通过；两页亮暗最终样本与独立视觉评审，分别保留各自信息语义。 |
| 12 | feed 刊头标真实源身份，不能以首篇日期代替订阅列表身份 | 通过；feed source 名称／host 与每篇 issue 日期分别记录于 UI、E2E 和 native IPC。 |
| 13 | 亮侧有可见纤维、毛边和叠页关系 | 通过；稳定 light reader/feed 样本和设计自评。 |
| 14 | 暗侧有炭纸、陶印和局部擦痕 | 通过；稳定 dark reader/feed 样本和设计自评。 |
| 15 | 材质按区域分配，正文仍清晰 | 通过；材质截图、32 条文本／焦点像素对比，正文 16px／1.85。 |
| 16 | 纸边、拓痕窄窗仍可辨 | 通过；reader/feed 窄窗／120% 矩阵及真实断点边缘。 |
| 17 | 放大内容后刊头、日期仍完整 | 通过；120% 主矩阵、最小 native bounds 和长标题用例。 |
| 18 | 背景、文字、细笔画和焦点正确分层 | 通过；最终 reader 标题／日期几何、字形像素和焦点像素结果。 |
| 19 | 装饰不拦截点击、选择或滚动 | 通过；装饰 `aria-hidden`、`pointer-events:none`、无焦点后代与交互检查。 |
| 20 | 装饰不重复朗读、不增加焦点，语义顺序保持清楚 | 通过结构证据；装饰 `aria-hidden` 且无焦点后代，标题、日期、编号保留原语义节点；keyboard/focus 用例通过。未做实机屏幕阅读器语音审计。 |
| 21 | 首选字体不可用时展示字仍完整 | 通过；四类 reader/feed 亮暗字形样本均回退 `KaiTi`，文本矩形保留。 |
| 22 | 保留正文字号、行距、段距与稳定轴线 | 通过；#64 纸层 E2E、最终 reader 矩阵。 |
| 23 | 导语、原文块、图片比例与题注顺序不变 | 通过；figure/paper E2E、确定性图片样本、完整 verify。 |
| 24 | 长概览分列，视觉／DOM／Tab 顺序一致 | 通过；合并 reader+feed 32 项 targeted suite 中的 overview 检查及 native 32 项 DOM 计数。 |
| 25 | grid、compact、magazine 和用户列数设置仍有效 | 通过；#65 单独的 15 项 feed 记录以及 full verify；该 15 项是 #64 合并 32 项中的 feed 子集，不重复相加。 |
| 26 | 日期、封面、摘要、来源遵循原字段语义 | 通过；feed layout/fields 用例，未改共享字段门控。 |
| 27 | 空列表、单篇、无封面、缺编号自然成版 | 通过；reader/feed fallback、布局和 figure 边界用例。 |
| 28 | 键盘操作可达且焦点可见 | 通过；reader overview link/feed card 焦点像素均超过 3:1；不据隐藏 native 声称 OS 焦点。 |
| 29 | 打开、已读、收藏和文字外链分流保持 | 通过；共享 store/IPC 未改，合并 targeted 测试和 190 项全量 E2E 通过。 |
| 30 | 图片维持当前行为，不新增放大或灯箱入口 | 通过；reader figure E2E，模板 diff 无新增图片操作。 |
| 31 | reduced-motion 下材质与构图静态成立 | 通过；#65 reduced-motion 样本、稳定动画矩阵和 full verify。 |
| 32 | 新背景上的文字、印章、焦点、滚动条达到对比度门槛 | 通过但有边界；32 条文本／焦点栅格像素项通过；scrollbar thumb 两项无实色像素，保留 A4 的计算／像素区分。 |
| 33 | 通用路径、其他风格、全局界面和 Mini 不受影响 | 通过；off/editorial 负对照 4 组合；最终 reader 修改为 Wabi reader scoped CSS。Native Mini 未单独复测。 |
| 34 | 用户先看真实内容的亮暗首屏与窄窗样本 | 通过；before/after 组合和当前最终代表帧均留档。 |
| 35 | 前后使用同一真实内容比较 | 通过；同一 fixture SHA `e0e241…`、确定性 SVG 和逐样本 JSON。 |
| 36 | 独立视觉评审分别判断字样、刊头和材质 | 通过，代表帧范围有限；root 独立检查 4 帧并报告 0 项新增视觉缺陷，不冒称逐帧人工看完 52 矩阵。 |
| 37 | 分开记录实现、功能验证、独立评审和用户认可 | 通过；本报告分栏；用户视觉认可仍为 pending。 |
| 38 | 允许在 Wabi 专属区域充分校准设计 | 通过；保持修改局部于 Wabi CSS，未改共享解析或全局默认。 |

## 结论与边界

- 实现：完成；产品修改集中在 Wabi 专用 CSS。
- 功能验证：refactor 定向 E2E 24/24；最终 `npm run verify` 574 Vitest、190 E2E、70/70 text contrast、14/14 UI contrast 和 5/5 archive byte comparisons 均通过；此前隐藏 native、矩阵和像素记录按原范围复用。
- 独立 review：规范轴无硬性违反、SPEC 轴 0 项发现、代表帧视觉评审完成；review paths 与逐轴结果见上方。
- 用户视觉认可：**已确认（2026-10-24，用户明示「当前wabi可判定封版」）。**
- 本票没有检查物理屏幕前台焦点、显示帧率、线上真实封面审美或发布环境。滚动条保留 2 项 thumb 直接像素未证明；其他计算与截图范围按 A4 说明。
