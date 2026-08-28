import { test, expect, type Page } from '@playwright/test'
import { loadApp, openFirstArticle, activeTab } from './setup'

/** 内容区缩放（uiZoom）：各视图内 nav（详情工具栏/设置标题栏/浏览器地址栏）应保持固定尺寸，
 *  不随 zoom 缩放；内容区随缩放。keep-alive 下断言限定活动标签容器。 */

type Box = { width: number; height: number }

async function navBox(page: Page): Promise<Box> {
  const el = activeTab(page).locator('.view-nav').first()
  await expect(el).toBeVisible()
  const b = await el.boundingBox()
  if (!b) throw new Error('view-nav boundingBox 为空')
  return { width: b.width, height: b.height }
}

test('详情页工具栏：uiZoom=2 与 uiZoom=1 尺寸一致（不随缩放）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await loadApp(page, 'default')
  await openFirstArticle(page)
  const b1 = await navBox(page)

  await loadApp(page, 'zoom2')
  await openFirstArticle(page)
  const b2 = await navBox(page)

  expect(b2.width).toBeCloseTo(b1.width, 1)
  expect(b2.height).toBeCloseTo(b1.height, 1)
})

test('设置页标题栏：uiZoom=2 与 uiZoom=1 尺寸一致（不随缩放）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await loadApp(page, 'default')
  await page.getByTitle('设置').click()
  const b1 = await navBox(page)

  await loadApp(page, 'zoom2')
  await page.getByTitle('设置').click()
  const b2 = await navBox(page)

  expect(b2.width).toBeCloseTo(b1.width, 1)
  expect(b2.height).toBeCloseTo(b1.height, 1)
})

test('浏览器地址栏：uiZoom=2 与 uiZoom=1 尺寸一致（不随缩放）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  // externalLinkBehavior='builtin'：点正文链接在内置浏览器标签打开
  await loadApp(page, 'zoomBuiltin')
  await openFirstArticle(page)
  await page.locator('.juya-links a').first().click()
  await expect(activeTab(page).locator('.view-nav')).toBeVisible()
  const b1 = await navBox(page)

  await loadApp(page, 'zoomBuiltin2')
  await openFirstArticle(page)
  await page.locator('.juya-links a').first().click()
  await expect(activeTab(page).locator('.view-nav')).toBeVisible()
  const b2 = await navBox(page)

  expect(b2.width).toBeCloseTo(b1.width, 1)
  expect(b2.height).toBeCloseTo(b1.height, 1)
})

test('阅读页内容区随 uiZoom 缩放（juya 正文高度放大）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await loadApp(page, 'default')
  await openFirstArticle(page)
  const issue1 = activeTab(page).locator('.juya-issue')
  await expect(issue1).toBeVisible()
  const h1 = (await issue1.boundingBox())?.height ?? 0

  await loadApp(page, 'zoom2')
  await openFirstArticle(page)
  const issue2 = activeTab(page).locator('.juya-issue')
  await expect(issue2).toBeVisible()
  const h2 = (await issue2.boundingBox())?.height ?? 0

  expect(h2).toBeGreaterThan(h1 * 1.5)
})
