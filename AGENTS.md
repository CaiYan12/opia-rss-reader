# AGENTS.md — opia-rss-reader

面向 AI 编码代理的项目约定。修改代码前必读。

## 项目概述

Windows 桌面 RSS 阅读器（Electron + React + TypeScript），默认订阅源 `https://daily.juya.uk/rss.xml`。主进程负责网络与持久化，渲染进程纯展示，插件机制面向后续扩展。

## 架构约束（不得违反）

1. **单向数据流**：渲染进程**禁止**直接发起网络请求或访问文件系统；一切数据经 IPC（契约见 `src/shared/ipc-contract.ts`）。
2. **跨进程类型**：主/渲染共用的类型只能放 `src/shared/`（types.ts / ipc-contract.ts / plugin-api.ts），新增 IPC 通道必须三处同步：契约常量 → preload 暴露 → main handler 注册。
3. **最小变更**：不重构无关代码；workaround 与 fix 必须在注释/提交信息中区分。
4. **内置功能走插件接口**：新增订阅源解析能力时优先实现 `FeedProvider`（`src/shared/plugin-api.ts`），而不是硬编码进 FeedService。
5. **主进程 timer 与窗口解耦**：自动刷新定时器在 FeedService，不得依赖窗口/Mini 模式状态。

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
