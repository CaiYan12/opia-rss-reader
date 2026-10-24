import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { makeStubScript } from './helpers'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

const SCREENSHOT_DIR = 'out/editorial-feed-masthead-pilot'

async function loadEditorial(
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
    `${makeStubScript('editorialT5LightGrid2')}
     window.__stubData.settings.juyaLightStyleId = 'editorial';
     window.__stubData.settings.juyaDarkStyleId = 'editorial';
     window.__stubData.settings.themeMode = ${JSON.stringify(scheme)};
     ${init}`
  )
  await page.goto('/')
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
}

test('editorial 订阅页头版保留真实源身份，日期留在卡片，标题命中衬线标题族', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadEditorial(page)
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'editorial-light')
  const masthead = root.locator('.jyedit-feed-masthead')
  await expect(masthead).toBeVisible()
  await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(masthead.locator('.jyedit-feed-masthead-domain')).toHaveText(
    new URL(DEFAULT_SOURCE.url).hostname
  )
  await expect(masthead.locator('.juya-feed-date, time')).toHaveCount(0)
  // editorial 走共享 DefaultFeedItem：日期 span 无独立类，沿用 feed.spec 的 editorial 口径定位。
  await expect(
    root
      .locator('.juya-feed-item .juya-feed-meta > span:not(.juya-feed-read-dot):not(.juya-feed-source)')
      .first()
  ).toBeVisible()

  expect(await masthead.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    'Noto Serif SC'
  )
  expect(await masthead.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
})

test('editorial 订阅页头版在空列表下仍呈现源身份', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadEditorial(page, 'window.__stubData.articles = [];')
  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.jyedit-feed-masthead h1')).toHaveText(DEFAULT_SOURCE.name)
  await expect(root.locator('.juya-feed-empty')).toHaveText('暂无内容，点击右上角刷新获取')
})

test('editorial 订阅页头版长源名在窄窗 120% 下自行换行不外溢', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 720, height: 900 })
  const longName = '城市早报与人工智能观察'.repeat(5)
  await loadEditorial(
    page,
    `window.__stubData.settings.uiZoom = 1.2;
     window.__stubData.sources = window.__stubData.sources.map((source) => ({
       ...source,
       name: ${JSON.stringify(longName)}
     }));`
  )
  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.jyedit-feed-masthead')
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
  // 超长来源名在卡片 meta 中的溢出属共享 DefaultFeedItem 行为，不在头版打样范围；只记录观察。
  console.log(`EDITORIAL_LONG_NAME_CARDS_OVERFLOW ${facts.scrollerOverflow}`)
})

for (const sample of [
  { scheme: 'light', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'dark', size: 'wide', width: 1280, height: 800, zoom: 1 },
  { scheme: 'light', size: 'narrow120', width: 720, height: 900, zoom: 1.2 },
  { scheme: 'dark', size: 'narrow120', width: 720, height: 900, zoom: 1.2 }
] as const) {
  test(`editorial 订阅页头版几何与版心对齐 ${sample.scheme} ${sample.size}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await loadEditorial(page, `window.__stubData.settings.uiZoom = ${sample.zoom};`, sample.scheme)
    await page.evaluate(() => document.fonts.ready)

    const screenshotPath = join(
      process.cwd(),
      SCREENSHOT_DIR,
      `feed-${sample.scheme}-${sample.size}.png`
    )
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const root = activeTab(page).locator('.juya-root')
    const masthead = root.locator('.jyedit-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const facts = await masthead.evaluate((element) => {
      const kicker = element.querySelector<HTMLElement>('.jyedit-feed-masthead-kicker')!
      const heading = element.querySelector('h1') as HTMLElement
      const domain = element.querySelector<HTMLElement>('.jyedit-feed-masthead-domain')!
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
        cornerCount: element.querySelectorAll('.jyedit-feed-masthead-corner').length,
        cornerTlAnimation: (() => {
          const tl = element.querySelector('.jyedit-feed-masthead-corner-tl')
          return tl ? getComputedStyle(tl).animationName : ''
        })(),
        secondHairlineTop: Number.parseFloat(getComputedStyle(element, '::before').top),
        secondHairlineBorderTopWidth: Number.parseFloat(
          getComputedStyle(element, '::before').borderTopWidth
        ),
        kickerColor: getComputedStyle(kicker).color,
        headingColor: getComputedStyle(heading).color,
        domainColor: getComputedStyle(domain).color,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth
      }
    })
    expect(facts.kickerBottom).toBeLessThanOrEqual(facts.headingTop)
    expect(facts.headingBottom).toBeLessThanOrEqual(facts.domainTop)
    expect(facts.headingFontSize).toBeGreaterThanOrEqual(sample.size === 'wide' ? 60 : 44)
    expect(facts.headingScrollWidth).toBeLessThanOrEqual(facts.headingClientWidth + 1)
    // CSS zoom 下 computed border 宽度按 1/zoom 报值（1px→0.833px），只断言发丝线存在。
    expect(
      Number.parseFloat(facts.borderTopWidth),
      '上缘发丝线存在'
    ).toBeGreaterThan(0)
    expect(facts.borderBottomStyle).toBe('double')
    // #78：双角标与第二条上缘发丝线在四样本（亮暗 × 宽窄 120%）下全部在场，且角标零动效。
    expect(facts.cornerCount, '双 L 形裁切角标在场').toBe(2)
    expect(facts.cornerTlAnimation, '角标零动效（V2 静帧纪律）').toBe('none')
    expect(facts.secondHairlineTop, '第二条上缘发丝线仍在（V1 双发丝上缘不变）').toBeGreaterThan(0)
    expect(facts.secondHairlineBorderTopWidth, '第二条发丝线本体存在').toBeGreaterThan(0)
    expect(facts.mastheadWidth).toBeGreaterThan(sample.size === 'wide' ? 900 : 400)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth)
    expect(facts.mastheadLeft, '头版与卡片列表同一版心左缘').toBeCloseTo(facts.feedLeft, 0)
    expect(facts.mastheadRight, '头版与卡片列表同一版心右缘').toBeCloseTo(facts.feedRight, 0)
    console.log(
      `EDITORIAL_MASTHEAD_REPORT ${sample.scheme}-${sample.size} ${JSON.stringify({
        kickerColor: facts.kickerColor,
        headingColor: facts.headingColor,
        domainColor: facts.domainColor,
        headingFontSize: facts.headingFontSize,
        mastheadWidth: facts.mastheadWidth
      })}`
    )
  })
}

// ---- #78：阅读页 .juya-issue 的 L 形裁切角标静帧搬入头版 + host 行题注化 ----
// 断言面：亮暗两变体角标可见（24×24、内缩 8px、发丝 token 上色）、aria-hidden 对辅助
// 技术静默、pointer-events:none 不拦截点击与选择；host 行前置 24px 发丝短线且字距对齐
// 题注语汇（uppercase + 0.08em）；头版无任何序号元素（无 counter 体系、无栏目序号词汇）。
// CSS 原文纪律由 tests/unit/juyaCssGuard.test.ts editorial 头版守卫组锁死。
for (const scheme of ['light', 'dark'] as const) {
  test(`editorial 订阅页头版裁切角标与题注化 host 行成立 ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadEditorial(page, '', scheme)
    await page.evaluate(() => document.fonts.ready)
    const root = activeTab(page).locator('.juya-root')
    await expect(root).toHaveAttribute('data-juya-variant', `editorial-${scheme}`)
    const masthead = root.locator('.jyedit-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const corners = masthead.locator('.jyedit-feed-masthead-corner')
    await expect(corners, '左上/右下两枚 L 形角标').toHaveCount(2)
    for (const corner of await corners.all()) {
      await expect(corner, '角标对辅助技术静默').toHaveAttribute('aria-hidden', 'true')
      await expect(corner).toBeVisible()
    }

    const facts = await masthead.evaluate((element) => {
      // 角标绝对定位锚定 padding box（阅读页 .juya-issue 无边框、头版容器带上边框 1px /
      // 3px double 收底），内缩量按 padding box 量取（zoom 1 下与声明值逐像素一致）。
      const mastheadCs = getComputedStyle(element)
      const mastheadRect = element.getBoundingClientRect()
      const padBox = {
        top: mastheadRect.top + Number.parseFloat(mastheadCs.borderTopWidth),
        left: mastheadRect.left + Number.parseFloat(mastheadCs.borderLeftWidth),
        right: mastheadRect.right - Number.parseFloat(mastheadCs.borderRightWidth),
        bottom: mastheadRect.bottom - Number.parseFloat(mastheadCs.borderBottomWidth)
      }
      const cornerFacts = (cls: string) => {
        const el = element.querySelector<HTMLElement>(`.${cls}`)!
        const cs = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return {
          position: cs.position,
          width: cs.width,
          height: cs.height,
          pointerEvents: cs.pointerEvents,
          animationName: cs.animationName,
          rectWidth: rect.width,
          rectHeight: rect.height,
          offsetTop: rect.top - padBox.top,
          offsetLeft: rect.left - padBox.left,
          offsetRight: padBox.right - rect.right,
          offsetBottom: padBox.bottom - rect.bottom,
          borderPainted: [cs.borderTopColor, cs.borderLeftColor, cs.borderRightColor, cs.borderBottomColor]
            .some((color) => color !== 'rgba(0, 0, 0, 0)')
        }
      }
      // 角标中心点命中测试：pointer-events:none 时命中的是其下方元素，不能是角标本体
      const hitAt = (el: HTMLElement): string => {
        const rect = el.getBoundingClientRect()
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return target ? (typeof target.className === 'string' ? target.className : target.tagName) : ''
      }
      // 头版不得出现任何序号语义：counter 体系（reset/increment/set）全为 none
      const counters: string[] = []
      for (const el of [element, ...element.querySelectorAll<HTMLElement>('*')]) {
        const cs = getComputedStyle(el)
        if (cs.counterReset !== 'none' || cs.counterIncrement !== 'none' || cs.counterSet !== 'none') {
          counters.push((typeof el.className === 'string' && el.className) || el.tagName)
        }
      }
      const domain = element.querySelector<HTMLElement>('.jyedit-feed-masthead-domain')!
      const domainCs = getComputedStyle(domain)
      const domainBefore = getComputedStyle(domain, '::before')
      return {
        cornerTl: cornerFacts('jyedit-feed-masthead-corner-tl'),
        cornerBr: cornerFacts('jyedit-feed-masthead-corner-br'),
        tlHit: hitAt(element.querySelector<HTMLElement>('.jyedit-feed-masthead-corner-tl')!),
        brHit: hitAt(element.querySelector<HTMLElement>('.jyedit-feed-masthead-corner-br')!),
        counters,
        domain: {
          display: domainCs.display,
          alignItems: domainCs.alignItems,
          gap: domainCs.gap,
          fontSize: domainCs.fontSize,
          letterSpacing: domainCs.letterSpacing,
          textTransform: domainCs.textTransform,
          beforeContent: domainBefore.content,
          beforeWidth: domainBefore.width,
          beforeHeight: domainBefore.height,
          beforePainted: domainBefore.backgroundColor !== 'rgba(0, 0, 0, 0)'
        },
        h1Text: (element.querySelector('h1') as HTMLElement).textContent
      }
    })

    for (const [name, corner, topLeft] of [
      ['左上角标', facts.cornerTl, true],
      ['右下角标', facts.cornerBr, false]
    ] as const) {
      expect(corner.position, `${name} 绝对定位收在容器内`).toBe('absolute')
      expect(corner.width, `${name} 24×24（阅读页现值）`).toBe('24px')
      expect(corner.height).toBe('24px')
      expect(corner.rectWidth, `${name} 实测 24px 见方`).toBeCloseTo(24, 0)
      expect(corner.rectHeight).toBeCloseTo(24, 0)
      expect(
        corner.pointerEvents,
        `${name} 不拦截点击与选择`
      ).toBe('none')
      expect(corner.animationName, `${name} 零动效`).toBe('none')
      expect(corner.borderPainted, `${name} ${scheme} 变体发丝边可见`).toBe(true)
      if (topLeft) {
        expect(corner.offsetTop, `${name} 内缩 8px（阅读页现值）`).toBeCloseTo(8, 0)
        expect(corner.offsetLeft).toBeCloseTo(8, 0)
      } else {
        expect(corner.offsetRight).toBeCloseTo(8, 0)
        expect(corner.offsetBottom).toBeCloseTo(8, 0)
      }
    }
    expect(facts.tlHit, '左上角标中心命中的是下方元素而非角标本体').not.toContain(
      'jyedit-feed-masthead-corner'
    )
    expect(facts.brHit, '右下角标中心命中的是下方元素而非角标本体').not.toContain(
      'jyedit-feed-masthead-corner'
    )

    expect(facts.counters, '头版无任何序号元素（counter 体系为零）').toEqual([])

    expect(facts.domain.display, 'host 行 flex 承载前置短线').toBe('flex')
    expect(facts.domain.alignItems).toBe('center')
    expect(facts.domain.gap).toBe('8px')
    expect(facts.domain.fontSize).toBe('11px')
    expect(
      Math.abs(Number.parseFloat(facts.domain.letterSpacing) - 0.08 * 11),
      'host 字距对齐阅读页题注语汇 0.08em'
    ).toBeLessThanOrEqual(0.01)
    expect(facts.domain.textTransform).toBe('uppercase')
    expect(facts.domain.beforeContent, '短线为 ::before 空内容装饰').toBe('""')
    expect(facts.domain.beforeWidth, '前置 24px 发丝短线').toBe('24px')
    expect(facts.domain.beforeHeight).toBe('1px')
    expect(facts.domain.beforePainted, '短线发丝上色可见').toBe(true)
  })
}
