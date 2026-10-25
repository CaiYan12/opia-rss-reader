# Windows 运行与构建参考

启动、调试、打包、原生窗口或 GPU 排查前，按相应小节读取。文中仓库路径以仓库根为基准；带日期的环境观测不代表当前机器仍处于同一状态，先核查再处理。命令与产物规则以 `package.json`、[README](../../README.md) 和脚本现状为准。

## 版本钉死（有原因的，勿升级）

| 依赖 | 约束 | 原因 |
|---|---|---|
| vite | `^7` | electron-vite@5 peer 只接受 vite ^5/6/7，vite 8 会 ERESOLVE |
| @vitejs/plugin-react | `^5` | 配合 vite ^7 |
| tailwindcss | `^3` | 主题走 CSS 变量 + tailwind.config 映射，未迁移 v4 |
| electron-store | `^8` | v10+ 为纯 ESM，与主进程 CJS 产物（externalizeDepsPlugin）不兼容 |

## 本机环境陷阱（Windows，用户机器实测）

- **本机曾出现 `ELECTRON_RUN_AS_NODE=1`**：该值会使 Electron 以纯 Node 模式启动而崩溃。运行／调试前检查并清除该变量（bash: `unset ELECTRON_RUN_AS_NODE`；PS: `Remove-Item Env:ELECTRON_RUN_AS_NODE`）。`start.bat` / `build.ps1` 已内置处理。
- **本机曾出现 `NODE_TLS_REJECT_UNAUTHORIZED=0`**：它会使 npm/electron-builder 给出安全警告；先核查当前进程环境，不在项目中复现该设置。
- Electron 二进制偶发未下载（报 "Electron uninstall"）：`node node_modules/electron/install.js` 修复。
- **DSH 的 Low 完整性标签会影响普通终端启动（2026-10-12 实测）**：DSH Windows ACL 沙箱给工作区设置可继承的 Low 标签，`node_modules\electron\dist\electron.exe` 继承后，从普通终端启动的 Electron 主进程也会降为 Low（`S-1-16-4096`），无法写入原 AppData profile。不加 `--no-sandbox` 时启动前退出；加上后出现 lockfile/cache `ACCESS DENIED`，甚至以 0 退出。用 `icacls "node_modules\electron\dist\electron.exe"` 检查完整性标签；本次仅对该可执行文件执行 `icacls "node_modules\electron\dist\electron.exe" /setintegritylevel M` 即恢复正常，保留工作区沙箱授权、原 profile 与依赖版本。重装依赖后新文件可能再次继承 Low，须重新核查；不要据此永久关闭 Chromium sandbox 或搬迁用户数据。
- **窗口正常但 GPU 回退软件合成（2026-10-22 实测）**：仅修正 `electron.exe` 标签仍可能留下 Low 标签 DLL。遇到 `InitializeStaticGLBindingsOneOff failed` / `gpu_compositing: disabled_software`，用 README「本机 GPU 自检」独立探针读取 GPU 路径、初始化日志与运行时标签；先核查同目录 `libEGL.dll`、`libGLESv2.dll`、`d3dcompiler_47.dll`。本机仅将这三文件改为 Medium 后，项目开发入口恢复 RTX 4070 / D3D11，GPU sandbox 仍开启，文件哈希与 DACL 未变；临时副本上反向改变标签已复现。重装依赖可能复发，勿递归修改工作区 ACL。诊断矩阵、指标边界与剩余动画瓶颈见 `docs/GPU-AUDIT-2026-10-22.md`。
- **`.bat` 调用 npm 必须用 `call npm run dev`**：npm 是 `.cmd`，不用 `call` 会转移批处理控制权，后面的退出码输出与 `pause` 不执行。`start.bat` 在 dev 返回后显示退出码并暂停，便于双击启动时保留失败信息。
- **双击入口安全警告（2026-10-12 补验）**：`start.bat` 无 `Zone.Identifier` 仍可能因继承 Low 完整性标签弹「打开文件 - 安全警告」。本次 `icacls "start.bat" /setintegritylevel M` 后，经 Explorer 对 `.bat` 本体 ShellExecute 直接启动窗口，无需确认，文件 SHA256 未变。验证双击必须走 `.bat` 的 Shell 入口；`cmd /c start.bat` 绕过该提示，不能证明双击无警告。
- **构建前先检查应用实例和文件占用**。运行中的产物可能使 electron-builder 因 `build/win-unpacked` 文件占用失败。记录占用路径及进程，优先选择不打断用户的验证方式；需要停止用户正在使用的实例时先协调并取得明确授权。获授权后可用 PowerShell `Stop-Process`（进程名含空格时 Git Bash 的 taskkill 不可靠），不要批量终止无关 Electron／Node 进程。
- **`npm run build` / `build.ps1` 的 IDE 内 EBUSY 风险（用户决策，2026-08-28；2026-10-11 实测收窄）**：IDE 的 AI 扩展会扫描锁定 `build/*.asar`，electron-builder 在 packaging 阶段报 `EBUSY: unlink build\win-unpacked\resources\app.asar`（Electron 社区已知问题，杀应用进程/重试均无效）。**2026-10-11 实测：ZCode 代理内完整跑通 `npm run build`（asar 写入、签名、portable 产物均正常），仅能确认 ZCode 内不触发此问题**；其他 IDE/扩展环境是否复现未知，该类环境下构建仍由用户在 IDE 外终端执行（`build.bat` 或 `powershell -File build.ps1 -Run`）。`build.ps1` 的 release 三形态流水线已于 2026-10-11 在 ZCode 代跑验证通过（Electron zip 下载 TLS 断连按上方镜像处方命令级重试即成功；EBUSY 两轮均未复现）。注意：脚本启动即整体清空 `release/`，手工放在其中的文件（如 RELEASE_NOTES）会被删，先备份。
- 应用已加单实例锁；测试多开行为时第二实例会自动退出属预期。
- **build.ps1 含中文注释，必须保持 UTF-8 with BOM**：`powershell.exe`（5.1）对无 BOM 文件按 GBK 误读中文注释导致语法损坏（`Unexpected token '}'`）；pwsh 7 无此问题，验证脚本须用 `powershell -File build.ps1` 实测。
- electron-builder 下载 Electron zip 偶发 TLS 断连（CN 网络）：命令级设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 重试即可，勿写入项目配置。
- build.ps1 已自动化发行：构建前清理 build/release 全部旧产物，构建后自动在 `release/` 生成三形态（`{name}-v{ver}-win32-x64\` 解包目录 + `.zip` + `-portable.exe`），命名跟随 electron-builder 产物规则。**三形态统一带 `v` 前缀（2026-09-24 起）**，四处同步：`package.json` 的 `portable.artifactName`、`build.ps1` 的 `$releaseBase`、`build.bat` 的 `DST` 与 portable 复制判断、README 产物表。

## 窗口行为事实（Windows 实测）

- 对已最大化窗口 `setSize()` **不会**解除最大化——尺寸转换前必须显式 `unmaximize()`，并先记 `isMaximized()` 与 `getNormalBounds()`（后者无论窗口状态恒返回常规态边界）。
- Mini 与最大化往返：进入 Mini 记录 `wasMaximized`，退出时还原 bounds 后 `if (wasMaximized) maximize()`。

## 原生验证入口

原生验收的隐藏窗口、隔离资料目录及证据边界见[验证指南](verification.md#真实-electron)。历史 GPU 初始化与 A/B 测量见 [GPU 核查记录](../GPU-AUDIT-2026-10-22.md)；发行历史见[发行记录](../RELEASES.md)。不要将 `build.ps1 -Run` 当作后台入口：该选项会启动应用。
