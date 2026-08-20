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

## 窗口行为事实（Windows 实测）

- 对已最大化窗口 `setSize()` **不会**解除最大化——尺寸转换前必须显式 `unmaximize()`，并先记 `isMaximized()` 与 `getNormalBounds()`（后者无论窗口状态恒返回常规态边界）。
- Mini 与最大化往返：进入 Mini 记录 `wasMaximized`，退出时还原 bounds 后 `if (wasMaximized) maximize()`。

## 文档与记忆维护

- 大型修改（新架构/新模块/行为变更）须同步更新本文件对应章节。
- 调试得出的可复用教训（如上面的窗口行为事实）须沉淀到本文件与项目记忆（`~/.trae-cn/memory/projects/-d-Dev-opia-rss-reader--p2-8c5b710068a2fd63ae01/project_memory.md`）。
- 犯错（错误 Root Cause 判断、虚构验证结果等）时必须更新记忆，避免重复犯错。

## 计划任务

- [x] v0.1.0：标签化窗口重构（无边框+TabStrip+会话持久化+Mini 修复+源切换下拉+默认订阅星形切换）
- [ ] 下迭代待定（在此维护）
