import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { makeStubScript, type Scenario } from './helpers'
import { getPlatformFontsForSelector } from './platform-fonts'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

async function loadWabi(
  page: Page,
  scenario: Scenario = 'wabi',
  init = '',
  scheme: 'light' | 'dark' = 'light'
): Promise<void> {
  const layoutInit =
    scenario === 'wabi'
      ? `window.__stubData.settings.layout = {
           ...window.__stubData.settings.layout,
           preset: 'grid',
           gridColumns: 2
         };`
      : ''
  const html = readFileSync(join(__dirname, '../../out/renderer/index.html'), 'utf-8').replace(
    /<meta[\s\S]*?Content-Security-Policy[\s\S]*?>/,
    ''
  )
  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'document') {
      void route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' })
    } else {
      void route.continue()
    }
  })
  await page.addInitScript(
    `${makeStubScript(scenario)}
     window.__stubData.settings.juyaLightStyleId = 'wabi';
     window.__stubData.settings.juyaDarkStyleId = 'wabi';
     window.__stubData.settings.themeMode = ${JSON.stringify(scheme)};
     ${layoutInit}
     ${init}`
  )
  await page.goto('/')
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
}

test('wabi 普通网格先读日期和标题，再显示 16:9 封面', async ({ page }) => {
  await loadWabi(page, 'wabi', "window.__stubData.articles[0].title = '真实文章标题';")
  const item = activeTab(page).locator('.juya-feed-item').first()
  await expect(item).toBeVisible()
  await expect(item.locator('.juya-feed-title')).toHaveText('真实文章标题')
  const expectedDate = new Date('2026-08-28T01:31:42.000Z').toLocaleString('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  await expect(item.locator('.juya-feed-date')).toHaveText(expectedDate)
  await page.waitForTimeout(280)
  await page.screenshot({ path: join(process.cwd(), 'out/wabi-ticket/wabi-feed-grid-light.png'), fullPage: true })

  const order = await item.evaluate((el) =>
    [...el.querySelectorAll('.juya-feed-meta, .juya-feed-title, .juya-feed-cover')].map((node) => {
      if (node.matches('.juya-feed-meta')) return 'date'
      if (node.matches('.juya-feed-title')) return 'title'
      return 'cover'
    })
  )
  expect(order).toEqual(['date', 'title', 'cover'])
  const verticalOrder = await item.evaluate((el) => {
    const top = (selector: string): number =>
      el.querySelector(selector)!.getBoundingClientRect().top
    return [top('.juya-feed-meta'), top('.juya-feed-title'), top('.juya-feed-cover')]
  })
  expect(verticalOrder[0]).toBeLessThan(verticalOrder[1])
  expect(verticalOrder[1]).toBeLessThan(verticalOrder[2])

  const cover = item.locator('.juya-feed-cover')
  const box = await cover.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width / box!.height).toBeCloseTo(16 / 9, 2)
})

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`wabi 期号悬停静止，仅改变边线（${motion}）`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion })
    await loadWabi(page)
    const item = activeTab(page).locator('.juya-feed-item').first()
    const cover = item.locator('.juya-feed-cover')
    await expect(item).toBeVisible()
    await page.waitForTimeout(280)
    const before = await item.evaluate((el) => getComputedStyle(el).borderTopColor)
    await item.hover()
    await page.waitForTimeout(180)
    const hover = await item.evaluate((el) => ({
      border: getComputedStyle(el).borderTopColor,
      transform: getComputedStyle(el).transform
    }))
    expect(hover.border).not.toBe(before)
    expect(hover.transform).toBe('none')
    expect(await cover.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`wabi 四列 grid 在 720px / 120% 中完整呈现日期和来源（${scheme}）`, async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 })
    const sourceName = '城市早报与人工智能观察'.repeat(5)
    const init = `
      window.__stubData.settings.uiZoom = 1.2;
      window.__stubData.sources = window.__stubData.sources.map((source) => ({
        ...source,
        name: ${JSON.stringify(sourceName)}
      }));
    `
    await loadWabi(page, 'grid4', init, scheme)

    const root = activeTab(page).locator('.juya-root')
    await expect(root).toHaveAttribute('data-juya-variant', `wabi-${scheme}`)
    const grid = root.locator('.juya-feed-grid')
    await expect(grid.locator('.juya-feed-item')).toHaveCount(6)
    expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/))).toHaveLength(4)
    await page.screenshot({
      path: join(process.cwd(), `out/wabi-ticket/wabi-feed-grid4-720-120-${scheme}.png`),
      fullPage: true
    })

    const metadataFits = await grid.locator('.juya-feed-item').evaluateAll((items) =>
      items.every((item) => {
        const card = item.getBoundingClientRect()
        const date = item.querySelector('.juya-feed-date')
        const source = item.querySelector('.juya-feed-source')
        const fitsCard = (el: Element | null): boolean => {
          if (!el) return false
          const rect = el.getBoundingClientRect()
          const node = el as HTMLElement
          return rect.left >= card.left - 1 && rect.right <= card.right + 1 && node.scrollWidth <= node.clientWidth + 1
        }
        return fitsCard(date) && fitsCard(source)
      })
    )
    expect(metadataFits).toBe(true)
    const feedGeometry = await grid.evaluate((el) => {
      const scroller = el.closest('.view-scroll')
      if (!scroller) throw new Error('Wabi feed must remain inside its active scroll container')
      const scrollBox = scroller.getBoundingClientRect()
      const items = [...el.querySelectorAll('.juya-feed-item')].map((item) => {
        const box = item.getBoundingClientRect()
        return { left: box.left, right: box.right }
      })
      return {
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        scrollLeft: scrollBox.left,
        scrollRight: scrollBox.right,
        items
      }
    })
    expect(feedGeometry.scrollWidth - feedGeometry.clientWidth).toBeLessThanOrEqual(0)
    expect(
      feedGeometry.items.every(
        (item) => item.left >= feedGeometry.scrollLeft - 1 && item.right <= feedGeometry.scrollRight + 1
      )
    ).toBe(true)
  })
}

test('wabi compact 保留小缩略图，日期与标题先于图版', async ({ page }) => {
  await loadWabi(page, 'compact')
  const compact = activeTab(page).locator('.juya-feed-compact')
  const compactItem = compact.locator('.juya-feed-item').first()
  const compactCover = await compactItem.locator('.juya-feed-cover').boundingBox()
  await expect(compact).toBeVisible()
  expect(compactCover?.width).toBe(72)
  expect(compactCover?.height).toBeCloseTo(40, 2)
  await expect(compactItem.locator('.juya-feed-summary')).toHaveCount(0)
  const compactOrder = await compactItem.evaluate((el) =>
    [...el.querySelectorAll('.juya-feed-meta, .juya-feed-title, .juya-feed-cover')].map((node) =>
      node.matches('.juya-feed-meta') ? 'date' : node.matches('.juya-feed-title') ? 'title' : 'cover'
    )
  )
  expect(compactOrder).toEqual(['date', 'title', 'cover'])
})

test('wabi magazine 首期号的图版层级高于普通期号', async ({ page }) => {
  await loadWabi(page, 'magazine')
  const magazine = activeTab(page).locator('.juya-feed')
  const featured = magazine.locator('.juya-feed-featured')
  const ordinary = magazine.locator('.juya-feed-grid .juya-feed-item').first()
  await expect(featured).toHaveCount(1)
  await expect(featured.locator('.juya-feed-summary')).toBeVisible()
  const featuredCover = await featured.locator('.juya-feed-cover').boundingBox()
  const ordinaryCover = await ordinary.locator('.juya-feed-cover').boundingBox()
  expect(featuredCover!.width).toBeGreaterThan(ordinaryCover!.width)
})

test('wabi magazine 首期号保留封面／摘要例外，但日期与来源仍遵循字段开关', async ({ page }) => {
  await loadWabi(
    page,
    'magazine',
    `window.__stubData.settings.layout.fields = {
       cover: false,
       summary: false,
       pubDate: false,
       source: false
     };`
  )
  const fieldsOffFeed = activeTab(page).locator('.juya-feed')
  const fieldsOffFeatured = fieldsOffFeed.locator('.juya-feed-featured')
  const fieldsOffRegular = fieldsOffFeed.locator('.juya-feed-grid .juya-feed-item')
  await expect(fieldsOffFeatured.locator('.juya-feed-cover')).toBeVisible()
  await expect(fieldsOffFeatured.locator('.juya-feed-summary')).toBeVisible()
  await expect(fieldsOffFeatured.locator('.juya-feed-date, .juya-feed-source')).toHaveCount(0)
  await expect(fieldsOffRegular.first().locator('.juya-feed-cover, .juya-feed-summary')).toHaveCount(0)
  await expect(fieldsOffRegular.first().locator('.juya-feed-date, .juya-feed-source')).toHaveCount(0)
})

test('wabi 四列网格空态横跨完整内容区', async ({ page }) => {
  await loadWabi(page, 'wabi', 'window.__stubData.articles = [];\nwindow.__stubData.settings.layout.gridColumns = 4;')
  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.wabi-feed-masthead h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(root.locator('.wabi-feed-masthead .juya-feed-date, .wabi-feed-masthead time')).toHaveCount(0)
  const grid = root.locator('.juya-feed-grid')
  const empty = grid.locator('.juya-feed-empty')
  await expect(empty).toHaveText('暂无内容，点击右上角刷新获取')
  const facts = await empty.evaluate((el) => {
    const grid = el.parentElement!
    const rect = grid.getBoundingClientRect()
    const style = getComputedStyle(grid)
    const paddingLeft = Number.parseFloat(style.paddingLeft)
    const paddingRight = Number.parseFloat(style.paddingRight)
    const emptyRect = el.getBoundingClientRect()
    return {
      columnEnd: getComputedStyle(el).gridColumnEnd,
      leftGap: emptyRect.left - (rect.left + paddingLeft),
      rightGap: rect.right - paddingRight - emptyRect.right
    }
  })
  expect(facts.columnEnd).toBe('-1')
  expect(Math.abs(facts.leftGap)).toBeLessThanOrEqual(1)
  expect(Math.abs(facts.rightGap)).toBeLessThanOrEqual(1)
})

test('wabi 期号可由键盘激活并打开阅读标签', async ({ page }) => {
  await loadWabi(page)
  const item = activeTab(page).locator('.juya-feed-item').first()
  await item.focus()
  expect(await item.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  expect(await item.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
  await page.keyboard.press('Enter')
  await expect(activeTab(page).locator('.juya-root .juya-issue')).toBeVisible()
})

test('wabi 展示字实际命中字体且字体不可用时保留完整文字', async ({ page }) => {
  await loadWabi(page)
  const heading = activeTab(page).locator('.wabi-feed-masthead h1')
  const fontStack = await heading.evaluate((element) => getComputedStyle(element).fontFamily)
  await expect(heading).toHaveText(DEFAULT_SOURCE.name)
  expect(fontStack).toContain('STXingkai')
  expect(fontStack).toContain('Noto Serif SC')

  const displayFonts = await getPlatformFontsForSelector(page, '.wabi-feed-masthead h1')
  expect(displayFonts.reduce((count, font) => count + font.glyphCount, 0)).toBeGreaterThan(0)
  const selectedText = await heading.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return range.toString()
  })
  expect(selectedText).toBe(DEFAULT_SOURCE.name)

  await heading.evaluate((element) => {
    element.style.fontFamily = "'__wabi_display_face_unavailable__', 'KaiTi', '楷体', serif"
  })
  const fallbackStack = await heading.evaluate((element) => getComputedStyle(element).fontFamily)
  expect(fallbackStack).toContain('KaiTi')
  await expect(heading).toHaveText(DEFAULT_SOURCE.name)
  const fallbackFonts = await getPlatformFontsForSelector(page, '.wabi-feed-masthead h1')
  expect(fallbackFonts.reduce((count, font) => count + font.glyphCount, 0)).toBeGreaterThan(0)
  console.log(`WABI_DISPLAY_FONT_REPORT ${JSON.stringify({ displayFonts, fallbackFonts })}`)
})

for (const sample of [
  { scheme: 'light', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'dark', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'light', size: 'narrow120', width: 720, height: 900, zoom: 1.2 },
  { scheme: 'dark', size: 'narrow120', width: 720, height: 900, zoom: 1.2 }
] as const) {
  test(`wabi 订阅刊头保留真实来源身份并适配 ${sample.scheme} ${sample.size}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await loadWabi(
      page,
      'wabi',
      `window.__stubData.settings.uiZoom = ${sample.zoom};`,
      sample.scheme
    )
    const cover = activeTab(page).locator('.juya-feed-item .juya-feed-cover').first()
    await expect(cover).toHaveJSProperty('complete', true)
    expect(await cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await page.evaluate(() => document.fonts.ready)

    const phase = process.env.WABI_CRAFT_PHASE ?? 'after'
    const screenshotPath = join(
      process.cwd(),
      'out/wabi-art-65',
      phase,
      `feed-${sample.scheme}-${sample.size}.png`
    )
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const root = activeTab(page).locator('.juya-root')
    const masthead = root.locator('.wabi-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.getByRole('heading', { level: 1 })).toHaveText(DEFAULT_SOURCE.name)
    await expect(masthead.locator('.wabi-feed-masthead-domain')).toHaveText(
      new URL(DEFAULT_SOURCE.url).hostname
    )
    await expect(masthead.locator('.juya-feed-date, time')).toHaveCount(0)
    await expect(root.locator('.juya-feed-item .juya-feed-date').first()).toBeVisible()

    const geometry = await masthead.evaluate((element) => {
      const heading = element.querySelector('h1')
      const domain = element.querySelector('.wabi-feed-masthead-domain')
      const rubbing = element.querySelector('.wabi-feed-rubbing')
      const root = element.closest('.juya-root')
      if (!heading || !domain || !rubbing || !root) throw new Error('Feed masthead parts are incomplete')
      const headingRect = heading.getBoundingClientRect()
      const headingRange = document.createRange()
      headingRange.selectNodeContents(heading)
      const headingTextRects = [...headingRange.getClientRects()]
      if (headingTextRects.length === 0) throw new Error('Feed source name has no visible text geometry')
      const headingTextRect = {
        left: Math.min(...headingTextRects.map((rect) => rect.left)),
        right: Math.max(...headingTextRects.map((rect) => rect.right)),
        top: Math.min(...headingTextRects.map((rect) => rect.top)),
        bottom: Math.max(...headingTextRects.map((rect) => rect.bottom))
      }
      const domainRect = domain.getBoundingClientRect()
      const rubbingRect = rubbing.getBoundingClientRect()
      const rubbingStyle = getComputedStyle(rubbing)
      const scroller = root.closest('.view-scroll')
      if (!scroller) throw new Error('Wabi feed must remain inside its active scroll container')
      return {
        headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        headingLeft: headingRect.left,
        headingRight: headingRect.right,
        domainLeft: domainRect.left,
        rubbingRect: {
          left: rubbingRect.left,
          right: rubbingRect.right,
          top: rubbingRect.top,
          bottom: rubbingRect.bottom
        },
        headingRect: {
          left: headingRect.left,
          right: headingRect.right,
          top: headingRect.top,
          bottom: headingRect.bottom
        },
        headingTextRect,
        domainRect: {
          left: domainRect.left,
          right: domainRect.right,
          top: domainRect.top,
          bottom: domainRect.bottom
        },
        mastheadWidth: element.getBoundingClientRect().width,
        mastheadHeight: element.getBoundingClientRect().height,
        headingScrollWidth: (heading as HTMLElement).scrollWidth,
        headingClientWidth: (heading as HTMLElement).clientWidth,
        rubbingHidden: rubbing.getAttribute('aria-hidden') === 'true',
        rubbingPointerEvents: rubbingStyle.pointerEvents,
        rubbingFocusable: rubbing.matches('a, button, input, select, textarea, [tabindex]'),
        scrollWidth: (scroller as HTMLElement).scrollWidth,
        clientWidth: (scroller as HTMLElement).clientWidth
      }
    })
    expect(geometry.headingFontSize).toBeGreaterThanOrEqual(sample.size === 'wide' ? 64 : 44)
    expect(geometry.headingLeft).toBeLessThan(geometry.domainLeft)
    expect(
      geometry.headingTextRect.right <= geometry.rubbingRect.left ||
        geometry.headingTextRect.left >= geometry.rubbingRect.right ||
        geometry.headingTextRect.bottom <= geometry.rubbingRect.top ||
        geometry.headingTextRect.top >= geometry.rubbingRect.bottom
    ).toBe(true)
    expect(
      geometry.domainRect.right <= geometry.rubbingRect.left ||
        geometry.domainRect.left >= geometry.rubbingRect.right ||
        geometry.domainRect.bottom <= geometry.rubbingRect.top ||
        geometry.domainRect.top >= geometry.rubbingRect.bottom
    ).toBe(true)
    expect(geometry.headingScrollWidth).toBeLessThanOrEqual(geometry.headingClientWidth + 1)
    expect(geometry.mastheadWidth).toBeGreaterThan(sample.size === 'wide' ? 900 : 400)
    expect(geometry.mastheadHeight).toBeGreaterThanOrEqual(sample.size === 'wide' ? 200 : 160)
    expect(geometry.rubbingHidden).toBe(true)
    expect(geometry.rubbingPointerEvents).toBe('none')
    expect(geometry.rubbingFocusable).toBe(false)
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
  })
}
