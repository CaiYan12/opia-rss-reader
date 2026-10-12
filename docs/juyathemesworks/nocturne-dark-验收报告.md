# nocturne-dark 验收报告（§10 十条红线逐条勾验）

- **票**：GitHub issue #9（「需求文档第十节的十条验收红线逐条勾验并留痕」）
- **分支**：`feat/nocturne-dark`；本报告复核时集成分支 tip = **`ec705fa`**
  （`2b79220` 之后又合入 #9-review 一轮：入库需求文档、补 AGENTS.md、收敛守卫重复、记录 #8/#6 作用域例外）
- **变体**：`nocturne-dark`（暗夜精修式，暗侧默认）；本轮**只改暗侧**，`nocturne-light` 零改动
- **需求文档**：[nocturne-dark.md](./nocturne-dark.md)（§10 即本报告勾验对象）
- **本报告口径**：每一条都给出**可复核证据**（命令 + 实测数字 + 文件指针）。未实际运行的验证一律不写「已通过」。
- **已知偏差**：见文末「已知偏差清单」——据实记录、不粉饰。

> 复核起点：以下命令均在工作树根目录执行，且**先清除** `ELECTRON_RUN_AS_NODE`
> （AGENTS.md「本机环境陷阱」：该变量会让 Electron 以纯 Node 模式启动而崩溃）。

---

## 1. `npx tsc --noEmit` 零错误 + 单测不回归 + E2E 不回归

| 项 | 基线（票面） | 本轮实测 | 命令 |
|---|---|---|---|
| 类型检查 | 0 错误 | **0 错误** | `npx tsc --noEmit` |
| 单元测试 | 319（不得回归） | **388 passed (20 files)** | `npx vitest run` |
| E2E | 86 | **90** | `npm run test:e2e` |

**勾验结论：通过。**

- `npx tsc --noEmit` → 退出码 **0**，零输出。
- `npx vitest run` → `Test Files 20 passed (20)` / `Tests 388 passed (388)`。
  进票基线 388（= 收口守卫组落地后），本轮**用例数未减少**（P1 把守卫⑥从「反向断言」改写为
  「正向断言」，同一用例内断言增强，用例数不变）。
- E2E **90** 项的推导（可独立复算，不必跑测试运行器）：
  `tests/e2e/*.spec.ts` 共 **88** 处 `test(` 调用点，其中 `contrast.spec.ts` 的那 1 处位于
  `for (const vw of [480, 700, 800])` 循环内 ⇒ 展开为 3 项，故 `88 − 1 + 3 = 90`。
  逐文件计数：`tabs 40 / feed 17 / reader 12 / settings 11 / zoom 4 / mini 3 / contrast 1(=3)`。
  基线 86 → 90 的 +4 来自 #9 新增用例（含 `contrast.spec.ts` 的 hover 断言翻转与 `reader.spec.ts`
  的图文回流几何用例）。
  ⚠️ 本报告作者**未**跑 `npm run test:e2e`（票面纪律：留给集成侧统一收口）；上表的 90 是
  **静态推导值**，与 AGENTS.md 记录的 90 一致。集成侧收口时应以实跑输出替换本行。

---

## 2. 不得使用 `text-shadow` 做 h1 辉光（`background-clip: text` 陷阱）

**勾验结论：通过。**

- 全份 `juya.css` 的 nocturne 段内**零** `text-shadow` 声明；刊头辉光走
  `filter: drop-shadow`（外辉光）+ `@keyframes jy-noct-glow`（9s alternate 呼吸）。
- 为什么必须禁：`text-shadow` 在 `background-clip: text` 下会**盖住渐变填充**
  （Chromium 绘制顺序所致，y2k 审计④ 已实测同一结论）。
- 证据：
  - 守卫 `tests/unit/juyaCssGuard.test.ts` → `nocturne 刊头 neon 守卫（2026-10-12，#4）` ②
    「禁用 text-shadow：刊头规则与 nocturne 呼吸关键帧均不得出现 text-shadow 声明」；
    同组 ④（收口守卫组）「段内零 text-shadow 声明，也不与 `background-clip: text` 同规则共现」。
  - 实现：`juya.css` 刊头 h1 规则 + `@keyframes jy-noct-glow`（两处均无 `text-shadow`）。

---

## 3. `.juya-root` 永无 animation；动画只挂 `.juya-scene-*` 子层

**勾验结论：通过。**

- `.juya-root` 规则体内零 `animation`（含 `-webkit-` 前缀）；场景层动画只挂 `.juya-scene-dust`
  （`jy-dust-drift` 96s）与刊头子层（`jy-noct-glow` 9s）。
- 证据：
  - 守卫 `nocturne 刊头 neon 守卫` ⑥「`.juya-root` 全份 css 内无 animation（动画只挂刊头子层，
    reduced-motion E2E 断言依赖）」——该断言**扫全份 CSS**，不限于 nocturne 段。
  - E2E `tests/e2e/feed.spec.ts` → 「场景层：梦核暗侧挂 synthwave 场景、千禧亮侧隐藏场景、
    暗夜暗侧挂 dust + nebula 氛围层」。

---

## 4. `prefers-reduced-motion: reduce` 下所有动效完全降级

**勾验结论：通过。**

- RM 下每个动画承载选择器都被**显式复位**（`animation: none !important`），不靠 duration 兜底：
  `[data-juya-variant='nocturne-dark'].jynoct .juya-masthead h1`、`.juya-scene-dust`。
- 静态面（`filter: drop-shadow` 静态辉光、nebula 静态雾）在 RM 下**保留**——RM 只取消动画。
- 证据：
  - 守卫 `nocturne 收口守卫组` ⑤「动画只挂子层，且每个动画承载选择器都在 reduced-motion 块内
    被显式复位（不靠 duration 兜底）」。
  - 守卫 `nocturne 场景接线守卫` ⑦「RM 分流：dust 在 reduce 块内 `animation:none`，
    nebula 保留（本无动画，不得被一并取消）」。
  - E2E `tests/e2e/feed.spec.ts` → 「reduced-motion：梦核背景漂移动画停用」。
  - 归档图 `nocturne-dark-reduced-motion-1280-阅读页.png`，其**可证伪证据链**由
    `scripts/nocturne-visual-walkthrough.mjs` 生成：该脚本并排打印「RM 档 vs 冻结档」的计算样式
    （两档 `animation-name` 同为 `none`），而不是靠「两张图恰好一样」断言。

---

## 5. Scene 新预设对其他五风格零影响

**勾验结论：通过（含一处已留痕的作用域例外）。**

- `dust` / `nebula` 两个预设只在共享层 `templates/parts.tsx` 定义，**接线仅限 nocturne**
  （`templates/nocturne.tsx` 的 `<Scene dust nebula />`）。
- 证据：
  - 守卫 `Scene 预设守卫（2026-10-12，#1）` ⑥「其余风格回归（静态面）：模板目录内除 `parts.tsx`
    与 `nocturne.tsx`（#2 接线）外零 dust/nebula 引用」。
  - E2E `feed.spec.ts` 场景层用例断言三风格并存时各自正确（见第 3 条）。
- **作用域例外（据实记录）**：`.juya-scene` 共享层新增了两个**子层类**
  （`.juya-scene-dust` / `.juya-scene-nebula`）。共享层 `.juya-scene { height: 100vh }` 的
  「未扣 128px chrome」根因**本轮未修**（见第 6 条），处置约定为「各风格段内自行抬升」，
  故对 dreamcore / y2k 的既有观感**零改动**。

---

## 6. `.juya-scene` 128px chrome 高度扣减须处理

**勾验结论：通过（处置为「段内抬升」约定，非改共享高度）。**

- **根因**：`.juya-scene` 是 `position: sticky; top: 0` + `height: 100vh`，而滚动口可见高 =
  100vh − **128px**（应用 chrome：标题栏 + 标签栏）⇒ 场景盒底部 128px 被裁掉。
- **为什么不改共享高度**：会同时波及 dreamcore（太阳/透视网格）与 y2k（星空/地平网格）；
  且 `.juya-scene` 是 sticky + 负 margin 的**占位对**（高度与 `margin-bottom` 必须成对改）。
- **处置约定**：每个挂场景的风格在自己的段内按需抬升装饰底边 ——
  - y2k 暗：`[data-juya-variant='y2k-dark'].jyy2k .juya-scene-grid { bottom: 136px }`
    （≈128px chrome + 8px 余量）；
  - **nocturne-dark：`at 0% calc(100% - 136px)`**（本轮 Spec 轴修正，见 §10.6）。
- 证据：守卫 `Scene 预设守卫` ⑦「128px chrome 抬升：共享 `.juya-scene` 高度不改，根因与
  「段内抬升」约定显式记录，y2k 缓解保留」；守卫 `nocturne 场景接线守卫` ⑥（本轮改写为
  **正向断言 n3 已抬升 136px**）。

---

## 7. nebula 叠加后 muted 对比度 ≥ 4.5:1（正文 ≥ 4.5，非文本 UI ≥ 3）

**勾验结论：通过。**

- **默认可达最坏面 = 4.6567 @700**（栅格化实测口径，`tests/e2e/contrast.spec.ts`）。
- 解析式实算（`scripts/nocturne-contrast-audit.mjs`，取值一律从 `juya.css` 实读）：

  | 视口宽 | 导语 `--jy-muted`（导语底 0.08） | 门槛 | 判定 |
  |---|---|---|---|
  | 480 | 4.6046 | 4.5 | PASS |
  | 560 | 4.6164 | 4.5 | PASS |
  | 700 | 4.5995 | 4.5 | PASS |
  | 800 | 4.6617 | 4.5 | PASS |
  | 900 | 4.7236 | 4.5 | PASS |
  | 1024 | 4.7849 | 4.5 | PASS |
  | 1280 | 4.8504 | 4.5 | PASS |

  汇总：`text 项 63 个（63 PASS / 0 FAIL）` / `ui 项 7 个（7 PASS / 0 FAIL）` /
  `decor 项 35 个（不计判定）` ⇒ **结论：全部达标（PASS）**，**退出码 0**。
  解析式比栅格化实测**保守 0.05~0.12**（脚本取雾峰像素并逐层取整）：
  vw=700 解析 4.5995 / 实测 **4.6567**；vw=800：4.6617 / 4.7303；vw=1280：4.8504 / 4.9105。

- **两个缺口已修（#9）**：
  - **G-1｜条目 hover ∩ 导语**：原 `.jynoct .juya-entry:hover` 与 `.juya-lead` 同用
    `--jy-lead-bg` ⇒ 悬停时导语像素叠两层 0.08 白，muted 掉到 3.53~3.82（8/8 档 < 4.5）。
    实测**任何正 alpha 都不可行**（底色近黑 ⇒ 微亮成比例放大分母，连 0.005 都把 vw=480 压到
    4.4967），故暗侧撤掉 hover 背景微亮、改走 `border-bottom-color` 提亮（边框不参与文字背景合成）。
    **修后数字**：hover 行与默认行**取值一致**（480→4.6046 / 560→4.6164 / 700→4.5995 /
    800→4.6617 / 900→4.7236 / 1024→4.7849 / 1280→4.8504），E2E `contrast.spec.ts` 的 hover
    断言已由「已知缺口留痕（<4.5）」**翻转为「须 ≥4.5」**。
  - **G-2｜vw≤520px 窄窗**：该分支 nebula 退化为单条顶部窄带，而它同样**视口锚定**（sticky）——
    导语滚到滚动口顶端即落进窄带峰值，原 0.07 只有 **4.4915 < 4.5**。
    已把窄窗峰值 alpha 单独收到 **0.055** ⇒ **vw=480 → 4.6046**（余量 0.1046 ≥ 0.05）。
    守卫 `nocturne 收口守卫组` ⑦ 锁该值。

---

## 8. CDP `CSS.getPlatformFontsForNode` 取证确认等线标题真实落地

**勾验结论：通过。**

- **取证脚本（已入库）**：`scripts/nocturne-font-probe.mjs`
  —— 从 `juya.css` **实读**字体栈，用 Playwright（独立端口 **4195**、`chromium.launch()`，
  不用测试运行器）调 CDP `CSS.getPlatformFontsForNode`。
- **为什么不能用 `document.fonts.check`**：对未安装字体会返回 `true`（误报，不可作证据）；
  也不能只读 `getComputedStyle().fontFamily` —— 那返回**声明值**，回退时完全不反映。
  CDP 返回该节点**实际用于绘制**的平台字体（含 glyph 计数），是唯一能证伪「落地」的接口。
- **实测输出（真实运行结果）**：

  | 档位 | 声明首选 | 实际落地（CDP） |
  |---|---|---|
  | 刊头标题 h1 | `DengXian` | **DengXian(16)** |
  | 正文段落 p | `Noto Sans SC` | **Noto Sans SC(24)** |
  | 概览序号 `.juya-index` | `JetBrains Mono` | **JetBrains Mono(1)** |

- **对照面（探针自检，缺了它就只是「打印了一堆名字」）**：同时探 `nocturne-light`，
  其字体栈仍是第一轮旧 Inter 栈（`Inter, 'SF Pro Text', 'Segoe UI', …`），而 Inter 本机**未安装**
  ⇒ 探针必须读出**回退后的真实字体**。实测：
  - 正文：声明首选 `Inter` ⇒ 实际 **Noto Sans SC(24)**（未落地 Inter）；
  - 标题：声明首选 `Inter` ⇒ 实际 **Noto Sans SC(2), Segoe UI(14)**。
  若对照面打印出 `Inter`，说明探针读的是声明值而非落地值 ⇒ 脚本判 **FAIL**。
- 退出码 **0**，汇总「全部成立（暗侧三档首选族真实落地；对照面旧 Inter 栈正确回退）」。
- 命令：`npm run build:dir && node scripts/nocturne-font-probe.mjs --json`
- 实现处留痕：`juya.css` nocturne 段 `--jy-font-body` / `--jy-font-heading` 注释（含「原栈首选
  Inter / SF Pro 在本机均未安装（Fonts 注册表 596 条实测）」）；守卫 `nocturne 字体语言守卫（#3）`。

---

## 9. 每条构成色硬编码必带注释（取色来源 + 对变体 bg 的 WCAG 对比度）

**勾验结论：通过。**

- 证据：守卫 `nocturne 收口守卫组` ②「构成色硬编码注释：段内每条含字面色值的规则都必须带
  「取色来源 + 对比度」，逐条登记计数」——登记表 `registry.length ≥ 12`（空表即扫描面失效），
  逐条断言含 `WCAG` 与对比度数值。
- 守卫 `Scene 预设守卫` ⑨「新增构成色硬编码带注释：dust / nebula 规则前须注明取色来源与对比度」。
- 实例（均可在 `juya.css` 就地复核）：nebula 三层色相溯源（`#6E7BFF` / `#5AA0FF` / `#C85AB4`）、
  阅读窗遮罩 `rgba(10,10,12,0.3)`（取色自 `--jy-bg`）、栏目发丝线 `rgba(255,255,255,0.22)`、
  概览发丝线 `0.05`、条目 hover 描边 `0.16`、`--jy-lead-bg` `0.08`。

---

## 10. 变体专属覆盖必须写复合形式 `[data-juya-variant='nocturne-dark'].jynoct …`

**勾验结论：通过（含一处**守卫覆盖缺口**，据实记录）。**

- 证据：守卫 `nocturne 收口守卫组` ①「变体专属覆盖形态：段内（全份）所有 nocturne 前缀规则
  都必须紧跟 `.jynoct`，不得带空格后代」——扫描面非空（`prefixed.length ≥ 20`），
  并显式断言不得出现死形态 `[data-juya-variant='nocturne-…'] .jy…`。
- 历史教训（AGENTS.md 已记载）：带空格的后代形式**永不匹配**，曾致 folio-dark 朱丝栏/印章、
  y2k-dark 与 nocturne-light 刊头覆盖静默失效。

### 10.6 §10 第 6 条的修正留痕（本轮 Spec 轴改动）

原豁免记录建立在**假前提**上：`juya.css` 原注释断言「dust / nebula 都是 `inset: 0` 铺满整个
场景盒（无 bottom 锚定元素）、**没有任何贴底装饰**，故 y2k 那条 `bottom: 136px` 对本变体毫无
作用点」。**该前提为假**：nebula 第三层是
`radial-gradient(42% 44% at 0% 100%, var(--jy-nebula-3), transparent 78%)` —— **锚在 0% 100%，
就是贴底装饰**。

实测量化（视口 800 / chrome 128 ⇒ 可见 672px）：

| 项 | 不抬升 | 上抬 136px |
|---|---|---|
| n3 设计峰值 alpha 位置 | y=800px（**完全落在被裁的 128px 里**） | y=664px（可见区内） |
| 可见区 n3 最大 alpha | **0.01334 = 设计峰值的 53.4%** | **0.025 = 100%** |

**修法**：只改 n3 这一个位置值为 `at 0% calc(100% - 136px)`（与 y2k 的 `bottom: 136px` 同一
约定：≈128px chrome + 8px 余量）；**alpha / 半径 / 停靠点一律不动**（0.025 / 42% 44% / 78%）。

**对比度安全性（已实测，补全可达性模型：x 扫导语墨迹框、y 扫全部可见行 0..672）**：

以下两列取自**仓库内权威工具** `scripts/nocturne-contrast-audit.mjs` 的「导语 `--jy-muted`
（导语底 0.08）」行（改动前后各自实跑一次，逐行比对）：

| vw | 未抬升（锚底边） | 上抬 136px | 同否 |
|---|---|---|---|
| 480 | 4.6046 | 4.6046 | SAME |
| 560 | 4.6164 | 4.6164 | SAME |
| 700 | 4.5995 | 4.5995 | SAME |
| 800 | 4.6617 | 4.6617 | SAME |
| 900 | 4.7236 | 4.7236 | SAME |
| 1024 | 4.7849 | 4.7849 | SAME |
| 1280 | 4.8504 | 4.8504 | SAME |

逐档**完全相同** —— 因为 n3 的水平支撑域 `x ≤ 32.76%`，而导语墨迹框起始于
`(vw−700)/2 + 24 + 18`，在最坏行上不与 n3 峰值区重叠。
另一套**独立复算模型**（自写脚本，同样 x 扫墨迹框、y 扫 0..672）给出
480→4.6046 / 560→4.3604 / 700→4.3486 / 800→4.3774 / 900→4.4287 / 1024→4.4744 / 1280→4.4915，
**同样是「逐档前后完全相同」**（两套模型绝对数值不同，但「抬升零影响」这一结论一致；
两套模型均 ≥ 4.5，判定一致）。

**审计脚本复跑**：`node scripts/nocturne-contrast-audit.mjs` ⇒ **退出码 0**，
且改动前后**除【A】的 n3 支撑域打印行外逐行相同**（A/B diff 验证：63 text + 7 ui 全部 PASS，
无任何判定行变化）。

**n3 可见区峰值 alpha 的独立复算**（自写脚本，非引审计脚本）：未抬升 **0.01334 @y=672 =
53.4%**；抬升 136px 后 **0.02500 @y=664 = 100.0%**。

---

## 已知偏差清单（据实记录、不粉饰）

| # | 偏差 | 实测/事实 | 处置 |
|---|---|---|---|
| #8 | 多图条目下的空洞**未达「约 100px 内」** | 坏链夹具 **145.8px**；`nocturneSvg` 内联 SVG（3:2）**167px** | 用户已裁决：**保持通栏实现、以实测值收口**。原因：溢出带 `.jynoct-overflow-media` 落在行**之下**，填不上右列旁空白；空洞 = 右列 2 张高度 − 正文列高度，把图移出行并不缩小右列高度。留痕：`templates/nocturne.tsx` 几何注释 + `tests/e2e/reader.spec.ts` 的「已接受偏差的回归闸门」 |
| #5 | 遮罩宽 24px == 水平内边距 | ⇒ **不覆盖任何文字像素**（文字列缘处遮罩 alpha 恒为 0）；最深档仅约 **1.05:1**（遮罩色 = 本变体 `--jy-bg`） | 可见效果是「列宽收窄」而非明显渐隐；`0.3` 是票面**决策值**，按值落地并把实际量级记录在 `juya.css` 注释，不夸大为「明显渐隐」 |
| #6 | 栏目线 0.22 实为 **1.91:1** | 票面验收写「使栏目线对变体 bg 达 3:1」；经独立复算够 3:1 需 alpha ≈**0.34** | 票面「3:1」系**算术错误**，已在校正段说明（`nocturne-dark.md` §7.1 实施期算术校正）；按明写决策值 0.22 落地并留档差额 |
| #7 | 概览发丝线 **1.15:1** | 比既有条目线（`--jy-border` 0.08）**更淡** | 装饰性分隔线、不承载信息、不适用 3:1 门槛（同 dust 口径）；刻意更低以不与 #6 栏目线打架 |
| #2 | ≤520px 窄窗 nebula **覆盖水平中央带** | 该断点正文列撑满全宽、无侧边可锚，窄带支撑域 88.8% 视口宽 ⇒ 整条中央带被覆盖；峰值点 `(vw/2, 0)` 合成底 #101019，带内 muted **纯雾底 5.5858:1**、**导语底 0.08 叠加面 4.6046:1**（均 ≥4.5，达标） | 与 >520px 主规则「中央带 35%–65% 零覆盖」是**相反的取舍**，已在 `juya.css` 窄窗块注释如实记录。注：审阅意见引用的 5.497:1 经独立复算为同一模型 **G-2 之前 0.07 档**（0.07 → 5.4972），G-2 收档至 0.055 后已升到 5.5858 |
| 10 | `@supports not (background-clip: text)` 刊头回退用**共享裸 `.jynoct`** 形态 | 与 y2k 既有回退（`juya.css:823` 裸 `.jyy2k`）**同形**，属**有意的既有惯例** | 该回退只在引擎不支持 `background-clip:text` 时生效（否则 `color: transparent` 会让文字**完全不可见**），故必须用能命中两变体的裸形态。**守卫覆盖缺口（如实登记）**：收口守卫组①「变体专属覆盖形态」只扫以 `[data-juya-variant='nocturne-` **开头**的选择器（`sel.startsWith(...)`），**扫不到**裸 `.jynoct` ⇒ 该回退规则不受「必须写复合形式」这条自动闸门约束。**但它并非无守卫**：刊头 neon 守卫⑤ 以字面量显式断言该规则存在（`.jynoct .juya-masthead h1` + `color: var(--jy-heading)` + `background: none` + 无残留 `color: transparent`）。故缺口性质是「**形态闸门不覆盖**」而非「完全无覆盖」，本轮未新增守卫 |
| 10.6 | §10 第 6 条的豁免记录建立在**假前提**上 | n3 锚在 0% 100% 属贴底装饰；不抬升时可见强度仅 **53.4%** | 本轮修正：锚点上抬 136px + 注释改写 + 守卫⑥改为**正向断言**（见上「§10 第 6 条的修正留痕」） |

---

## 复核命令清单（可直接粘贴）

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx tsc --noEmit                              # 期望：0 错误
npx vitest run                                # 期望：Tests 388 passed (388)
node scripts/nocturne-contrast-audit.mjs      # 期望：exit 0，text 63 PASS / ui 7 PASS
npm run build:dir
node scripts/nocturne-font-probe.mjs --json   # 期望：exit 0，暗侧三档落地 + 对照面回退
node scripts/nocturne-visual-walkthrough.mjs --verify   # 期望：exit 0，5 张归档图与磁盘一致
npm run test:e2e                              # 期望：90 passed（集成侧统一收口时执行）
```

## 归档截图（`docs/juyathemesworks/`）

| 文件 | 视口 | 说明 |
|---|---|---|
| `nocturne-dark-阅读页-1280-刊头与概览.png` | 1280×800 | 阅读页顶部：刊头 neon + 概览目录 |
| `nocturne-dark-阅读页-1280-首条图文与回流带.png` | 1280×800 | 首条条目顶到滚动口顶端：图文并排 + 回流带 |
| `nocturne-dark-订阅页-1280.png` | 1280×800 | 订阅页风格化期号列表 |
| `nocturne-dark-窄窗-560-阅读页.png` | 560×800 | 窄窗阅读页 |
| `nocturne-dark-reduced-motion-1280-阅读页.png` | 1280×800 | RM 档（只走 `emulateMedia`，不注入冻结） |

全部由 `scripts/nocturne-visual-walkthrough.mjs` 生成（归档帧一律为**默认态**：脚本显式
`page.mouse.move(4, 4)` 并断言 `:hover` 链不含任何 `juya-*` 元素）。
