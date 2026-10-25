import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { inflateSync } from 'node:zlib'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { loadApp, openFirstArticle, activeTab } from './setup'

const LONG_URL = `https://example.test/${'wabiPaperUnbrokenPath'.repeat(16)}`
const PAPER_ISSUE = `<div>
<h1>侘寂纸页排字</h1>
<h2>纸面栏目</h2>
<h3>第一条：完整导语与长正文 <code>#1</code></h3>
<blockquote>这段导语需要完整显示，并以细陶土竖线和留白区分正文，不依赖大片底色。${'导语仍保留全文。'.repeat(4)}</blockquote>
<p>普通正文用于测量字号、行距和纸面上的实际文字对比度。</p>
<p>无断点 URL 正文：${LONG_URL}</p>
<p>相关链接：</p><ul><li><a href="https://example.test/related">相关链接文字保持可读且可键盘到达</a></li></ul>
<h3>第二条：没有导语的边界 <code>#2</code></h3>
<p>缺少导语时不应留下空白装饰。正文轴线仍然与前后条目一致。</p>
<h3>第三条：回到同一轴线 <code>#3</code></h3>
<blockquote>第三条完整导语。</blockquote><p>第三条正文。</p>
</div>`

type Side = 'light' | 'dark'

async function loadWabiSample(page: Page, side: Side, zoom = 1): Promise<void> {
  await loadApp(page, 'wabi')
  // Reuse the established in-memory window.opia seam. The second init script runs after
  // helpers.ts seeds its scenario and before the renderer requests settings and articles.
  await page.addInitScript(
    ({ side: selectedSide, zoom: selectedZoom, contentHtml }) => {
      const data = (window as unknown as {
        __stubData: {
          settings: {
            themeMode: string
            juyaLightStyleId: string
            juyaDarkStyleId: string
            uiZoom: number
          }
          articles: Array<{ contentHtml: string }>
        }
      }).__stubData
      data.settings.themeMode = selectedSide
      data.settings.juyaLightStyleId = 'wabi'
      data.settings.juyaDarkStyleId = 'wabi'
      data.settings.uiZoom = selectedZoom
      data.articles = data.articles.map((article) => ({ ...article, contentHtml }))
    },
    { side, zoom, contentHtml: PAPER_ISSUE }
  )
  await page.reload()
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  await openFirstArticle(page)
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.mouse.move(0, 0)
  await expect(activeTab(page).locator(`.juya-root[data-juya-variant="wabi-${side}"]`)).toBeVisible()
}

type Png = { width: number; height: number; pixels: number[][] }

function decodePng(buffer: Buffer): Png {
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const data: Buffer[] = []
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const chunk = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
      bitDepth = chunk[8]
      colorType = chunk[9]
    } else if (type === 'IDAT') data.push(chunk)
    else if (type === 'IEND') break
    offset += length + 12
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`)
  }
  const bytesPerPixel = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * bytesPerPixel
  const decoded = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const left = i >= bytesPerPixel ? decoded[y * stride + i - bytesPerPixel] : 0
      const above = y > 0 ? decoded[(y - 1) * stride + i] : 0
      const upperLeft = i >= bytesPerPixel && y > 0 ? decoded[(y - 1) * stride + i - bytesPerPixel] : 0
      const value = row[i]
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = above
      else if (filter === 3) predictor = (left + above) >> 1
      else if (filter === 4) {
        const p = left + above - upperLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - above)
        const pc = Math.abs(p - upperLeft)
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`)
      decoded[y * stride + i] = (value + predictor) & 0xff
    }
  }
  const pixels: number[][] = []
  for (let y = 0; y < height; y++) {
    const row: number[] = []
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * bytesPerPixel
      row.push((decoded[i] << 16) | (decoded[i + 1] << 8) | decoded[i + 2])
    }
    pixels.push(row)
  }
  return { width, height, pixels }
}

function parseRgb(value: string): number {
  const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (!parts || parts.length !== 3) throw new Error(`Unsupported color: ${value}`)
  return (parts[0] << 16) | (parts[1] << 8) | parts[2]
}

function luminance(rgb: number): number {
  const channel = [16, 8, 0].map((shift) => {
    const value = ((rgb >> shift) & 0xff) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2]
}

function contrast(a: number, b: number): number {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

async function sampleBackgroundContrast(
  page: Page,
  locator: Locator,
  inset: { left: number; top: number; right: number; bottom: number }
): Promise<number> {
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
  const box = await locator.boundingBox()
  if (!box) throw new Error('Text sample has no visible bounding box')
  const textColor = await locator.evaluate((element) => getComputedStyle(element).color)
  const left = Math.round(box.x + inset.left)
  const top = Math.round(box.y + inset.top)
  const width = Math.max(1, Math.round(box.width - inset.left - inset.right))
  const height = Math.max(1, Math.round(box.height - inset.top - inset.bottom))
  const clip = { x: left, y: top, width, height }
  const visible = decodePng(await page.screenshot({ clip }))
  await locator.evaluate((element) => {
    for (const target of [element, ...element.querySelectorAll('*')]) {
      const styled = target as HTMLElement
      styled.style.setProperty('color', 'transparent', 'important')
      styled.style.setProperty('transition', 'none', 'important')
    }
  })
  try {
    const background = decodePng(await page.screenshot({ clip }))
    const ink = parseRgb(textColor)
    const glyphBackgrounds: Array<{ pixel: number; before: number; x: number; y: number }> = []
    for (let y = 0; y < visible.height; y++) {
      for (let x = 0; x < visible.width; x++) {
        const before = visible.pixels[y][x]
        const after = background.pixels[y][x]
        const delta = [16, 8, 0].map((shift) => Math.abs(((before >> shift) & 0xff) - ((after >> shift) & 0xff)))
        if (Math.max(...delta) >= 32) glyphBackgrounds.push({ pixel: after, before, x, y })
      }
    }
    if (glyphBackgrounds.length === 0) throw new Error('Could not isolate any rendered glyph pixels')
    const measured = glyphBackgrounds.map((sample) => ({
      ...sample,
      ratio: contrast(ink, sample.pixel)
    }))
    const worst = measured.reduce((low, current) => (current.ratio < low.ratio ? current : low))
    // eslint-disable-next-line no-console
    // eslint-disable-next-line no-console
    console.log(`[wabi glyph sample] ink=${textColor} pixels=${measured.length} worst=${JSON.stringify(worst)}`)
    return worst.ratio
  } finally {
    await locator.evaluate((element) => {
      for (const target of [element, ...element.querySelectorAll('*')]) {
        const styled = target as HTMLElement
        styled.style.removeProperty('color')
        styled.style.removeProperty('transition')
      }
    })
  }
}

async function attachReaderScreenshot(page: Page, testInfo: TestInfo, side: Side): Promise<void> {
  const width = page.viewportSize()?.width ?? 0
  const body = await page.screenshot({ fullPage: true })
  await testInfo.attach(`wabi-${side}-${width}px-reader`, { body, contentType: 'image/png' })
  mkdirSync(join(process.cwd(), 'out', 'wabi-ticket'), { recursive: true })
  const phase = process.env.WABI_EVIDENCE_PHASE ?? 'run'
  await page.screenshot({
    path: join(process.cwd(), 'out', 'wabi-ticket', `wabi-${phase}-${side}-${width}px-reader.png`),
    fullPage: true
  })
}

for (const side of ['light', 'dark'] as const) {
  test(`wabi-${side}: paper typography stays aligned and readable on the rendered texture`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await loadWabiSample(page, side)
    const root = activeTab(page).locator('.juya-root')
    const entries = root.locator('.juya-entry')
    await expect(entries).toHaveCount(3)
    await attachReaderScreenshot(page, testInfo, side)

    const styles = await entries.evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return {
          left: rect.left,
          backgroundColor: style.backgroundColor,
          borderWidth: style.borderWidth,
          boxShadow: style.boxShadow
        }
      })
    )
    expect(styles.map((style) => style.left), 'every entry uses the same left edge').toEqual([
      styles[0].left,
      styles[0].left,
      styles[0].left
    ])
    for (const style of styles) {
      expect(style.backgroundColor, 'entry text sits directly on the paper').toBe('rgba(0, 0, 0, 0)')
      expect(style.borderWidth, 'entry card border is removed').toBe('0px')
      expect(style.boxShadow, 'entry double shadow is removed').toBe('none')
    }

    const title = root.locator('.juya-masthead h1')
    const mastheadTitle = root.locator('.wabi-reading-craft-title')
    const mastheadDate = root.locator('.wabi-reading-craft-date')
    const paragraph = root.locator('.juya-entry p:not(.juya-links-label)').first()
    const lead = entries.nth(0).locator('.juya-lead')
    const index = entries.nth(0).locator('.juya-index')
    const link = root.locator('.juya-links a').first()
    await expect(title).toHaveCSS('font-family', /Noto Serif SC/)
    const metrics = await paragraph.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        family: style.fontFamily,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        textIndent: Number.parseFloat(style.textIndent),
        marginBottom: Number.parseFloat(style.marginBottom)
      }
    })
    expect(metrics.family).toMatch(/Segoe UI.*Noto Sans SC/)
    expect(metrics.fontSize).toBeGreaterThan(14.5)
    expect(metrics.lineHeight / metrics.fontSize).toBeGreaterThan(1.8)
    expect(metrics.textIndent).toBe(0)
    expect(metrics.marginBottom).toBeGreaterThan(0)

    await expect(lead).toContainText('导语仍保留全文。')
    await expect(mastheadDate).toHaveText('2026年8月28日')
    await expect(entries.nth(1).locator('.juya-lead'), 'missing lead has no empty decoration').toHaveCount(0)
    const leadStyle = await lead.evaluate((element) => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, borderLeft: style.borderLeftWidth, color: style.color }
    })
    expect(leadStyle.background, 'lead has no large colored backing').toBe('rgba(0, 0, 0, 0)')
    expect(leadStyle.borderLeft).toBe('2px')
    await expect(link).toHaveAttribute('href', 'https://example.test/related')

    const measured = {
      mastheadTitle: await sampleBackgroundContrast(page, mastheadTitle, { left: 0, top: 0, right: 0, bottom: 0 }),
      mastheadDate: await sampleBackgroundContrast(page, mastheadDate, { left: 0, top: 0, right: 0, bottom: 0 }),
      body: await sampleBackgroundContrast(page, paragraph, { left: 0, top: 0, right: 0, bottom: 0 }),
      lead: await sampleBackgroundContrast(page, lead, { left: 0, top: 0, right: 0, bottom: 0 }),
      index: await sampleBackgroundContrast(page, index, { left: 0, top: 0, right: 0, bottom: 0 }),
      link: await sampleBackgroundContrast(page, link, { left: 0, top: 0, right: 0, bottom: 0 })
    }
    // eslint-disable-next-line no-console
    console.log(`[wabi paper pixel contrast] side=${side} ${JSON.stringify(measured)}`)
    for (const [name, ratio] of Object.entries(measured)) {
      expect(ratio, `${name} against actual rendered paper pixels`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test(`wabi-${side}: an unbroken URL wraps at 720px with 120% content zoom`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 720, height: 800 })
    await loadWabiSample(page, side, 1.2)
    const root = activeTab(page).locator('.juya-root')
    await attachReaderScreenshot(page, testInfo, side)
    const paragraph = root.locator('.juya-entry p').filter({ hasText: LONG_URL })
    await expect(paragraph).toContainText(LONG_URL)
    const facts = await paragraph.evaluate((element) => {
      const scroller = element.closest('.view-scroll') as HTMLElement | null
      const range = document.createRange()
      range.selectNodeContents(element)
      const fragments = [...range.getClientRects()]
      return {
        paragraphScrollWidth: (element as HTMLElement).scrollWidth,
        paragraphClientWidth: (element as HTMLElement).clientWidth,
        lineFragments: fragments.length,
        lastTextRight: fragments.at(-1)?.right ?? 0,
        paragraphRight: element.getBoundingClientRect().right,
        scrollWidth: scroller?.scrollWidth ?? 0,
        clientWidth: scroller?.clientWidth ?? 0
      }
    })
    expect(facts.lineFragments, 'the long URL is laid out across multiple lines').toBeGreaterThan(1)
    expect(facts.paragraphScrollWidth).toBeLessThanOrEqual(facts.paragraphClientWidth + 1)
    expect(facts.lastTextRight).toBeLessThanOrEqual(facts.paragraphRight + 1)
    expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth + 1)
  })
}
