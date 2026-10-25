import { defineConfig } from '@playwright/test'

/** Playwright 仅覆盖渲染层行为（驱动 out/renderer 构建产物 + window.opia 桩）。
 *  Electron IPC / 持久化 / 原生窗口由用户真机验收（见 docs/PLAN-20260828.md 阶段 9）。
 *  运行前先 `npm run build:dir` 产出 out/renderer。
 *  端口可经环境变量 PLAYWRIGHT_PORT 覆盖（并行 worktree 隔离用，#68）；默认 4173，
 *  三处（baseURL / webServer.url / webServer.command）同步取值，默认值下行为与硬编码时一致。 */
const port = process.env.PLAYWRIGHT_PORT ?? '4173'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  // CI 的共享 runner 偶发帧率抖动；只给 CI 一次重试，本地仍为 0。
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 8000
  },
  webServer: {
    command: `npx vite preview --outDir out/renderer --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 20000
  }
})
