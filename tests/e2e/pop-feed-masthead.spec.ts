import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { makeStubScript } from './helpers'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

const SCREENSHOT_DIR = 'out/feed-masthead-pop'

/** 镜像 wabi-feed 的 loadWabi：wabi 内存桩 + 风格 id 覆盖为 pop + themeMode；
 *  布局锁 grid 2 列，使头版版心对齐断言有稳定参照（.juya-feed 内容盒 1120px）。 */
async function loadPop(
  page: Page,
  init = '',
  scheme: 'light' | 'dark' = 'light'
): Promise<void> {
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
    `${makeStubScript('wabi')}
     window.__stubData.settings.juyaLightStyleId = 'pop';
     window.__stubData.settings.juyaDarkStyleId = 'pop';
     window.__stubData.settings.themeMode = ${JSON.stringify(scheme)};
     window.__stubData.settings.layout = {
       ...window.__stubData.settings.layout,
       preset: 'grid',
       gridColumns: 2
     };
     ${init}`
  )
  await page.goto('/')
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
}

test('pop 订阅页头版保留真实源身份，日期留在卡片，装饰不进朗读树与指针路径', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadPop(page)
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'pop-light')
  const masthead = root.locator('.jypop-feed-masthead')
  await expect(masthead).toBeVisible()
  await expect(masthead.locator('.jypop-feed-masthead-kicker')).toHaveText('订阅源')
  await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(masthead.locator('.jypop-feed-masthead-domain')).toHaveText(
    new URL(DEFAULT_SOURCE.url).hostname
  )
  await expect(masthead.locator('.juya-feed-date, time')).toHaveCount(0)
  // pop 走共享 DefaultFeedItem：日期 span 无独立类，沿用 feed.spec 的 pop 口径定位。
  await expect(
    root
      .locator('.juya-feed-item .juya-feed-meta > span:not(.juya-feed-read-dot):not(.juya-feed-source)')
      .first()
  ).toBeVisible()

  expect(await masthead.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    'Impact'
  )
  expect(await masthead.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  const strip = masthead.locator('.jypop-feed-masthead-strip')
  await expect(strip).toHaveAttribute('aria-hidden', 'true')
  expect(await strip.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none')
})

test('pop 订阅页头版在空列表下仍呈现源身份', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadPop(page, 'window.__stubData.articles = [];')
  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.jypop-feed-masthead h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(root.locator('.juya-feed-empty')).toHaveText('暂无内容，点击右上角刷新获取')
})

test('pop 订阅页头版长源名在窄窗 120% 下自行换行不外溢', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 720, height: 900 })
  const longName = '城市早报与人工智能观察'.repeat(5)
  await loadPop(
    page,
    `window.__stubData.settings.uiZoom = 1.2;
     window.__stubData.sources = window.__stubData.sources.map((source) => ({
       ...source,
       name: ${JSON.stringify(longName)}
     }));`
  )
  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.jypop-feed-masthead')
  await expect(masthead.locator('h1')).toHaveText(longName)
  const facts = await masthead.evaluate((element) => {
    const heading = element.querySelector('h1') as HTMLElement
    const scroller = element.closest('.view-scroll') as HTMLElement
    return {
      headingOverflow: heading.scrollWidth - heading.clientWidth,
      mastheadRight: element.getBoundingClientRect().right,
      scrollerRight: scroller.getBoundingClientRect().right,
      scrollerOverflow: scroller.scrollWidth - scroller.clientWidth
    }
  })
  expect(facts.headingOverflow).toBeLessThanOrEqual(1)
  expect(facts.mastheadRight).toBeLessThanOrEqual(facts.scrollerRight + 1)
  // 超长来源名在卡片 meta 中的溢出属共享 DefaultFeedItem 行为（#67 已立案的独立小项），
  // 不在头版范围；只记录观察。
  console.log(`POP_LONG_NAME_CARDS_OVERFLOW ${facts.scrollerOverflow}`)
})

for (const sample of [
  { scheme: 'light', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'dark', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'light', size: 'narrow120', width: 720, height: 900, zoom: 1.2 },
  { scheme: 'dark', size: 'narrow120', width: 720, height: 900, zoom: 1.2 }
] as const) {
  test(`pop 订阅页头版几何与版心对齐 ${sample.scheme} ${sample.size}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await loadPop(page, `window.__stubData.settings.uiZoom = ${sample.zoom};`, sample.scheme)
    await page.evaluate(() => document.fonts.ready)

    const screenshotPath = join(
      process.cwd(),
      SCREENSHOT_DIR,
      `feed-${sample.scheme}-${sample.size}.png`
    )
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const root = activeTab(page).locator('.juya-root')
    const masthead = root.locator('.jypop-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const facts = await masthead.evaluate((element) => {
      const kicker = element.querySelector<HTMLElement>('.jypop-feed-masthead-kicker')!
      const heading = element.querySelector('h1') as HTMLElement
      const domain = element.querySelector<HTMLElement>('.jypop-feed-masthead-domain')!
      const scroller = element.closest('.view-scroll') as HTMLElement
      const feed = element.nextElementSibling
      const feedRect = feed ? feed.getBoundingClientRect() : null
      const rect = element.getBoundingClientRect()
      return {
        kickerBottom: kicker.getBoundingClientRect().bottom,
        headingTop: heading.getBoundingClientRect().top,
        headingBottom: heading.getBoundingClientRect().bottom,
        kickerColor: getComputedStyle(kicker).color,
        kickerBackground: getComputedStyle(kicker).backgroundColor,
        headingColor: getComputedStyle(heading).color,
        headingBackground: getComputedStyle(heading.parentElement as Element).backgroundColor,
        domainColor: getComputedStyle(domain).color,
        domainBackground: getComputedStyle(domain.closest('.jypop-feed-masthead-side') as Element)
          .backgroundColor,
        mastheadLeft: rect.left,
        mastheadRight: rect.right,
        mastheadWidth: rect.width,
        feedLeft: feedRect ? feedRect.left : Number.NaN,
        feedRight: feedRect ? feedRect.right : Number.NaN,
        headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        headingScrollWidth: heading.scrollWidth,
        headingClientWidth: heading.clientWidth,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth
      }
    })
    // 语义顺序（kicker → 标题）在几何上成立：贴纸底缘不越过标题顶缘
    expect(facts.kickerBottom).toBeLessThanOrEqual(facts.headingTop)
    expect(facts.headingFontSize).toBeGreaterThanOrEqual(sample.size === 'wide' ? 60 : 44)
    expect(facts.headingScrollWidth).toBeLessThanOrEqual(facts.headingClientWidth + 1)
    expect(facts.mastheadWidth).toBeGreaterThan(sample.size === 'wide' ? 900 : 400)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth)
    expect(facts.mastheadLeft, '头版与卡片列表同一版心左缘').toBeCloseTo(facts.feedLeft, 0)
    expect(facts.mastheadRight, '头版与卡片列表同一版心右缘').toBeCloseTo(facts.feedRight, 0)
    console.log(
      `POP_MASTHEAD_REPORT ${sample.scheme}-${sample.size} ${JSON.stringify({
        kickerColor: facts.kickerColor,
        kickerBackground: facts.kickerBackground,
        headingColor: facts.headingColor,
        headingBackground: facts.headingBackground,
        domainColor: facts.domainColor,
        domainBackground: facts.domainBackground,
        headingFontSize: facts.headingFontSize,
        mastheadWidth: facts.mastheadWidth
      })}`
    )
  })
}
