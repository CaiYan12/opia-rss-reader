# Handoff — opia-rss-reader 标签拖动排序 / 弹性宽度 / 数量上限

生成时间：2026-08-28
交接对象：Codex（具备 computer-use / 真机执行能力）
交接来源：Trae 代理（无真机能力，已完成实现 + Playwright/vitest/tsc 验证）

> 背景与需求确认记录见 `.trae/documents/tab-drag-sort-layout-cap.md`（12 项决策已确认，非目标/分阶段计划均已在此）。本文件只记执行结果与真机交接，不重复计划内容。

## 一、本次改动文件（全部为工作区未提交状态）

| 文件 | 改动 |
|---|---|
| `src/renderer/stores/tabOps.ts` | **新建**：`MAX_TABS=20`、`TAB_LIMIT_MSG`、`reorderTab(tabs,dragId,targetId,'before'\|'after')`（无效 ID/相同位置返回原数组引用）、`canOpenTab`、`truncateSavedSession` |
| `src/renderer/stores/useAppStore.ts` | 新增 `moveTab` action；4 个 `open*` 统一上限守卫 + 设置页单例复用；`init` 恢复前 `truncateSavedSession(saved, MAX_TABS)` 截断 |
| `src/renderer/components/TabStrip.tsx` | 等宽弹性布局（`flex-1 min-w-[140px] max-w-[260px]`）+ Pointer Events 拖动状态机 + 被拖标签浮起 + 边缘自动滚动 + 新建/激活滚动可见；接手后补充边缘速度上限与指针捕获清理 |
| `src/renderer/components/tabDrag.ts` | **新建**：拖动坐标、窗口边界、边缘速度与指针捕获清理纯函数 |
| `src/renderer/stores/useToastStore.ts` | **新建**：全局单例 toast（2.4s 自动清除、连续不堆叠） |
| `src/renderer/components/Toast.tsx` | **新建**：`role="status" aria-live="polite"` 提示条，主题 token |
| `src/renderer/App.tsx` | 挂载 `<Toast />` |
| `src/renderer/styles/index.css` | 末尾追加 `.toast` 动效 + reduced-motion 降级 |
| `tests/unit/tabOps.test.ts` | **新建**：23 个纯逻辑单测 |
| `tests/unit/tabDrag.test.ts` | **新建**：4 个拖动几何/边界/清理单测 |
| `tests/unit/useAppStore.test.ts` | **新建**：Mini 满标签外链守卫单测 |
| `tests/e2e/tabs.spec.ts` | **新建**：30 个 Playwright 用例（几何/拖动/上限/回归） |
| `tests/e2e/helpers.ts` | 新增 `tabs5`/`tabs20`/`tabs20Builtin`/`tabs25`/`tabsMany` 场景；`sessionGet` 可控返回、`sessionSave` 记录 `__stubCalls` |
| `tests/e2e/setup.ts` | ready 判断与 openSettings 改用 `getByRole('banner')`（避免与 settings 标签 title 冲突） |
| `AGENTS.md` | 「界面架构事实」新增标签拖动排序 / 弹性宽度 / 数量上限三条 |

## 二、已执行的验证结果（全部实际运行，非虚构）

| 验证 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 零错误 |
| 单元测试 | `npm test` | 44/44（tabOps 23 + parseJuyaIssue 16 + tabDrag 4 + useAppStore 1） |
| 渲染层 E2E | `npm run test:e2e` | 65/65（tabs 30 + 既有 35） |

接手后执行记录（2026-08-28）：IDE 外运行 `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\build.ps1` 成功，生成 `build/win-unpacked`、portable EXE 与 release ZIP；Computer Use 已在该发行版上确认 20 标签恢复、满上限「＋」Toast 和 Mini 状态。Mini 文章点击路径因 ChatGPT 面板遮挡，按一次恢复重试后停止，未标记为通过。

## 三、给 Codex 的提示词（复制粘贴给 Codex 会话）

```
你在 Windows 项目 D:\Dev\opia-rss-reader 中工作。接手前先完整阅读 AGENTS.md 与本仓库约定，再执行以下任务。

背景：标签栏新增了「Chrome 式拖动排序 + 等宽弹性宽度 + 数量上限 20」。代码与自动化测试（tsc/vitest 39/Playwright 59）已由 Trae 代理完成并全部通过，但 Electron 打包与真机行为尚未验证。你的职责是真机构建 + 真机验收 + 独立代码审查，发现问题回填修复。

环境注意（AGENTS.md 本机陷阱）：
- 构建前必须先清除 ELECTRON_RUN_AS_NODE（PowerShell: Remove-Item Env:ELECTRON_RUN_AS_NODE）。
- 必须先在 IDE/终端外杀掉正在运行的 "Opia RSS Reader" 应用实例（进程名含空格，用 Stop-Process 按 MainWindowTitle 匹配），否则 electron-builder 因 build/win-unpacked 文件占用报 EBUSY。
- 不要在会扫描锁定 build/*.asar 的 AI 扩展环境内构建（会 EBUSY）；用 IDE 外终端执行。
- electron-builder 下载 Electron zip 偶发 TLS 断连：命令级设 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ 与 ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ 重试。

步骤：
1. 构建：在 IDE 外终端运行 `npm run build`（或 build.bat / powershell -File build.ps1 -Run）。记录产物（release/ 三形态）与实际构建结果。
2. 真机验收以下清单（每项记录 通过/失败 + 证据）：
   A. 拖动排序：拖动任意标签（含主页、含拖到主页前）实时重排；释放后顺序即生效。
   B. 拖动不切换内容：拖动非激活标签，释放后仍显示拖动前的内容。
   C. 拖动反馈：被拖标签浮起（缩放+阴影），指针跟随；拖动开始后源菜单关闭。
   D. 拖动阈值：单击标签只激活不拖动；从关闭按钮/源切换按钮按下拖动不会移动标签。
   E. 边缘自动滚动：标签多到横向溢出（约 >7 个）后，拖到左右边缘自动滚动；释放后被拖标签可见。
   F. 取消路径：拖动中按 Esc / 点击窗口外 / 拖动到窗口外释放，顺序不变。
   G. 弹性宽度：标签少（1-2 个）时等宽铺满但不过宽（≤260px）；标签增多逐渐收缩；最小宽 140px 后横向滚动；加号紧跟最后标签。
   H. 数量上限：开满 20 个标签后，「＋」/点击文章/外链内置浏览器 均被拒绝并弹 toast「标签已达上限（20）」；连续点击不堆叠；toast 约 2.4s 消失。
   I. 设置页复用：已打开设置标签时再点设置按钮，只激活不新增。
   J. 会话持久化：拖动重排后重启（startupOpen=lastSession），顺序保持。
   K. 恢复超限：手工构造 25 个标签的会话（或临时改 MAX_TABS 验证截断逻辑）后重启，只恢复 20 个。
   L. 回归：中键关闭、关闭按钮、源切换菜单、Ctrl+Tab 顺序、关闭最后标签退出、浏览器标签标题更新、亮/暗主题下视觉 token 正常（无硬编码颜色）。
   M. reduced-motion：系统开启减弱动态后，toast/拖动无多余位移动画，功能正常。
3. 独立代码审查：检查 moveTab/守卫/截断覆盖入口完整性、拖动状态机清理路径（pointercancel/blur/Escape/卸载）、toast aria-live、reduced-motion、是否有遗漏的标签创建入口（grep openHomeTab|openReaderTab|openBrowserTab|openSettingsTab）。发现问题按最小变更修复并重跑 npx tsc --noEmit + npm test + npm run test:e2e。
4. 若真机发现拖动手感/阈值/宽度像素值问题：阈值 DRAG_THRESHOLD=5、边缘触发区 EDGE_ZONE=48、max 速度 EDGE_MAX_SPEED=24、min-w 140 / max-w 260 均为建议初值（见 tabOps/TabStrip），按真机手感标定并回写 AGENTS.md。

约束：
- 遵守 AGENTS.md 全部架构约束（单向数据流、shared 类型、主题 token、最小变更、reduced-motion）。
- 不得为拖动引入新依赖；不得改 SavedSession 契约；不得改关闭邻接激活规则。
- 不得把未实际运行的结果写成已验证。
- 完成时返回：构建结果、每项验收 通过/失败 + 证据、审查发现与修复、最终三验证结果。
```

## 四、真机验收清单（速查）

1. 拖动排序（含主页、跨到主页前、多主页）
2. 拖动不切换内容 / 单击不误触发拖动
3. 拖动反馈（浮起/阴影/源菜单关闭）
4. 溢出边缘自动滚动 + 释放后可见
5. Esc/失焦/窗口外释放取消
6. 弹性宽度（少→铺满、多→收缩、min 后滚动、加号位置、长标题省略）
7. 上限 20（＋/文章/外链全拒绝 + toast 不堆叠）
8. 设置页复用
9. 会话重启顺序保持 + 恢复超限截断
10. 回归：中键/关闭按钮/源菜单/Ctrl+Tab/关最后退出/浏览器标题/亮暗主题/reduced-motion

## 五、suggested skills

接手代理（Codex）建议按需调用：
- `superpowers:systematic-debugging`：真机发现拖动错位/指针泄漏/滚动异常时先稳定复现再定位。
- `superpowers:requesting-code-review` / `vercel:react-best-practices`：独立审查阶段。
- `superpowers:verification-before-completion`：交付前重跑允许的验证并记录最新结果。

## 六、未决风险 / 待真机确认

- 拖动阈值 5px、边缘触发区 48px、最大速度 24px/帧、min-w 140 / max-w 260 均为建议初值，需真机手感标定（Playwright 已按这些值通过几何断言）。
- Playwright 桩无法覆盖：真实 Electron 会话落盘与重启恢复、原生指针/DPI 175% 手感、webview 标题更新（浏览器标签）、toast 在真实窗口的层级与主题。这些必须在真机验收。
- `openSettingsTab` 语义变化：由「可开多个设置标签」改为「单例复用」（已确认，属预期）。
- 未提交 git：全部改动处于工作区未提交状态，由用户决定是否提交。
- 后续修订：已补充 Chrome 式插入竖线、当前激活标签淡化，以及原槽位透明占位 + 跨过标签 `transform` 让位动画；keep-alive 内容面板按稳定 DOM 顺序渲染，避免视觉标签重排移动活动页面造成异常刷新。真机仍需检查让位速度、竖线位置和淡化比例。

## 七、关键文件速查

- 重排/上限/截断纯函数：`src/renderer/stores/tabOps.ts`
- store 接线（moveTab/守卫/复用/截断）：`src/renderer/stores/useAppStore.ts`
- 拖动 + 弹性宽度：`src/renderer/components/TabStrip.tsx`
- toast：`src/renderer/stores/useToastStore.ts` + `src/renderer/components/Toast.tsx`
- 单测：`tests/unit/tabOps.test.ts`
- E2E：`tests/e2e/tabs.spec.ts`（helpers/setup 有配套扩展）
