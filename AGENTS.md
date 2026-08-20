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
- **HomeView**：主页标签内容（订阅文章列表或 BlankPage 空页面引导页）；源切换入口在主页标签的下拉按钮，**没有**单独的订阅源标签行（SourceTabs 已删）。
- **ReaderView / BrowserPage / SettingsPanel**：均为标签内容（阅读/内置浏览器 webview/设置），设置页无返回按钮（经标签栏关闭）。
- **MiniView**：Mini 模式 = 同一窗口切换形态（360x480、置顶、保留任务栏入口），非独立窗口。
- **默认订阅**：数量 ≤ 1，允许为 0（此时主页 = 空页面）；设置页用星形按钮切换（实心=默认，点击取消）。
- **会话持久化**：`SavedSession` 存于 electron-store，标签变化即落盘；reader 存 guid，重启从文章缓存解析。
- **快捷键**：关闭/切换标签组合键可在设置中自定义（ShortcutCapture 组件捕获录入）。
- **主题与字号解耦**：`ThemeTokens.fonts` 只有字体族（heading/body），**不含字号**；基准字号固定 14px（index.css）。切换主题不改变任何元素尺寸（v0.1.0 曾因 juya-daily sizeBase=15 导致全 UI 尺寸跳变，已移除该机制）。
- **自绘取色器**：ThemeEditor 颜色行用 `ColorSwatch`（整块圆角色块显示颜色，`.swatch` hover/active 微缩放）+ `ColorPicker`（自绘弹出式：SV 面板+色相条+hex 输入，全部主题 token）。取色器经 `createPortal(document.body)` 挂载——内容区在 zoom 容器内，fixed 坐标会被 CSS zoom 缩放，portal 免疫；出入场复用 `.menu-pop`。原生 `<input type="color">` 已弃用（其白框不随主题）。
- **自绘 Select 替代原生 select**：原生 `<select>` 弹出菜单无法随主题着色（Chromium 限制）、箭头位置不可控、number 输入带原生 spinner。`Select.tsx`（主题 token，与 TabStrip 源切换下拉同款）替换 SettingsPanel/BlankPage/ThemeEditor 全部原生 select；number spinner 经 CSS 隐藏。菜单最大高度 280px 超出内部滚动（继承全局 webkit-scrollbar 主题样式）；展开方向自适应（下方视口空间不足且上方更宽裕时向上展开，`data-dropup` 时 transform-origin 改 bottom center，打开期间 scroll/resize 重算）。下拉出入场动画 `.menu-pop`（180ms `--ease-out`，scale 0.95+opacity，origin top center，`@starting-style` 入场 / `data-closing` 退场，可中断回开，`prefers-reduced-motion` 降级）；Select 与 TabStrip 源菜单共用。Select 支持 `getOptionStyle`（选项/触发器标签内联样式，字体下拉按字体本身预览渲染）与 `editable` combobox 模式（触发器为输入框：输入即过滤选项，Enter/失焦提交输入文本为自定义值，经 `formatInput` 格式化，`getDisplay` 定制关闭态显示；选项 mousedown preventDefault 防止 input 先失焦提交半成品）。**教训：字体下拉曾用系统全量字体（~500 项 + 每项字体预览）——即使虚拟滚动（只渲染可视区 ±6 行），滚动时每次窗口更新仍要解析新字体族，奇卡；且全量渲染时打开即假死数秒。方案已整体弃用。**
- **字体下拉（固定列表 + 可输入）**：ThemeEditor 标题/正文字体 = 固定常用字体列表（`FONT_OPTIONS` 常量，value 为完整 font-family 栈，含中英文常用字体与通用族，约 22 项）+ editable 输入自定义字体名（裸名经 `toCssFont` 加引号）。关闭态显示：命中选项 label / 自定义值栈首族名（`firstFamily`）。系统字体枚举 IPC（font:list）已删除。
- **原生控件随主题**：浏览器原生表单控件（focus 外圈/checkbox/range/选区/下拉选项）默认取系统色、不读页面 CSS 变量。index.css 用 `:root { accent-color: var(--t-accent) }` + `:focus-visible { outline: 2px solid var(--t-accent) }`（Chromium UA 的 auto focus 圈**忽略**作者 outline-color，必须显式 solid 才挂上变量）+ `::selection` 全部挂主题变量。UI 禁止内嵌硬编码颜色（含关闭按钮 hover 红等）。**主题亮/暗分类（`colorScheme`）**：`ThemeTokens.colorScheme?: 'light' | 'dark'`（可选，向后兼容旧自定义 JSON）。内置主题显式声明：windows-light/claude-design/juya-daily=light，windows-dark=dark。`applyTheme` 落到 `root.style.colorScheme`（显式字段优先；旧主题无字段时按 bg 相对亮度 WCAG 式推导，<0.5 视为暗）。ThemeService.validate 校验值域；ThemeEditor 有「亮/暗分类」下拉（切错亮暗会即时改变 color-scheme，原生 UA 渲染部分如滚动条随之一致）。**range 滑条已 CSS 自绘**（原生 track 渲染为 accent 暗色变体、随 accent 染色漂移且不读主题 token）：track 用 `--t-chip`、填充/手柄用 `--t-accent`，填充分割点由组件注入 `--range-progress`（=(value-min)/(max-min)，`as React.CSSProperties` cast）；手柄 hover/active 微放大（reduced-motion 降级）。
- **内容区缩放（类浏览器页面缩放）**：`settings.uiZoom`（0.5–2，步进 0.05，持久化）。App.tsx 中标签内容包在 `style={{ zoom: uiZoom }}` 容器内（Chromium CSS zoom：放大内部 px 但不放大百分比/flex 分配尺寸，容器恰好填满）；标题栏/标签栏/ZoomWidget 浮动控件在 zoom 容器**外**不缩放；Mini 模式不缩放。调节方式：Ctrl+滚轮（修饰键组合经 `settings.shortcuts.zoomWheel` 可自定义，ShortcutCapture `modifierOnly` 模式录入）+ ZoomWidget 右下角浮动控件（百分比/加减/重置）。webview（内置浏览器标签）内部滚轮事件不经过宿主，Ctrl+滚轮在 webview 上无效属预期。

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
- [ ] 下迭代待定（在此维护）
