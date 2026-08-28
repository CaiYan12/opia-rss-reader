import { test, expect, type Page } from '@playwright/test'
import { loadApp, openSettings } from './setup'

/** 设置入口：橘鸦风格选择器位置、选项内容、即时生效与持久化调用 */

/** 定位橘鸦风格行内的 Select 触发器（按行标签文本） */
function styleSelectTrigger(page: Page, label: string) {
  const row = page.getByText(label, { exact: true }).locator('xpath=..')
  return row.locator('button').first()
}

test('橘鸦风格亮/暗两侧常态显示（固定亮色模式亦同时可见）', async ({ page }) => {
  await loadApp(page, 'default') // themeMode='light'
  await openSettings(page)

  // 分区标题（font-medium 段，避免与说明文案的宽文本匹配冲突）
  await expect(page.locator('p.font-medium', { hasText: '橘鸦定制阅读风格' })).toBeVisible()
  await expect(page.getByText('亮色风格', { exact: true })).toBeVisible()
  // 亮/暗常态显示：固定亮色模式下暗色行也同时可见（不再按 themeMode 隐显）
  await expect(page.getByText('暗色风格', { exact: true })).toBeVisible()
  await expect(
    page.getByText('仅作用于橘鸦AI早报的订阅页与阅读页')
  ).toBeVisible()
})

test('亮色风格下拉包含 关闭 + 五种风格选项', async ({ page }) => {
  await loadApp(page, 'default')
  await openSettings(page)

  await styleSelectTrigger(page, '亮色风格').click()
  const menu = page.locator('.menu-pop')
  await expect(menu).toBeVisible()
  for (const label of [
    '关闭（使用通用样式）',
    '卡片主题式',
    '千禧网页式',
    '波普艺术式',
    '90 年代报刊式',
    '蒸汽梦核式'
  ]) {
    await expect(menu.getByText(label, { exact: true })).toBeVisible()
  }
})

test('切换亮色风格立即持久化（settingsSet 记录）', async ({ page }) => {
  await loadApp(page, 'default')
  await openSettings(page)

  await styleSelectTrigger(page, '亮色风格').click()
  await page.locator('.menu-pop').getByText('波普艺术式', { exact: true }).click()

  const calls = await page.evaluate(() => window.__stubCalls)
  const patch = calls.find((c: unknown[]) => c[0] === 'settingsSet')?.[1] as Record<string, string> | undefined
  expect(patch).toBeTruthy()
  expect(patch?.juyaLightStyleId).toBe('pop')
})

test('固定暗色模式下亮/暗两侧仍同时显示', async ({ page }) => {
  await loadApp(page, 'dark')
  await openSettings(page)
  await expect(page.getByText('暗色风格', { exact: true })).toBeVisible()
  await expect(page.getByText('亮色风格', { exact: true })).toBeVisible()
})

test('跟随系统模式显示亮暗双行', async ({ page }) => {
  await loadApp(page, 'system')
  await openSettings(page)
  await expect(page.getByText('亮色风格', { exact: true })).toBeVisible()
  await expect(page.getByText('暗色风格', { exact: true })).toBeVisible()
})

test('橘鸦亮/暗风格选择器左右分半并排（亮左暗右、同一行）', async ({ page }) => {
  await loadApp(page, 'default')
  await openSettings(page)

  const light = page.getByText('亮色风格', { exact: true })
  const dark = page.getByText('暗色风格', { exact: true })
  const lb = await light.boundingBox()
  const db = await dark.boundingBox()
  expect(lb).toBeTruthy()
  expect(db).toBeTruthy()
  if (!lb || !db) return
  // 同一行（top 近似相等），亮色在左、暗色在右（grid-cols-2 左右分半）
  expect(Math.abs(lb.y - db.y)).toBeLessThanOrEqual(2)
  expect(db.x).toBeGreaterThan(lb.x + lb.width / 2)
})

test('预设与橘鸦风格下拉宽度随窗口宽度变化（跟随窗口大小）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await loadApp(page, 'default')
  await openSettings(page)

  const presetTrigger = page.getByText('预设', { exact: true }).locator('xpath=..').locator('button')
  const lightTrigger = page.getByText('亮色风格', { exact: true }).locator('xpath=..').locator('button')
  const widePreset = (await presetTrigger.boundingBox())?.width ?? 0
  const wideLight = (await lightTrigger.boundingBox())?.width ?? 0

  await page.setViewportSize({ width: 700, height: 800 })
  const narrowPreset = (await presetTrigger.boundingBox())?.width ?? 0
  const narrowLight = (await lightTrigger.boundingBox())?.width ?? 0

  expect(widePreset).toBeGreaterThan(narrowPreset + 20)
  expect(wideLight).toBeGreaterThan(narrowLight + 20)
})

test('橘鸦源行锁定：停用开关禁用、无删除按钮；普通源行有删除按钮', async ({ page }) => {
  await loadApp(page, 'other')
  await page.getByTitle('设置').click()

  const juyaRow = page.locator('li').filter({ hasText: '橘鸦AI早报' })
  await expect(juyaRow.locator('input[type="checkbox"]')).toBeDisabled()
  await expect(juyaRow.locator('button[title="删除"]')).toHaveCount(0)

  const otherRow = page.locator('li').filter({ hasText: '其他源' })
  await expect(otherRow.locator('input[type="checkbox"]')).toBeEnabled()
  await expect(otherRow.locator('button[title="删除"]')).toHaveCount(1)
})
