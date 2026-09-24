import { expect, test } from '@playwright/test'
import { activeTab, loadApp } from './setup'

test.describe('Mini 模式展开摘要', () => {
  test('橘鸦源：日期行展开简报，查看更多回正常模式阅读页且不开外链', async ({ page }) => {
    await loadApp(page, 'default')

    // 进入 Mini（桩返回 true）
    await page.evaluate(() => {
      window.opia.toggleMini = async () => true
    })
    await page.getByRole('banner').getByTitle('Mini').click()
    const row = page.locator('ul > li > button').first()
    await expect(row).toBeVisible()

    // 未展开时无「查看更多」
    await expect(page.getByRole('button', { name: /查看更多/ })).toHaveCount(0)

    // 展开：显示概览（简报）条目（夹具第一条 #1）
    await row.click()
    await expect(page.locator('ul').getByText(/#1 示例要闻标题一/)).toBeVisible()

    // 查看更多 → 退出 Mini、正常模式新开阅读标签（juya 定制视图），不开外链
    await page.evaluate(() => {
      window.opia.toggleMini = async () => false
    })
    await page.getByRole('button', { name: /查看更多/ }).click()
    // 退出 Mini 后页面有两个 banner（应用标题栏 + 橘鸦刊头），须过滤断言
    await expect(page.getByRole('banner').filter({ hasText: 'Opia RSS Reader' })).toBeVisible()
    // keep-alive 下主页面板也含隐藏的 .juya-root（风格化期号列表），必须限定活动面板
    await expect(activeTab(page).locator('.juya-root')).toBeVisible()
    await expect(activeTab(page).locator('[data-juya-variant]')).toHaveAttribute(
      'data-juya-variant',
      'folio-light'
    )
    const external = await page.evaluate(
      () => window.__stubCalls.filter(([kind]) => kind === 'openExternal').length
    )
    expect(external).toBe(0)
  })

  test('文本源：展开显示限长摘要，查看更多可用', async ({ page }) => {
    await loadApp(page, 'miniText')
    await page.evaluate(() => {
      window.opia.toggleMini = async () => true
    })
    await page.getByRole('banner').getByTitle('Mini').click()

    const row = page.locator('ul > li > button').first()
    await expect(row).toBeVisible()
    await row.click()

    const digest = page.locator('ul p').first()
    await expect(digest).toBeVisible()
    await expect(digest).toContainText('…') // 超长文本已截断
    await expect(page.getByRole('button', { name: /查看更多/ })).toBeVisible()
  })

  test('再次点击日期行收起摘要（手风琴单开）', async ({ page }) => {
    // 需要至少两篇文章：夹具文章简报内容相同，只能按摘要区域数量断言手风琴
    await loadApp(page, 'many')
    await page.evaluate(() => {
      window.opia.toggleMini = async () => true
    })
    await page.getByRole('banner').getByTitle('Mini').click()

    const rows = page.locator('ul > li > button')
    // 展开摘要区 = 展开行的直接子 div（摘要里的 ul/li 无 div 子节点）
    const panels = page.locator('ul > li > div')
    await rows.first().click()
    await expect(panels).toHaveCount(1)

    // 展开第二条：第一条收起，始终只有一个摘要区
    await rows.nth(1).click()
    await expect(panels).toHaveCount(1)
    await expect(page.getByRole('button', { name: /查看更多/ })).toHaveCount(1)

    // 再点一次当前行：收起，摘要区归零
    await rows.nth(1).click()
    await expect(panels).toHaveCount(0)
  })
})
