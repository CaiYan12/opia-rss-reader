# AGENTS.md — opia-rss-reader

面向 AI 编码代理的项目约定。修改代码前必读。

## 项目概述

Windows 桌面 RSS 阅读器（Electron + React + TypeScript），默认订阅源 `https://daily.juya.uk/rss.xml`。单窗口多标签 UI（无边框自绘标题栏 + 常驻标签栏），标签会话可持久化恢复。主进程负责网络与持久化，渲染进程纯展示，插件机制面向后续扩展。

## 架构约束（不得违反）

1. **单向数据流**：渲染进程**禁止**直接发起网络请求或访问文件系统；一切数据经 IPC（契约见 `src/shared/ipc-contract.ts`）。
2. **跨进程类型**：主/渲染共用的类型只能放 `src/shared/`（types.ts / ipc-contract.ts / plugin-api.ts），新增 IPC 通道必须三处同步：契约常量 → preload 暴露 → main handler 注册。
3. **最小变更**：不重构无关代码；workaround 与 fix 必须在注释/提交信息中区分。
4. **内置功能走插件接口**：新增订阅源解析能力时优先实现 `FeedProvider`（`src/shared/plugin-api.ts`），而不是硬编码进 FeedService。
5. **主进程 timer 与窗口解耦**：自动刷新定时器在 FeedService，不得依赖窗口/Mini 模式状态。
6. **标签页模型与窗口控制**：标签页（`Tab` 联合类型）状态全部在 `src/renderer/stores/useAppStore.ts`；窗口控制（最小化/最大化/关闭/Mini 切换）一律经 IPC 由主进程 `src/main/window.ts` 执行，渲染层不得直接操作窗口；UI 样式只用主题 token（tailwind.config 映射的 CSS 变量），禁止内嵌硬编码颜色/样式值。

## 版本钉死（有原因的，勿升级）

| 依赖 | 约束 | 原因 |
|---|---|---|
| vite | `^7` | electron-vite@5 peer 只接受 vite ^5/6/7，vite 8 会 ERESOLVE |
| @vitejs/plugin-react | `^5` | 配合 vite ^7 |
| tailwindcss | `^3` | 主题走 CSS 变量 + tailwind.config 映射，未迁移 v4 |
| electron-store | `^8` | v10+ 为纯 ESM，与主进程 CJS 产物（externalizeDepsPlugin）不兼容 |

## 本机环境陷阱（Windows，用户机器实测）

- **`ELECTRON_RUN_AS_NODE=1` 存在于用户环境**：Electron 会以纯 Node 模式启动而崩溃。任何运行/调试前必须清除该变量（bash: `unset ELECTRON_RUN_AS_NODE`；PS: `Remove-Item Env:ELECTRON_RUN_AS_NODE`）。`start.bat` / `build.ps1` 已内置处理。
- **`NODE_TLS_REJECT_UNAUTHORIZED=0` 同样在环境中**：npm/electron-builder 会有安全警告，属用户既有配置，不要在项目中复现该设置。
- Electron 二进制偶发未下载（报 "Electron uninstall"）：`node node_modules/electron/install.js` 修复。
- **构建前必须杀掉正在运行的应用实例**，否则 electron-builder 因 `build/win-unpacked` 文件占用失败。杀进程用 PowerShell `Stop-Process`（进程名含空格时 Git Bash 的 taskkill 不可靠）。
- **`npm run build` / `build.ps1` 不在 IDE 内执行（用户决策，2026-08-28）**：IDE 的 AI 扩展会扫描锁定 `build/*.asar`，electron-builder 在 packaging 阶段报 `EBUSY: unlink build\win-unpacked\resources\app.asar`（Electron 社区已知问题，杀应用进程/重试均无效）。构建一律由用户在 IDE 外终端执行（`build.bat` 或 `powershell -File build.ps1 -Run`）；代理只交付构建指令与验收清单，不代跑。
- 应用已加单实例锁；测试多开行为时第二实例会自动退出属预期。
- **build.ps1 含中文注释，必须保持 UTF-8 with BOM**：`powershell.exe`（5.1）对无 BOM 文件按 GBK 误读中文注释导致语法损坏（`Unexpected token '}'`）；pwsh 7 无此问题，验证脚本须用 `powershell -File build.ps1` 实测。
- electron-builder 下载 Electron zip 偶发 TLS 断连（CN 网络）：命令级设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 重试即可，勿写入项目配置。
- build.ps1 已自动化发行：构建前清理 build/release 全部旧产物，构建后自动在 `release/` 生成三形态（`{name}-{ver}-win32-x64\` 解包目录 + `.zip` + `-portable.exe`），命名跟随 electron-builder 产物规则。

## 常用命令

```bash
npm run dev          # 开发（需先清 ELECTRON_RUN_AS_NODE）
npx tsc --noEmit     # 类型检查（提交前必过）
npm run build        # electron-vite build + electron-builder → build/*.exe
powershell -File build.ps1 -Run   # 构建并启动
```

## 验证标准

- 代码改动后：`npx tsc --noEmit` 零错误 + `npm run build` 成功。
- 主进程逻辑改动：运行产物并检查主进程日志（如 `[main] initial refresh, added=N`、`[PluginManager] loaded ...`）。
- 不得声称未实际运行的验证已通过。

## RSS 源事实（已验证，勿重新臆测）

- RSS 2.0，item 含 `description`（纯文本摘要）与 `content:encoded`（含图全文 HTML）
- 无 item 级封面字段；封面从 `content:encoded` 提取（文件名含 `cover_` 的 img 优先，见 `RssProvider.extractCover`）
- 每日一期，北京时间约 09:20–10:10 更新

## 界面架构事实（v0.1.0 标签化重构后）

- **TitleBar**：无边框自绘标题栏（logo + 拖拽区 + 收藏过滤/刷新/Mini/设置 + 最小化/最大化/关闭）。菜单已置空（默认菜单的 Ctrl+W 会抢标签快捷键），dev 用 F12 开 DevTools。
- **TabStrip**：常驻标签栏。主页标签内置订阅源切换下拉（关闭按钮左侧，「＋」紧跟最后一个标签，Chrome 式）；下拉菜单用 `position: fixed`（规避滚动容器 `overflow-x-auto` 裁剪）；中键关闭标签。
- **标签拖动排序（2026-08-28）**：全部标签（含主页，允许多主页）可在标签栏内自由排序，仅窗口内、无拖出/跨窗口。Pointer Events：主键按下超 5px 阈值进入拖动态（关闭/源切换按钮 onPointerDown stopPropagation 排除）；被拖标签 absolute 浮起跟随指针，原槽位保留透明占位，跨过的标签用 transform 平滑让位；插入位置由让位动画直观呈现，插入竖线（`.tab-drop-indicator`）已注释但保留 insertion 状态供释放提交计算；拖动期间当前激活标签淡化（`data-drag-active-target`）；释放时 moveTab 一次提交（不改变 activeTabId），pointercancel/Escape/失焦取消不提交；拖动开始关闭源菜单。拖动态只存 TabStrip 局部 state，最终顺序经 moveTab 提交 store（避免拖动中频繁触发 sessionSave 写盘）。内容 keep-alive 面板按稳定 DOM 顺序渲染（`getStableTabOrder`），避免视觉标签重排移动活动页面。reorderTab 无效 ID/相同位置返回原数组引用（调用方可据此跳过提交）。标签事件挂整卡 div（修复上下留白不可点/拖），`cursor-pointer`；标签左右及加号前低对比分隔线（`.tab-item::before/::after` 同像素重叠）。
- **标签生命周期动效（2026-08-28）**：新建标签经 `@starting-style` 从左侧展开，关闭标签由 App 统一延迟 180ms 后提交 store，标签从左侧收束；关闭按钮、中键和关闭快捷键共用该入口，关闭最后一个标签在退场后才调用 `windowClose`。关闭紧邻「＋」的末位标签时，「＋」以 FLIP 式 `transform` 同步向左移动，并在真实移除后无过渡重基准，避免 flex 重排跳变。`prefers-reduced-motion: reduce` 下跳过等待与位移动效。
- **标签弹性宽度（2026-08-28）**：标签 `flex-1 min-w-[140px] max-w-[260px]` 等宽弹性分配（少标签铺满可用空间但不超过 260px，多标签收缩到 140px 后容器 `overflow-x-auto` 横向滚动）；「＋」`shrink-0` 紧跟最后标签。像素值为建议初值，真机验收标定。新建/激活标签自动滚动到可见（`scrollIntoView`）、关闭后 clamp `scrollLeft`。
- **标签数量上限（2026-08-28）**：单一总上限 `MAX_TABS = 20`，覆盖所有标签类型与所有创建入口（守卫集中在 `useAppStore` 的 `openHomeTab`/`openReaderTab`/`openBrowserTab`/`openSettingsTab`，非只限「＋」）；`openSettingsTab` 单例复用（已存在 settings 标签则激活，不占额度）；恢复会话时 `truncateSavedSession(saved, MAX_TABS)` 截断（旧会话超限静默丢弃超出部分，`SavedSession` 契约不变）。超限拒绝创建并弹全局 toast「标签已达上限（20）」（`useToastStore` + `Toast.tsx`，`role="status" aria-live="polite"`，2.4s，连续触发不堆叠）。
- **HomeView**：主页标签内容（订阅文章列表或 BlankPage 空页面引导页）；源切换入口在主页标签的下拉按钮，**没有**单独的订阅源标签行（SourceTabs 已删）。
- **ReaderView / BrowserPage / SettingsPanel**：均为标签内容（阅读/内置浏览器 webview/设置），设置页无返回按钮（经标签栏关闭）。订阅源列表的 URL 为链接式按钮（2026-08-31）：hover 下划线，点击走 `openExternalSmart` 按外链设置打开（系统浏览器/内置标签展示 XML）；添加订阅源先经主进程 provider 验证链接，验证期间按钮显示加载 SVG 与「验证中…」，失败不写入源列表。
- **MiniView**：Mini 模式 = 同一窗口切换形态（360x480、置顶、保留任务栏入口），非独立窗口。**日期行可展开摘要（2026-08-31）**：手风琴单开（同时只展开一条，再点当前行收起）；橘鸦源展开简报（`parseJuyaIssue` 的概览条目纯文本，不含外链不响应点击），其他源展开限长文本摘要（优先 summary，缺省 DOMParser 剥离 contentHtml，`MINI_TEXT_LIMIT = 120` 字符截断加省略号，无内容则行不可展开）；「查看更多 →」= `openFromMini`：标记已读 + 新开阅读标签（走统一上限守卫，满员提示并留在 Mini）+ 成功后退出 Mini 回正常模式，全程不开外链（旧的 openExternalSmart 链路已移除）。纯逻辑在 `src/renderer/components/miniDigest.ts`（单测 miniDigest.test.ts，E2E mini.spec.ts；夹具文章简报内容相同，手风琴断言用摘要区域数量而非文本）。
- **默认订阅**：数量 ≤ 1，允许为 0（此时主页 = 空页面）；设置页用星形按钮切换（实心=默认，点击取消）。
- **会话持久化**：`SavedSession` 存于 electron-store，标签变化即落盘；reader 存 guid，重启从文章缓存解析。
- **快捷键**：关闭/切换标签组合键可在设置中自定义（ShortcutCapture 组件捕获录入）。
- **主题与字号解耦**：`ThemeTokens.fonts` 只有字体族（heading/body），**不含字号**；基准字号固定 14px（index.css）。切换主题不改变任何元素尺寸（v0.1.0 曾因 juya-daily sizeBase=15 导致全 UI 尺寸跳变，已移除该机制）。
- **主题三态与亮暗隔离**：`settings.themeMode` 为 `system | light | dark`，`lightThemeId` / `darkThemeId` 分别记忆两侧主题；`activeThemeId` 仅用于旧数据迁移。跟随系统由主进程监听 Electron `nativeTheme.updated`，经 `theme:system-changed` IPC 推送，渲染进程不得直接访问 Electron。主题选择器必须先用共享 `resolveThemeScheme` 分类：亮色区只允许 light、暗色区只允许 dark；旧主题无 `colorScheme` 时按背景亮度归入唯一分类，失效 ID 只能回退同侧 `windows-light` / `windows-dark`。
- **主题编辑双草稿**：系统模式同时展示亮暗编辑区，固定模式只展示对应侧。两个草稿独立；编辑当前未生效侧只更新草稿与缩略图，不改变应用外观。所在区域决定保存分类（亮色区强制 light、暗色区强制 dark），内置主题另存副本，自定义主题覆盖原 ID。
- **自绘取色器**：ThemeEditor 颜色行用 `ColorSwatch`（整块圆角色块显示颜色，`.swatch` hover/active 微缩放）+ `ColorPicker`（自绘弹出式：SV 面板+色相条+hex 输入，全部主题 token）。取色器经 `createPortal(document.body)` 挂载——内容区在 zoom 容器内，fixed 坐标会被 CSS zoom 缩放，portal 免疫；出入场复用 `.menu-pop`。原生 `<input type="color">` 已弃用（其白框不随主题）。
- **自绘 Select 替代原生 select**：原生 `<select>` 弹出菜单无法随主题着色（Chromium 限制）、箭头位置不可控、number 输入带原生 spinner。`Select.tsx`（主题 token，与 TabStrip 源切换下拉同款）替换 SettingsPanel/BlankPage/ThemeEditor 全部原生 select；number spinner 经 CSS 隐藏。菜单最大高度 280px 超出内部滚动（继承全局 webkit-scrollbar 主题样式）；展开方向自适应（下方视口空间不足且上方更宽裕时向上展开，`data-dropup` 时 transform-origin 改 bottom center，打开期间 scroll/resize 重算）。下拉出入场动画 `.menu-pop`（180ms `--ease-out`，scale 0.95+opacity，origin top center，`@starting-style` 入场 / `data-closing` 退场，可中断回开，`prefers-reduced-motion` 降级）；Select 与 TabStrip 源菜单共用。Select 支持 `getOptionStyle`（选项/触发器标签内联样式，字体下拉按字体本身预览渲染）与 `editable` combobox 模式（触发器为输入框：输入即过滤选项，Enter/失焦提交输入文本为自定义值，经 `formatInput` 格式化，`getDisplay` 定制关闭态显示；选项 mousedown preventDefault 防止 input 先失焦提交半成品）。**教训：字体下拉曾用系统全量字体（~500 项 + 每项字体预览）——即使虚拟滚动（只渲染可视区 ±6 行），滚动时每次窗口更新仍要解析新字体族，奇卡；且全量渲染时打开即假死数秒。方案已整体弃用。**
- **字体下拉（固定列表 + 可输入）**：ThemeEditor 标题/正文字体 = 固定常用字体列表（`FONT_OPTIONS` 常量，value 为完整 font-family 栈，含中英文常用字体与通用族，约 22 项）+ editable 输入自定义字体名（裸名经 `toCssFont` 加引号）。关闭态显示：命中选项 label / 自定义值栈首族名（`firstFamily`）。系统字体枚举 IPC（font:list）已删除。
- **原生控件随主题**：浏览器原生表单控件（focus 外圈/checkbox/range/选区/下拉选项）默认取系统色、不读页面 CSS 变量。index.css 用 `:root { accent-color: var(--t-accent) }` + `:focus-visible { outline: 2px solid var(--t-accent) }`（Chromium UA 的 auto focus 圈**忽略**作者 outline-color，必须显式 solid 才挂上变量）+ `::selection` 全部挂主题变量。UI 禁止内嵌硬编码颜色（含关闭按钮 hover 红等）。**主题亮/暗分类（`colorScheme`）**：`ThemeTokens.colorScheme?: 'light' | 'dark'`（可选，向后兼容旧自定义 JSON）。内置主题显式声明：windows-light/claude-design/juya-daily=light，windows-dark=dark。`applyTheme` 落到 `root.style.colorScheme`（显式字段优先；旧主题无字段时按 bg 相对亮度 WCAG 式推导，<0.5 视为暗）。ThemeService.validate 校验值域；ThemeEditor 有「亮/暗分类」下拉（切错亮暗会即时改变 color-scheme，原生 UA 渲染部分如滚动条随之一致）。**range 滑条已 CSS 自绘**（原生 track 渲染为 accent 暗色变体、随 accent 染色漂移且不读主题 token）：track 用 `--t-chip`、填充/手柄用 `--t-accent`，填充分割点由组件注入 `--range-progress`（=(value-min)/(max-min)，`as React.CSSProperties` cast）；手柄 hover/active 微放大（reduced-motion 降级）。
- **内容区缩放（类浏览器页面缩放）**：`settings.uiZoom`（0.5–2，步进 0.05，持久化）。zoom **下沉到各视图内容区**：每个视图在 scroller（`flex-1 overflow-y-auto`）内部包一层 `style={{ zoom: uiZoom }}`（Chromium CSS zoom：放大内部 px 但不放大百分比/flex 分配尺寸，scroller 仍恰好填满）；全局标题栏/标签栏/ZoomWidget 与**各视图内 nav**（详情工具栏/设置标题栏/浏览器地址栏，统一挂 `view-nav` 类）都在 zoom 容器外，保持固定尺寸；Mini 模式不缩放。调节方式：Ctrl+滚轮（修饰键组合经 `settings.shortcuts.zoomWheel` 可自定义，ShortcutCapture `modifierOnly` 模式录入）+ ZoomWidget 右下角浮动控件（百分比/加减/重置）。webview（内置浏览器标签）内部滚轮事件不经过宿主，Ctrl+滚轮在 webview 上无效属预期。

## 橘鸦定制阅读系统（2026-08-28 新增，2026-09-24 重设计为八风格）

- **身份判据**：唯一合法来源是内置默认订阅 `JUYA_SOURCE_ID = 'juya-daily'`（`src/shared/types.ts`）。判据为 `article.sourceId === JUYA_SOURCE_ID`；用户添加相同 URL 的源（`src-*` id）不获得身份。不做启动补回迁移（旧数据删过该源即无定制能力）。
- **源锁定**：`juya-daily` 不可删除、不可停用（`FeedService.removeSource` / `toggleSource` 拦截）；项目无改名功能故无需第三把锁；设置页该源行停用开关禁用、不渲染删除按钮，仅保留默认星标。
- **风格模型**：`JuyaStyleId = 'off' | 'folio' | 'y2k' | 'pop' | 'newsprint90s' | 'dreamcore' | 'nocturne' | 'editorial' | 'wabi'`；`Settings.juyaLightStyleId` / `juyaDarkStyleId`（亮暗各一，默认 `'folio'` / `'nocturne'`，`'off'`=回退通用样式）；合法集合与默认值常量在 `src/shared/types.ts`（`JUYA_STYLE_IDS` / `DEFAULT_JUYA_LIGHT` / `DEFAULT_JUYA_DARK`）。挂进通用三态：`themeMode=system` 按系统亮暗取对应侧。风格**不进** `ThemeTokens` / `ThemeService` / ThemeEditor，只读、不可编辑；注册表在 `src/renderer/juya/juyaStyles.ts`（16 变体，含焦点色与背景材质字段，`backgroundImageAsset` 为未来图片资源扩展位）。旧持久化数据残留的 `'card'` 由 `StoreService.getSettings` 读取清洗 + `migrateJuyaStyleSettings()` 写回迁移（调用点 `src/main/index.ts`）。
- **结构化解析**：`src/renderer/juya/parseJuyaIssue.ts`（渲染进程 DOMParser 实时解析，不碰抓取/缓存链路）→ `JuyaIssue`（期头/概览/栏目/条目：标题/链接/编号/导语/段落/图片/相关链接）。整篇降级判据：无任何全文栏目 → 返回 `null` → 静默回退通用渲染；部分失配 → 字段缺省不整篇降级。安全边界不变：模板全部文本经 React 转义渲染，链接经 `openExternalSmart` 拦截，模板自绘 `<img loading="lazy">`。
- **模板架构（2026-09-24 第二轮起为全风格定制排版）**：`src/renderer/juya/templates/shared.tsx`（原子层：SafeLink/EntryTitle/Lead/Paragraphs/ImageGrid[stack/grid/hero/plate 四模式]/LinksBlock/OverviewItems/EntryBlocks）+ `parts.tsx`（Scene 场景固定层 / FeedShell 订阅页骨架[预设分发·--jy-cols·stagger·空态单一来源] / EntrySplit 图文并排 / feedFieldGates 字段门控 / DefaultFeedItem）。7 个风格手写 `{IssueView, FeedList}`（FeedList = FeedShell + DefaultFeedItem，个性化全走 CSS）；**newsprint90s 继续用 `makeJuyaTemplate` 工厂**（base.tsx 保留为其专用 + 兜底）。样式全部集中在 `src/renderer/juya/juya.css`；组件不内联颜色。每风格作用域提供 `--jy-focus`；动效统一 `prefers-reduced-motion` 降级。**场景层约定**：`.juya-scene` 为 sticky 假固定层（fixed 会被内容区 CSS zoom 破坏锚定），动画一律挂 `.juya-scene-*` 子层，`.juya-root` 永无 animation（reduced-motion E2E 断言的结构保证）；synthwave 太阳/网格（dreamcore 双变体）、星空/地平网格（y2k 暗）经 Scene 挂载，y2k 亮由 CSS 隐藏场景。
- **分流接线**：`ReaderView` 三重判据（源身份 + 风格开启 + 解析成功）→ 定制 `IssueView`；工具栏（收藏/原文）保持通用样式。`HomeView`：橘鸦源 + 风格开启 → 风格化期号列表（**遵循通用 `layout` 设置：预设/列数/显示字段**，见 `base.tsx` FeedList），否则原 `ArticleList` 路径。
- **设置入口**：主题设置卡片内底部、`border-t` 分割线之下，「橘鸦定制阅读风格」亮/暗两个自绘 Select **常态显示**、`grid-cols-2` 左右分半占位（同「偏好」区样式；选项=关闭+八风格，即时生效）。
- **测试基建**：`vitest`（纯逻辑，`tests/unit/`，配置 `vitest.config.ts`，happy-dom）+ `@playwright/test`（渲染层，`tests/e2e/`，驱动 `out/renderer` 构建产物 + `window.opia` 内存桩；webServer 健康检查必须用 `localhost`；keep-alive 下断言必须限定活动标签容器 `div.min-h-0.w-full`）。`tests/fixtures/` 为脱敏真实样本夹具，已加入 `.gitignore`（禁止提交）。命令：`npm test` / `npm run test:e2e`（后者先 `build:dir`）。
- **单测扩展（2026-08-31）**：单测 268 项 / E2E 75 项。主进程代码（ipc/preload/FeedService/StoreService/ThemeService/PluginManager）用 `vi.mock('electron')` / `vi.mock('electron-store')` 捕获 `ipcMain.handle` 与 `exposeInMainWorld` 后以假依赖直调；FakeStore 等鸭型对象直接字面量 `as unknown as X` 注入，不必 mock。共享桩助手 `tests/unit/helpers/opiaStub.ts`（全部方法默认 `vi.fn`），E2E 注入式桩已补全全部 `OpiaApi` 方法。`ipcContract` + `opiaStubContract` 测试静态守卫 ipc-contract ↔ preload ↔ ipc.ts 三处同步与裸字符串通道（`window:mini-changed` 已删除）。插件契约行为由 `pluginManager.test.ts` 守护（含 `plugins/` 三示例真实可加载、`provides` 门控、错误隔离）。

## 窗口行为事实（Windows 实测）

- 对已最大化窗口 `setSize()` **不会**解除最大化——尺寸转换前必须显式 `unmaximize()`，并先记 `isMaximized()` 与 `getNormalBounds()`（后者无论窗口状态恒返回常规态边界）。
- Mini 与最大化往返：进入 Mini 记录 `wasMaximized`，退出时还原 bounds 后 `if (wasMaximized) maximize()`。

## 文档与记忆维护

- 大型修改（新架构/新模块/行为变更）须同步更新本文件对应章节。
- 调试得出的可复用教训（如上面的窗口行为事实）须沉淀到本文件与项目记忆（`~/.trae-cn/memory/projects/-d-Dev-opia-rss-reader--p2-8c5b710068a2fd63ae01/project_memory.md`）。
- 犯错（错误 Root Cause 判断、虚构验证结果等）时必须更新记忆，避免重复犯错。

## 计划任务

- [x] v0.1.0：标签化窗口重构（无边框+TabStrip+会话持久化+Mini 修复+源切换下拉+默认订阅星形切换）
  - **已发布**（2026-08-20，GitHub Release，用户手动同步）：tag `v0.1.0`，commit `5d0e90e`；产物 `release/`（portable.exe 90.74MB / win32-x64.zip 151.97MB / win32-x64 解包目录）
- [x] 橘鸦定制阅读系统（五风格×亮暗双变体）：**完成**（2026-08-28）
  - 自动化：tsc 零错误 / vitest 16/16 / Playwright 35/35；`npm run build` 由 Codex IDE 外构建成功。
  - 真机验收：Codex computer-use + 用户人工必做项 4/4 全部通过，无代码缺陷（清单见 `docs/PLAN-20260828.md` 阶段 9）。
  - 用户反馈三连跟进：订阅页遵循布局、视图内 nav 不缩放（zoom 下沉）、设置亮/暗风格常态分半（见 PLAN 交付报告「跟进修订」）。
- [x] 橘鸦风格序列重设计（2026-09-24）：八风格×亮暗双变体=16 变体。`card` 被 `folio`（纸感精读式，朱丝栏）取代并新增 `nocturne`（暗夜精修式，新暗侧默认）/ `editorial`（杂志编辑式）/ `wabi`（侘寂日杂式）；`y2k`/`pop`/`dreamcore` 精修（铬面刊头、Ben-Day 双色叠印、单色紫雾去霓虹）；`newsprint90s` 原样保留。旧数据 `'card'` 经 StoreService 读取清洗 + `migrateJuyaStyleSettings` 迁移；新默认亮 `folio` / 暗 `nocturne`。
- [x] 橘鸦全风格定制排版 + 场景化背景（2026-09-24 第二轮）：7 风格手写模板摆脱工厂统一骨架（shared.tsx 原子层 + parts.tsx FeedShell/EntrySplit/Scene）；图文排版 per-style（y2k/nocturne 图文并排、pop/dreamcore 首图通栏、folio/editorial plate 题注、wabi 奇偶错位）；场景背景 dreamcore=synthwave（条纹太阳 mask + 透视霓虹网格滚动）、y2k 暗=星空+地平网格、folio=信纸格线+印章水印、editorial=颗粒+裁切角标；动效放开（reduced-motion 降级底线保留），root 永不挂 animation。
- [x] 测试基建补齐 + 插件 API 文档/示例（2026-08-31）：**完成**。README 计划两项落地——① IPC/FeedService/标签会话/主题系统自动化测试（vitest 268/268、Playwright 75/75、tsc 零错误、`npm run build` 成功）；② `docs/PLUGIN_API.md` + 三示例插件（example-json-feed / example-theme / example-hello）。顺带加固：插件主题注册逐个 try/catch（坏主题不再拖垮启动）、`readdirSync` 失败按根隔离、`collectThemes` 按 `provides` 门控、删除 `window:mini-changed` 裸通道、`plugin-api.ts` TSDoc 对齐实际行为。
- [x] Mini模式不完全（2026-08-31）：**完成**。日期行左侧三角可展开（手风琴单开）：橘鸦订阅展开简报（概览）纯文本，其他订阅展示限长（120 字符）文本摘要；「查看更多 →」跳正常模式阅读页并退出 Mini，不开外链；标签满上限时提示并留在 Mini。验证：tsc 零错误 / vitest 279/279 / Playwright 78/78。
- [ ] 其他待测试内容
