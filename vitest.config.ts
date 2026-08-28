import { defineConfig } from 'vitest/config'

// 仅覆盖纯逻辑单测（解析器/识别判据/设置合并）。
// UI 行为验证走 Playwright，不在本配置范围内。
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
    // 夹具目录仅存放脱敏后的真实样本快照，不参与用例发现
    exclude: ['tests/fixtures/**', 'node_modules/**'],
    passWithNoTests: true
  }
})
