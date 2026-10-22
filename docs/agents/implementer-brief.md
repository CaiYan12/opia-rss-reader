# 实施代理 brief

派实现子代理前的固定上下文包。目标是把探索成本前置到控制者，代理只做实现；参考本轮的教训，实施代理合计 token 成本远高于必要的读文件量。

## 必读指针

- 规格与票据（issue 编号，必要时本地 SPEC）
- `GLOSSARY.md`（术语）
- `AGENTS.md` 中与本次改动相关的章节（只读命中的章节，不整篇重读）
- `docs/agents/workflow.md`（阶段门）

## 白名单

控制者在 brief 里列出允许修改的文件。代理不读白名单外的源码；需要额外文件时先回报，不要自行扩大范围。

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

## 报告

分支、HEAD、实跑测试与结果、改动文件、剩余工作。未完成不得声称完成。
