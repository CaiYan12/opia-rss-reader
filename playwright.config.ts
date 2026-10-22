import { defineConfig } from '@playwright/test'

/** Playwright 仅覆盖渲染层行为（驱动 out/renderer 构建产物 + window.opia 桩）。
 *  Electron IPC / 持久化 / 原生窗口由用户真机验收（见 docs/PLAN-20260828.md 阶段 9）。
 *  运行前先 `npm run build:dir` 产出 out/renderer。 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  // CI 的共享 runner 偶发帧率抖动；只给 CI 一次重试，本地仍为 0。
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 8000
  },
  webServer: {
    command: 'npx vite preview --outDir out/renderer --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 20000
  }
})
