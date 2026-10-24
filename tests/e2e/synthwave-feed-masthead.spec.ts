import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { makeStubScript, readGridPlane, SYNTHWAVE_GRID } from './helpers'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

const SCREENSHOT_DIR = 'out/feed-masthead-synthwave'

/** 镜像 loadWabi / editorial 打样加载器：内存桩驱动构建产物；
 *  底 scenario 用 'wabi'（纯数据形态），风格 id 覆盖为 synthwave，themeMode 决定亮暗变体。 */
async function loadSynth(
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
     window.__stubData.settings.juyaLightStyleId = 'synthwave';
     window.__stubData.settings.juyaDarkStyleId = 'synthwave';
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

test('synthwave 订阅页头版保留真实源身份，日期留在卡片，刊头字体与零动画', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadSynth(page)
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'synthwave-light')
  const masthead = root.locator('.jysynth-feed-masthead')
  await expect(masthead).toBeVisible()
  await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(masthead.locator('.jysynth-feed-masthead-domain')).toHaveText(
    new URL(DEFAULT_SOURCE.url).hostname
  )
  await expect(masthead.locator('.juya-feed-date, time')).toHaveCount(0)
  // 日期语义不变：卡片上仍有日期（synthwave 走 metaIcons，日期带独立类）
  await expect(root.locator('.juya-feed-item .juya-feed-date').first()).toBeVisible()

  // 头版用刊头等宽栈（汉字仍由栈内 Noto Sans SC 承接，声明级断言同 editorial 打样口径）
  expect(await masthead.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    'JetBrains Mono'
  )
  // 头版自身零动画（.juya-root 永无 animation 的结构承诺）
  expect(await masthead.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
})

test('synthwave 订阅页头版在空列表下仍呈现源身份', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadSynth(page, 'window.__stubData.articles = [];')
  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.jysynth-feed-masthead h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(root.locator('.juya-feed-empty')).toHaveText('暂无内容，点击右上角刷新获取')
})

test('synthwave 订阅页头版长源名在窄窗 120% 下自行换行不外溢', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 720, height: 900 })
  const longName = '城市早报与人工智能观察'.repeat(5)
  await loadSynth(
    page,
    `window.__stubData.settings.uiZoom = 1.2;
     window.__stubData.sources = window.__stubData.sources.map((source) => ({
       ...source,
       name: ${JSON.stringify(longName)}
     }));`
  )
  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.jysynth-feed-masthead')
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
  console.log(`SYNTHWAVE_LONG_NAME_CARDS_OVERFLOW ${facts.scrollerOverflow}`)
})

for (const sample of [
  { scheme: 'light', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'dark', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'light', size: 'narrow120', width: 720, height: 900, zoom: 1.2 },
  { scheme: 'dark', size: 'narrow120', width: 720, height: 900, zoom: 1.2 }
] as const) {
  test(`synthwave 订阅页头版几何与版心对齐 ${sample.scheme} ${sample.size}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await loadSynth(page, `window.__stubData.settings.uiZoom = ${sample.zoom};`, sample.scheme)
    await page.evaluate(() => document.fonts.ready)

    const screenshotPath = join(process.cwd(), SCREENSHOT_DIR, `feed-${sample.scheme}-${sample.size}.png`)
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const root = activeTab(page).locator('.juya-root')
    const masthead = root.locator('.jysynth-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const facts = await masthead.evaluate((element) => {
      const kicker = element.querySelector<HTMLElement>('.jysynth-feed-masthead-kicker')!
      const heading = element.querySelector('h1') as HTMLElement
      const domain = element.querySelector<HTMLElement>('.jysynth-feed-masthead-domain')!
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
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth
      }
    })
    expect(facts.kickerBottom).toBeLessThanOrEqual(facts.headingTop)
    expect(facts.headingBottom).toBeLessThanOrEqual(facts.domainTop)
    expect(facts.headingFontSize).toBeGreaterThanOrEqual(sample.size === 'wide' ? 64 : 48)
    expect(facts.headingScrollWidth).toBeLessThanOrEqual(facts.headingClientWidth + 1)
    expect(facts.mastheadWidth).toBeGreaterThan(sample.size === 'wide' ? 900 : 400)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth)
    expect(facts.mastheadLeft, '头版与卡片列表同一版心左缘').toBeCloseTo(facts.feedLeft, 0)
    expect(facts.mastheadRight, '头版与卡片列表同一版心右缘').toBeCloseTo(facts.feedRight, 0)
    console.log(
      `SYNTHWAVE_MASTHEAD_REPORT ${sample.scheme}-${sample.size} ${JSON.stringify({
        headingFontSize: facts.headingFontSize,
        mastheadWidth: facts.mastheadWidth
      })}`
    )
  })
}

test('synthwave 订阅页头版与场景共存：装饰层在文字之下、网格动画照常、暂停清单不受影响', async ({
  page
}) => {
  // 不降级 reduced-motion：本用例要量测网格动画在跑
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadSynth(page, '', 'dark')
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'synthwave-dark')

  // 场景节点仍在且完整（sun + 透视网格），aria-hidden 装饰底
  const scene = root.locator('.juya-scene')
  await expect(scene).toHaveCount(1)
  await expect(scene).toBeVisible()
  await expect(scene.locator('.juya-scene-sun')).toHaveCount(1)
  await expect(scene.locator(SYNTHWAVE_GRID)).toHaveCount(1)
  await expect(scene).toHaveAttribute('aria-hidden', 'true')

  const facts = await root.evaluate((element) => {
    const sceneNode = element.querySelector('.juya-scene') as HTMLElement
    const masthead = element.querySelector('.jysynth-feed-masthead') as HTMLElement
    const heading = masthead.querySelector('h1') as HTMLElement
    const cs = (node: Element) => getComputedStyle(node)
    const sceneRect = sceneNode.getBoundingClientRect()
    const headingRect = heading.getBoundingClientRect()
    const kids = [...element.children].map((child) => child.className.split(' '))
    return {
      scenePosition: cs(sceneNode).position,
      sceneZ: cs(sceneNode).zIndex,
      scenePointerEvents: cs(sceneNode).pointerEvents,
      mastheadPosition: cs(masthead).position,
      mastheadZ: cs(masthead).zIndex,
      sceneTop: sceneRect.top,
      sceneBottom: sceneRect.bottom,
      headingTop: headingRect.top,
      headingBottom: headingRect.bottom,
      sceneIndex: kids.findIndex((c) => c.includes('juya-scene')),
      mastheadIndex: kids.findIndex((c) => c.includes('jysynth-feed-masthead')),
      feedIndex: kids.findIndex((c) => c.includes('juya-feed'))
    }
  })
  expect(facts.scenePosition).toBe('sticky')
  expect(facts.scenePointerEvents).toBe('none')
  expect(facts.mastheadPosition).toBe('relative')
  // z 层次：内容（头版）必须高于场景装饰层 —— 装饰几何上不可能盖字
  expect(Number(facts.mastheadZ)).toBeGreaterThan(Number(facts.sceneZ))
  // 共存是真实的：头版标题与场景层几何重叠（浮于场景之上，不是上下排开互不相交）
  expect(facts.headingTop).toBeLessThan(facts.sceneBottom)
  expect(facts.headingBottom).toBeGreaterThan(facts.sceneTop)
  // DOM 结构：场景仍是最前，头版在场景之后、列表之前
  expect(facts.sceneIndex).toBe(0)
  expect(facts.mastheadIndex).toBeGreaterThan(facts.sceneIndex)
  expect(facts.feedIndex).toBeGreaterThan(facts.mastheadIndex)

  // 网格动画照常：两次采样 translateY 必须变化（#45 同口径）
  const grid = root.locator(SYNTHWAVE_GRID)
  await expect(grid).toBeVisible()
  const before = await readGridPlane(grid)
  await page.waitForTimeout(450)
  const after = await readGridPlane(grid)
  expect(before.texture.animationPlayState, '可见时动画应为 running').toBe('running')
  expect(after.texture.translateY, '两次采样 translateY 必须变化（头版未拖停网格）').not.toBe(
    before.texture.translateY
  )

  // 不可见暂停清单不受影响：data-app-hidden 下纹理层转 paused，恢复后回 running
  await page.evaluate(() => document.documentElement.setAttribute('data-app-hidden', ''))
  const paused = await readGridPlane(grid)
  expect(paused.texture.animationPlayState, '窗口不可见时应为 paused').toBe('paused')
  await page.evaluate(() => document.documentElement.removeAttribute('data-app-hidden'))
  const resumed = await readGridPlane(grid)
  expect(resumed.texture.animationPlayState, '恢复可见后应回到 running').toBe('running')
})
