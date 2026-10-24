import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { makeStubScript, type Scenario } from './helpers'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

const SCREENSHOT_DIR = 'out/feed-masthead-nocturne'

/** 镜像 wabi-feed.spec 的 loadWabi（#68：构建产物 + 内存桩 + 端口隔离），仅把
 *  风格 id 覆盖为 nocturne 并显式给 themeMode —— 亮暗两变体由 scheme 参数驱动。 */
async function loadNocturne(
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
     window.__stubData.settings.juyaLightStyleId = 'nocturne';
     window.__stubData.settings.juyaDarkStyleId = 'nocturne';
     window.__stubData.settings.themeMode = ${JSON.stringify(scheme)};
     ${layoutInit}
     ${init}`
  )
  await page.goto('/')
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
}

test('nocturne 订阅页头版保留真实源身份，日期留在卡片，标题命中等线标题栈', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadNocturne(page, 'wabi', '', 'dark')
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'nocturne-dark')
  const masthead = root.locator('.jynoct-feed-masthead')
  await expect(masthead).toBeVisible()
  await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(masthead.locator('.jynoct-feed-masthead-domain')).toHaveText(
    new URL(DEFAULT_SOURCE.url).hostname
  )
  // 头版内无日期；卡片日期语义不变（nocturne 走共享 DefaultFeedItem，metaIcons 默认关，
  // 日期 span 无独立类，沿用 feed.spec / editorial 打样的口径定位）。
  await expect(masthead.locator('.juya-feed-date, time')).toHaveCount(0)
  await expect(
    root
      .locator('.juya-feed-item .juya-feed-meta > span:not(.juya-feed-read-dot):not(.juya-feed-source)')
      .first()
  ).toBeVisible()

  // 场景槽位：头版渲染在 .juya-root 内、.juya-feed 之前
  const order = await root.evaluate((el) => {
    const kids = [...el.children].map((c) => c.className)
    return {
      masthead: kids.findIndex((c) => c.includes('jynoct-feed-masthead')),
      feed: kids.findIndex((c) => c.includes('juya-feed'))
    }
  })
  expect(order.masthead).toBeGreaterThanOrEqual(0)
  expect(order.feed).toBeGreaterThan(order.masthead)

  // 标题字体：暗侧标题栈以 DengXian 为 CJK 首选（nocturne 零衬线字体语言）
  expect(
    await masthead.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)
  ).toContain('DengXian')
  // 银灰渐变刊头字：渐变 + clip:text + 透明字色（与阅读页刊头同一语汇）
  const headingFacts = await masthead.locator('h1').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundImage: style.backgroundImage,
      backgroundClip: style.backgroundClip,
      color: style.color
    }
  })
  expect(headingFacts.backgroundImage).toContain('linear-gradient')
  expect(headingFacts.backgroundClip).toBe('text')
  expect(headingFacts.color).toBe('rgba(0, 0, 0, 0)')

  // 头版完全静态（新规则无任何 animation / transition 声明，juyaCssGuard 扫描面覆盖）；
  // 装饰全部是伪元素：不入朗读树、无焦点、无交互。
  // 注：RM 下共享层会把 .juya-root * 的 transition-duration 钉到 0.01ms，此处不断言该值。
  expect(await masthead.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  await expect(masthead.locator('a, button, [tabindex]')).toHaveCount(0)
  expect(
    await masthead
      .locator('.jynoct-feed-masthead-kicker')
      .evaluate((element) => getComputedStyle(element, '::after').content)
  ).toBe('""')
})

test('nocturne 订阅页头版在空列表下仍呈现源身份', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadNocturne(page, 'wabi', 'window.__stubData.articles = [];', 'dark')
  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.jynoct-feed-masthead h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(root.locator('.juya-feed-empty')).toHaveText('暂无内容，点击右上角刷新获取')
})

test('nocturne 订阅页头版长源名在窄窗 120% 下自行换行不外溢', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 720, height: 900 })
  const longName = '城市早报与人工智能观察'.repeat(5)
  await loadNocturne(
    page,
    'wabi',
    `window.__stubData.settings.uiZoom = 1.2;
     window.__stubData.sources = window.__stubData.sources.map((source) => ({
       ...source,
       name: ${JSON.stringify(longName)}
     }));`,
    'dark'
  )
  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.jynoct-feed-masthead')
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
  console.log(`NOCTURNE_LONG_NAME_CARDS_OVERFLOW ${facts.scrollerOverflow}`)
})

for (const sample of [
  { scheme: 'light', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'dark', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'light', size: 'narrow120', width: 720, height: 900, zoom: 1.2 },
  { scheme: 'dark', size: 'narrow120', width: 720, height: 900, zoom: 1.2 }
] as const) {
  test(`nocturne 订阅页头版几何与版心对齐 ${sample.scheme} ${sample.size}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await loadNocturne(page, 'wabi', `window.__stubData.settings.uiZoom = ${sample.zoom};`, sample.scheme)
    await page.evaluate(() => document.fonts.ready)

    const screenshotPath = join(process.cwd(), SCREENSHOT_DIR, `feed-${sample.scheme}-${sample.size}.png`)
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const root = activeTab(page).locator('.juya-root')
    const masthead = root.locator('.jynoct-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const facts = await masthead.evaluate((element) => {
      const kicker = element.querySelector<HTMLElement>('.jynoct-feed-masthead-kicker')!
      const heading = element.querySelector('h1') as HTMLElement
      const domain = element.querySelector<HTMLElement>('.jynoct-feed-masthead-domain')!
      const scroller = element.closest('.view-scroll') as HTMLElement
      const feed = element.nextElementSibling
      const feedRect = feed ? feed.getBoundingClientRect() : null
      const rect = element.getBoundingClientRect()
      return {
        kickerBottom: kicker.getBoundingClientRect().bottom,
        headingTop: heading.getBoundingClientRect().top,
        headingBottom: heading.getBoundingClientRect().bottom,
        domainTop: domain.getBoundingClientRect().top,
        mastheadLeft: rect.left,
        mastheadRight: rect.right,
        mastheadWidth: rect.width,
        feedLeft: feedRect ? feedRect.left : Number.NaN,
        feedRight: feedRect ? feedRect.right : Number.NaN,
        feedClass: feed ? feed.className : '',
        headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        headingScrollWidth: heading.scrollWidth,
        headingClientWidth: heading.clientWidth,
        borderTopWidth: getComputedStyle(element).borderTopWidth,
        borderBottomWidth: getComputedStyle(element).borderBottomWidth,
        kickerColor: getComputedStyle(kicker).color,
        headingGradient: getComputedStyle(heading).backgroundImage,
        domainColor: getComputedStyle(domain).color,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth
      }
    })
    expect(facts.kickerBottom).toBeLessThanOrEqual(facts.headingTop)
    expect(facts.headingBottom).toBeLessThanOrEqual(facts.domainTop)
    // 夹具 floor 36px；CSS zoom 是否计入 computed 字号随内核实现有差，断言取两侧都安全的水位
    expect(facts.headingFontSize).toBeGreaterThanOrEqual(sample.size === 'wide' ? 48 : 34)
    expect(facts.headingScrollWidth).toBeLessThanOrEqual(facts.headingClientWidth + 1)
    // CSS zoom 下 computed border 宽度按 1/zoom 报值（1px→0.833px），只断言上下发丝线存在。
    expect(Number.parseFloat(facts.borderTopWidth), '上缘发丝线存在').toBeGreaterThan(0)
    expect(Number.parseFloat(facts.borderBottomWidth), '下缘发丝线存在').toBeGreaterThan(0)
    expect(facts.mastheadWidth).toBeGreaterThan(sample.size === 'wide' ? 900 : 400)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth)
    expect(facts.feedClass).toContain('juya-feed')
    expect(facts.mastheadLeft, '头版与卡片列表同一版心左缘').toBeCloseTo(facts.feedLeft, 0)
    expect(facts.mastheadRight, '头版与卡片列表同一版心右缘').toBeCloseTo(facts.feedRight, 0)
    console.log(
      `NOCTURNE_MASTHEAD_REPORT ${sample.scheme}-${sample.size} ${JSON.stringify({
        kickerColor: facts.kickerColor,
        headingGradient: facts.headingGradient,
        domainColor: facts.domainColor,
        headingFontSize: facts.headingFontSize,
        mastheadWidth: facts.mastheadWidth
      })}`
    )
  })
}
