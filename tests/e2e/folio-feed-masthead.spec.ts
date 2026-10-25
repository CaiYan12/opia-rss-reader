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
      // #80 印章盒：绝对定位锚定容器 padding box（top/right 20px）；rotate -8deg 视觉外扩
      // 约 5px/侧，判定时外扩留余量（宁严勿松）。
      const mastheadCs = getComputedStyle(element)
      const sealCs = getComputedStyle(element, '::after')
      const sealTop = rect.top + Number.parseFloat(mastheadCs.borderTopWidth) + 20
      const sealRight = rect.right - Number.parseFloat(mastheadCs.borderRightWidth) - 20
      const sealBox = {
        top: sealTop - 5,
        bottom: sealTop + Number.parseFloat(sealCs.height) + 5,
        left: sealRight - Number.parseFloat(sealCs.width) - 5,
        right: sealRight + 5
      }
      const textLines = (el: Element): DOMRect[] => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return [...range.getClientRects()]
      }
      const sealOverlaps = (lines: DOMRect[]): boolean =>
        lines.some(
          (line) =>
            line.left < sealBox.right &&
            line.right > sealBox.left &&
            line.top < sealBox.bottom &&
            line.bottom > sealBox.top
        )
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
        clientWidth: scroller.clientWidth,
        sealContent: sealCs.content,
        sealBg: sealCs.backgroundImage,
        sealOpacity: sealCs.opacity,
        sealBlend: sealCs.mixBlendMode,
        sealRotate: sealCs.rotate,
        sealWidth: sealCs.width,
        sealPointerEvents: sealCs.pointerEvents,
        sealAnimation: sealCs.animationName,
        sealTransitionDuration: sealCs.transitionDuration,
        mastheadBg: mastheadCs.backgroundImage,
        sealOverlapsHeading: sealOverlaps(textLines(heading)),
        sealOverlapsKicker: sealOverlaps(textLines(kicker))
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
    // #80：印章水印与朱丝栏在四样本（亮暗 × 宽窄 120%）下成立；印章不叠压居中文字
    // （Range 行盒判定，含 rotate 外扩余量；不压字截图留证即本循环全页截图）。
    // zoom 1.2 下 computed 尺寸有亚像素量化（同 border-width 1px→0.833px 口径），宽度用容差断言。
    expect(Number.parseFloat(facts.sealWidth), '印章 72×72（阅读页现值）').toBeCloseTo(72, 1)
    expect(facts.sealRotate, '阅读页现值 rotate -8deg').toBe('-8deg')
    expect(facts.sealPointerEvents, '水印不拦截命中').toBe('none')
    expect(facts.sealAnimation, '印章零动效').toBe('none')
    expect(facts.sealTransitionDuration, '头版静帧：阅读页 300ms 过渡不搬').toBe('0s')
    expect(facts.sealOpacity, `${sample.scheme} 印章静帧透明度（阅读页现值）`).toBe(
      sample.scheme === 'dark' ? '0.1' : '0.12'
    )
    expect(facts.sealBlend, `${sample.scheme} 印章混合（阅读页现值）`).toBe(
      sample.scheme === 'dark' ? 'screen' : 'multiply'
    )
    expect(facts.sealBg, '印章 SVG data URI 在场').toContain('data:image/svg+xml')
    expect(facts.mastheadBg, '朱丝栏 hard-stop 绯线在场（暗侧取阅读页暗值）').toContain(
      sample.scheme === 'dark' ? 'rgba(208, 113, 79, 0.3)' : 'rgba(179, 69, 46, 0.28)'
    )
    expect(facts.sealOverlapsHeading, '印章不叠压 h1 大字').toBe(false)
    expect(facts.sealOverlapsKicker, '印章不叠压 kicker').toBe(false)
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

// ---- #80：阅读页印章水印与朱丝栏静帧搬入头版 ----
// 断言面：亮暗两变体印章可见（::after 承载 SVG data URI、rotate -8deg、静帧透明度）、
// 对辅助技术静默（content '' 不进朗读树）、pointer-events:none 不改命中区域、零新增可聚焦
// 元素（不进焦点顺序）；朱丝栏两变体 hard-stop 绯线在场。CSS 原文纪律（现值、静帧、
// 构成色白名单、阅读页反证）由 tests/unit/juyaCssGuard.test.ts folio 守卫组锁死。
for (const scheme of ['light', 'dark'] as const) {
  test(`folio 订阅页头版印章水印与朱丝栏成立 ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadFolio(page, '', scheme)
    await page.evaluate(() => document.fonts.ready)
    const root = activeTab(page).locator('.juya-root')
    await expect(root).toHaveAttribute('data-juya-variant', `folio-${scheme}`)
    const masthead = root.locator('.jyfolio-feed-masthead')
    await expect(masthead).toBeVisible()
    await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)

    const facts = await masthead.evaluate((element) => {
      const mastheadCs = getComputedStyle(element)
      const sealCs = getComputedStyle(element, '::after')
      const rect = element.getBoundingClientRect()
      const sealTop = rect.top + Number.parseFloat(mastheadCs.borderTopWidth) + 20
      const sealRight = rect.right - Number.parseFloat(mastheadCs.borderRightWidth) - 20
      const sealWidth = Number.parseFloat(sealCs.width)
      const sealHeight = Number.parseFloat(sealCs.height)
      // 印章中心命中测试：pointer-events:none 时命中穿透到印章下方既有流内元素
      // （宽容器下通常是撑满行宽的 kicker 段），与无水印时完全一致——命中归真实内容，
      // 水印不形成独立命中层。
      const hit = document.elementFromPoint(sealRight - sealWidth / 2, sealTop + sealHeight / 2)
      // 焦点顺序：头版内不得出现新增可聚焦元素（印章为伪元素，天然不进焦点链）。
      const focusables = [
        ...element.querySelectorAll('a, button, input, select, textarea, [tabindex]')
      ]
      return {
        content: sealCs.content,
        bg: sealCs.backgroundImage,
        opacity: sealCs.opacity,
        blend: sealCs.mixBlendMode,
        rotate: sealCs.rotate,
        width: sealWidth,
        height: sealHeight,
        pointerEvents: sealCs.pointerEvents,
        animationName: sealCs.animationName,
        transitionDuration: sealCs.transitionDuration,
        hitWithinMasthead: hit ? element.contains(hit) || hit === element : false,
        hitClassName: hit ? (typeof hit.className === 'string' ? hit.className : hit.tagName) : '',
        focusableCount: focusables.length,
        ruleBg: mastheadCs.backgroundImage
      }
    })

    expect(facts.content, '印章空内容：不进朗读树').toBe('""')
    expect(facts.bg, '印章为阅读页同款 SVG data URI').toContain('data:image/svg+xml')
    expect(facts.width, '印章 72×72（阅读页现值）').toBe(72)
    expect(facts.height).toBe(72)
    expect(facts.rotate, '阅读页现值 rotate -8deg').toBe('-8deg')
    expect(facts.opacity, `${scheme} 印章静帧透明度（阅读页现值）`).toBe(
      scheme === 'dark' ? '0.1' : '0.12'
    )
    expect(facts.blend, `${scheme} 印章混合（阅读页现值）`).toBe(
      scheme === 'dark' ? 'screen' : 'multiply'
    )
    expect(facts.pointerEvents, '不拦截点击与选择').toBe('none')
    expect(facts.animationName, '零动效（V2 静帧纪律）').toBe('none')
    expect(facts.transitionDuration, '头版静帧：阅读页 300ms 过渡不搬').toBe('0s')
    expect(
      facts.hitWithinMasthead,
      `印章中心命中的是容器内既有流内元素而非独立命中层（实测 ${facts.hitClassName}）`
    ).toBe(true)
    expect(facts.focusableCount, '头版零可聚焦元素（不进焦点顺序）').toBe(0)
    expect(facts.ruleBg, '朱丝栏 hard-stop 绯线在场（暗侧取阅读页暗值）').toContain(
      scheme === 'dark' ? 'rgba(208, 113, 79, 0.3)' : 'rgba(179, 69, 46, 0.28)'
    )
  })
}
