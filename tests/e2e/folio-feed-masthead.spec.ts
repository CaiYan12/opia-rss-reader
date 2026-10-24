import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { makeStubScript } from './helpers'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

const SCREENSHOT_DIR = 'out/feed-masthead-folio'

// 镜像 wabi-feed.spec 的 loadWabi：makeStubScript('wabi') + 网格 2 列布局，
// 仅把亮暗风格 id 覆盖为 'folio'（端口隔离见 playwright.config 的 PLAYWRIGHT_PORT）。
async function loadFolio(
  page: Page,
  init = '',
  scheme: 'light' | 'dark' = 'light'
): Promise<void> {
  const layoutInit = `window.__stubData.settings.layout = {
       ...window.__stubData.settings.layout,
       preset: 'grid',
       gridColumns: 2
     };`
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
     window.__stubData.settings.juyaLightStyleId = 'folio';
     window.__stubData.settings.juyaDarkStyleId = 'folio';
     window.__stubData.settings.themeMode = ${JSON.stringify(scheme)};
     ${layoutInit}
     ${init}`
  )
  await page.goto('/')
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
}

test('folio 订阅页头版保留真实源身份，日期留在卡片，标题命中衬线标题族', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadFolio(page)
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'folio-light')
  const masthead = root.locator('.jyfolio-feed-masthead')
  await expect(masthead).toBeVisible()
  await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(masthead.locator('.jyfolio-feed-masthead-domain')).toHaveText(
    new URL(DEFAULT_SOURCE.url).hostname
  )
  await expect(masthead.locator('.juya-feed-date, time')).toHaveCount(0)
  // folio 走共享 DefaultFeedItem：日期 span 无独立类，沿用 feed.spec 的 folio 口径定位。
  await expect(
    root
      .locator('.juya-feed-item .juya-feed-meta > span:not(.juya-feed-read-dot):not(.juya-feed-source)')
      .first()
  ).toBeVisible()

  expect(await masthead.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    'Noto Serif SC'
  )
  expect(await masthead.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')

  // 朱菱花押是纯装饰：不进朗读树、不接指针、不产生焦点停留点。
  const fleuron = masthead.locator('.jyfolio-divider')
  await expect(fleuron).toHaveAttribute('aria-hidden', 'true')
  expect(await fleuron.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none')
  expect(await fleuron.evaluate((element) => element.matches('a, button, input, select, textarea, [tabindex]'))).toBe(
    false
  )
})

test('folio 订阅页头版在空列表下仍呈现源身份', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadFolio(page, 'window.__stubData.articles = [];')
  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.jyfolio-feed-masthead h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(root.locator('.juya-feed-empty')).toHaveText('暂无内容，点击右上角刷新获取')
})

test('folio 订阅页头版长源名在窄窗 120% 下自行换行不外溢', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 720, height: 900 })
  const longName = '城市早报与人工智能观察'.repeat(5)
  await loadFolio(
    page,
    `window.__stubData.settings.uiZoom = 1.2;
     window.__stubData.sources = window.__stubData.sources.map((source) => ({
       ...source,
       name: ${JSON.stringify(longName)}
     }));`
  )
  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.jyfolio-feed-masthead')
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
  // 超长来源名在卡片 meta 中的溢出属共享 DefaultFeedItem 行为，不在头版范围；只记录观察。
  console.log(`FOLIO_LONG_NAME_CARDS_OVERFLOW ${facts.scrollerOverflow}`)
})

for (const sample of [
  { scheme: 'light', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'dark', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'light', size: 'narrow120', width: 720, height: 900, zoom: 1.2 },
  { scheme: 'dark', size: 'narrow120', width: 720, height: 900, zoom: 1.2 }
] as const) {
  test(`folio 订阅页头版几何与版心对齐 ${sample.scheme} ${sample.size}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await loadFolio(page, `window.__stubData.settings.uiZoom = ${sample.zoom};`, sample.scheme)
    await page.evaluate(() => document.fonts.ready)

    const screenshotPath = join(
      process.cwd(),
      SCREENSHOT_DIR,
      `feed-${sample.scheme}-${sample.size}.png`
    )
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const root = activeTab(page).locator('.juya-root')
    const masthead = root.locator('.jyfolio-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const facts = await masthead.evaluate((element) => {
      const kicker = element.querySelector<HTMLElement>('.jyfolio-feed-masthead-kicker')!
      const heading = element.querySelector('h1') as HTMLElement
      const fleuron = element.querySelector<HTMLElement>('.jyfolio-divider')!
      const domain = element.querySelector<HTMLElement>('.jyfolio-feed-masthead-domain')!
      const scroller = element.closest('.view-scroll') as HTMLElement
      const feed = element.nextElementSibling
      const feedRect = feed ? feed.getBoundingClientRect() : null
      const rect = element.getBoundingClientRect()
      return {
        kickerBottom: kicker.getBoundingClientRect().bottom,
        headingTop: heading.getBoundingClientRect().top,
        headingBottom: heading.getBoundingClientRect().bottom,
        fleuronTop: fleuron.getBoundingClientRect().top,
        fleuronBottom: fleuron.getBoundingClientRect().bottom,
        domainTop: domain.getBoundingClientRect().top,
        mastheadLeft: rect.left,
        mastheadRight: rect.right,
        mastheadWidth: rect.width,
        feedLeft: feedRect ? feedRect.left : Number.NaN,
        feedRight: feedRect ? feedRect.right : Number.NaN,
        headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        headingScrollWidth: heading.scrollWidth,
        headingClientWidth: heading.clientWidth,
        borderTopWidth: getComputedStyle(element).borderTopWidth,
        accentRuleWidth: Number.parseFloat(getComputedStyle(element, '::before').borderTopWidth),
        kickerColor: getComputedStyle(kicker).color,
        headingColor: getComputedStyle(heading).color,
        domainColor: getComputedStyle(domain).color,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth
      }
    })
    expect(facts.kickerBottom).toBeLessThanOrEqual(facts.headingTop)
    expect(facts.headingBottom).toBeLessThanOrEqual(facts.fleuronTop)
    expect(facts.fleuronBottom).toBeLessThanOrEqual(facts.domainTop)
    expect(facts.headingFontSize).toBeGreaterThanOrEqual(sample.size === 'wide' ? 60 : 44)
    expect(facts.headingScrollWidth).toBeLessThanOrEqual(facts.headingClientWidth + 1)
    // CSS zoom 下 computed border 宽度按 1/zoom 报值（1px→0.833px），只断言文武线两线存在。
    expect(Number.parseFloat(facts.borderTopWidth), '上缘文武线细线存在').toBeGreaterThan(0)
    expect(facts.accentRuleWidth, '上缘文武线朱色粗线存在').toBeGreaterThan(0)
    expect(facts.mastheadWidth).toBeGreaterThan(sample.size === 'wide' ? 900 : 400)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth)
    expect(facts.mastheadLeft, '头版与卡片列表同一版心左缘').toBeCloseTo(facts.feedLeft, 0)
    expect(facts.mastheadRight, '头版与卡片列表同一版心右缘').toBeCloseTo(facts.feedRight, 0)
    console.log(
      `FOLIO_MASTHEAD_REPORT ${sample.scheme}-${sample.size} ${JSON.stringify({
        kickerColor: facts.kickerColor,
        headingColor: facts.headingColor,
        domainColor: facts.domainColor,
        headingFontSize: facts.headingFontSize,
        mastheadWidth: facts.mastheadWidth
      })}`
    )
  })
}
