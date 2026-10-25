# AGENTS.md — opia-rss-reader

修改代码前读取本文件，再按任务加载下面的参考文档。

## 项目与架构边界

Windows 桌面 RSS 阅读器，使用 Electron + React + TypeScript。主进程负责网络和持久化，渲染进程负责展示。

1. 渲染进程不直接访问网络或文件系统，数据经 IPC；契约在 `src/shared/ipc-contract.ts`。
2. 跨进程共用类型只放在 `src/shared/`。新增 IPC 通道同步更新契约常量、preload 暴露和 main handler。
3. 新增订阅解析能力优先实现 `FeedProvider`（`src/shared/plugin-api.ts`），不硬编码进 FeedService。
4. 自动刷新 timer 属于 FeedService，与窗口和 Mini 状态解耦。
5. `Tab` 状态在 `src/renderer/stores/useAppStore.ts`；原生窗口操作经 IPC 交给 `src/main/window.ts`。
6. 通用组件使用主题 token（`tailwind.config.js` 映射的 CSS 变量），不内嵌硬编码颜色／样式值。风格 CSS 的作用域、材质色和滚动条例外见 UI 参考；不借局部改版改变共享默认行为。
7. 保持最小变更，不重构无关代码；区分 workaround 与 fix。调整依赖前先读版本约束及原因。

## 用户前台与资料保护

- 验证优先 headless、隐藏窗口或后台方式；需要显示／聚焦窗口、OS 键鼠操作或停止用户进程时，先说明具体原因并协调取得授权。
- 原生验收使用独立资料目录和真实 main/preload/IPC。隐藏 DOM 焦点、截图或浏览器桩的证明范围见验证指南，不能据此声称 OS 前台行为已通过。
- 启动 Electron 前检查并清除 `ELECTRON_RUN_AS_NODE`；运行、打包及文件占用处理先读 Windows 参考。

## 按任务读取

只加载当前任务命中的文档或小节，按需继续；不要把所有参考文档重新塞进每个子代理上下文。

| 任务 | 必须读取 |
| --- | --- |
| 选择技能、判断该走哪条流程、阶段交界 | [技能路由](docs/agents/skills.md)；阶段产物与外部写操作门见 [工作流阶段门](docs/agents/workflow.md) |
| 开始或继续一个工作阶段、外部写操作 | [工作流阶段门](docs/agents/workflow.md) |
| 依赖、Windows 启动、打包、GPU、原生窗口 | [Windows 运行与构建参考](docs/agents/windows-runtime.md)；具体命令查 [README](README.md) 与 `package.json` |
| 标签、主题、缩放、Mini、橘鸦模板与 CSS | [UI 与橘鸦阅读参考](docs/agents/ui-reference.md)的相关小节 |
| 某个风格的修改、验收或封版后需求 | [逐风格施工记录](docs/STYLE-WORKLOG.md)中该风格的范围和已接受取舍 |
| 测试、截图、原生验收或新增探针 | [验证指南](docs/agents/verification.md) |
| 派实现子代理 | [实施代理 brief](docs/agents/implementer-brief.md) |
| 领域术语或架构决策 | [GLOSSARY.md](GLOSSARY.md)、[领域文档入口](docs/agents/domain.md) |
| GitHub issue、PR 或标签 | [Issue tracker](docs/agents/issue-tracker.md)、[标签映射](docs/agents/triage-labels.md)；仓库操作使用 `gh` CLI |
| 发行或回溯旧版 | [README](README.md)的发行流程、[发行记录](docs/RELEASES.md) |
| 插件接口 | [插件 API](docs/PLUGIN_API.md) |

## 验证与交接

按验证指南完成必要检查，报告实际命令、退出码、候选版本和未覆盖边界。源码、测试／夹具、配置或环境改变后，重新判断证据是否有效；纯文档导航变更只运行受影响的检查，不重复启动产品。

交接以当前 Git、配置和实际输出为准；历史测试数、分支、标签、机器状态不作为当前结果。错误记录应明确更正，并保留原始失败及其适用边界。

## 文档与记忆维护

- 新架构、行为变化或可复用教训写入对应参考文档；只有新增任务入口或必须常驻的硬边界才修改本文件。
- 命令以配置和 README 为准，术语以 GLOSSARY 为准；历史数字、施工过程与版本考古分别放施工记录和发行记录，避免维护多份状态缓存。
- 项目经验默认沉淀到对应项目文档。长期个人记忆遵循当前环境的授权要求；不能仅因犯错便自行写入个人记忆或改动全局代理规则。
- 已作废的历史计划／交接稿与已关轮次的本地 SPEC／TICKETS 已于 2026-10-25 清理（正本为 GitHub issue 或 git 历史），不再回补；现行执行约定以本文件指向的当前参考为准。

## Agent skills

### Workflow

主流程与入口路由见 `docs/agents/skills.md`；阶段产物与外部写操作门见 `docs/agents/workflow.md`。默认路径：`/grill-with-docs` → `/to-spec` → `/to-tickets` → 逐票 `/implement`（`/tdd` 驱动、`/code-review` 收口）。

### Issue tracker

GitHub issues（`CaiYan12/opia-rss-reader`，用 `gh` CLI）。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个 canonical triage 角色与仓库标签字符串一一相同（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：根目录 `GLOSSARY.md` + `docs/adr/`（按需创建）。见 `docs/agents/domain.md`。
