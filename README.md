# 📰 Opia RSS Reader

Windows 桌面 AI 新闻 RSS 阅读器。默认订阅 [橘鸦AI早报](https://daily.juya.uk/rss.xml)，支持多订阅源、可自定义主题与布局、Mini 挂件模式与插件扩展。

## ✨ 功能

- **多订阅源**：浏览器式标签页，一源一页；支持添加 / 删除 / 启停
- **标签栏**：Chrome 式标签页——可拖动排序（全部标签自由重排）、等宽弹性宽度（少量标签铺满、溢出横向滚动）、数量上限（20）与超限提示；标签会话重启自动恢复
- **三种布局预设**：紧凑列表、卡片网格（1–4 列可调）、杂志风；卡片字段（封面 / 摘要 / 时间 / 来源）可独立开关
- **应用内阅读**：渲染 RSS `content:encoded` 全文（DOMPurify 消毒），图片懒加载；点击行为可在设置中切换为浏览器打开
- **橘鸦定制阅读系统**：内置橘鸦AI早报源提供八套独立视觉风格（纸感精读式 / 千禧网页式 / 波普艺术式 / 90 年代报刊式 / 蒸汽梦核式 / 暗夜精修式 / 杂志编辑式 / 侘寂日杂式）× 亮暗双变体；每风格独立设计排版（图文并排、首图通栏、题注装裱、奇偶错位等）与场景化背景（synthwave 条纹太阳与透视网格、星空、信纸格线与印章水印等）；订阅页遵循「布局」的预设 / 列数 / 显示字段；可整体关闭回退通用样式；内置源不可删除、不可停用
- **主题系统**：内置 Windows-Light、Windows-Dark、Claude-Design、Juya-Daily 四套主题；主题编辑器支持取色、字体、字号、圆角实时预览并另存为自定义主题
- **Mini 模式**：无边框置顶小窗，整体可拖动，日期行可展开——橘鸦源展示简报、其他源展示限长摘要，「查看更多」回正常模式阅读（不开外链），一键切回
- **历史记录**：已读 / 收藏 / 阅读时间持久化，保留天数可配
- **自动刷新**：启动拉取 + 定时刷新（间隔可配）+ 手动刷新
- **插件机制**：`plugins/` 目录加载三类注册点 —— FeedProvider（订阅源抓取）与 Theme（主题）完整可用，CardRenderer 在 v1 仅登记元数据；契约、限制与排障见 [docs/PLUGIN_API.md](docs/PLUGIN_API.md)

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

1. 调用 `build.ps1` 完成 electron-vite + electron-builder 生产构建 → `build/OpiaRSSReader-v<version>-portable.exe`
2. 精简 locales（仅保留 en-US / zh-CN）、删除残留 `default_app.asar` 与 `.pdb` 调试符号
3. 组装完整可运行 app 到 `release/`，并生成 zip 与 portable exe

产出（位于 `release/`，已被 `.gitignore` 忽略）：

| 文件 | 说明 |
|---|---|
| `OpiaRSSReader-v<version>-win32-x64\` | 完整 app 目录（exe + dll + 资源） |
| `OpiaRSSReader-v<version>-win32-x64.zip` | 同名压缩包，供 GitHub Releases 上传 |
| `OpiaRSSReader-v<version>-portable.exe` | 单文件便携版 |

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

**一条命令跑全部闸门**（本地）：

```powershell
npm run verify      # = typecheck + vitest + Playwright + 对比度审计 + 归档逐字节比对
```

CI 跑 `npm run verify:ci`：同一条链路，但跳过归档逐字节比对 —— 归档截图依赖本地字体与渲染环境，跨机器不可能逐字节一致（2026-10-22 CI 首跑实证 5 张全不一致）。本地仍用 `npm run verify` 锁死归档。

分项跑：

```powershell
npm run typecheck   # tsc --noEmit
npm test            # vitest 单元测试（解析器等纯逻辑，tests/unit）
npm run test:e2e    # Playwright 渲染层端到端（先自动 build:dir，驱动 out/renderer + window.opia 内存桩）
npm run verify:nocturne  # 两个 nocturne 专用闸门（见下）
```

### 本机 GPU 自检

遇到窗口卡顿、重装 Electron 依赖后，或发行前核查本机运行时：

```powershell
npm run diagnose:gpu
npm run diagnose:gpu -- --help
```

该命令启动独立、隐藏的 Electron 探针，检查实际活动显卡、硬件合成、栅格化和 GPU 初始化日志；Windows 额外只读查询 `electron.exe`、`libEGL.dll`、`libGLESv2.dll`、`d3dcompiler_47.dll` 的完整性标签。它自动为子进程清除 `ELECTRON_RUN_AS_NODE`，不加载阅读器配置，不自动修权限，不强制选择独显。

报告保存在 `out/gpu-diagnostics/run-*/report.md` 和 `report.json`，同目录保留原始日志；每次创建新目录，既有报告不覆盖。退出码：`0` = PASS，`1` = 检出软件回退或 Low 标签，`2` = 信息不足、启动失败或超时。该本机检查独立于 `verify` / CI；不是显示 FPS、应用当前实例或发行包的验收。

可用 `--electron <独立 Electron 运行时的 electron.exe>` 检查另一份运行时，`--output <目录>` 指定报告父目录，`--timeout <毫秒>` 设置 5000–60000ms 的探针预算（默认 15000ms，标签查询另有 15 秒上限）。`--electron` 不用于启动打包后的 Opia exe。Windows 只读标签查询使用进程级执行策略参数运行仓库内脚本，不改变系统执行策略；查询被更高层策略拦截时报告信息不足。排障背景见 [GPU 核查记录](docs/GPU-AUDIT-2026-10-22.md)。

### 本机性能探针（perf-probe）

需要在不改正式样式的前提下，按固定口径复核阅读页滚动性能时：

```powershell
npm run build:dir
npm run diagnose:gpu
npm run perf:probe
npm run perf:probe -- --mode light
npm run perf:probe -- --mode trace
npm run perf:probe -- --app-dir D:/Dev/opia-wt/old58219a1 --mode light
npm run perf:probe -- --help
```

该命令启动真实 Electron 主进程 / preload / IPC / 渲染层，使用独立的临时 profile 和确定性的缓存合成文章（32 条目 / 34 图像），要求窗口 1099×721 CSS px、DPR 1.75、`uiZoom=1`，以 600 px/s 向下滚动 3000 CSS px 后输出报告；不满足这些条件即判不可比。轻量采样（只装 rAF 采样器）与完整 trace（Chromium compositor 帧事件）分开启动、分开报告，数字不可混档比较。

固定条件逐项写入报告头：样本标题 / 条目数、视口、DPR、uiZoom、滚动距离 / 速度、GPU 型号、显示器刷新率、`document.visibilityState`、`[data-app-hidden]`。任何一项不满足、GPU 未 PASS 或无法证明 profile 隔离时，报告标注「样本不可比」，退出码 `1`。报告中的 GPU 状态来自本次应用内 `getGPUFeatureStatus()` / `getGPUInfo()`，不等于完整性标签结论；标签级排障仍以 `npm run diagnose:gpu` 为准。轻量采样输出 rAF 回调频率、回调间隔（中位 / P95 / 最差）；完整 trace 输出 compositor 呈现帧数、呈现间隔与 `DroppedFrame` 掉帧数。取不到的指标显式写「未测」，不填 0。

退出码：`0` = 样本可比；`1` = 已产出报告但样本不可比；`2` = 启动 / 测量失败或参数非法。报告保存在 `out/perf-probe/run-*/`，每次新建目录，不覆盖既有报告。

旧 / 新构建比较（#47）：`--app-dir <path>` 指向已运行 `build:dir` 的应用根目录；主进程、preload 与 renderer 均来自该目录，Electron 可执行文件固定取探针自身的依赖，避免两组运行时不同。报告分别记录探针与被测应用的 HEAD、构建指纹和主进程实际路径。网格载体按父元素 → `::after` 探测；`--pause-grid` 只停检测到的载体。两处都无动画时返回 `2`，不会把旧版静默当成新版。A/B 正式比较应让两版网格均运动，预热不计入统计，按旧→新→新→旧重复至少两轮；轻量与 trace 分档，报告成对差值、中位数与组内漂移，漂移覆盖差值时结论为「收益未确定」。

隔离：探针在 require 主进程前把 `userData` / `sessionData` 指向临时目录，并在运行前后对真实 profile（`%APPDATA%/opia-rss-reader` 等）做只读 stat 快照；报告记录临时 / 真实路径与前后变化。无法隔离时立即停止，不改用真实 profile。运行前请关闭正在使用的 Opia 实例；若真实 profile 在采样期间被别的进程写入，报告会判为无法证明隔离。实现上使用 Playwright `_electron` 启动真实应用，再从页面会话开 CDP `Tracing` / `Input.synthesizeScrollGesture`；调试端口由 Playwright 以临时端口分配，不占用 `4173` / `9222`，也不需要手写 websocket CDP 客户端。采样前会把被测窗口聚焦并移到 z 序最前（不设 always-on-top），避免遮挡节流污染样本。

边界：**这不是显示 FPS 验收**。rAF 回调频率不是显示 FPS；trace 的呈现 / 掉帧是 Chromium compositor 口径，不等于显示器扫描输出。每次运行是一个单段样本，机器负载或温度会带来明显波动；比较时应看同一批次的多次复跑，不要用单次数字下结论。样本是合成固定文章，不是 `docs/GPU-AUDIT-2026-10-22.md` 的缓存文章，绝对值不可跨样本比较。初版 ≥100Hz 绝对目标已撤销，100Hz 仅作历史参考，不写入测试门槛、不进 `verify` / CI 或探针退出码；旧 / 新比较按交错复跑的成对差值、中位数与组内波动判断。synthwave 本轮实现及 A/B 已完成并封稿，结果与适用范围见 `docs/GPU-AUDIT-2026-10-22.md`；代码与发行状态另行区分。

### 橘鸦风格的额外闸门

改动了 `src/renderer/juya/` 下的 CSS 就多两道闸（已含在 `npm run verify` 里）：

```powershell
node scripts/nocturne-contrast-audit.mjs             # 叠加态对比度全量实算，取值实读 juya.css，退出码上报
node scripts/nocturne-visual-walkthrough.mjs         # 写入模式：重生归档截图 + 打印 RM 证据
node scripts/nocturne-visual-walkthrough.mjs --verify # 只比对不写盘（重生后必须 exit 0）
```

> **改了影响渲染的取值时**：先跑写入模式重生归档，再跑 `--verify`。跳过重生会让 `--verify` 报旧图陈旧（曾踩过）。逐项历史见 `docs/STYLE-WORKLOG.md`。

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

插件是 `plugins/` 下的一个目录，含清单与 CommonJS 入口：

```
plugins/<your-plugin>/
├── manifest.json   # { id, name, version, main, provides: ["feed-provider"|"theme"|"card-renderer"] }
└── index.cjs       # 导出实现 OpiaPlugin 的对象（类型见 src/shared/plugin-api.ts）
```

- `provides` 是**能力开关**：没声明的注册点，即使入口里带了对应字段也不会生效。
- 加载发生在启动时（一次、同步、无热重载），改完插件需重启应用；没有 `init` / `dispose` 钩子。
- 发行版是便携 exe，`app.asar` 内的 `plugins/` 只读 —— **用户插件请放 `%APPDATA%\Opia RSS Reader\plugins\`**。
- 插件以 main 进程完整权限运行且未沙箱化；主题颜色会直接注入 CSS，核心不做净化。
- 三类注册点可用度不同：**FeedProvider 与 Theme 完整可用，CardRenderer 在 v1 仅登记元数据、界面无变化。**

完整契约、provider 选中规则、主题校验规则、排障日志与坑位清单见 **[docs/PLUGIN_API.md](docs/PLUGIN_API.md)**。
可直接照抄的骨架见仓库内三个示例（`npm test` 会校验它们真实可加载）：

| 示例 | 注册点 |
| --- | --- |
| `plugins/example-json-feed/` | `feed-provider` —— JSON Feed 1.1 解析器 |
| `plugins/example-theme/` | `theme` —— 亮/暗各一的完整主题 |
| `plugins/example-hello/` | `card-renderer` —— 仅元数据（演示 v1 未接通） |

重启应用后自动加载，主进程日志 `[main] plugin registry: {...}` 可见注册结果。

---

## 🗺️ TODO

这里的 TODO 是公开路线图，欢迎通过 [Issue](https://github.com/CaiYan12/opia-rss-reader/issues) 讨论优先级，或直接提交 PR 认领已经明确的任务。

- [x] 补充 IPC、FeedService、标签会话与主题系统的自动化测试（`npm test`：契约三处同步守卫、provider 选中与源锁定、会话序列化与恢复截断、主题亮暗分类与校验）
- [x] 完善 `FeedProvider`、`Theme`、`CardRenderer` 插件 API 文档与示例（[docs/PLUGIN_API.md](docs/PLUGIN_API.md) + `plugins/` 三个示例；CardRenderer 明确标注 v1 未接通）
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
其中，Codex（OpenAI）作为共同作者与贡献者参与本项目。
