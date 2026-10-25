# 技能路由（ask-matt 流程）

完整地图由 `/ask-matt` 提供；本文件固化本仓库的默认路径、硬约束与阶段交界选择。
阶段产物与外部写操作门见[工作流阶段门](workflow.md)；领域词汇与 ADR 见[领域文档](domain.md)。

## 主流程：想法 → 交付

| 步骤 | 技能 | 本仓库约定 |
| --- | --- | --- |
| 澄清想法 | `/grill-with-docs` | 有工作目录时用它（访谈结论落 `GLOSSARY.md` / ADR）；无目录用 `/grill-me`。一轮问题 + 每题推荐答案，等回答再进下一轮。 |
| 需要可运行答案 | `/prototype`（两侧 `/handoff`） | 原型是 primary source，保留在 `prototype/<name>` 分支并从实现 issue 指过去；答案折回正式实现。 |
| 多会话建设 | `/to-spec` → `/to-tickets` → 逐票 `/implement`；或 `/implement-spec` | 逐票实现每票后 `/clear`；整 spec 用 `/implement-spec` 走 task graph 前沿并在集成分支收口。子代理并发上限实测为 1，串行派发。 |
| 实现内部 | `/tdd` → `/code-review` | 每票 TDD 红→绿；收口双轴评审（Standards + Spec）。 |
| 开 PR | `/pr` | push / 开 PR 各自需要用户明确动词，不能由「方案已批准」推断。 |
| 复盘 | `/retro` | 在同一会话、`/clear` 之前运行；只改环境（导航、检查、标准、工具），不改业务代码。 |

**上下文卫生**：步骤 1–3（grilling → spec → tickets）保持在一个未中断的上下文里，直到 `/to-tickets` 完成；每票 `/implement` 从干净上下文开始。接近 smart zone 时在阶段边界 `/compact`，不要带病推进。

## 入口（on-ramps）

| 情况 | 路径 | 备注 |
| --- | --- | --- |
| 外部 issue / 需求堆积 | `/triage` → `/implement` | 只 triage 不是 `/to-tickets` 产出的 issue；后者已 agent-ready。 |
| 难 bug（一眼看不出、间歇性、两已知好点之间的回归） | `/diagnosing-bugs` → `/retro` | 先建立一条已在本 bug 上变红的单命令反馈回路，再修；补回归测试。若结论是缺少可锁定的 seam，转 `/improve-codebase-architecture`。 |
| 巨大而模糊的工程 | `/wayfinder` → `/to-spec` → `/to-tickets` → `/implement` | wayfinder 只产出决策，不产出交付；地图清晰后必须经 `/to-spec` 收拢。只有工程确认很小时才可从地图直接 `/implement`。 |

## 代码库健康

`/improve-codebase-architecture` 找 deepening 候选；选中的候选作为一个 idea 进入 `/grill-with-docs`。模块形状用 `/codebase-design` 的词汇（module / interface / depth / seam / adapter / leverage / locality）。

## 词汇层

- `/domain-modeling`：挑战模糊或过载术语；难以回退的决定落 ADR。
- `/codebase-design`：设计模块形状时使用，也是 `/tdd` 与 `/improve-codebase-architecture` 的共同词汇。

## 独立技能

| 场景 | 技能 |
| --- | --- |
| 无工作目录时的澄清 | `/grill-me` |
| 只要访谈原语 | `/grilling` |
| 后台调研并留 cited Markdown | `/research` |
| 阻塞点在他人口中 | `/to-questionnaire` |
| 只有人才能做的步骤（凭据、第三方面板、一次性迁移） | `/wizard` |
| 消息没被理解，要求换种说法重述 | `/wait-what` |
| 多会话学习一个概念 | `/teach` |
| 写给 agent 的文档（skills、AGENTS.md、被指向的 docs） | `/writing-for-agents` |

## 阶段交界

在阶段交界处五选一：继续 / `/clear` / `/handoff` / 子代理 / `/compact`。先排除 Continue；默认沿树向下走到 `/compact`。`/handoff` 只用于换 harness、换目录、交给同事或阶段中途分叉。本仓库硬门：外部写操作（issue / PR / push / tag / 发行）各自需要用户明确动词；子代理并发上限实测为 1。

## 前置

首次工程流程前运行 `/setup-matt-pocock-skills`。本仓库已完成：issue tracker、triage labels、domain docs 三份配置分别在 [issue-tracker.md](issue-tracker.md)、[triage-labels.md](triage-labels.md)、[domain.md](domain.md)。
