import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { makeStubScript } from './helpers'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

const SCREENSHOT_DIR = 'out/feed-masthead-newsprint'

/** 镜像 wabi-feed.spec 的 loadWabi：wabi 桩 + 风格 id 覆盖为 newsprint90s + themeMode。
 *  布局沿用桩默认（grid 2 列），与打样 spec 的几何口径一致。 */
async function loadNewsprint(
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
     window.__stubData.settings.juyaLightStyleId = 'newsprint90s';
     window.__stubData.settings.juyaDarkStyleId = 'newsprint90s';
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

test('newsprint90s 订阅页报头保留真实源身份，日期留在卡片，报头命中楷体刊头 token', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadNewsprint(page)
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'newsprint90s-light')
  const masthead = root.locator('.jynews-feed-masthead')
  await expect(masthead).toBeVisible()
  await expect(masthead.locator('.jynews-feed-masthead-kicker')).toHaveText('订阅源')
  await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(masthead.locator('.jynews-feed-masthead-domain')).toHaveText(
    new URL(DEFAULT_SOURCE.url).hostname
  )
  // 头版不承载日期（阅读页刊头的日期/星期行语义不搬进来）；期号日期仍在卡片元信息里
  await expect(masthead.locator('time')).toHaveCount(0)
  await expect(masthead).not.toContainText('年')
  await expect(
    root
      .locator('.juya-feed-item .juya-feed-meta > span:not(.juya-feed-read-dot):not(.juya-feed-source)')
      .first()
  ).toBeVisible()

  expect(await masthead.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    'KaiTi'
  )
  expect(await masthead.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
})

test('newsprint90s 订阅页报头在空列表下仍呈现源身份，两级公告保持原样', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadNewsprint(page, 'window.__stubData.articles = [];')
  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.jynews-feed-masthead')
  await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(masthead.locator('.jynews-feed-masthead-domain')).toHaveText(
    new URL(DEFAULT_SOURCE.url).hostname
  )
  // newsprint 空态是本风格自渲染的两级报纸公告（#32），头版加入后文案不变
  await expect(root.locator('.juya-feed-empty strong')).toHaveText('暂无内容')
  await expect(root.locator('.juya-feed-empty span')).toHaveText('点击右上角刷新获取')
})

test('newsprint90s 订阅页报头长源名在窄窗 120% 下自行换行不外溢', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 720, height: 900 })
  const longName = '城市早报与人工智能观察'.repeat(5)
  await loadNewsprint(
    page,
    `window.__stubData.settings.uiZoom = 1.2;
     window.__stubData.sources = window.__stubData.sources.map((source) => ({
       ...source,
       name: ${JSON.stringify(longName)}
     }));`
  )
  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.jynews-feed-masthead')
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
  // 超长来源名在卡片 meta 中的溢出属共享卡片行为（打样已记录的独立观察项），不在头版范围。
  console.log(`NEWSPRINT_LONG_NAME_CARDS_OVERFLOW ${facts.scrollerOverflow}`)
})

for (const preset of ['compact', 'magazine'] as const) {
  test(`newsprint90s 订阅页报头在 ${preset} 预设下与卡片列表同版心`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadNewsprint(
      page,
      `window.__stubData.settings.layout = { ...window.__stubData.settings.layout, preset: '${preset}' };`
    )
    const root = activeTab(page).locator('.juya-root')
    const masthead = root.locator('.jynews-feed-masthead')
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
    const facts = await masthead.evaluate((element) => {
      const feed = element.nextElementSibling
      const scroller = element.closest('.view-scroll') as HTMLElement
      return {
        mastheadLeft: element.getBoundingClientRect().left,
        mastheadRight: element.getBoundingClientRect().right,
        feedLeft: feed ? feed.getBoundingClientRect().left : Number.NaN,
        feedRight: feed ? feed.getBoundingClientRect().right : Number.NaN,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth
      }
    })
    expect(facts.mastheadLeft, '报头与卡片列表同一版心左缘').toBeCloseTo(facts.feedLeft, 0)
    expect(facts.mastheadRight, '报头与卡片列表同一版心右缘').toBeCloseTo(facts.feedRight, 0)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth)
  })
}

for (const sample of [
  { scheme: 'light', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'dark', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'light', size: 'narrow120', width: 720, height: 900, zoom: 1.2 },
  { scheme: 'dark', size: 'narrow120', width: 720, height: 900, zoom: 1.2 }
] as const) {
  test(`newsprint90s 订阅页报头几何与版心对齐 ${sample.scheme} ${sample.size}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await loadNewsprint(page, `window.__stubData.settings.uiZoom = ${sample.zoom};`, sample.scheme)
    await page.evaluate(() => document.fonts.ready)

    const screenshotPath = join(
      process.cwd(),
      SCREENSHOT_DIR,
      `feed-${sample.scheme}-${sample.size}.png`
    )
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const root = activeTab(page).locator('.juya-root')
    await expect(root).toHaveAttribute('data-juya-variant', `newsprint90s-${sample.scheme}`)
    const masthead = root.locator('.jynews-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const facts = await masthead.evaluate((element) => {
      const kicker = element.querySelector<HTMLElement>('.jynews-feed-masthead-kicker')!
      const heading = element.querySelector('h1') as HTMLElement
      const domain = element.querySelector<HTMLElement>('.jynews-feed-masthead-domain')!
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
        headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        headingScrollWidth: heading.scrollWidth,
        headingClientWidth: heading.clientWidth,
        borderTopWidth: getComputedStyle(element).borderTopWidth,
        borderBottomStyle: getComputedStyle(element).borderBottomStyle,
        borderBottomWidth: Number.parseFloat(getComputedStyle(element).borderBottomWidth),
        kickerColor: getComputedStyle(kicker).color,
        headingColor: getComputedStyle(heading).color,
        domainColor: getComputedStyle(domain).color,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth
      }
    })
    // 语义顺序：引导词 → 源名 → host，自上而下不重叠
    expect(facts.kickerBottom).toBeLessThanOrEqual(facts.headingTop)
    expect(facts.headingBottom).toBeLessThanOrEqual(facts.domainTop)
    expect(facts.headingFontSize).toBeGreaterThanOrEqual(sample.size === 'wide' ? 44 : 32)
    expect(facts.headingScrollWidth).toBeLessThanOrEqual(facts.headingClientWidth + 1)
    // CSS zoom 下 computed border 宽度按 1/zoom 报值（1px→0.833px），只断言框线存在且下沿是 double
    expect(Number.parseFloat(facts.borderTopWidth), '上沿细线存在').toBeGreaterThan(0)
    expect(facts.borderBottomStyle).toBe('double')
    expect(facts.borderBottomWidth, '下沿 4px double（zoom 下按 1/zoom 报值）').toBeGreaterThan(2)
    expect(facts.mastheadWidth).toBeGreaterThan(sample.size === 'wide' ? 900 : 400)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth)
    expect(facts.mastheadLeft, '报头与卡片列表同一版心左缘').toBeCloseTo(facts.feedLeft, 0)
    expect(facts.mastheadRight, '报头与卡片列表同一版心右缘').toBeCloseTo(facts.feedRight, 0)
    console.log(
      `NEWSPRINT_MASTHEAD_REPORT ${sample.scheme}-${sample.size} ${JSON.stringify({
        kickerColor: facts.kickerColor,
        headingColor: facts.headingColor,
        domainColor: facts.domainColor,
        headingFontSize: facts.headingFontSize,
        mastheadWidth: facts.mastheadWidth
      })}`
    )
  })
}
