import { test, expect, type Locator } from '@playwright/test'
import { loadApp, openFirstArticle, activeTab } from './setup'

/** 订阅页（HomeView 橘鸦源）风格化 + 响应式基线（Playwright 可覆盖部分）。
 *  keep-alive 下断言限定活动标签容器。 */

test('默认（纸感精读式）：橘鸦订阅页渲染风格化期号列表', async ({ page }) => {
  await loadApp(page, 'default')
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'folio-light')
  const feed = root.locator('.juya-feed')
  await expect(feed).toBeVisible()
  await expect(feed.locator('.juya-feed-title')).toHaveText(['2026-08-28'])
  await expect(feed.locator('.juya-feed-cover')).toHaveAttribute('loading', 'lazy')
})

test('风格关闭：订阅页回退通用 ArticleList（卡片网格）', async ({ page }) => {
  await loadApp(page, 'off')
  const tab = activeTab(page)
  await expect(tab.locator('.juya-feed')).toHaveCount(0)
  await expect(tab.locator('main article').first()).toBeVisible()
  await expect(tab.locator('.juya-root')).toHaveCount(0)
})

test('点击风格化期号卡片打开阅读页（定制模板）', async ({ page }) => {
  await loadApp(page, 'default')
  await page.locator('.juya-feed-item').first().click()
  await expect(activeTab(page).locator('.juya-root .juya-issue')).toBeVisible()
})

test('窄窗口（480px）：定制阅读页无横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 })
  await loadApp(page, 'default')
  await openFirstArticle(page)
  await expect(activeTab(page).locator('.juya-root')).toBeVisible()
  const overflow = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('.overflow-y-auto')]
    const scroller = scrollers.find((el) => el.closest('div:not([class*="hidden"])')) ?? document.scrollingElement
    if (!scroller) return -1
    return scroller.scrollWidth - scroller.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
})

test('窄窗口（480px）：风格化订阅页无横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 })
  await loadApp(page, 'newsprint')
  await expect(activeTab(page).locator('.juya-feed')).toBeVisible()
  const overflow = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('.overflow-y-auto')]
    const scroller = scrollers.find((el) => el.closest('div:not([class*="hidden"])')) ?? document.scrollingElement
    if (!scroller) return -1
    return scroller.scrollWidth - scroller.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
})

test('reduced-motion：梦核背景漂移动画停用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadApp(page, 'dark')
  await openFirstArticle(page)
  const animated = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('.juya-root')] as HTMLElement[]
    const visible = roots.find((r) => r.offsetParent !== null)
    if (!visible) return null
    return getComputedStyle(visible).animationName
  })
  expect(animated === 'none' || animated === '' || animated === null).toBeTruthy()
})

test('八风格逐一断言阅读页根节点结构类', async ({ page }) => {
  const cases: Array<{
    scenario: 'default' | 'y2k' | 'pop' | 'newsprint' | 'dark' | 'nocturne' | 'editorial' | 'wabi'
    cls: string
  }> = [
    { scenario: 'default', cls: 'jyfolio' },
    { scenario: 'y2k', cls: 'jyy2k' },
    { scenario: 'pop', cls: 'jypop' },
    { scenario: 'newsprint', cls: 'jynews' },
    { scenario: 'dark', cls: 'jydream' },
    { scenario: 'nocturne', cls: 'jynoct' },
    { scenario: 'editorial', cls: 'jyedit' },
    { scenario: 'wabi', cls: 'jywabi' }
  ]
  for (const c of cases) {
    await loadApp(page, c.scenario)
    await openFirstArticle(page)
    await expect(activeTab(page).locator(`.juya-root.${c.cls}`)).toBeVisible()
  }
})

test('场景层：梦核暗侧挂 synthwave 场景、千禧亮侧隐藏场景、暗夜不挂场景', async ({ page }) => {
  await loadApp(page, 'dark')
  await openFirstArticle(page)
  const dreamRoot = activeTab(page).locator('.juya-root.jydream')
  await expect(dreamRoot.locator('.juya-scene-sun')).toBeVisible()
  await expect(dreamRoot.locator('.juya-scene-grid-persp')).toBeVisible()

  await loadApp(page, 'y2k')
  await openFirstArticle(page)
  await expect(activeTab(page).locator('.juya-root .juya-scene')).toBeHidden()

  await loadApp(page, 'nocturne')
  await openFirstArticle(page)
  await expect(activeTab(page).locator('.juya-root .juya-scene')).toHaveCount(0)
})

test('橘鸦订阅页遵循「布局」预设 grid 的列数（gridColumns=4）', async ({ page }) => {
  await loadApp(page, 'grid4')
  const grid = activeTab(page).locator('.juya-feed-grid')
  await expect(grid).toHaveCount(1)
  const colCount = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(colCount).toBe(4)
})

test('橘鸦订阅页遵循「布局」预设 compact（单列行式）', async ({ page }) => {
  await loadApp(page, 'compact')
  const feed = activeTab(page).locator('.juya-feed-compact')
  await expect(feed).toBeVisible()
  await expect(feed.locator('.juya-feed-item')).toHaveCount(4)
  await expect(feed.locator('.juya-feed-title').first()).toHaveText('2026-08-28')
})

test('橘鸦订阅页遵循「布局」预设 magazine（首条大幅 + 其余网格）', async ({ page }) => {
  await loadApp(page, 'magazine')
  const tab = activeTab(page)
  await expect(tab.locator('.juya-feed-featured')).toHaveCount(1)
  await expect(tab.locator('.juya-feed-grid .juya-feed-item')).toHaveCount(4)
})

test('橘鸦订阅页遵循「布局」显示字段：默认展示摘要与来源', async ({ page }) => {
  await loadApp(page, 'default')
  const feed = activeTab(page).locator('.juya-feed')
  await expect(feed.locator('.juya-feed-summary')).toHaveText(['示例摘要占位文本'])
  await expect(feed.locator('.juya-feed-source')).toHaveText(['橘鸦AI早报'])
})

test('橘鸦订阅页遵循「布局」显示字段：全关后隐藏封面/摘要/日期/来源', async ({ page }) => {
  await loadApp(page, 'fieldsoff')
  const feed = activeTab(page).locator('.juya-feed')
  await expect(feed.locator('.juya-feed-cover')).toHaveCount(0)
  await expect(feed.locator('.juya-feed-summary')).toHaveCount(0)
  await expect(feed.locator('.juya-feed-source')).toHaveCount(0)
  // 元信息仅剩未读圆点，日期被隐藏
  await expect(feed.locator('.juya-feed-meta > span:not(.juya-feed-read-dot)')).toHaveCount(0)
})

/* ---- 程序化视觉合理性断言（无视觉模型，纯几何校验） ---- */

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number }

async function boxesOf(locator: Locator): Promise<Box[]> {
  return locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    })
  )
}

/** 返回第一个重叠对，无重叠返回 null（容忍 1px 舍入） */
function firstOverlap(boxes: Box[]): string | null {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlap = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
      if (overlap) return `item ${i} 与 ${j} 重叠`
    }
  }
  return null
}

test('视觉合理性（几何）：grid4 卡片无重叠、行内对齐、不溢出容器', async ({ page }) => {
  await loadApp(page, 'grid4')
  const tab = activeTab(page)
  const container = tab.locator('.juya-feed-grid')
  const items = container.locator('.juya-feed-item')
  await expect(items).toHaveCount(6)

  const boxes = await boxesOf(items)
  expect(firstOverlap(boxes)).toBeNull()

  const cRect = await container.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right }
  })
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(cRect.left - 1)
    expect(b.right).toBeLessThanOrEqual(cRect.right + 1)
  }

  // 行内对齐：同一 top 的分组内高度一致，每行不超过 4 项
  const rows = new Map<number, number[]>()
  boxes.forEach((b, i) => {
    const key = Math.round(b.top)
    rows.set(key, [...(rows.get(key) ?? []), i])
  })
  for (const idxs of rows.values()) {
    expect(idxs.length).toBeLessThanOrEqual(4)
    const heights = idxs.map((i) => boxes[i].height)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
  }
})

test('视觉合理性（几何）：magazine 首条大幅与其余网格无重叠', async ({ page }) => {
  await loadApp(page, 'magazine')
  const tab = activeTab(page)
  const featured = tab.locator('.juya-feed-featured')
  await expect(featured).toHaveCount(1)
  const featuredBox = (await boxesOf(featured))[0]
  const gridBoxes = await boxesOf(tab.locator('.juya-feed-grid .juya-feed-item'))
  expect(firstOverlap([featuredBox, ...gridBoxes])).toBeNull()
})

test('视觉合理性（几何）：compact 单列垂直堆叠、行式紧凑', async ({ page }) => {
  await loadApp(page, 'compact')
  const tab = activeTab(page)
  const items = tab.locator('.juya-feed-item')
  await expect(items).toHaveCount(4)
  const boxes = await boxesOf(items)

  // 单列：全部左对齐，后一行 top > 前一行 bottom
  const lefts = boxes.map((b) => b.left)
  expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(1)
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1)
  }
  // 行式：每行高度紧凑
  for (const b of boxes) {
    expect(b.height).toBeLessThan(100)
  }
})
