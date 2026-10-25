import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { makeStubScript } from './helpers'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

const SCREENSHOT_DIR = 'out/feed-masthead-y2k'

/** 镜像 loadWabi：makeStubScript('wabi') 内存桩 + 风格 id 覆盖为 y2k + themeMode。 */
async function loadY2k(
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
     window.__stubData.settings.juyaLightStyleId = 'y2k';
     window.__stubData.settings.juyaDarkStyleId = 'y2k';
     window.__stubData.settings.themeMode = ${JSON.stringify(scheme)};
     ${init}`
  )
  await page.goto('/')
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
}

/** @supports not (background-clip: text) 实色回退块必须覆盖头版标题（含亮暗复合选择器）。
 *  构建器会把条件改写为等价的 not ((-webkit-background-clip: text) or (background-clip: text))，
 *  故只锚定「not + background-clip」语义而不比对完整条件文本。 */
async function hasMastheadFallback(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of rules) {
        if (
          rule instanceof CSSSupportsRule &&
          rule.conditionText.replace(/\s+/g, '').startsWith('not(') &&
          rule.conditionText.includes('background-clip') &&
          rule.cssText.includes('.jyy2k-feed-masthead h1')
        ) {
          return true
        }
      }
    }
    return false
  })
}

test('y2k 订阅页头版保留真实源身份，铬字无 text-shadow，订阅页无新增场景层', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadY2k(page)
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'y2k-light')
  const masthead = root.locator('.jyy2k-feed-masthead')
  await expect(masthead).toBeVisible()
  await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(masthead.locator('.jyy2k-feed-masthead-domain')).toHaveText(
    new URL(DEFAULT_SOURCE.url).hostname
  )
  // 头版内无期号日期；卡片日期语义不变（y2k 走共享 DefaultFeedItem，日期 span 无独立类，
  // 沿用 feed.spec 的 y2k 口径定位）。
  await expect(masthead.locator('.juya-feed-date, time')).toHaveCount(0)
  await expect(
    root
      .locator('.juya-feed-item .juya-feed-meta > span:not(.juya-feed-read-dot):not(.juya-feed-source)')
      .first()
  ).toBeVisible()

  // 订阅页不新增场景层：星空/地平网格只在阅读页。
  await expect(root.locator('.juya-scene')).toHaveCount(0)

  // 头版自身无动画；不新增 Tab 停留点（无焦点元素）。
  expect(await masthead.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  expect(await masthead.locator('a, button, input, select, textarea, [tabindex]').count()).toBe(0)

  // 铬字渐变路径：background-clip:text 生效、无 text-shadow 压盖、命中 y2k 黑体标题栈。
  const heading = masthead.locator('h1')
  const chrome = await heading.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      clip: style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text',
      textShadow: style.textShadow,
      backgroundImage: style.backgroundImage
    }
  })
  expect(chrome.clip).toBe(true)
  expect(chrome.textShadow).toBe('none')
  expect(chrome.backgroundImage).toContain('linear-gradient')
  expect(await heading.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('SimHei')

  // 不支持 background-clip:text 的引擎走实色回退（亮/暗两条渐变规则都被覆盖）。
  expect(await hasMastheadFallback(page)).toBe(true)
})

test('y2k 订阅页头版在空列表下仍呈现源身份', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadY2k(page, 'window.__stubData.articles = [];')
  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.jyy2k-feed-masthead h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(root.locator('.juya-feed-empty')).toHaveText('暂无内容，点击右上角刷新获取')
})

test('y2k 订阅页头版长源名在窄窗 120% 下自行换行不外溢', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 720, height: 900 })
  const longName = '城市早报与人工智能观察'.repeat(5)
  await loadY2k(
    page,
    `window.__stubData.settings.uiZoom = 1.2;
     window.__stubData.sources = window.__stubData.sources.map((source) => ({
       ...source,
       name: ${JSON.stringify(longName)}
     }));`
  )
  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.jyy2k-feed-masthead')
  await expect(masthead.locator('h1')).toHaveText(longName)
  // #76 窗口标题：长源名在标题栏单行 ellipsis 截断，不把 plaque / 三钮撑破
  const barFacts = await masthead.evaluate((element) => {
    const bar = element.querySelector('.jyy2k-feed-masthead-titlebar') as HTMLElement
    const title = bar.querySelector('.jyy2k-feed-masthead-titlebar-title') as HTMLElement
    const titleStyle = getComputedStyle(title)
    return {
      titleText: title.textContent ?? '',
      truncating: title.scrollWidth > title.clientWidth,
      whiteSpace: titleStyle.whiteSpace,
      textOverflow: titleStyle.textOverflow,
      barRight: bar.getBoundingClientRect().right,
      plaqueRight: element.getBoundingClientRect().right
    }
  })
  expect(barFacts.titleText).toBe(`◆ ${longName}.EXE — 运行中`)
  expect(barFacts.whiteSpace).toBe('nowrap')
  expect(barFacts.textOverflow).toBe('ellipsis')
  expect(barFacts.truncating, '长源名触发单行截断').toBe(true)
  expect(barFacts.barRight, '标题栏不把 plaque 撑破').toBeLessThanOrEqual(barFacts.plaqueRight + 1)
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
  // 超长来源名在卡片 meta 中的溢出属共享 DefaultFeedItem 行为（editorial 打样同款观察项），
  // 不在头版范围；只记录观察。
  console.log(`Y2K_LONG_NAME_CARDS_OVERFLOW ${facts.scrollerOverflow}`)
})

// ---- #76：订阅页头版窗口拟真标题栏与三钮（真实 DOM + aria-hidden 整体静默）----
// 断言面：标题栏为真实 DOM 元素（承载逐订阅源动态源名）、整体 aria-hidden、无焦点元素；
// 窗口标题 `◆ <源名>.EXE — 运行中`；× 与阅读页关闭钮同款（on-accent 底 accent 色、
// 1px 边、12px 700、18×16 含边），_ □ muted 未激活态；不加状态栏；零动效。
// CSS 原文纪律（token 化、零字面色）由 tests/unit/juyaCssGuard.test.ts 标题栏守卫组锁死，
// 此处只断计算样式与结构（亮暗两变体各跑一遍）。
for (const scheme of ['light', 'dark'] as const) {
  test(`y2k 订阅页头版窗口标题栏与三钮成立 ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadY2k(page, '', scheme)
    const root = activeTab(page).locator('.juya-root')
    await expect(root).toHaveAttribute('data-juya-variant', `y2k-${scheme}`)
    const masthead = root.locator('.jyy2k-feed-masthead')
    await expect(masthead).toBeVisible()

    // 不加状态栏：头版直接子元素恰为 标题栏 / kicker / h1 / domain 四件
    const children = await masthead.evaluate((element) =>
      [...element.children].map((child) => child.className || child.tagName.toLowerCase())
    )
    expect(children).toEqual([
      'jyy2k-feed-masthead-titlebar',
      'jyy2k-feed-masthead-kicker',
      'h1',
      'jyy2k-feed-masthead-domain'
    ])

    const titlebar = masthead.locator('.jyy2k-feed-masthead-titlebar')
    // 真实 DOM + 整体 AT 静默：aria-hidden 生效、无任何可聚焦元素（_ □ × 是装饰 span 非控件）
    await expect(titlebar).toHaveAttribute('aria-hidden', 'true')
    await expect(titlebar.locator('button, a, input, select, textarea, [tabindex]')).toHaveCount(0)
    // 窗口标题含真实订阅源名（`◆ <源名>.EXE — 运行中`，与阅读页伪标题栏同语法）
    const title = titlebar.locator('.jyy2k-feed-masthead-titlebar-title')
    await expect(title).toHaveText(`◆ ${DEFAULT_SOURCE.name}.EXE — 运行中`)

    const facts = await titlebar.evaluate((element) => {
      const barStyle = getComputedStyle(element)
      const titleEl = element.querySelector('.jyy2k-feed-masthead-titlebar-title') as HTMLElement
      const titleStyle = getComputedStyle(titleEl)
      const buttons = [...element.querySelectorAll<HTMLElement>('.jyy2k-feed-masthead-titlebar-btn')]
      const close = element.querySelector('.jyy2k-feed-masthead-titlebar-btn-close') as HTMLElement
      const closeStyle = getComputedStyle(close)
      const plaque = element.closest('.jyy2k-feed-masthead') as HTMLElement
      const domain = plaque.querySelector('.jyy2k-feed-masthead-domain') as HTMLElement
      const barRect = element.getBoundingClientRect()
      const plaqueRect = plaque.getBoundingClientRect()
      return {
        barPosition: barStyle.position,
        barPointerEvents: barStyle.pointerEvents,
        barAnimation: barStyle.animationName,
        titleWhiteSpace: titleStyle.whiteSpace,
        titleTextOverflow: titleStyle.textOverflow,
        titleMinWidth: titleStyle.minWidth,
        titleFontSize: titleStyle.fontSize,
        titleColor: titleStyle.color,
        domainColor: getComputedStyle(domain).color,
        closeWidth: close.offsetWidth,
        closeHeight: close.offsetHeight,
        closeColor: closeStyle.color,
        closeBackground: closeStyle.backgroundColor,
        closeBorderWidth: closeStyle.borderTopWidth,
        closeFontWeight: closeStyle.fontWeight,
        inactiveColors: buttons.slice(0, 2).map((b) => getComputedStyle(b).color),
        inactiveBackgrounds: buttons.slice(0, 2).map((b) => getComputedStyle(b).backgroundColor),
        barLeft: barRect.left,
        barRight: barRect.right,
        plaqueLeft: plaqueRect.left,
        plaqueRight: plaqueRect.right
      }
    })

    expect(facts.barPosition).toBe('absolute')
    expect(facts.barPointerEvents).toBe('none')
    expect(facts.barAnimation).toBe('none')
    // 单行 ellipsis 属性就绪（默认源名不触发截断，截断行为由长源名测试锁）
    expect(facts.titleWhiteSpace).toBe('nowrap')
    expect(facts.titleTextOverflow).toBe('ellipsis')
    expect(Number.parseFloat(facts.titleMinWidth)).toBe(0)
    expect(facts.titleFontSize).toBe('10px')
    // 窗口标题与 domain 行同 muted token（对 plaque 两端 AA 由守卫组实算）
    expect(facts.titleColor).toBe(facts.domainColor)
    // × 与阅读页关闭钮同款：18×16（border-box 含 1px 边）、on-accent 底 accent 色、12px 700
    expect(facts.closeWidth).toBe(18)
    expect(facts.closeHeight).toBe(16)
    expect(facts.closeBorderWidth).toBe('1px')
    expect(facts.closeFontWeight).toBe('700')
    if (scheme === 'light') {
      expect(facts.closeColor).toBe('rgb(255, 255, 255)')
      expect(facts.closeBackground).toBe('rgb(36, 86, 214)')
    } else {
      expect(facts.closeColor).toBe('rgb(6, 16, 36)')
      expect(facts.closeBackground).toBe('rgb(91, 157, 255)')
    }
    // _ □ 未激活态：muted 字色、无底色
    expect(facts.inactiveColors[0], '_ 未激活 muted').toBe(facts.domainColor)
    expect(facts.inactiveColors[1], '□ 未激活 muted').toBe(facts.domainColor)
    expect(facts.inactiveBackgrounds.every((bg) => bg === 'rgba(0, 0, 0, 0)')).toBe(true)
    // 标题栏收在 plaque 盒内，不外溢
    expect(facts.barLeft).toBeGreaterThanOrEqual(facts.plaqueLeft - 1)
    expect(facts.barRight).toBeLessThanOrEqual(facts.plaqueRight + 1)
  })
}

for (const sample of [
  { scheme: 'light', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'dark', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'light', size: 'narrow120', width: 720, height: 900, zoom: 1.2 },
  { scheme: 'dark', size: 'narrow120', width: 720, height: 900, zoom: 1.2 }
] as const) {
  test(`y2k 订阅页头版几何与版心对齐 ${sample.scheme} ${sample.size}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await loadY2k(page, `window.__stubData.settings.uiZoom = ${sample.zoom};`, sample.scheme)
    await page.evaluate(() => document.fonts.ready)

    const screenshotPath = join(
      process.cwd(),
      SCREENSHOT_DIR,
      `feed-${sample.scheme}-${sample.size}.png`
    )
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const root = activeTab(page).locator('.juya-root')
    const masthead = root.locator('.jyy2k-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const facts = await masthead.evaluate((element) => {
      const kicker = element.querySelector<HTMLElement>('.jyy2k-feed-masthead-kicker')!
      const heading = element.querySelector('h1') as HTMLElement
      const domain = element.querySelector<HTMLElement>('.jyy2k-feed-masthead-domain')!
      const scroller = element.closest('.view-scroll') as HTMLElement
      const feed = element.nextElementSibling
      const feedRect = feed ? feed.getBoundingClientRect() : null
      const rect = element.getBoundingClientRect()
      const headingStyle = getComputedStyle(heading)
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
        headingFontSize: Number.parseFloat(headingStyle.fontSize),
        headingScrollWidth: heading.scrollWidth,
        headingClientWidth: heading.clientWidth,
        borderTopWidth: getComputedStyle(element).borderTopWidth,
        kickerColor: getComputedStyle(kicker).color,
        domainColor: getComputedStyle(domain).color,
        headingTextShadow: headingStyle.textShadow,
        headingFilter: headingStyle.filter,
        headingStrokeWidth: headingStyle.webkitTextStrokeWidth,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth
      }
    })
    expect(facts.kickerBottom).toBeLessThanOrEqual(facts.headingTop)
    expect(facts.headingBottom).toBeLessThanOrEqual(facts.domainTop)
    expect(facts.headingFontSize).toBeGreaterThanOrEqual(sample.size === 'wide' ? 60 : 44)
    expect(facts.headingScrollWidth).toBeLessThanOrEqual(facts.headingClientWidth + 1)
    // CSS zoom 下 computed border 宽度按 1/zoom 报值（2px→1.667px），只断言像素浮雕描边存在。
    expect(Number.parseFloat(facts.borderTopWidth), 'plaque 描边存在').toBeGreaterThan(0)
    // 铬字无 text-shadow 压盖（亮暗两侧一致）。
    expect(facts.headingTextShadow).toBe('none')
    // 亮侧：铬字高光/暗影双影走 filter: drop-shadow；暗侧：霓虹描边走 1px text-stroke。
    if (sample.scheme === 'light') {
      expect(facts.headingFilter).toContain('drop-shadow')
    } else {
      expect(facts.headingStrokeWidth).toBe('1px')
    }
    expect(facts.mastheadWidth).toBeGreaterThan(sample.size === 'wide' ? 900 : 400)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth)
    expect(facts.mastheadLeft, '头版与卡片列表同一版心左缘').toBeCloseTo(facts.feedLeft, 0)
    expect(facts.mastheadRight, '头版与卡片列表同一版心右缘').toBeCloseTo(facts.feedRight, 0)
    console.log(
      `Y2K_MASTHEAD_REPORT ${sample.scheme}-${sample.size} ${JSON.stringify({
        kickerColor: facts.kickerColor,
        domainColor: facts.domainColor,
        headingFontSize: facts.headingFontSize,
        mastheadWidth: facts.mastheadWidth
      })}`
    )
  })
}
