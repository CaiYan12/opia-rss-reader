import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadApp, openFirstArticle, activeTab } from './setup'

const svg = (width: number, height: number, color: string): string =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#${color}"/></svg>`)}`

const issueHtml = `<div>
<h1>Wabi 原文图文流</h1>
<h2>图文阅读</h2>
<h3>顺序与图版</h3>
<p>横图之前的正文。</p>
<p><a href="https://example.com/image"><img src="${svg(1024, 512, '3b4a8f')}" alt="横图题注"></a></p>
<p>图片之后的正文。</p>
<p><img src="${svg(520, 500, '2f6f6a')}" alt="近方图题注"></p>
<p><a href="https://example.com/linked-image"><img src="${svg(640, 360, '7a3f6b')}" alt="连续图题注"></a></p>
<p><img src="${svg(320, 600, '8a5a2f')}" alt="竖图题注"></p>
<p>连续图片之后的正文。</p>
<p><img src="${svg(600, 400, '4a4a52')}" alt=""></p>
<p>最后一段正文。</p>
<p>相关链接：</p><ul><li><a href="https://example.com/related">原文相关链接</a></li></ul>
</div>`

test('wabi：段落与图版遵循原文顺序，题注保留 alt 且链接图片不变成按钮', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'wabi')
  await page.addInitScript((contentHtml) => {
    ;(window as unknown as { __stubData: { articles: Array<{ contentHtml: string }> } })
      .__stubData.articles[0].contentHtml = contentHtml
  }, issueHtml)
  await page.reload()
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'wabi-light')
  const entry = root.locator('.juya-entry').first()
  const contentOrder = await entry.evaluate((article) =>
    Array.from(article.querySelectorAll('p:not(.juya-links-label), img')).map((node) =>
      node instanceof HTMLImageElement ? `img:${node.alt}` : `p:${node.textContent?.trim()}`
    )
  )
  expect(contentOrder).toEqual([
    'p:横图之前的正文。',
    'img:横图题注',
    'p:图片之后的正文。',
    'img:近方图题注',
    'img:连续图题注',
    'img:竖图题注',
    'p:连续图片之后的正文。',
    'img:',
    'p:最后一段正文。'
  ])

  const figures = entry.locator('figure')
  await expect(figures).toHaveCount(5)
  const figureFacts = await figures.evaluateAll((elements) =>
    elements.map((figure) => {
      const image = figure.querySelector('img')!
      return {
        alt: image.alt,
        caption: figure.querySelector('figcaption')?.textContent?.trim() ?? null,
        src: image.getAttribute('src'),
        loading: image.loading,
        linked: image.closest('a') !== null,
        role: image.getAttribute('role'),
        tabIndex: image.tabIndex
      }
    })
  )
  expect(figureFacts.map(({ alt, caption }) => [alt, caption])).toEqual([
    ['横图题注', '横图题注'],
    ['近方图题注', '近方图题注'],
    ['连续图题注', '连续图题注'],
    ['竖图题注', '竖图题注'],
    ['', null]
  ])
  expect(figureFacts.every((fact) => fact.src?.startsWith('data:image/svg+xml,') && fact.loading === 'lazy')).toBe(true)
  expect(figureFacts.every((fact) => !fact.linked && fact.role === null && fact.tabIndex === -1)).toBe(true)

  const relatedLinkFollowsBody = await entry.evaluate((article) => {
    const lastParagraph = Array.from(article.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent?.trim() === '最后一段正文。'
    )
    const relatedLinks = article.querySelector('.juya-links')
    return Boolean(lastParagraph && relatedLinks && (lastParagraph.compareDocumentPosition(relatedLinks) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  mkdirSync('out/wabi-ticket/59-evidence', { recursive: true })
  writeFileSync(
    'out/wabi-ticket/59-evidence/flow.json',
    JSON.stringify({ contentOrder, figureFacts, relatedLinkFollowsBody }, null, 2),
    'utf8'
  )
  expect(relatedLinkFollowsBody).toBe(true)

  await figures.nth(2).locator('img').click()
  const externalCalls = await page.evaluate(() =>
    (window as unknown as { __stubCalls: Array<[string, ...unknown[]]> }).__stubCalls.filter(
      ([kind]) => kind === 'openExternal'
    )
  )
  expect(externalCalls).toEqual([])
})

test('wabi：图版保留原比例，横图展开、竖图收束并适配亮暗与缩放', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'wabi')
  await page.addInitScript((contentHtml) => {
    ;(window as unknown as { __stubData: { articles: Array<{ contentHtml: string }> } })
      .__stubData.articles[0].contentHtml = contentHtml
  }, issueHtml)
  await page.reload()
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  await openFirstArticle(page)

  const geometryEvidence: Array<Record<string, number | string>> = []
  const assertFigures = async (variant: 'wabi-light' | 'wabi-dark', zoom: number): Promise<void> => {
    const root = activeTab(page).locator('.juya-root')
    await expect(root).toHaveAttribute('data-juya-variant', variant)
    const actualZoom = await page.evaluate(() => {
      const host = document.querySelector('.view-scroll')?.firstElementChild
      return host ? Number.parseFloat(getComputedStyle(host).zoom) : Number.NaN
    })
    expect(actualZoom, `${variant} 内容区缩放`).toBeCloseTo(zoom, 2)

    const entry = root.locator('.juya-entry').first()
    const images = entry.locator('figure img')
    await expect(images).toHaveCount(5)
    for (const width of [1280, 480]) {
      await page.setViewportSize({ width, height: 900 })
      for (let i = 0; i < await images.count(); i++) {
        const image = images.nth(i)
        await image.scrollIntoViewIfNeeded()
        await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
        const facts = await image.evaluate((el) => {
          const img = el as HTMLImageElement
          const style = getComputedStyle(img)
          const rect = img.getBoundingClientRect()
          const figure = img.closest('figure')!
          const figureRect = figure.getBoundingClientRect()
          const figureStyle = getComputedStyle(figure)
          const entry = img.closest('.juya-entry')!
          const entryStyle = getComputedStyle(entry)
          const scroll = img.closest('.view-scroll')!
          const zoomHost = scroll.firstElementChild
          const zoomFactor = zoomHost ? Number.parseFloat(getComputedStyle(zoomHost).zoom) || 1 : 1
          const borderWidth = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
          const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
          const availableWidth =
            (entry.clientWidth - Number.parseFloat(entryStyle.paddingLeft) - Number.parseFloat(entryStyle.paddingRight)) *
            zoomFactor
          return {
            alt: img.alt,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            imageWidth: rect.width - borderWidth,
            figureWidth: figureRect.width,
            availableWidth,
            displayedRatio: (rect.width - borderWidth) / (rect.height - borderHeight),
            overflow: figureStyle.overflow,
            fit: style.objectFit,
            clipPath: style.clipPath,
            maskImage: style.maskImage,
            scrollWidth: scroll.scrollWidth,
            clientWidth: scroll.clientWidth
          }
        })
        geometryEvidence.push({ variant, zoom, viewportWidth: width, ...facts })
        expect(facts.displayedRatio, `${variant}/${width}px ${facts.alt} 原比例`).toBeCloseTo(
          facts.naturalWidth / facts.naturalHeight,
          2
        )
        expect(facts.fit).not.toBe('cover')
        expect(facts.overflow).not.toBe('hidden')
        expect(facts.clipPath).toBe('none')
        expect(facts.maskImage).toBe('none')
        expect(facts.scrollWidth).toBeLessThanOrEqual(facts.clientWidth + 1)
        if (facts.alt === '横图题注') {
          expect(facts.imageWidth / facts.availableWidth, `${variant}/${width}px 横图版心利用率`).toBeGreaterThanOrEqual(0.9)
        }
        if (facts.alt === '竖图题注') {
          expect(Math.abs(facts.figureWidth - facts.imageWidth), `${variant}/${width}px 竖图不留伴随空栏`).toBeLessThanOrEqual(2)
        }
      }
      await page.screenshot({
        path: `out/wabi-ticket/59-evidence/${variant}-${zoom === 1 ? '100' : '120'}-${width}.png`,
        fullPage: true
      })
    }
  }

  await assertFigures('wabi-light', 1)

  await page.addInitScript(() => {
    const data = (window as unknown as {
      __stubData: { settings: { themeMode: string; juyaDarkStyleId: string; uiZoom: number } }
    }).__stubData
    data.settings.themeMode = 'dark'
    data.settings.juyaDarkStyleId = 'wabi'
    data.settings.uiZoom = 1.2
  })
  await page.reload()
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  await openFirstArticle(page)
  await assertFigures('wabi-dark', 1.2)
  writeFileSync(
    'out/wabi-ticket/59-evidence/geometry.json',
    JSON.stringify(geometryEvidence, null, 2),
    'utf8'
  )
})
