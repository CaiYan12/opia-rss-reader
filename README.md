# 📰 Opia RSS Reader

Windows 桌面 AI 新闻 RSS 阅读器。默认订阅 [橘鸦AI早报](https://daily.juya.uk/rss.xml)，支持多订阅源、可自定义主题与布局、Mini 挂件模式与插件扩展。

## ✨ 功能

- **多订阅源**：浏览器式标签页，一源一页；支持添加 / 删除 / 启停
- **三种布局预设**：紧凑列表、卡片网格（1–4 列可调）、杂志风；卡片字段（封面 / 摘要 / 时间 / 来源）可独立开关
- **应用内阅读**：渲染 RSS `content:encoded` 全文（DOMPurify 消毒），图片懒加载；点击行为可在设置中切换为浏览器打开
- **橘鸦定制阅读系统**：内置橘鸦AI早报源提供五套独立视觉风格（卡片主题式 / 千禧网页式 / 波普艺术式 / 90 年代报刊式 / 蒸汽梦核式）× 亮暗双变体；订阅页遵循「布局」的预设 / 列数 / 显示字段；可整体关闭回退通用样式；内置源不可删除、不可停用
- **主题系统**：内置 Windows-Light、Windows-Dark、Claude-Design、Juya-Daily 四套主题；主题编辑器支持取色、字体、字号、圆角实时预览并另存为自定义主题
- **Mini 模式**：无边框置顶小窗，整体可拖动，紧凑列表，一键切回
- **历史记录**：已读 / 收藏 / 阅读时间持久化，保留天数可配
- **自动刷新**：启动拉取 + 定时刷新（间隔可配）+ 手动刷新
- **插件机制**：`plugins/` 目录加载，支持 FeedProvider / Theme / CardRenderer 三类注册点（示例见 `plugins/example-hello/`）

## 🧰 技术栈

<p align="center">
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white" alt="Electron 43"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" alt="TypeScript 7"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 3"></a>
</p>

| 领域 | 技术 |
| --- | --- |
| 桌面运行时 | [Electron](https://www.electronjs.org/) `43` · [electron-vite](https://electron-vite.org/) `5` |
| 前端界面 | [React](https://react.dev/) `19` · [Tailwind CSS](https://tailwindcss.com/) `3` |
| 语言与构建 | [TypeScript](https://www.typescriptlang.org/) `7` · [Vite](https://vite.dev/) `7` |
| 状态与持久化 | [Zustand](https://zustand.docs.pmnd.rs/) `5` · [electron-store](https://github.com/sindresorhus/electron-store) `8` |
| RSS 与内容安全 | [rss-parser](https://github.com/rbren/rss-parser) `3` · [DOMPurify](https://github.com/cure53/DOMPurify) `3` |

## 🛠️ 开发 / 构建

安装依赖：`npm install`

项目提供两个一键脚本，分别用于开发调试与发布构建。两者均内置本机托管 Node 路径与 `ELECTRON_RUN_AS_NODE` 清除，双击即可运行。

### Debug —— `start.bat`

开发模式（热重载）。双击 `start.bat`，或手动：

```powershell
npm run dev
```

`start.bat` 会切换到托管 Node 22.22.2、清除 `ELECTRON_RUN_AS_NODE`、优雅关闭上一轮遗留的 dev 实例（仅限本项目路径下的 electron，不影响 VSCode 等其它 Electron 应用），随后启动 `electron-vite dev`。`Ctrl+C` 停止。

### Release —— `build.bat`

一键发布构建。双击 `build.bat`，或在项目根运行：

```powershell
.\build.bat
```

流程：

1. 调用 `build.ps1` 完成 electron-vite + electron-builder 生产构建 → `build/OpiaRSSReader-<version>-portable.exe`
2. 精简 locales（仅保留 en-US / zh-CN）、删除残留 `default_app.asar` 与 `.pdb` 调试符号
3. 组装完整可运行 app 到 `release/`，并生成 zip 与 portable exe

产出（位于 `release/`，已被 `.gitignore` 忽略）：

| 文件 | 说明 |
|---|---|
| `OpiaRSSReader-v<version>-win32-x64\` | 完整 app 目录（exe + dll + 资源） |
| `OpiaRSSReader-v<version>-win32-x64.zip` | 同名压缩包，供 GitHub Releases 上传 |
| `OpiaRSSReader-<version>-portable.exe` | 单文件便携版 |

> 构建前若检测到 VSCode 正在运行，`build.bat` 会提示先关闭——VSCode 的 AI 扩展会扫描并锁定 `build/` 下的 asar 文件，导致 electron-builder 报 EBUSY。

### 仅构建不发布 —— `build.ps1`

`build.ps1` 是 `build.bat` 的构建核心，也可单独运行做快速验证。加 `-Run` 会在构建后启动 `build/win-unpacked/` 里的实际 exe（非 portable SFX，以便捕获 stdout），并 tail 日志直到出现 `initial refresh` 标记：

```powershell
powershell -File build.ps1        # 仅构建 portable exe 到 build/
powershell -File build.ps1 -Run   # 构建并启动，tail 启动日志
```

> **本机环境注意**：若环境变量存在 `ELECTRON_RUN_AS_NODE=1`，Electron 会以纯 Node 模式运行而无法开窗。三个脚本均已内置清除；在其它 shell 中手动运行 `npm run dev` / `npm run build` 前请自行 `unset ELECTRON_RUN_AS_NODE`（bash）或 `Remove-Item Env:ELECTRON_RUN_AS_NODE`（PowerShell）。
>
> 脚本中的 Node 路径 `C:\Users\Einn Tzai\.workbuddy\binaries\node\versions\22.22.2` 为本机托管运行时，其它机器请改为自己的 Node 路径或移除该行改用系统 Node。

### 测试

```powershell
npm test            # vitest 单元测试（解析器等纯逻辑，tests/unit）
npm run test:e2e    # Playwright 渲染层端到端（先自动 build:dir，驱动 out/renderer + window.opia 内存桩）
npx tsc --noEmit    # 类型检查（提交前必过）
```

## 🗂️ 目录结构

```
src/
├── main/                 # 主进程
│   ├── index.ts          # 入口、单实例锁、服务装配
│   ├── window.ts         # 窗口创建、Mini/完整模式切换
│   ├── feed/             # FeedService（抓取/缓存/定时刷新）+ 内置 RssProvider
│   ├── store/            # StoreService（electron-store 封装）
│   ├── theme/            # ThemeService + 内置主题 token
│   ├── plugin/           # PluginManager（plugins/ 目录加载器）
│   └── ipc.ts            # IPC handler 集中注册
├── preload/index.ts      # contextBridge 类型安全 API（window.opia）
├── renderer/             # React 渲染层
│   ├── components/       # TitleBar / TabStrip / HomeView / ReaderView / BrowserPage / SettingsPanel / ThemeEditor / MiniView 等
│   ├── juya/             # 橘鸦定制阅读系统：结构化解析 / 风格注册表 / 五风格模板 / juya.css
│   ├── layouts/          # 紧凑列表 / 卡片网格 / 杂志风
│   ├── stores/           # zustand 全局状态
│   └── theme/            # CSS 变量注入
└── shared/               # 主/渲染共用：types.ts、ipc-contract.ts、plugin-api.ts
tests/                    # vitest 单测（tests/unit）+ Playwright 端到端（tests/e2e）+ 脱敏夹具（tests/fixtures，不提交）
plugins/                  # 插件目录（含示例 example-hello）
```

## 💾 数据位置

- 设置 / 订阅源 / 历史 / 文章缓存：`%APPDATA%/Opia RSS Reader/opia-data.json`
- 自定义主题：`%APPDATA%/Opia RSS Reader/themes/*.json`

## 🧩 插件开发

在 `plugins/<your-plugin>/` 放置：

```
manifest.json   # { id, name, version, main, provides: ["feed-provider"|"theme"|"card-renderer"] }
index.cjs       # CommonJS，导出实现 OpiaPlugin 接口的对象（见 src/shared/plugin-api.ts）
```

重启应用后自动加载，主进程日志可见注册结果。

---

## 🗺️ TODO

这里的 TODO 是公开路线图，欢迎通过 [Issue](https://github.com/CaiYan12/opia-rss-reader/issues) 讨论优先级，或直接提交 PR 认领已经明确的任务。

- [ ] 补充 IPC、FeedService、标签会话与主题系统的自动化测试
- [ ] 完善 `FeedProvider`、`Theme`、`CardRenderer` 插件 API 文档与示例
- [ ] 持续优化不同 Windows 环境下的兼容性、打包与升级体验
- [ ] 根据社区反馈完善订阅管理、阅读体验与无障碍支持

## 🐛 Issue 与反馈

发现 Bug、希望新增功能或有使用建议，欢迎前往 [GitHub Issues](https://github.com/CaiYan12/opia-rss-reader/issues)。

- 提交前请先搜索已有 Issue，避免重复反馈。
- 新建 Issue 时请尽量提供应用版本、Windows 版本、复现步骤、预期行为和实际行为。
- UI 或交互问题请附上截图；启动、刷新或构建问题请附上相关日志，并移除订阅地址、本地路径等敏感信息。
- 如果问题涉及安全或隐私，请只公开必要信息，并在提交前确认日志中没有个人数据。

也可以直接使用 [新建 Issue](https://github.com/CaiYan12/opia-rss-reader/issues/new) 入口提交反馈。

## 🤝 贡献

我们欢迎任何可行的贡献代码、插件、文档、测试和 UI 改进。建议按以下流程参与：

1. 先在 [Issues](https://github.com/CaiYan12/opia-rss-reader/issues) 中搜索或讨论变更意图。
2. Fork 仓库，创建独立分支，并保持每个 PR 聚焦于一个主题。
3. 完成修改后运行 `npx tsc --noEmit` 和 `npm run build`。
4. 提交 Pull Request，说明变更内容、关联的 Issue、验证方式；涉及 UI 的改动请附截图或录屏。

提交代码时请遵循项目的架构边界：

- 渲染进程不直接访问网络或文件系统，跨进程数据统一经 IPC 传递。
- 新增 IPC 通道时，同步更新共享契约、preload 暴露和主进程 handler。
- 新增订阅源解析能力时，优先实现 `FeedProvider`，不要直接硬编码进 `FeedService`。
- UI 样式使用主题 token；无关重构请与功能性改动分开提交。

感谢每一位提交反馈、修复问题、编写插件或完善文档的贡献者。
