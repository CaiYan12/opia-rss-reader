# 实施代理 brief

派实现子代理前的固定上下文包。目标是把探索成本前置到控制者，代理只做实现；参考本轮的教训，实施代理合计 token 成本远高于必要的读文件量。

## 必读指针

- 规格与票据（issue 编号，必要时本地 SPEC）
- `GLOSSARY.md`（术语）
- 根 `AGENTS.md` 及其按任务指向的参考小节（只加载命中内容）
- `docs/agents/workflow.md`（阶段门）
- 涉及测试、截图、原生窗口或探针时，读 `docs/agents/verification.md` 的相应小节

## 白名单

控制者在 brief 里列出允许修改的文件。代理不读白名单外的源码；需要额外文件时先回报，不要自行扩大范围。

## 验证上下文

- 提供候选基线、既有证据位置、定向命令及预期观察，说明哪些输入已验证且没有改变。
- 明确前台限制与独立资料目录；默认 headless／隐藏方式，不让子代理自行显示窗口、操作 OS 键鼠或停止用户进程。
- 新探针先跑最小完整样本、逐项保存，再扩大范围。部分失败只补缺失证据，遵循验证指南的复用条件。

## 工作方式

- 先调用 `tdd` 技能，红 → 绿。
- 每完成一个可提交单元就 commit（显式路径，信息带票号）。
- 分支纪律：从集成分支建票分支；每次 commit 前确认当前分支不是集成分支。
- 定向测试命令写在 brief 里；不跑全量 verify（留给收口票）。
- 硬停止条件：时间或上下文到点，就提交 WIP 并报告分支、HEAD、实跑测试、剩余工作。

## worktree 与依赖

隔离 worktree 没有 `node_modules`。二选一：

- **主工作树串行**：简单，推荐单人会话；在当前检出建票分支直接做。
- **隔离 worktree + 目录 junction**：Windows 下把主检出的 `node_modules` 链接进来（`cmd //c mklink /J node_modules <主检出>\node_modules`）。

不要在 worktree 里重新 `npm install`：Electron / Playwright 下载会吃掉大部分时间预算。

**⚠️ junction 生命周期硬警告（2026-10-24 事故，同日二发）**：`git worktree remove --force` 的递归删除会**穿透 junction**，把 junction 指向的主检出 `node_modules` 一并清空（应用直接无法启动，`npm run dev` 秒败）。**`git worktree remove`（不带 --force 也一样）不因 gitignored 的 junction 拒绝删除——静默穿透**。拆除流程必须逐步执行并核验，禁止把 rmdir 塞进 `2>/dev/null` 的循环里一次性跑完：①逐个 `cmd //c rmdir "<worktree>\node_modules"`（只删链接不删目标）；②逐个 `dir /AL <worktree>` 确认 JUNCTION 行已消失；③`git worktree remove`；④终态 `ls <主检出>/node_modules | wc -l` 复核目标完好。另：清理前先对 worktree 根目录做一次全量 `dir /AL` 扫描——**孤儿目录**（遗留于磁盘但未注册在 `git worktree list` 的，如 2026-10-22 的 `w47`）也可能持有活 junction。恢复被清空的依赖：`npm ci` → 本仓库 npm 的 install-scripts 策略会拦 electron/esbuild 的 postinstall，需 `npm install-scripts approve` 写入 package.json `allowScripts` 后重装；electron 二进制可从 `%LOCALAPPDATA%\electron\Cache` 的对应版本 zip 手动解压到 `node_modules/electron/dist` 并写 `path.txt`（内容 `electron.exe`）。**解压后必须提级**：仓库根目录带 Low 强制完整性标签（`icacls D:\Dev\opia-rss-reader` 可见 `Mandatory Label\Low`，OI/CI 向下传播），新解压文件全部继承 Low，Low-IL 的 electron.exe 会在 GUI 初始化即崩（exit 0x80000003 STATUS_BREAKPOINT、零日志；node 模式 `ELECTRON_RUN_AS_NODE=1 electron.exe --version` 却正常——这是判别特征，但 node 模式通过≠GUI 可用，恢复后必须做真实 GUI 启动探针：拉起后数 electron 进程 ≥4（main/gpu/utility/renderer）即 chromium 初始化成功）。修复：PowerShell 下 `icacls '...\node_modules\electron\dist' /setintegritylevel M`，用 `scripts/gpu-integrity.ps1 -RuntimeDirectory <dist>` 核验（2026-10-22 GPU 审计的三个 DLL Low 标签同源）。

## 报告

分支、HEAD、实跑测试与结果、改动文件、剩余工作。未完成不得声称完成。
