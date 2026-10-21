# 发行记录

本文件是 **发布考古**：每次发版的 tag、commit、产物字节数与当时的校验口径。这些信息在发版时有用，日常开工不需要 —— 故从 `AGENTS.md` 移出，只在发版/回溯时读。

现行发版流程见 `README.md`（`build.bat` / `build.ps1`）与 `AGENTS.md` 的「本机环境陷阱」章节。

## v0.2.0（2026-09-24）

八风格重设计 + 全风格定制排版 + 场景化背景 + 发行产物命名统一为 `v` 前缀。

- **tag** `v0.2.0` → commit `d3bd788`
- 附件：
  - `OpiaRSSReader-v0.2.0-portable.exe` — 95,171,122 bytes
  - `OpiaRSSReader-v0.2.0-win32-x64.zip` — 142,681,122 bytes
  - 解包目录 `OpiaRSSReader-v0.2.0-win32-x64\`
- 内嵌 `ProductVersion 0.2.0.0`，与 tag 一致。
- 校验口径：tsc 0 错误 / vitest 287 / Playwright 82。
- **构建前须关闭 VSCode**：`build.ps1` 清 `release/` 用 `-ErrorAction SilentlyContinue`，被锁文件会**静默漏删**——本次残留了旧 `OpiaRSSReader-0.1.1-win32-x64\resources\app.asar`。构建后必须核对 `release/` 恰好只有本次三形态。
- 构建由用户在 IDE 外执行 `build.bat`（IDE 内 asar `EBUSY` 风险见 AGENTS.md）。

## v0.1.0（2026-08-20）

标签化窗口重构：无边框自绘标题栏 + TabStrip + 会话持久化 + Mini 修复 + 源切换下拉 + 默认订阅星形切换。

- **tag** `v0.1.0` → commit `5d0e90e`（用户手动同步发布）
- 产物在 `release/`：portable.exe 90.74MB / win32-x64.zip 151.97MB / win32-x64 解包目录
- 当时的验证：tsc 零错误 / vitest 16/16 / Playwright 35/35；`npm run build` 在 Codex IDE 外构建成功。

## 未发版的批次

以下批次已完成但未单独发版，随下一次发版一并出：

| 批次 | 完成日期 | 说明 |
|---|---|---|
| 橘鸦定制阅读系统（五风格 × 亮暗） | 2026-08-28 | 后被八风格重设计取代 |
| 测试基建补齐 + 插件 API 文档/示例 | 2026-08-31 | vitest 268 / Playwright 75 |
| Mini 模式补齐 | 2026-08-31 | vitest 279 / Playwright 78 |
| 橘鸦风格序列重设计（八风格 × 亮暗 = 16） | 2026-09-24 | 随 v0.2.0 发布 |
| 全风格定制排版 + 场景化背景 | 2026-09-24 | 随 v0.2.0 发布 |
| 橘鸦逐风格样式修复（folio / y2k / pop / nocturne） | 2026-10-11 ~ 10-21 | 详见 `docs/STYLE-WORKLOG.md` |
| nocturne 二轮打磨（T0–T12 / #11–#23，PR #24 / merge `09c2246`） | 2026-10-21 | 16 个提交；最终实测 tsc 0 / vitest 448 / Playwright 104 |
