# 发行记录

本文件是 **发布考古**：每次发版的 tag、commit、产物字节数与当时的校验口径。这些信息在发版时有用，日常开工不需要 —— 故从 `AGENTS.md` 移出，只在发版/回溯时读。

现行发版流程见 `README.md`（`build.bat` / `build.ps1`）与 [Windows 运行与构建参考](agents/windows-runtime.md)；历史环境结论须先在当前检出核查。

## v0.2.1（2026-10-25）

八风格订阅页头版（V1+V2）+ 逐风格精修（nocturne / folio / y2k / pop / editorial / wabi）+ 概览目录全风格两列统一与标题页内跳转 + 验证证据链入库（归档生成脚本 / 对比度实算审计 / CI 单闸门）。

- **tag** `v0.2.1` → commit `9c53187`（annotated）
- 附件：
  - `OpiaRSSReader-v0.2.1-portable.exe` — 99,791,244 bytes
  - `OpiaRSSReader-v0.2.1-win32-x64.zip` — 159,421,177 bytes
  - 解包目录 `OpiaRSSReader-v0.2.1-win32-x64\`
- 内嵌 `ProductVersion 0.2.1.0`，与 tag 一致。
- 校验口径：tsc 0 错误 / vitest 626 / Playwright 266 / nocturne 对比度 text 70 + ui 14 PASS / 归档 5 张逐字节一致；CI verify run `40173345364`（@ 9c53187）success，Node 20 弃用注解 0 条（actions 已 v5）。
- 构建在 ZCode 代理内执行 `build.ps1`（2026-10-11 已验证通道），无 EBUSY。
- **「清场静默漏删」二发**：v0.2.0 轮残留的 `OpiaRSSReader-v0.2.0-win32-x64\resources\app.asar` 被 `WorkBuddy.exe` 持句柄一个月，build.ps1 的 release 清理对它静默失败（v0.2.0 条目同坑异因：那次是 VSCode 锁）。持有者用 Sysinternals handle64（live.sysinternals.com 临时下载）定位；经用户退出 WorkBuddy 后删除，`release/` 复核恰好三形态。构建后核对三形态的纪律再次证明必要。

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

## 历史批次归档

下表按发版归档各批次（曾属「未发版批次」，已随对应版本发布）：

| 批次 | 完成日期 | 说明 |
|---|---|---|
| 橘鸦定制阅读系统（五风格 × 亮暗） | 2026-08-28 | 后被八风格重设计取代 |
| 测试基建补齐 + 插件 API 文档/示例 | 2026-08-31 | vitest 268 / Playwright 75 |
| Mini 模式补齐 | 2026-08-31 | vitest 279 / Playwright 78 |
| 橘鸦风格序列重设计（八风格 × 亮暗 = 16） | 2026-09-24 | 随 v0.2.0 发布 |
| 全风格定制排版 + 场景化背景 | 2026-09-24 | 随 v0.2.0 发布 |
| 橘鸦逐风格样式修复（folio / y2k / pop / nocturne） | 2026-10-11 ~ 10-21 | 随 v0.2.1 发布；详见 `docs/STYLE-WORKLOG.md` |
| nocturne 二轮打磨（T0–T12 / #11–#23，PR #24 / merge `09c2246`） | 2026-10-21 | 随 v0.2.1 发布；16 个提交 |
| synthwave 场景性能 A/B 与 GPU 审计（`docs/GPU-AUDIT-2026-10-22.md`） | 2026-10-22 | 随 v0.2.1 发布 |
| editorial 首字下沉加粗 / wabi 阅读页视觉形象（#59–#66） | 2026-10-23 ~ 10-24 | 随 v0.2.1 发布 |
| 订阅页头版 V1 + V2 + 概览两列统一（PR #84，#67 及子票 #68–#83） | 2026-10-24 ~ 10-25 | 随 v0.2.1 发布 |
| 概览标题页内跳转 + 原文外链图标（PR #85） | 2026-10-25 | 随 v0.2.1 发布 |
| 验证/CI 基建与工程治理（verify 单闸门、归档脚本入库、fixture 入库、正本强跟踪、actions v5） | 2026-10-21 ~ 10-25 | 随 v0.2.1 发布 |

当前无未发版批次。
