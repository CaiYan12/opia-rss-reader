import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { activeTab, loadApp, openFirstArticle } from './setup'

type Side = 'light' | 'dark'
const REAL_FIXTURE = join(process.cwd(), 'tests', 'fixtures', 'juya-content.html')
const SYNTHETIC_FIXTURE = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'juya-content.synthetic.html')

function getFixtureFingerprint(): { path: string; sha256: string } {
  const path = existsSync(REAL_FIXTURE) ? REAL_FIXTURE : SYNTHETIC_FIXTURE
  return { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }
}

async function routeFixtureImages(page: Page): Promise<void> {
  await page.route('https://assets.example.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const palette = ['#b99872', '#89947b', '#8d7770', '#bfaa8e', '#737f78']
    const paletteIndex = [...path].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length
    const fill = palette[paletteIndex]
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="${fill}"/><path d="M0 270 C110 226 180 310 300 248 S500 288 640 220 V360 H0Z" fill="#37332b" fill-opacity=".22"/><path d="M0 294 C130 265 216 327 348 281 S520 313 640 270" fill="none" stroke="#f3f0e8" stroke-opacity=".45" stroke-width="3"/></svg>`
    })
  })
}

async function loadWabiReader(
  page: Page,
  side: Side,
  zoom: number,
  articleOverride: { title?: string; pubDate?: string; contentHtml?: string } = {}
): Promise<void> {
  await loadApp(page, 'wabi')
  await routeFixtureImages(page)
  await page.addInitScript(
    ({ selectedSide, selectedZoom, articleOverride }) => {
      const data = (window as unknown as {
        __stubData: {
          settings: {
            themeMode: string
            juyaLightStyleId: string
            juyaDarkStyleId: string
            uiZoom: number
          }
          articles: Array<{ title: string; pubDate: string; contentHtml: string }>
        }
      }).__stubData
      data.settings.themeMode = selectedSide
      data.settings.juyaLightStyleId = 'wabi'
      data.settings.juyaDarkStyleId = 'wabi'
      data.settings.uiZoom = selectedZoom
      if (Object.keys(articleOverride).length > 0) {
        data.articles[0] = { ...data.articles[0], ...articleOverride }
      }
    },
    { selectedSide: side, selectedZoom: zoom, articleOverride }
  )
  await page.reload()
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  await openFirstArticle(page)
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.mouse.move(0, 0)
  await expect(activeTab(page).locator(`.juya-root[data-juya-variant="wabi-${side}"]`)).toBeVisible()
}

async function saveScreenEvidence(page: Page, side: Side, width: number, zoom: number): Promise<Array<{ familyName: string; glyphCount: number; isCustomFont: boolean }>> {
  const phase = process.env.WABI_EVIDENCE_PHASE ?? 'run'
  const evidenceDir = join(process.cwd(), 'out', 'wabi-art-implementation-2026-10-24', '64', phase)
  mkdirSync(evidenceDir, { recursive: true })
  const path = join(evidenceDir, `reader-${side}-${width}-${Math.round(zoom * 100)}.png`)
  await page.screenshot({ path, fullPage: false })

  const root = activeTab(page).locator('.juya-root')
  const facts = await root.evaluate((element) => {
    const bounds = (node: Element | null) => {
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }
    }
    const header = element.querySelector('.juya-masthead')
    const title = header?.querySelector('h1') ?? null
    const date = header?.querySelector('time') ?? null
    const scroller = element.closest('.view-scroll')
    return {
      variant: element.getAttribute('data-juya-variant'),
      heading: title?.textContent ?? null,
      date: date?.textContent ?? null,
      dateTime: date?.getAttribute('datetime') ?? null,
      header: bounds(header),
      title: bounds(title),
      dateBounds: bounds(date),
      fontFamily: title ? getComputedStyle(title).fontFamily : null,
      scrollWidth: scroller?.scrollWidth ?? null,
      clientWidth: scroller?.clientWidth ?? null
    }
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root: documentRoot } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeId: titleNodeId } = await cdp.send('DOM.querySelector', {
    nodeId: documentRoot.nodeId,
    selector: '.wabi-reading-craft-title'
  })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: titleNodeId })
  await cdp.detach()
  const renderedTitleFonts = fonts.map((font: { familyName: string; glyphCount: number; isCustomFont: boolean }) => ({
    familyName: font.familyName,
    glyphCount: font.glyphCount,
    isCustomFont: font.isCustomFont
  }))
  console.log(`[wabi reading title fonts] ${JSON.stringify({ side, width, zoom, renderedTitleFonts })}`)
  writeFileSync(
    join(evidenceDir, `reader-${side}-${width}-${Math.round(zoom * 100)}.json`),
    JSON.stringify({ path, fixture: getFixtureFingerprint(), imageRoute: 'assets.example.com -> deterministic SVG by URL path', facts, renderedTitleFonts }, null, 2),
    'utf8'
  )
  return renderedTitleFonts
}

for (const side of ['light', 'dark'] as const) {
  for (const sample of [
    { width: 1280, height: 900, zoom: 1, label: 'wide' },
    { width: 560, height: 800, zoom: 1.2, label: 'narrow-120' }
  ]) {
    test(`wabi ${side} reader craft masthead composes correctly at ${sample.label}`, async ({ page }) => {
      await page.setViewportSize({ width: sample.width, height: sample.height })
      await loadWabiReader(page, side, sample.zoom)
      const root = activeTab(page).locator('.juya-root')
      const renderedTitleFonts = await saveScreenEvidence(page, side, sample.width, sample.zoom)

      await expect(root).toHaveClass(/wabi-reading-craft/)
      const masthead = root.locator('.wabi-reading-craft-masthead')
      await expect(masthead).toBeVisible()
      await expect(masthead.locator('h1')).toHaveCount(1)
      await expect(masthead.locator('h1')).toHaveText('AI 早报 2026-08-28')
      const titleStyle = await masthead.locator('h1').evaluate((element) => {
        const style = getComputedStyle(element)
        return { family: style.fontFamily, fontSize: Number.parseFloat(style.fontSize), fontWeight: style.fontWeight }
      })
      expect(titleStyle.family).toContain('华文行楷')
      expect(titleStyle.fontSize).toBeGreaterThan(sample.width === 1280 ? 50 : 30)
      expect(titleStyle.fontWeight).toBe('400')
      expect(renderedTitleFonts.some((font) => font.glyphCount > 0)).toBe(true)

      const date = masthead.locator('time.wabi-reading-craft-date')
      await expect(date).toHaveAttribute('datetime', '2026-08-28T01:31:42.000Z')
      await expect(date).toHaveText('2026年8月28日')
      const geometry = await masthead.evaluate((element) => {
        const title = element.querySelector('h1')!
        const date = element.querySelector('time')!
        const titleBox = title.getBoundingClientRect()
        const dateBox = date.getBoundingClientRect()
        const headerBox = element.getBoundingClientRect()
        const style = getComputedStyle(date)
        const range = document.createRange()
        range.selectNodeContents(title)
        return {
          titleRight: titleBox.right,
          dateLeft: dateBox.left,
          dateRight: dateBox.right,
          headerLeft: headerBox.left,
          headerRight: headerBox.right,
          textRects: [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
          writingMode: style.writingMode,
          scrollWidth: (title as HTMLElement).scrollWidth,
          clientWidth: (title as HTMLElement).clientWidth
        }
      })
      expect(geometry.dateLeft).toBeGreaterThan(geometry.titleRight - 1)
      expect(geometry.dateRight).toBeLessThanOrEqual(geometry.headerRight + 1)
      expect(geometry.textRects.length).toBeGreaterThan(0)
      expect(geometry.textRects.every((rect) => rect.left >= geometry.headerLeft - 1 && rect.right <= geometry.dateLeft + 1)).toBe(true)
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
      expect(geometry.writingMode).toBe('vertical-rl')
      await expect(masthead.locator('.wabi-reading-craft-rubbing[aria-hidden="true"]')).toBeVisible()
      await expect(masthead.locator('svg[tabindex]')).toHaveCount(0)
      expect(await masthead.locator('.wabi-reading-craft-rubbing').evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none')
      expect(await root.locator('.juya-entry p:not(.juya-links-label)').first().evaluate((node) => {
        const style = getComputedStyle(node)
        return { fontSize: style.fontSize, lineHeight: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize) }
      })).toEqual({ fontSize: '16px', lineHeight: 1.85 })
    })
  }
}

test('wabi reader falls back to the article title and omits unavailable dates and numbers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadWabiReader(page, 'light', 1, {
    title: 'Article title fallback',
    pubDate: 'not-a-date',
    contentHtml: '<div><h2>Section without a number</h2><h3>Entry without an index</h3><p>Readable body text remains.</p></div>'
  })

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveClass(/wabi-reading-craft/)
  await expect(root.locator('.wabi-reading-craft-title')).toHaveText('Article title fallback')
  await expect(root.locator('.wabi-reading-craft-date')).toHaveCount(0)
  await expect(root.locator('.juya-index')).toHaveCount(0)
  await expect(root.locator('p').filter({ hasText: 'Readable body text remains.' })).toBeVisible()
})

test('wabi display title remains readable when both handwritten font names are unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadWabiReader(page, 'light', 1)
  const title = activeTab(page).locator('.wabi-reading-craft-title')
  await title.evaluate((element) => {
    ;(element as HTMLElement).style.fontFamily =
      '"__MissingWabiHandwriting__", "__MissingSTXingkai__", "KaiTi", "楷体", "Noto Serif SC", serif'
  })
  await page.evaluate(() => document.fonts.ready.then(() => true))

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '.wabi-reading-craft-title'
  })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
  await cdp.detach()
  const renderedFonts = fonts.map((font: { familyName: string; glyphCount: number; isCustomFont: boolean }) => ({
    familyName: font.familyName,
    glyphCount: font.glyphCount,
    isCustomFont: font.isCustomFont
  }))
  const declaredFallback = await title.evaluate((element) => getComputedStyle(element).fontFamily)
  const evidenceDir = join(process.cwd(), 'out', 'wabi-art-implementation-2026-10-24', '64', 'verify')
  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(
    join(evidenceDir, 'font-fallback.json'),
    JSON.stringify({ declaredFallback, renderedFonts }, null, 2),
    'utf8'
  )
  console.log(`[wabi display fallback fonts] ${JSON.stringify({ declaredFallback, renderedFonts })}`)

  expect(renderedFonts.some((font) => font.glyphCount > 0)).toBe(true)
  expect(renderedFonts.some((font) => /KaiTi|楷体|Noto Serif SC/i.test(font.familyName))).toBe(true)
})

test('wabi reader wraps a long issue heading beside its vertical date at 120% zoom', async ({ page }) => {
  const longHeading = `秋日器物与和纸：${'UnbrokenWabiCraft'.repeat(4)}工艺封面长标题折行样本`
  await page.setViewportSize({ width: 480, height: 780 })
  await loadWabiReader(page, 'dark', 1.2, {
    pubDate: '2026-08-28T01:31:42.000Z',
    contentHtml: `<div><h1>${longHeading}</h1><h2>长标题栏目</h2><h3>正文条目</h3><p>正文在刊头之后继续沿同一轴线阅读。</p></div>`
  })

  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.wabi-reading-craft-masthead')
  const title = masthead.locator('.wabi-reading-craft-title')
  const date = masthead.locator('.wabi-reading-craft-date')
  await expect(title).toHaveText(longHeading)
  await expect(date).toHaveText('2026年8月28日')
  const renderedTitleFonts = await saveScreenEvidence(page, 'dark', 480, 1.2)
  expect(renderedTitleFonts.some((font) => font.glyphCount > 0)).toBe(true)

  const geometry = await masthead.evaluate((element) => {
    const title = element.querySelector('h1')!
    const date = element.querySelector('time')!
    const titleBox = title.getBoundingClientRect()
    const dateBox = date.getBoundingClientRect()
    const headerBox = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(title)
    const textRects = [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right }))
    const scroller = element.closest('.juya-root')?.closest('.view-scroll') as HTMLElement | null
    return {
      titleTextRects: textRects,
      titleRight: titleBox.right,
      dateLeft: dateBox.left,
      dateRight: dateBox.right,
      headerLeft: headerBox.left,
      headerRight: headerBox.right,
      scrollWidth: scroller?.scrollWidth ?? 0,
      clientWidth: scroller?.clientWidth ?? 0
    }
  })
  expect(geometry.titleTextRects.length).toBeGreaterThan(1)
  expect(
    geometry.titleTextRects.every((rect) => rect.left >= geometry.headerLeft - 1 && rect.right <= geometry.dateLeft + 1)
  ).toBe(true)
  expect(geometry.dateRight).toBeLessThanOrEqual(geometry.headerRight + 1)
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
})

for (const side of ['light', 'dark'] as const) {
  test(`wabi ${side} page materials preserve keyboard link focus`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await loadWabiReader(page, side, 1)
    const root = activeTab(page).locator('.juya-root')
    const firstLink = root.locator('.juya-overview a').first()
    await firstLink.focus()
    await page.keyboard.press('Tab')

    const expectedOutlineColor = side === 'light' ? 'rgb(165, 101, 74)' : 'rgb(201, 154, 125)'
    const focusProbe = {
      variant: `wabi-${side}`,
      expectedColor: expectedOutlineColor
    }
    const focusState = await page.evaluate((variant) => {
      const active = document.activeElement
      const root = active?.closest('.juya-root')
      const style = active ? getComputedStyle(active) : null
      return {
        variant: root?.getAttribute('data-juya-variant') ?? null,
        activeTag: active?.tagName ?? null,
        activeHref: active instanceof HTMLAnchorElement ? active.getAttribute('href') : null,
        activeText: active?.textContent ?? null,
        activeInsideRoot: Boolean(root && active && root.contains(active)),
        focusVisible: Boolean(active?.matches(':focus-visible')),
        focusToken: root ? getComputedStyle(root).getPropertyValue('--jy-focus').trim() : null,
        outlineColor: style?.outlineColor ?? null,
        outlineWidth: style?.outlineWidth ?? null,
        outlineStyle: style?.outlineStyle ?? null
      }
    }, focusProbe.variant)
    console.log(`[wabi keyboard focus state] ${JSON.stringify({ side, focusState })}`)
    const resolvedFocusIsStable = ({ variant, expectedColor }: typeof focusProbe) => {
      const active = document.activeElement
      const root = active?.closest('.juya-root')
      return Boolean(
        root &&
          root.getAttribute('data-juya-variant') === variant &&
          root.classList.contains('wabi-reading-craft') &&
        active &&
          root.contains(active) &&
          active instanceof HTMLAnchorElement &&
          active.matches(':focus-visible') &&
          getComputedStyle(active).outlineColor === expectedColor
      )
    }
    await page.waitForFunction(resolvedFocusIsStable, focusProbe, { timeout: 5000 })
    await page.waitForFunction(resolvedFocusIsStable, focusProbe, { timeout: 5000 })

    const focusedLink = root.locator('.juya-overview a:focus-visible').first()
    await expect(focusedLink).toBeVisible()
    const focusFacts = await focusedLink.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
        outlineColor: style.outlineColor,
        hitTargetIsLink: hit === element
      }
    })
    console.log(`[wabi keyboard focus settled] ${JSON.stringify({ side, focusFacts })}`)
    expect(focusFacts).toEqual({
      outlineStyle: 'solid',
      outlineWidth: '2px',
      outlineOffset: '2px',
      outlineColor: expectedOutlineColor,
      hitTargetIsLink: true
    })
  })
}
