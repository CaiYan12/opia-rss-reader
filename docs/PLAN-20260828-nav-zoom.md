# 视图内 nav 不随内容区缩放 — 计划（2026-08-28）

> 状态：执行中。本计划针对「Ctrl+滚轮内容区缩放时，详情页工具栏 / 设置页标题栏 / 浏览器地址栏跟随缩放」问题的结构性修复。

## 一、目标

内容区缩放（`settings.uiZoom`，0.5–2，Ctrl+滚轮）只作用于各视图的**内容区**；视图内上方的 nav（详情页收藏/原文工具栏、设置页标题栏、外部页地址栏）与全局标题栏/标签栏一样**保持固定尺寸**，不随缩放。

## 二、现状与问题

- 现状：`App.tsx` 在标签内容最外层 `div` 上挂 `style={{ zoom: uiZoom }}`，包住**全部**标签内容 → 三个视图的内嵌 nav 也在 zoom 子树内，随缩放放大缩小。
- 全局标题栏/标签栏/ZoomWidget 在 zoom 容器外，不受影响（符合预期）。
- 已否决方案：对 nav 做反向缩放（`zoom: 1/uiZoom`）——用户判定为「换汤不换药」，nav 仍在 zoom 子树内，仅靠嵌套缩放抵消，非结构性修复。

## 三、方案（结构性修复）

把 `zoom` 从 App 层**下沉到各视图的内容区**（scroller 内部包裹一层 zoom div），nav 移出 zoom 子树：

- `App.tsx`：移除标签内容外层 `style={{ zoom: uiZoom }}`。
- 各视图在 `flex-1 overflow-y-auto` **内部**包一层 `<div style={{ zoom: uiZoom }}>`，nav 留在 zoom 外层：
  - `HomeView`：`main` 内包 zoom（无 nav，整页缩放，行为不变）。
  - `ReaderView`：`flex-1 overflow-y-auto` 内包 zoom；工具栏在外。
  - `SettingsPanel`：`flex-1 overflow-y-auto` 内包 zoom（`space-y-4 p-4` 移入 zoom 内层，随内容缩放）；标题栏在外。
  - `BrowserPage`：webview 外包 zoom（`flex-1` 移入 zoom 内层、webview 改 `h-full w-full`）；地址栏在外。
- 三处 nav 保留 `view-nav` 类（语义标记 + 测试稳定定位）。
- 缩放语义不变：zoom 放大内部 px 长度、不放大 flex/百分比分配尺寸（Chromium 实测，见 AGENTS.md），scroller 仍恰好填满可用空间并正常滚动。

## 四、范围 / 非目标

范围：三个视图 nav 固定 + zoom 下沉。非目标：不改 zoom 语义/快捷键/持久化；不改 Mini（本就不缩放）；不改标题栏/标签栏/ZoomWidget；不改主题、juya 渲染。

## 五、改动文件

- `src/renderer/App.tsx`（移除外层 zoom）
- `src/renderer/components/HomeView.tsx` / `ReaderView.tsx` / `SettingsPanel.tsx` / `BrowserPage.tsx`（zoom 下沉 + nav 移出）
- `tests/e2e/helpers.ts`（`zoom2` / `zoomBuiltin` / `zoomBuiltin2` 场景）
- `tests/e2e/zoom.spec.ts`（新增：三处 nav 尺寸在 uiZoom=1 与 2 下一致 + 内容随缩放）
- `AGENTS.md`（内容区缩放章节同步）

## 六、执行步骤与验证

- [x] 6.1 四个视图 zoom 下沉 + App 移除外层 zoom（见第三节）
- [x] 6.2 Playwright 场景与用例（三 nav 固定 + 内容缩放）
  - 证据：`tests/e2e/zoom.spec.ts` 4 用例（详情工具栏/设置标题栏/浏览器地址栏尺寸在 uiZoom 1↔2 一致 + juya 正文随缩放放大）
- [x] 6.3 `npx tsc --noEmit` 零错误；`npx vitest run` 16/16；`npx playwright test` 33/33（含回归）
- [x] 6.4 AGENTS.md 同步（内容区缩放章节改为「zoom 下沉到各视图内容区，nav 统一 `view-nav` 类在 zoom 外」）
- [x] 6.5 真机验收项（Playwright 无法覆盖）：真实 Electron 中 Ctrl+滚轮，三视图 nav 不缩放、内容缩放正常 —— **完成**
  - 证据：阅读页工具栏 / 设置页标题栏（Codex 截图 zoom-reader-200.jpg、zoom-settings-200.jpg）+ 应用内浏览器地址栏（用户人工，builtin 程序：偏好→外链打开方式=内置浏览器→正文「相关链接」开应用内浏览器标签→150%/200% 地址栏不缩放）。

## 七、风险与未决项

1. webview 在 zoom 父容器下的视觉缩放依赖 Chromium 合成器行为，与现状一致（webview 本就在 zoom 子树内）；真机抽查。
2. SettingsPanel 的 `space-y-4 p-4` 移入 zoom 内层后，间距/内边距随缩放（与现状一致）。
3. 未提交；构建/真机验收由用户在 IDE 外执行（EBUSY asar 锁红线）。
