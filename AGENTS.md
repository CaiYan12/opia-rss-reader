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
- **DSH 的 Low 完整性标签会影响普通终端启动（2026-10-12 实测）**：DSH Windows ACL 沙箱给工作区设置可继承的 Low 标签，`node_modules\electron\dist\electron.exe` 继承后，从普通终端启动的 Electron 主进程也会降为 Low（`S-1-16-4096`），无法写入原 AppData profile。不加 `--no-sandbox` 时启动前退出；加上后出现 lockfile/cache `ACCESS DENIED`，甚至以 0 退出。用 `icacls "node_modules\electron\dist\electron.exe"` 检查完整性标签；本次仅对该可执行文件执行 `icacls "node_modules\electron\dist\electron.exe" /setintegritylevel M` 即恢复正常，保留工作区沙箱授权、原 profile 与依赖版本。重装依赖后新文件可能再次继承 Low，须重新核查；不要据此永久关闭 Chromium sandbox 或搬迁用户数据。
- **`.bat` 调用 npm 必须用 `call npm run dev`**：npm 是 `.cmd`，不用 `call` 会转移批处理控制权，后面的退出码输出与 `pause` 不执行。`start.bat` 在 dev 返回后显示退出码并暂停，便于双击启动时保留失败信息。
- **双击入口安全警告（2026-10-12 补验）**：`start.bat` 无 `Zone.Identifier` 仍可能因继承 Low 完整性标签弹「打开文件 - 安全警告」。本次 `icacls "start.bat" /setintegritylevel M` 后，经 Explorer 对 `.bat` 本体 ShellExecute 直接启动窗口，无需确认，文件 SHA256 未变。验证双击必须走 `.bat` 的 Shell 入口；`cmd /c start.bat` 绕过该提示，不能证明双击无警告。
- **构建前必须杀掉正在运行的应用实例**，否则 electron-builder 因 `build/win-unpacked` 文件占用失败。杀进程用 PowerShell `Stop-Process`（进程名含空格时 Git Bash 的 taskkill 不可靠）。
- **`npm run build` / `build.ps1` 的 IDE 内 EBUSY 风险（用户决策，2026-08-28；2026-10-11 实测收窄）**：IDE 的 AI 扩展会扫描锁定 `build/*.asar`，electron-builder 在 packaging 阶段报 `EBUSY: unlink build\win-unpacked\resources\app.asar`（Electron 社区已知问题，杀应用进程/重试均无效）。**2026-10-11 实测：ZCode 代理内完整跑通 `npm run build`（asar 写入、签名、portable 产物均正常），仅能确认 ZCode 内不触发此问题**；其他 IDE/扩展环境是否复现未知，该类环境下构建仍由用户在 IDE 外终端执行（`build.bat` 或 `powershell -File build.ps1 -Run`）。`build.ps1` 的 release 三形态流水线已于 2026-10-11 在 ZCode 代跑验证通过（Electron zip 下载 TLS 断连按上方镜像处方命令级重试即成功；EBUSY 两轮均未复现）。注意：脚本启动即整体清空 `release/`，手工放在其中的文件（如 RELEASE_NOTES）会被删，先备份。
- 应用已加单实例锁；测试多开行为时第二实例会自动退出属预期。
- **build.ps1 含中文注释，必须保持 UTF-8 with BOM**：`powershell.exe`（5.1）对无 BOM 文件按 GBK 误读中文注释导致语法损坏（`Unexpected token '}'`）；pwsh 7 无此问题，验证脚本须用 `powershell -File build.ps1` 实测。
- electron-builder 下载 Electron zip 偶发 TLS 断连（CN 网络）：命令级设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 重试即可，勿写入项目配置。
- build.ps1 已自动化发行：构建前清理 build/release 全部旧产物，构建后自动在 `release/` 生成三形态（`{name}-v{ver}-win32-x64\` 解包目录 + `.zip` + `-portable.exe`），命名跟随 electron-builder 产物规则。**三形态统一带 `v` 前缀（2026-09-24 起）**，四处同步：`package.json` 的 `portable.artifactName`、`build.ps1` 的 `$releaseBase`、`build.bat` 的 `DST` 与 portable 复制判断、README 产物表。

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
- **滚动条风格适配（2026-10-11）**：橘鸦定制风格激活时，内容区滚动条 thumb 跟随该风格色板（HomeView `<main>` / ReaderView 内容 div 统一挂 `view-scroll` 语义类，沿用 `view-nav` 挂类先例；Mini 无橘鸦风格不挂）。**核心技术约束**：滚动条伪元素挂在滚动容器（`.juya-root` 的祖先）上，而 `--jy-*` 变量定义在 `.juya-root`（后代）——CSS 自定义属性只向下继承，滚动容器读不到，故 juya.css 只能以 `.view-scroll:has([data-juya-variant='…'])::-webkit-scrollbar-thumb` 向上匹配 + 每变体**字面色**（沿用「构成色硬编码必带注释」惯例，每条注明取色来源与对变体 bg 的 WCAG 对比度，非文本 UI 件 ≥3:1）。width/track（透明）与默认圆角 4px 继承 index.css 全局滚动条块（该块一字节不动，通用 UI 不受影响）；特异性 (0,2,1) 压过全局 (0,0,1)，仅直角/锐角风格（pop/newsprint90s=0、y2k/editorial=2px）按各自 `--jy-radius` 覆写圆角。keep-alive 多标签：各标签滚动容器只 `:has` 到自己的后代 juya-root，天然按标签正确、无需 JS。守卫：`tests/unit/juyaCssGuard.test.ts` 滚动条组（注册表 JUYA_STYLES 驱动，未来加变体自动纳入）；验证 tsc 0 / vitest 319 / E2E 86；双轴评审 Spec/Standards 双 PASS + browser-visual-qa PASS（4 风格正样本/通用路径负对照/订阅页均正确，thumb 对实际槽区底色亦全部 ≥3:1），最终提交 `63a4bc3`。

## 橘鸦定制阅读系统（2026-08-28 新增，2026-09-24 重设计为八风格）

- **身份判据**：唯一合法来源是内置默认订阅 `JUYA_SOURCE_ID = 'juya-daily'`（`src/shared/types.ts`）。判据为 `article.sourceId === JUYA_SOURCE_ID`；用户添加相同 URL 的源（`src-*` id）不获得身份。不做启动补回迁移（旧数据删过该源即无定制能力）。
- **源锁定**：`juya-daily` 不可删除、不可停用（`FeedService.removeSource` / `toggleSource` 拦截）；项目无改名功能故无需第三把锁；设置页该源行停用开关禁用、不渲染删除按钮，仅保留默认星标。
- **变体覆盖选择器约定（2026-10-11）**：`data-juya-variant` 与 `.jy<abbr>` 恒挂同一根元素，变体专属覆盖必须写复合形式 `[data-juya-variant='folio-dark'].jyfolio …`；带空格的后代形式永不匹配（曾致 folio-dark 朱丝栏/印章、y2k-dark 与 nocturne-light 刊头覆盖静默失效）。`tests/unit/juyaCssGuard.test.ts` 静态守卫该死形态，并守卫 folio muted 文本对 bg/lead-bg 的对比度 ≥4.5（WCAG AA；当前亮 `#6a6250` / 暗 `#998e75`，改色须同步过守卫）。
- **风格模型**：`JuyaStyleId = 'off' | 'folio' | 'y2k' | 'pop' | 'newsprint90s' | 'dreamcore' | 'nocturne' | 'editorial' | 'wabi'`；`Settings.juyaLightStyleId` / `juyaDarkStyleId`（亮暗各一，默认 `'folio'` / `'nocturne'`，`'off'`=回退通用样式）；合法集合与默认值常量在 `src/shared/types.ts`（`JUYA_STYLE_IDS` / `DEFAULT_JUYA_LIGHT` / `DEFAULT_JUYA_DARK`）。挂进通用三态：`themeMode=system` 按系统亮暗取对应侧。风格**不进** `ThemeTokens` / `ThemeService` / ThemeEditor，只读、不可编辑；注册表在 `src/renderer/juya/juyaStyles.ts`（16 变体，含焦点色与背景材质字段，`backgroundImageAsset` 为未来图片资源扩展位）。旧持久化数据残留的 `'card'` 由 `StoreService.getSettings` 读取清洗 + `migrateJuyaStyleSettings()` 写回迁移（调用点 `src/main/index.ts`）。
- **结构化解析**：`src/renderer/juya/parseJuyaIssue.ts`（渲染进程 DOMParser 实时解析，不碰抓取/缓存链路）→ `JuyaIssue`（期头/概览/栏目/条目：标题/链接/编号/导语/段落/图片/相关链接）。整篇降级判据：无任何全文栏目 → 返回 `null` → 静默回退通用渲染；部分失配 → 字段缺省不整篇降级。安全边界不变：模板全部文本经 React 转义渲染，链接经 `openExternalSmart` 拦截，模板自绘 `<img loading="lazy">`。
- **模板架构（2026-09-24 第二轮起为全风格定制排版）**：`src/renderer/juya/templates/shared.tsx`（原子层：SafeLink/EntryTitle/Lead/Paragraphs/ImageGrid[stack/grid/hero/plate 四模式]/LinksBlock/OverviewItems/EntryBlocks）+ `parts.tsx`（Scene 场景固定层 / FeedShell 订阅页骨架[预设分发·--jy-cols·stagger·空态单一来源] / EntrySplit 图文并排 / feedFieldGates 字段门控 / DefaultFeedItem）。7 个风格手写 `{IssueView, FeedList}`（FeedList = FeedShell + DefaultFeedItem，个性化全走 CSS）；**newsprint90s 继续用 `makeJuyaTemplate` 工厂**（base.tsx 保留为其专用 + 兜底）。样式全部集中在 `src/renderer/juya/juya.css`；组件不内联颜色。每风格作用域提供 `--jy-focus`；动效统一 `prefers-reduced-motion` 降级。**场景层约定**：`.juya-scene` 为 sticky 假固定层（fixed 会被内容区 CSS zoom 破坏锚定），动画一律挂 `.juya-scene-*` 子层，`.juya-root` 永无 animation（reduced-motion E2E 断言的结构保证）；synthwave 太阳/网格（dreamcore 双变体）、星空/地平网格（y2k 暗）经 Scene 挂载，y2k 亮由 CSS 隐藏场景。
- **folio 横格与去卡片（2026-10-11）**：信纸横格不再铺 `.juya-issue` 容器（容器级格线无法对齐任意结构文本），下沉到正文段落——`.jyfolio .juya-entry p:not(.juya-links-label)` 行高 = 格距 28px（**勿单独改 line-height 或格距其一**，否则错位）、段间距 0 + 段首缩进 2em（信笺惯例：缩进即段落标记，格线跨段落连续），格线色走 `--jy-ruled` token；条目去卡片（透明/无边框/无阴影，正文直接写在纸上），plate 装裱与导语内衬保留实底。图文由 `JuyaEntry.blocks`（parseJuyaIssue 新增：文档顺序段/图交错块，paragraphs/images 是其扁平投影，旧模板不受影响）驱动：首图升为开卷通栏图（紧跟导语/标题），其余图随文走、按出现顺序 62% 窄幅左/右交替（`.jyfolio-plate-inset` / `-right`，≤520px 回落全宽）。**特异性教训**：`.jyfolio .juya-entry > .juya-plate` 的 margin 简写（0,3,0）会压过两类选择器的 `.jyfolio-plate-right { margin-left: auto }`，覆盖规则必须同级特异性且靠后。概览两列目录须显式 `display: block`（flex 容器不参与 CSS 多列布局，此前 column-count 静默失效呈单列）。~~已知共性问题未修：`.juya-links-label` 被基类 `.juya-entry p` 特异性压制~~ → 已修（2026-10-11）：base 段落规则改为 `.juya-entry p:not(.juya-links-label)`，标签 12px 全风格生效；并补 `.juya-overview a:hover` / `.juya-links a:hover` 下划线（base 层，全风格）。folio 签名件（2026-10-11 第三轮）：栏目 h2 下压**文武线**（1px border 全宽 + 2px accent 全宽，::after 置于细线下 2px）；同栏目相邻条目间「细线—朱菱—细线」分隔符（`.jyfolio-divider`，folio.tsx 在 `i>0` 条目前渲染 `<div/><span/>`，span 7px accent 菱形 clip-path；E2E 以 `.juya-entry + .jyfolio-divider + .juya-entry` 相邻三元组断言锁位）。
- **订阅页纸面满屏（2026-10-11）**：橘鸦订阅页短内容时 `.juya-root` 须铺满视口高——HomeView JuyaFeed 分支的 zoom div 附加 `minHeight: '100%'` + flex column，`.juya-root` 追加 `flex: 1`（非 flex 父级时惰性，ReaderView 不受影响）；ArticleList（非橘鸦）分支不加 flex，逐字节零变化。改高度链时注意 zoom 与 min-height 的交互（zoom.spec 守护）。
- **nocturne 暗夜精修式（2026-10-12，#1–#9 九票收口）**：八风格之一，**暗侧默认**（`DEFAULT_JUYA_DARK`），亮侧 `nocturne-light` 本轮范围外（§9 明确「任何改动」不做）。
  - **Scene 新增 `dust` / `nebula` 预设（共享层，`templates/parts.tsx`）**：`dust` 靠**平铺 `radial-gradient`** 得一两千点量级微粒，**不生成 DOM 节点**（逐点元素会让长文页节点数爆炸）；`nebula` 为静态渐层雾。两预设经 `<Scene dust nebula />` 挂载，场景层仍是 sticky 假固定层。
  - **接线**：nocturne-dark 三层 nebula alpha **0.07 / 0.04 / 0.025**，雾锚在左右水平边缘、**中心区避让**（正文列零覆盖）。
  - **字体三档**：标题 `DengXian` 起 / 正文 `Noto Sans SC` 起 / 元信息与序号 `JetBrains Mono` 起（等宽）。
  - **阅读窗**：700px 变体覆写（`max-width` 收窄）+ 左右渐隐遮罩 **24px / alpha 0.3**（遮罩色取本变体 `--jy-bg`，只渐隐不染色）。
  - **导语**：`--jy-lead-bg` **0.08** + 左竖线 `--jy-focus` 色，发光走**外阴影 `box-shadow`**。
  - **栏目线**：`rgba(255,255,255,0.22)`（对 `--jy-bg` 实算 1.91:1，属装饰件；够 3:1 需 ≈0.34，会违反 §7.1「克制」红线，故按决策值落地并留档差额）。**概览序号**发光（`--jy-accent`，收窄到 `.juya-overview` 以免连带点亮条目标题徽章）。
  - **图文回流**：右列限 **2 张**，第 3 张起进 `.jynoct-overflow-media` 通栏带。该容器**共享** `.jynoct` 作用域是**有意例外**（模板结构变化而非样式取值变化，`IssueView` 无 `variantId` 分支 ⇒ 两变体共用骨架；收窄会让 `nocturne-light` 渲染出无样式裸容器）。
  - **绘制陷阱教训（与 y2k 的「`text-shadow` 在 `background-clip:text` 下会盖住渐变填充」并列，两条都是本项目的硬约束）**：**`filter: drop-shadow` 作用在带半透明背景的元素上时，取的是整个元素的 alpha 轮廓** —— 阴影会把矩形**整片**投影出来并被自身半透明底透出。所以「给元素加辉光但只想照亮它的某条边」用 `drop-shadow` 不成立（实测：某规则 **74.2%** 的内部像素被洗涤）；要只照某条边应当用**外阴影 `box-shadow`**（按规范只画在边框盒之外，落入 border-box 的部分被裁掉，几何上不可能洗涤内部）。
  - **可达性口径教训**：计算「叠加态对比度最坏面」时，`.juya-scene` 是 `position: sticky; top: 0` ⇒ **视口锚定而非文档锚定**：用「元素在文档里的 y 坐标」推断它不被背景雾覆盖是错的，元素滚到滚动口顶端时才会落进雾层峰值。另：nebula 三层雾的支撑域**两两不相交**，「三层全重叠」是**不可达面**，不得当作最坏面。
  - **刊头极光带（2026-10-12，用户指令「头部过于朴素、Vista 极光几乎不存在」）**：`.juya-masthead` 两条伪元素承载弧形径向渐变——前层青白亮脊 + 青蓝/靛蓝幕帘（`blur(4px)`），后层**水平偏心**（`at 38%`）的品红反相幕帘（`blur(13px)`）制造纵深；mask 两端渐隐；前层 24s / 后层 31s **交错相位**只动 `opacity`（不动几何，避免贴图滑动感）。刊头 h1 渐变同时由中性银灰改为**冷调** `#ffffff → #b9c6f0`（末档向 `--jy-nebula-2` 色相偏移）。**零新增色相**：四色全取自既有的 `--jy-nebula-2/3` 与 `--jy-accent`（守卫⑤按色相集合逐一锁定）。
  - **分层硬约束（本次最重要的技术教训）**：极光带取 **`z-index: -1`，绝不是 0**。按 CSS 2.1 附录 E，定位元素 `z-index: 0` 绘于第 6 步，而**非定位的正文文本**（h1、概览项）在第 5 步 ⇒ `z-index: 0` 的极光会盖在标题字**之上**，半透明 + blur 会洗淡文字（与上文「绘制陷阱教训」那条 `drop-shadow` 同属一类）。取负值则落到最近堆叠上下文的第 2 步：在所有内容之下、但在 `.juya-scene` 之上。**据此极光在几何上不可能覆盖任何文字像素，可读性由结构保证而非 alpha 调参。** 已用栅格化差分独立验证（同取景、只切极光一变量；字形掩码须取自**去了极光**的那张图并做腐蚀，否则亮脊会被误判成字形）：字形核心被改写 **0/4372**（1280）/ **0/13783**（560），内部洗涤率 **0.00%**（对照上文 `drop-shadow` 的 74.2%）。抗锯齿边缘的 24% 像素会随背景变化，那是半透明边缘与背后内容的正常混合，非「洗字」。
  - **极光带的其它结构约束**：`.juya-masthead` 须补 `position: relative` 作包含块（否则 `left/right: 0` 会以 `.juya-issue` 为基准横跨整个 issue 盒）；`left/right: 0` + 无 `transform` ⇒ **零横向溢出**（`.juya-issue` 无 `overflow:hidden`，横向越界会在 `.view-scroll` 上滚出滚动条；实测 1280/560 两档溢出均 0px）；装饰层 `pointer-events: none`。**RM 下两层必须显式钉 `opacity`**（0.81 / 0.76），不能只撤动画——关键帧撤掉后元素回到「无 opacity 声明」即最亮档 1，比动画平均态更亮（守卫⑧锁此点）。
  - 验证：tsc 0 错误 / vitest 397 / Playwright 90 / 对比度审计 exit 0 / 字体探针 exit 0 / 视觉走查 `--verify` exit 0。
- **分流接线**：`ReaderView` 三重判据（源身份 + 风格开启 + 解析成功）→ 定制 `IssueView`；工具栏（收藏/原文）保持通用样式。`HomeView`：橘鸦源 + 风格开启 → 风格化期号列表（**遵循通用 `layout` 设置：预设/列数/显示字段**，见 `base.tsx` FeedList），否则原 `ArticleList` 路径。
- **设置入口**：主题设置卡片内底部、`border-t` 分割线之下，「橘鸦定制阅读风格」亮/暗两个自绘 Select **常态显示**、`grid-cols-2` 左右分半占位（同「偏好」区样式；选项=关闭+八风格，即时生效）。
- **测试基建**：`vitest`（纯逻辑，`tests/unit/`，配置 `vitest.config.ts`，happy-dom）+ `@playwright/test`（渲染层，`tests/e2e/`，驱动 `out/renderer` 构建产物 + `window.opia` 内存桩；webServer 健康检查必须用 `localhost`；keep-alive 下断言必须限定活动标签容器 `div.min-h-0.w-full`）。`tests/fixtures/` 为脱敏真实样本夹具，已加入 `.gitignore`（禁止提交）。命令：`npm test` / `npm run test:e2e`（后者先 `build:dir`）。
- **对比度审计脚本（2026-10-12）**：`scripts/nocturne-contrast-audit.mjs` —— 叠加态对比度**全量实算**，取值**实读 `juya.css`**（不硬编码 token），自判 PASS/FAIL 并以**退出码**上报。**注意不要放仓库根目录**——`.gitignore` 的 `/_*.js` 会静默忽略（放 `scripts/` 下）。配套 E2E：`tests/e2e/contrast.spec.ts`（栅格化实测，与脚本互为解析式/实测两口径；`lum`/`contrast` 与脚本**同源，改动需同步**）与 `nocturneSvg` 场景（内联 SVG 图源，使图文回流的真实几何可达，不再依赖坏链塌陷）。
- **单测扩展（2026-08-31）**：单测 268 项 / E2E 75 项。主进程代码（ipc/preload/FeedService/StoreService/ThemeService/PluginManager）用 `vi.mock('electron')` / `vi.mock('electron-store')` 捕获 `ipcMain.handle` 与 `exposeInMainWorld` 后以假依赖直调；FakeStore 等鸭型对象直接字面量 `as unknown as X` 注入，不必 mock。共享桩助手 `tests/unit/helpers/opiaStub.ts`（全部方法默认 `vi.fn`），E2E 注入式桩已补全全部 `OpiaApi` 方法。`ipcContract` + `opiaStubContract` 测试静态守卫 ipc-contract ↔ preload ↔ ipc.ts 三处同步与裸字符串通道（`window:mini-changed` 已删除）。插件契约行为由 `pluginManager.test.ts` 守护（含 `plugins/` 三示例真实可加载、`provides` 门控、错误隔离）。

## 窗口行为事实（Windows 实测）

- 对已最大化窗口 `setSize()` **不会**解除最大化——尺寸转换前必须显式 `unmaximize()`，并先记 `isMaximized()` 与 `getNormalBounds()`（后者无论窗口状态恒返回常规态边界）。
- Mini 与最大化往返：进入 Mini 记录 `wasMaximized`，退出时还原 bounds 后 `if (wasMaximized) maximize()`。

## 文档与记忆维护

- 大型修改（新架构/新模块/行为变更）须同步更新本文件对应章节。
- 调试得出的可复用教训（如上面的窗口行为事实）须沉淀到本文件与项目记忆（`~/.trae-cn/memory/projects/-d-Dev-opia-rss-reader--p2-8c5b710068a2fd63ae01/project_memory.md`）。
- 犯错（错误 Root Cause 判断、虚构验证结果等）时必须更新记忆，避免重复犯错。

## Agent skills

### Issue tracker

Issues 与规格存于本仓库 GitHub Issues（`CaiYan12/opia-rss-reader`），一切读写经 `gh` CLI。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个 triage 角色沿用同名 label（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文布局：根目录 `GLOSSARY.md` + `docs/adr/`（两者均尚未创建，由 `/domain-modeling` 按需惰性生成）。本文件 `AGENTS.md` 已承担多数术语的约定职责。见 `docs/agents/domain.md`。

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
- [x] v0.2.0 发版（2026-09-24）：八风格重设计 + 全风格定制排版 + 场景化背景 + 发行产物命名统一为 `v` 前缀，构建由用户在 IDE 外执行 `build.bat`。
  - **已发布**（GitHub Release，附注 tag）：tag `v0.2.0` → commit `d3bd788`；附件 `OpiaRSSReader-v0.2.0-portable.exe` 95,171,122 bytes / `OpiaRSSReader-v0.2.0-win32-x64.zip` 142,681,122 bytes；解包目录 `OpiaRSSReader-v0.2.0-win32-x64\`；内嵌 `ProductVersion 0.2.0.0` 与 tag 一致。
  - 校验：tsc 0 错误 / vitest 287 / Playwright 82；构建前需关闭 VSCode（`build.ps1` 清 `release/` 用 `-ErrorAction SilentlyContinue`，被锁文件会**静默漏删**——本次残留了旧 `OpiaRSSReader-0.1.1-win32-x64\resources\app.asar`，构建后必须核对 `release/` 恰好只有本次三形态）。
- [ ] 橘鸦风格样式修复（逐风格推进，2026-10-11 启动）：folio（纸感精读式）已完成三轮——①横格下沉段落按行高对齐、条目去卡片透明、概览两列失效修复；②段首缩进 2em + 图文内容流排布（首图开卷/窄幅左右错位）；③变体覆盖死选择器修复 + muted 对比度 AA；④基层链接标签/hover 修复 + h2 文武线 + 朱菱分隔符 + 订阅页纸面满屏。验证 tsc 0 错误 / vitest 291 / Playwright 85 / SDD 全流程评审 + 最终验收 PASS。评审建议 ④（印章压日期行）已于 2026-10-11 遗留事务处理批次实现（commit `37e8feb`：日期行 padding-right 88px 右让印章、印章零改动；修法经控制者裁定为最小侵入候选，独立提交可回退）；其余四风格（newsprint90s/dreamcore/editorial/wabi）待体检（folio/y2k/pop 见下；nocturne 已于 2026-10-12 封版，见下）。
  - y2k（千禧网页式）已完成（2026-10-11，审计建议①-⑦）：①中文字体栈落地（正文 `'SimSun','NSimSun','DengXian',serif` / 标题 `'SimHei','Microsoft YaHei',sans-serif` / 伪标题栏 `'Courier New',monospace`，仅改两变体块 `--jy-font-*`）；②段首缩进 2em（`.juya-entry p:not(.juya-links-label)`，保留 10px 段距，导语 blockquote 天然不命中）；③EntrySplit 嵌套 h3 字号 17px y2k 兜底（共享层 `>`→后代已修，2026-10-11 SDD 共享层批次，y2k 兜底随之移除、由共享层提供 17px）；④亮侧铬字渐变末档深化 `#7e93c4→#6b82b8`（对 card 3.58:1 / lead-bg 3.30:1 实算 ≥3）+ 亮侧 `filter: drop-shadow` 上白下暗双影——**text-shadow 在 background-clip:text 下会盖住渐变填充，禁用**；暗侧渐变未动；⑤星光砖 56px→160px 双层错相（`background-position` 偏移），透明度亮 0.4/暗 0.3；⑥y2k 暗地平网格 `[data-juya-variant='y2k-dark'].jyy2k .juya-scene-grid { bottom: 136px }` 抬入视口（共享 `.juya-scene` 100vh 未扣应用 chrome 128px 的根因属共享层，另开任务）+ 网格线 alpha 0.28→0.35；⑦y2k 四处装饰伪 content（' ↗'/'◆ AI_DAILY.EXE — 运行中'/'×'/'» '）改 `'…' / ''` 空 alt 语法 + `@supports not (background-clip: text)` 实色回退。守卫：`juyaCssGuard.test.ts` 新增 y2k 组 7 项（含 WCAG 对比度实算）。共享层三项已全部落地（2026-10-11 SDD 共享层批次）：EntrySplit h3 选择器 `>`→后代形态（y2k 兜底随之移除）；短内容 `.juya-root` 断底（ReaderView 橘鸦分支补高度链）；FeedShell 列表补 React key。验证 tsc 0 / vitest 298 / Playwright 86；SimSun 高分屏渲染与 160px 砖密度待真机核对。
  - pop（波普艺术式）已完成（2026-10-11，审计批准七项=①a②b③④⑤⑥⑦；**未批不做：①b 字体栈、②a 纯 CSS 自由化四项**）：⑦暗色减黄——pop-dark `--jy-heading` `#ffe957→#f2f2ea`（border 保留荧光黄），硬阴影加暗侧复合覆盖三选择器改深紫 `#4a2d7a`（#000 在 #14141a 上不可见）；④暗 chip 暗侧覆盖 `[data-juya-variant='pop-dark'].jypop .juya-section:nth-of-type(3n+3) > h2` 米白底+深底字（亮色 #141414 字节不变，实算 16.3:1）；③爆炸星 `left: -30px→-40px` 整体移出 h1 文字盒（h1 补 margin-left 16px 收星形于刊头边框内，窄窗 24px）；①a h1 `text-shadow: 3px 3px 0 rgba(0,0,0,.28)` 印刷感（h1 两侧均坐品红刊头底，亮暗同值；字体栈锁死未动）；⑤两条 hover 规则包进 `@media (prefers-reduced-motion: no-preference)`（RM 下徽章 ±6° 静态交替与卡片静止）；⑥日期贴纸 `white-space: nowrap` + ≤520px 降级为普通 meta 文本（去描边/圆角/nowrap）；②b 模板参与——期号核实 **JuyaIssue 无独立期号字段**（期头 h1 形如「AI 早报 2026-08-28」），pop.tsx 取期头日期渲染 MM.DD 超大斜置期号（56px、rotate(-7deg)、`aria-hidden`、缺失回退 pubDate 均无则不渲染；原案品红 accent 在品红刊头底上不可见，改 on-accent 白字+`--jy-border` 硬位移阴影；≤520px 隐藏），`.juya-links-label` 爆炸星 SVG 底（preserveAspectRatio none 拉伸、实心核承载文字）+ 粗体白字（对星底 #d81b60 实算 4.95:1）。守卫：`juyaCssGuard.test.ts` 新增 pop 组 8 项（含 WCAG 实算、媒体块花括号配平提取）。零共享层改动。验证 tsc 0 错误 / vitest 306 / Playwright 86；期号数字字号与爆炸星密度待真机核对；双轴评审 Spec/Standards 双 PASS（P3 注释数字误算与期号大字 AA 守卫已采纳）+ browser-visual-qa PASS（A-H 全过、console 0 警告），最终提交 `807d5b1`。
  - pop 刊头多色矩形拼贴（2026-10-11 用户指令「头部还是不够丰富……可用多个不同颜色的矩形区域彰显风格特色，同时不影响下部正文阅读」）：阅读页 `.juya-masthead` 由单品红方块改 grid 拼贴构成——刊头底即蓝色沟槽 #1f4fd8（暗侧复合覆盖改 #141414），内含三面板：品红标题面板 `.jypop-title-panel`（h1 白字+爆炸星，padding-left 28 + h1 margin 16 = 44px 收星于面板内）、荧光黄期号面板 `.jypop-issue-panel`（#ffe957 底；期号白字→黑 #141414 实算 14.95:1，硬位移影改品红 #e0245e 亮暗共用——原 --jy-border 影在黑字/黄底上分别融字与隐形）、黑底 Ben-Day 白点色带 `.jypop-strip`（暗侧改蓝 #1f4fd8，黑带融暗底不可辨）；面板分隔走既有 3px 描边+6px 硬阴影语言（随 `--jy-border`，暗侧阴影随既有 #4a2d7a、黄面板描边改黑防黄边融底）；≤520px 期号面板整体隐藏（原仅藏数字）、标题面板 padding-left 补 20px（20+24=44px 与基础同裕度）。全部面板为刊头盒内常规流网格项不外溢正文，`margin-bottom: 24px` 间距不变，零新增 animation/transition。守卫 `juyaCssGuard.test.ts` 新增 pop 拼贴组 8 项（TDD 先红后绿：面板/网格存在、期号黑字对黄底 ≥4.5 实算、h1 两变体白字/品红 ≥3、色带纹理、星形几何双上下文实算、期号面板旋转富余、零动效、暗侧复合覆盖存在）；旧「期号白字/品红」断言保留、注释主体改指 h1。零共享层改动（基层规则/shared/parts/base.tsx 未碰）。验证 tsc 0 错误 / vitest 314 / Playwright 86；待真机核对：拼贴观感、蓝色沟槽亮变体饱和度、期号品红影密度；双轴评审 Spec/Standards 双 PASS + browser-visual-qa PASS（不侵正文 24px 间距实测、暗覆盖生效、420px 零溢出），窄窗残留 12px 列沟槽已修（gap: 12px 0），最终提交 `0e1c04a`。
  - nocturne（暗夜精修式，**暗侧默认**）已完成（2026-10-12，#1–#9 九票收口）：①Scene 新增 `dust`/`nebula` 预设（共享层 `parts.tsx`；`dust` 靠平铺 `radial-gradient` 得一两千点量级而非 DOM 节点）；②三层 nebula 接线（alpha 0.07/0.04/0.025，中心区避让）；③字体三档（DengXian / Noto Sans SC / JetBrains Mono）；④刊头 neon 标题；⑤阅读窗 700px 变体覆写 + 24px 遮罩 alpha 0.3；⑥导语 `--jy-lead-bg` 0.08 + 左竖线**外阴影**发光、栏目线 0.22；⑦概览序号发光；⑧图文回流（右列限 2 张，第 3 张起进 `.jynoct-overflow-media`）；⑨收口守卫组 + 叠加态对比度全量实算（`scripts/nocturne-contrast-audit.mjs`）+ 视觉走查归档。需求文档 `docs/juyathemesworks/nocturne-dark.md` 已入库（含 §5 / §7.1 两段实施期校正）。验证 tsc 0 错误 / vitest 388 / Playwright 90。
    - **已并入 `main`**（2026-10-12，merge `83a70d9`；`feat/nocturne-dark` @ `3286ffb` 保留不删）。**合并时 `start.bat` 必须核对**：分支那份是修复**之前**的旧版（早于 `ca975e5`，`npm run dev` 无 `call`、无条件 `pause`），合并后须确认 `git rev-parse HEAD:start.bat` == `ca975e5:start.bat`（本次实测 `fd4b6a8` 一致，修复未被回退）。
    - **已封版**（2026-10-12，用户确认「现状正常，可封版 nocturne 风格」；先例同 folio 的 `2026-10-11 folio 封版`）。此后该风格进入冻结状态——**未获用户明确授权不得再改动 `nocturne` 相关样式取值**，发现新问题须先报用户裁决（§9 的「不做」清单同样继续有效）。
    - **封版所覆盖的改动**（用户分别单独指令，均在前述范围内）：九票 #1–#9（merge `83a70d9`）、归档图重生 `c79ae16`、刊头极光带 `75dee1f`（用户指令「头部过于朴素、Vista 极光几乎不存在」——修掉「原实现根本没有极光」的根因：`filter: drop-shadow` 只能描字形轮廓、无法成带，改为两条独立伪元素的弧形渐变幕帘）。`00b86aa`（`pause` 收窄）属 `start.bat` 脚本修复，与本风格无关。
    - **归档图陈旧缺陷（合并时由 `--verify` 发现并修复）**：§10.6 的 `3a63626` 改了 nebula n3 锚点（`0% 100%` → `calc(100% - 136px)`），却**只重跑审计与字体探针、未重跑视觉走查**，致 4 张阅读页归档仍是修正前的像素（订阅页无场景层故不受影响），`--verify` 返回 **exit 1**。重生后 exit 0、5 张逐字节一致。**教训：改了影响渲染的 CSS 取值后必须重跑归档生成（写入模式）；`--verify` 只比对不写盘，正是暴露该缺陷的闸门，不可当工具噪声跳过。**
- [ ] 其他待测试内容
