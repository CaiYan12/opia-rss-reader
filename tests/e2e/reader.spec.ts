import { test, expect } from '@playwright/test'
import { loadApp, openFirstArticle, activeTab } from './setup'
import { readGridPlane, SYNTHWAVE_GRID, type GridPlaneFacts } from './helpers'

/** 阅读页分流与降级：橘鸦定制路径三重判据（源身份 + 风格开启 + 解析成功）。
 *  keep-alive 下主页与阅读页同时在 DOM，故断言限定活动标签容器。 */

test('默认（纸感精读式）：橘鸦文章走定制模板（结构化栏目/条目/编号徽章）', async ({ page }) => {
  await loadApp(page, 'default')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toBeVisible()
  await expect(root).toHaveAttribute('data-juya-variant', 'folio-light')
  await expect(root.locator('.juya-masthead h1')).toHaveText('AI 早报 2026-08-28')
  await expect(root.locator('.juya-section > h2')).toHaveText(['要闻', '模型发布', '产品应用'])
  // 条目内编号徽章带 # 前缀（概览区徽章为纯数字，故限定条目作用域）
  await expect(root.locator('.juya-entry .juya-index').first()).toContainText('#1')
  await expect(root.locator('.juya-lead').first()).toBeVisible()
  // folio 图文走内容流（plate 直接嵌在条目内，无 .juya-media 包裹），图片必须懒加载
  await expect(root.locator('.juya-entry img').first()).toHaveAttribute('loading', 'lazy')
  // 工具栏仍为通用样式（收藏/原文存在）
  await expect(activeTab(page).getByTitle('在浏览器打开原文')).toBeVisible()
})

test('风格关闭：回退通用渲染（.article-content，无定制根）', async ({ page }) => {
  await loadApp(page, 'off')
  await openFirstArticle(page)

  const tab = activeTab(page)
  await expect(tab.locator('.juya-root')).toHaveCount(0)
  await expect(tab.locator('.article-content')).toBeVisible()
})

test('解析失败（无骨架）：静默回退通用渲染', async ({ page }) => {
  await loadApp(page, 'broken')
  await openFirstArticle(page)

  const tab = activeTab(page)
  await expect(tab.locator('.juya-root')).toHaveCount(0)
  await expect(tab.locator('.article-content')).toBeVisible()
})

test('非橘鸦源文章：永不进定制路径', async ({ page }) => {
  await loadApp(page, 'other')
  await page.getByTitle('切换订阅源').click()
  await page.locator('.menu-pop').getByText('其他源', { exact: true }).click()
  await openFirstArticle(page)
  const tab = activeTab(page)
  await expect(tab.locator('.juya-root')).toHaveCount(0)
  await expect(tab.locator('.article-content')).toBeVisible()
})

test('暗色模式 + 蒸汽梦核式：变体切换为 synthwave-dark', async ({ page }) => {
  await loadApp(page, 'dark')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'synthwave-dark')
  await expect(root).toHaveClass(/jysynth/)
})

test('editorial T1：亮暗排字层级、对比度与栏目首条导语', async ({ page }) => {
  await loadApp(page, 'editorialT1')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'editorial-light')
  const leads = root.locator('.juya-lead')
  await expect(leads).toHaveCount(4)
  const floats = await leads.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el, '::first-letter').float)
  )
  expect(floats, '每个栏目首条导语下沉，后续条目正常排字').toEqual(['left', 'none', 'none', 'left'])
  await expect(
    root.locator('.juya-section').first().locator('.juya-entry').nth(1),
    '开篇后的相邻条目分隔线应保持'
  ).toHaveCSS('border-top-width', '1px')
  await expect(leads.nth(0)).toHaveText('中文开篇导语，字形应完整显示。')
  await expect(leads.nth(1)).toHaveText('English opening lead stays in normal typesetting.')
  await expect(leads.nth(2)).toHaveText('“引号开头的导语”应完整显示。')

  for (const variantId of ['editorial-light', 'editorial-dark'] as const) {
    await root.evaluate((el, id) => el.setAttribute('data-juya-variant', id), variantId)
    const facts = await root.evaluate((el) => {
      const colorOf = (selector: string): string => {
        const target = el.querySelector(selector)
        if (!target) throw new Error(`缺少对比度取样角色：${selector}`)
        return getComputedStyle(target).color
      }
      const sectionNumber = getComputedStyle(el.querySelector('.juya-section > h2')!, '::before')
      const scroller = el.closest('.view-scroll')!
      const thumb = getComputedStyle(scroller, '::-webkit-scrollbar-thumb').backgroundColor
      const titleLink = el.querySelector('.juya-entry h3 a')
      const accent = getComputedStyle(el).getPropertyValue('--jy-accent').trim()
      const channels = accent.slice(1).match(/.{2}/g)?.map((hex) => Number.parseInt(hex, 16))
      if (!channels || channels.length !== 3) throw new Error(`无效的 editorial accent：${accent}`)
      return {
        heading: getComputedStyle(el.querySelector('.juya-masthead h1')!).fontSize,
        section: getComputedStyle(el.querySelector('.juya-section > h2')!).fontSize,
        entry: getComputedStyle(el.querySelector('.juya-entry h3')!).fontSize,
        body: getComputedStyle(el.querySelector('.juya-entry p:not(.juya-links-label)')!).fontSize,
        sectionNumber: sectionNumber.color,
        badgeText: colorOf('.juya-index'),
        muted: [
          colorOf('.juya-date-line'),
          colorOf('.juya-deck'),
          colorOf('.juya-lead'),
          colorOf('.juya-plate figcaption'),
          colorOf('.juya-links-label'),
          colorOf('.juya-colophon')
        ],
        link: colorOf('.juya-overview a'),
        accent,
        accentRgb: `rgb(${channels.join(', ')})`,
        focus: getComputedStyle(el).getPropertyValue('--jy-focus').trim(),
        thumb,
        titleLinkExists: Boolean(titleLink)
      }
    })
    expect(facts.heading, `${variantId} 刊头层级`).toBe('42px')
    expect(facts.section, `${variantId} 栏目层级`).toBe('24px')
    expect(facts.entry, `${variantId} 条目层级`).toBe('20px')
    expect(facts.body, `${variantId} 正文层级`).toBe('15px')
    expect(facts.muted.every((color) => color === facts.muted[0]), `${variantId} 次要文字统一取 muted`).toBe(true)
    expect(facts.titleLinkExists, `${variantId} 可键盘访问的标题链接存在`).toBe(true)
    expect(facts.thumb, `${variantId} 滚动条与风格强调色一致`).toBe(facts.accentRgb)
    await root.locator('.juya-entry h3 a').first().focus()
    await page.keyboard.press('Tab')
    const focusLink = root.locator('a:focus-visible').first()
    await expect(focusLink, `${variantId} 键盘焦点留在内容链接上`).toBeVisible()
    await expect(focusLink, `${variantId} 焦点环使用风格 token`).toHaveCSS(
      'outline-color',
      variantId === 'editorial-light' ? 'rgb(138, 47, 43)' : 'rgb(208, 138, 125)'
    )
  }
})

test('editorial T3：段落与图片按文档顺序各出现一次且相关链接位于末尾', async ({ page }) => {
  await loadApp(page, 'editorialT3')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'editorial-light')
  const entries = root.locator('.juya-section').first().locator(':scope > .juya-entry')
  await expect(entries).toHaveCount(2)

  const stream = async (entry: typeof entries) => entry.locator('p:not(.juya-links-label), img').evaluateAll((els) =>
    els.map((el) => el instanceof HTMLImageElement ? `img:${el.alt}` : el.textContent?.trim())
  )
  expect(await stream(entries.nth(0))).toEqual([
    'img:横向图题注',
    '首条段落甲。',
    '首条段落乙。',
    'img:近方图题注',
    '首条段落丙。',
    'img:链接图题注',
    '首条段落丁。'
  ])
  expect(await stream(entries.nth(1))).toEqual([
    '后续段落甲。这段文字用于验证长文与单图之间的连续排版。'.repeat(8),
    'img:竖向图题注',
    '后续段落乙。'
  ])
  await expect(root.locator('.juya-entry img')).toHaveCount(5)
  await expect(root.locator('.juya-entry img[loading="lazy"]')).toHaveCount(5)
  await expect(entries.nth(0).locator('h3')).toContainText('EditorialT3')
  await expect(entries.nth(0).locator('.juya-links')).toHaveCount(1)
  await expect(entries.nth(0).locator('.juya-links a')).toContainText('U'.repeat(160))
  expect(await entries.nth(0).locator('.juya-links').evaluate((el) => el.parentElement?.lastElementChild === el)).toBe(true)

  const noImageEntry = root.locator('.juya-section').nth(1).locator(':scope > .juya-entry')
  await expect(noImageEntry).toContainText('无图正文仍完整呈现。')
  await expect(noImageEntry.locator('img, .juya-entry-figure, .juya-media, .juya-plate')).toHaveCount(0)
  await expect(noImageEntry.locator('.juya-lead, .juya-index, .juya-links, .juya-links-label')).toHaveCount(0)

  const brokenImageEntry = root.locator('.juya-section').nth(2).locator(':scope > .juya-entry')
  await expect(brokenImageEntry).toContainText('坏图之前的段落仍可读。')
  await expect(brokenImageEntry).toContainText('坏图之后的段落仍可读。')
  expect(await stream(brokenImageEntry)).toEqual([
    'img:损坏图片',
    '坏图之前的段落仍可读。',
    '坏图之后的段落仍可读。'
  ])
})

test('editorial T4：栏目首条首图进入开篇且其余图文顺序不变', async ({ page }) => {
  await loadApp(page, 'editorialT4')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const firstEntry = root.locator('.juya-section').first().locator(':scope > .juya-entry').first()
  const opening = firstEntry.locator(':scope > .juya-editorial-opening')
  await expect(opening.locator('h3')).toContainText('栏目首条交错样本')
  await expect(opening.locator('.juya-lead')).toHaveText('首条导语保持现有来源。')

  const openingImage = opening.locator('figure img')
  await expect(openingImage).toHaveAttribute('alt', '横向图题注')
  await expect.poll(() => openingImage.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(640)
  await expect(root.locator('.juya-entry img')).toHaveCount(6)
  await expect(root.locator('.juya-entry img[alt="横向图题注"]')).toHaveCount(1)

  const remainingStream = await firstEntry
    .locator(':scope > p:not(.juya-links-label), :scope > figure img')
    .evaluateAll((els) => els.map((el) =>
      el instanceof HTMLImageElement ? `img:${el.alt}` : el.textContent?.trim()
    ))
  expect(remainingStream).toEqual([
    '首条段落甲。',
    '首条段落乙。',
    'img:近方图题注',
    '首条段落丙。',
    'img:链接图题注',
    '首条段落丁。'
  ])
})

test('editorial T4：宽屏横图开篇并排且后续正文回到连续列宽', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'editorialT4')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const entries = root.locator('.juya-section').first().locator(':scope > .juya-entry')
  const first = entries.first()
  const opening = first.locator('.juya-editorial-opening')
  const openingImage = opening.locator('.juya-editorial-opening-image img')
  await expect.poll(() => openingImage.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(640)
  await expect(opening).toHaveAttribute('data-image-layout', 'landscape')

  const geometry = await opening.evaluate((el) => {
    const copy = el.querySelector('.juya-editorial-opening-copy')!.getBoundingClientRect()
    const figure = el.querySelector('.juya-editorial-opening-image')!.getBoundingClientRect()
    return { copyLeft: copy.left, copyRight: copy.right, imageLeft: figure.left, imageRight: figure.right }
  })
  expect(geometry.copyLeft).toBeLessThan(geometry.imageLeft)
  expect(geometry.copyRight).toBeLessThan(geometry.imageLeft)
  const firstBounds = await first.boundingBox()
  expect(firstBounds).not.toBeNull()
  expect(geometry.imageRight).toBeLessThanOrEqual(firstBounds!.x + firstBounds!.width + 1)
  await page.screenshot({
    path: 'out/editorial-implementation-2026-10-22/53/editorial-light-1280.png',
    fullPage: true
  })

  const firstBody = first.locator(':scope > p:not(.juya-links-label)').first()
  const laterBody = entries.nth(1).locator(':scope > p:not(.juya-links-label)').first()
  const [firstWidth, laterWidth] = await Promise.all([
    firstBody.evaluate((el) => el.getBoundingClientRect().width),
    laterBody.evaluate((el) => el.getBoundingClientRect().width)
  ])
  expect(Math.abs(firstWidth - laterWidth)).toBeLessThanOrEqual(1)
})

test('editorial T4：亮暗两侧按版心宽度切换横图开篇布局', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'editorialT4')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const opening = root.locator('.juya-section').first().locator('.juya-editorial-opening').first()
  const image = opening.locator('.juya-editorial-opening-image img')
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(640)

  for (const variantId of ['editorial-light', 'editorial-dark'] as const) {
    await root.evaluate((el, id) => el.setAttribute('data-juya-variant', id), variantId)
    const expectedTextColor = variantId === 'editorial-light' ? 'rgb(46, 43, 36)' : 'rgb(197, 191, 178)'
    await expect.poll(() => root.evaluate((el) => getComputedStyle(el.querySelector('.juya-section > .juya-entry')!).color))
      .toBe(expectedTextColor)
    for (const width of [1280, 900, 800, 641, 640, 560, 520, 480]) {
      await page.setViewportSize({ width, height: 900 })
      const geometry = await opening.evaluate((el) => {
        const copy = el.querySelector('.juya-editorial-opening-copy')!.getBoundingClientRect()
        const figure = el.querySelector('.juya-editorial-opening-image')!.getBoundingClientRect()
        return { copyLeft: copy.left, copyRight: copy.right, copyBottom: copy.bottom, imageLeft: figure.left, imageTop: figure.top }
      })
      const shouldSplit = width >= 800
      if (shouldSplit) {
        expect(geometry.copyRight).toBeLessThan(geometry.imageLeft)
        expect(geometry.imageTop).toBeLessThan(geometry.copyBottom)
      } else {
        expect(Math.abs(geometry.copyLeft - geometry.imageLeft)).toBeLessThanOrEqual(1)
        expect(geometry.imageTop).toBeGreaterThanOrEqual(geometry.copyBottom)
      }
      const scroller = root.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " view-scroll ")]')
      expect(await scroller.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${variantId} ${width}px 横向溢出`).toBe(true)
    }
  }
})

test('editorial T4：真实暗侧设置下正文与导语颜色稳定且截图匹配', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'editorialT4Dark')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'editorial-dark')
  const opening = root.locator('.juya-section').first().locator('.juya-editorial-opening').first()
  const image = opening.locator('.juya-editorial-opening-image img')
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(640)
  await image.evaluate((el) => (el as HTMLImageElement).decode())

  const colors = await root.evaluate((el) => {
    const rootStyle = getComputedStyle(el)
    const article = el.querySelector('.juya-section > .juya-entry')!
    const paragraph = el.querySelector('.juya-section > .juya-entry > p:not(.juya-links-label)')!
    const lead = el.querySelector('.juya-editorial-opening .juya-lead')!
    return {
      themeMode: (window as unknown as { __stubData: { settings: { themeMode: string } } }).__stubData.settings.themeMode,
      textToken: rootStyle.getPropertyValue('--jy-text').trim(),
      rootColor: rootStyle.color,
      articleColor: getComputedStyle(article).color,
      paragraphColor: getComputedStyle(paragraph).color,
      leadColor: getComputedStyle(lead).color,
      leadBackground: getComputedStyle(lead).backgroundColor
    }
  })
  expect(colors.themeMode).toBe('dark')
  expect(colors.textToken).toBe('#c5bfb2')
  expect(colors.rootColor).toBe('rgb(197, 191, 178)')
  expect(colors.articleColor).toBe(colors.rootColor)
  expect(colors.paragraphColor).toBe(colors.rootColor)
  expect(colors.leadColor).toBe('rgb(139, 133, 119)')
  expect(colors.leadBackground).toBe('rgb(30, 28, 24)')

  await expect.poll(() => root.locator('.juya-entry').first().evaluate((el) => getComputedStyle(el).color))
    .toBe(colors.rootColor)
  await page.screenshot({
    path: 'out/editorial-implementation-2026-10-22/53/editorial-dark-1280.png',
    fullPage: true
  })
})

test('editorial T4：竖图与无图无导语开篇不留空位', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'editorialT4')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const portraitEntry = root.locator('.juya-section').nth(3).locator(':scope > .juya-entry').first()
  const portraitOpening = portraitEntry.locator('.juya-editorial-opening')
  const portrait = portraitOpening.locator('.juya-editorial-opening-image img')
  await expect.poll(() => portrait.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(540)
  await expect(portraitOpening).toHaveAttribute('data-image-layout', 'stacked')
  await expect(portraitOpening.locator('.juya-lead')).toHaveCount(0)
  const portraitGeometry = await portraitOpening.evaluate((el) => {
    const copy = el.querySelector('.juya-editorial-opening-copy')!.getBoundingClientRect()
    const figure = el.querySelector('.juya-editorial-opening-image')!.getBoundingClientRect()
    return { copyLeft: copy.left, copyBottom: copy.bottom, figureLeft: figure.left, figureTop: figure.top }
  })
  expect(Math.abs(portraitGeometry.copyLeft - portraitGeometry.figureLeft)).toBeLessThanOrEqual(1)
  expect(portraitGeometry.figureTop).toBeGreaterThanOrEqual(portraitGeometry.copyBottom)

  const noImageEntry = root.locator('.juya-section').nth(1).locator(':scope > .juya-entry').first()
  const noImageOpening = noImageEntry.locator('.juya-editorial-opening')
  await expect(noImageOpening.locator('h3')).toHaveText('没有图片的条目')
  await expect(noImageOpening.locator('.juya-lead, figure')).toHaveCount(0)
  await expect(noImageEntry.locator(':scope > p')).toContainText('无图正文仍完整呈现。')
})

test('editorial T4：641px 窗宽与 120% 内容区缩放上下排列', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await loadApp(page, 'editorialT4Zoom')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const opening = root.locator('.juya-section').first().locator('.juya-editorial-opening').first()
  const image = opening.locator('.juya-editorial-opening-image img')
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(640)
  for (const width of [800, 641]) {
    await page.setViewportSize({ width, height: 900 })
    const geometry = await opening.evaluate((el) => {
      const copy = el.querySelector('.juya-editorial-opening-copy')!.getBoundingClientRect()
      const figure = el.querySelector('.juya-editorial-opening-image')!.getBoundingClientRect()
      const image = el.querySelector('img') as HTMLImageElement
      const style = getComputedStyle(image)
      const rect = image.getBoundingClientRect()
      const borderWidth = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
      const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
      return {
        copyLeft: copy.left,
        copyBottom: copy.bottom,
        imageLeft: figure.left,
        imageTop: figure.top,
        displayedRatio: (rect.width - borderWidth) / (rect.height - borderHeight),
        naturalRatio: image.naturalWidth / image.naturalHeight
      }
    })
    expect(Math.abs(geometry.copyLeft - geometry.imageLeft)).toBeLessThanOrEqual(1)
    expect(geometry.imageTop).toBeGreaterThanOrEqual(geometry.copyBottom)
    expect(Math.abs(geometry.displayedRatio - geometry.naturalRatio)).toBeLessThan(0.015)
    const scroller = root.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " view-scroll ")]')
    expect(await scroller.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${width}px 横向溢出`).toBe(true)
    if (width === 641) {
      await page.screenshot({
        path: 'out/editorial-implementation-2026-10-22/53/editorial-light-641-zoom120.png',
        fullPage: true
      })
    }
  }
})

test('editorial T3：正文图保留原比例与题注，窄窗不溢出且图片交互不扩张', async ({ page }) => {
  await loadApp(page, 'editorialT3')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const images = root.locator('.juya-entry img:not([alt="损坏图片"])')
  await expect(images).toHaveCount(4)

  for (const variantId of ['editorial-light', 'editorial-dark'] as const) {
    await root.evaluate((el, id) => el.setAttribute('data-juya-variant', id), variantId)
    for (const width of [1280, 560]) {
      await page.setViewportSize({ width, height: 900 })
      for (let i = 0; i < await images.count(); i++) {
        const image = images.nth(i)
        await image.scrollIntoViewIfNeeded()
        await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
        const facts = await image.evaluate((el) => {
          const img = el as HTMLImageElement
          const style = getComputedStyle(img)
          const rect = img.getBoundingClientRect()
          const borderWidth = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
          const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
          const figure = img.closest('figure')
          return {
            src: img.getAttribute('src'),
            alt: img.alt,
            loading: img.loading,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            displayedRatio: (rect.width - borderWidth) / (rect.height - borderHeight),
            fit: style.objectFit,
            caption: figure?.querySelector('figcaption')?.textContent?.trim() ?? null,
            overflow: figure ? getComputedStyle(figure).overflow : null,
            clipPath: style.clipPath,
            maskImage: style.maskImage,
            left: rect.left,
            right: rect.right,
            role: img.getAttribute('role'),
            tabIndex: img.tabIndex,
            cursor: style.cursor,
            linked: img.closest('a') !== null
          }
        })
        expect(facts.src).toMatch(/^data:image\/svg\+xml,/)
        expect(facts.alt).not.toBe('')
        expect(facts.loading).toBe('lazy')
        expect(facts.caption).toBe(facts.alt)
        expect(facts.fit).not.toBe('cover')
        expect(facts.overflow).not.toBe('hidden')
        expect(facts.clipPath).toBe('none')
        expect(facts.maskImage).toBe('none')
        expect(Math.abs(facts.displayedRatio - facts.naturalWidth / facts.naturalHeight)).toBeLessThan(0.015)
        const rootBounds = await root.boundingBox()
        expect(rootBounds).not.toBeNull()
        expect(facts.left).toBeGreaterThanOrEqual(rootBounds!.x - 1)
        expect(facts.right).toBeLessThanOrEqual(rootBounds!.x + rootBounds!.width + 1)
        expect(facts.role).toBeNull()
        expect(facts.tabIndex).toBe(-1)
        expect(facts.cursor).not.toBe('zoom-in')
        expect(facts.cursor).not.toBe('pointer')
        expect(facts.linked).toBe(false)
      }
      const scroller = root.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " view-scroll ")]')
      expect(await scroller.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    }

    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion })
      for (const index of [0, 2]) {
        const image = images.nth(index)
        await image.hover()
        await expect(image).toHaveCSS('transform', 'none')
        await image.click()
      }
    }
  }

  const externalCalls = await page.evaluate(() =>
    (window as unknown as { __stubCalls: Array<[string, string]> }).__stubCalls.filter(([kind]) => kind === 'openExternal')
  )
  expect(externalCalls).toEqual([])
})

test('editorial T2：摘要左对齐并使用正体', async ({ page }) => {
  await loadApp(page, 'editorial')
  await openFirstArticle(page)

  const deck = activeTab(page).locator('.juya-deck')
  await expect(deck).toBeVisible()
  await expect(deck).toHaveCSS('text-align', 'left')
  await expect(deck).toHaveCSS('font-style', 'normal')
  await expect(deck).toHaveText('示例摘要占位文本')
})

test('editorial T2：刊头与刊尾按同一本地日期显示跨日发布时间', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
    timezoneId: 'Asia/Shanghai'
  })
  try {
    const page = await context.newPage()
    await loadApp(page, 'editorialT2')
    await openFirstArticle(page)

    const root = activeTab(page).locator('.juya-root')
    await expect(root.locator('.juya-masthead h1')).toHaveText('杂志编辑式 T2 长标题 Magazine Editorial Issue')
    await expect(root.locator('.juya-date-line')).toContainText('2026年10月22日')
    await expect(root.locator('.juya-colophon')).toContainText('2026-10-22')
    await expect(root.locator('.juya-deck')).toHaveText('摘要完整，无改写无截断。'.repeat(12))
  } finally {
    await context.close()
  }
})

test('editorial T2：上午日期、文章标题回退及缺省摘要概览', async ({ page }) => {
  await loadApp(page, 'editorialT2Fallback')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.juya-masthead h1')).toHaveText('文章标题回退来源：长标题 fallback')
  await expect(root.locator('.juya-date-line')).toContainText('2026年10月22日')
  await expect(root.locator('.juya-colophon')).toContainText('2026-10-22')
  await expect(root.locator('.juya-deck')).toHaveCount(0)
  await expect(root.locator('.juya-overview')).toHaveCount(0)
})

test('editorial T2：32项概览宽屏双列、窄屏单列且顺序与键盘外链一致', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'editorialT2')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const overview = root.locator('.juya-overview')
  const anchors = overview.locator('a')
  await expect(anchors).toHaveCount(32)
  await expect(overview.locator('.juya-index')).toHaveText(
    Array.from({ length: 32 }, (_, i) => String(i + 1))
  )
  const wide = await overview.evaluate((el) => ({
    display: getComputedStyle(el).display,
    columns: getComputedStyle(el).gridTemplateColumns,
    height: el.getBoundingClientRect().height
  }))
  expect(wide.display).toBe('grid')
  expect(wide.columns.trim().split(/\s+/)).toHaveLength(2)
  await root.evaluate((el) => el.setAttribute('data-juya-variant', 'editorial-dark'))
  const darkColumns = await overview.evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/))
  expect(darkColumns).toHaveLength(2)
  await expect(root.locator('.juya-deck')).toHaveCSS('text-align', 'left')
  await expect(root.locator('.juya-deck')).toHaveCSS('font-style', 'normal')
  await root.evaluate((el) => el.setAttribute('data-juya-variant', 'editorial-light'))

  const order = await anchors.evaluateAll((els) => els.map((el) => ({
    text: el.textContent?.trim(),
    href: el.getAttribute('href'),
    top: el.getBoundingClientRect().top,
    left: el.getBoundingClientRect().left
  })))
  expect(order.map((item) => item.text)).toEqual(
    Array.from({ length: 32 }, (_, i) => `第${i + 1}条概览项目含完整中文标题`)
  )
  expect(order.map(({ text: _text, href }) => href)).toEqual(
    Array.from({ length: 32 }, (_, i) => `https://example.com/editorial/${i + 1}`)
  )
  const visualOrder = [...order]
    .sort((a, b) => Math.round(a.top) - Math.round(b.top) || a.left - b.left)
    .map((item) => item.text)
  expect(visualOrder).toEqual(order.map((item) => item.text))

  const oneColumnHeight = await overview.evaluate((el) => {
    el.setAttribute('style', 'display:flex;flex-direction:column;gap:6px')
    const height = el.getBoundingClientRect().height
    el.removeAttribute('style')
    return height
  })
  expect(wide.height).toBeLessThan(oneColumnHeight)

  await page.setViewportSize({ width: 560, height: 900 })
  const narrowColumns = await overview.evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/))
  expect(narrowColumns).toHaveLength(1)

  await anchors.first().focus()
  await page.keyboard.press('Tab')
  await expect(anchors.nth(1)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  const externalCalls = await page.evaluate(() =>
    (window as unknown as { __stubCalls: Array<[string, string]> }).__stubCalls.filter(([kind]) => kind === 'openExternal')
  )
  expect(externalCalls).toEqual([['openExternal', 'https://example.com/editorial/1']])
})

test('蒸汽梦核式暗侧卡面（#39）：刊头/条目 18px 毛玻璃、概览底板、配图描边与降饱和', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'dark')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'synthwave-dark')

  // 刊头与条目同一套 18px 毛玻璃（此前 6px，落日与网格几乎透底）
  for (const [name, locator] of [
    ['刊头', root.locator('.juya-masthead')],
    ['条目', root.locator('.juya-entry').first()]
  ] as const) {
    const filter = await locator.evaluate((el) => getComputedStyle(el).backdropFilter)
    expect(filter, `${name}毛玻璃半径`).toContain('blur(18px)')
    expect(filter, `${name}饱和度补偿`).toContain('saturate(1.15)')
  }

  // 概览底板：与卡片同源（有底色、有边框、有内衬），不是裸列表
  const overview = root.locator('.juya-overview')
  await expect(overview).toBeVisible()
  const panel = await overview.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      bg: cs.backgroundColor,
      border: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      padding: `${cs.paddingTop} ${cs.paddingRight}`,
      backdrop: cs.backdropFilter
    }
  })
  expect(panel.bg, '概览底板须有底色（不能是 transparent）').not.toBe('rgba(0, 0, 0, 0)')
  expect(panel.border, '底板 1px 边框').toBe('1px')
  expect(panel.radius, '底板圆角与卡片统一').toBe('16px')
  expect(panel.padding, '内衬 12×16').toBe('12px 16px')
  expect(panel.backdrop, '底板同强度毛玻璃').toContain('blur(18px)')

  // 配图：1px 霓虹描边 + 降饱和，别让落日色把照片冲得过艳
  const img = root.locator('.juya-media img').first()
  await expect(img).toBeVisible()
  const media = await img.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { filter: cs.filter, border: cs.borderTopWidth, color: cs.borderTopColor }
  })
  expect(media.filter, '配图降饱和').toContain('saturate(0.92)')
  expect(media.border, '配图 1px 描边').toBe('1px')
})

test('蒸汽梦核暗侧调色板（#34 review）：token 对齐 SPEC、落日三色、刊头描边与亮侧分色', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'dark')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'synthwave-dark')

  // 走真实级联读 token，而不是读 CSS 文本：梦核紫残留在计算值上会立刻显形
  const tokens = await root.evaluate((el) => {
    const cs = getComputedStyle(el)
    const pick = (name: string): string => cs.getPropertyValue(name).replace(/\s+/g, '')
    return {
      heading: pick('--jy-heading'),
      text: pick('--jy-text'),
      muted: pick('--jy-muted'),
      accent: pick('--jy-accent'),
      onAccent: pick('--jy-on-accent'),
      link: pick('--jy-link'),
      border: pick('--jy-border'),
      leadBg: pick('--jy-lead-bg'),
      focus: pick('--jy-focus'),
      sunMid: pick('--jy-scene-sun-mid')
    }
  })
  expect(tokens).toEqual({
    heading: '#ffe6ff',
    text: '#f0dcff',
    muted: '#c9b7e0',
    accent: '#ff2d95',
    onAccent: '#1a0010',
    link: '#ff8ad0',
    border: 'rgba(255,45,149,0.32)',
    leadBg: 'rgba(255,45,149,0.12)',
    // 焦点色未随迁移改动：SPEC 未规定，属待单独裁决
    focus: '#b89aff',
    sunMid: '#ff9a3c'
  })

  // 落日三色（#ffe14d → #ff9a3c → #ff2d95）：中段橙带必须真的进了径向渐变
  const sun = root.locator('.juya-scene-sun')
  await expect(sun).toBeVisible()
  const sunBg = await sun.evaluate((el) => getComputedStyle(el).backgroundImage)
  for (const [name, rgb] of [
    ['首站黄', 'rgb(255, 225, 77)'],
    ['中段橙', 'rgb(255, 154, 60)'],
    ['末端品红', 'rgb(255, 45, 149)']
  ] as const) {
    expect(sunBg, `落日${name}`).toContain(rgb)
  }

  // 刊头描边：暗侧与 --jy-heading 同源（近白紫），亮侧另取深色低透 —— 见下一个用例
  const stroke = await root.locator('.juya-masthead h1').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { color: cs.webkitTextStrokeColor, width: cs.webkitTextStrokeWidth }
  })
  expect(stroke.width, '1px 描边').toBe('1px')
  expect(stroke.color, '暗侧描边取 --jy-heading 的 45% alpha').toBe('rgba(255, 230, 255, 0.45)')
})

test('蒸汽梦核亮侧（#41）：日间版天空挂载、网格底边在视口内、卡面同为 18px 毛玻璃', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'synthwaveLight')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'synthwave-light')
  await expect(root).toHaveClass(/jysynth/)

  // 场景层必须真的画出日间天空（顶 #ffd6e8 → 底 #ffe6cc）与更淡的扫描线：
  // 只有变体属性与场景节点时，亮侧仍是「淡紫底 + 通用卡片」，看不出合成波母题。
  const scene = root.locator('.juya-scene')
  await expect(scene).toBeVisible()
  const sky = await scene.evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(sky, '日间天空顶部色').toContain('rgb(255, 214, 232)')
  expect(sky, '日间天空底部色').toContain('rgb(255, 230, 204)')
  expect(sky, '扫描线层').toContain('repeating-linear-gradient')
  await expect(scene.locator('.juya-scene-sun')).toBeVisible()
  await expect(scene.locator('.juya-scene-grid-persp')).toBeVisible()

  // 几何：网格底边必须落在滚动口可视区内（#36 的教训 —— 只看 CSS 可见性会漏检「被推出视口」）
  const geom = await root.evaluate((el) => {
    const scroller = el.closest('.view-scroll') as HTMLElement
    const grid = el.querySelector('.juya-scene-grid.juya-scene-grid-persp') as HTMLElement
    const g = grid.getBoundingClientRect()
    const s = scroller.getBoundingClientRect()
    return { height: g.height, bottom: g.bottom, portBottom: s.bottom }
  })
  expect(geom.height, '透视投影后网格应有可辨高度').toBeGreaterThan(120)
  expect(geom.bottom, '网格底边不得落到可视区下缘之外').toBeLessThanOrEqual(geom.portBottom + 1)
  expect(geom.bottom, '网格底边应贴住可视区下缘').toBeGreaterThan(geom.portBottom - 40)

  // 地面必须是浅色（#ffcadb）：共享的 #170a2a 是暗侧地面，亮侧沿用会让卡片压在网格区时变灰卡，
  // 0.62 白卡合成底上次要文字只有 2.78（AA 不过）
  await expect(scene.locator('.juya-scene-grid.juya-scene-grid-persp')).toHaveCSS(
    'background-color',
    'rgb(255, 202, 219)'
  )

  // 卡面与暗侧同强度毛玻璃（亮侧卡面 rgba(255,255,255,.62)，滤镜不变）
  for (const [name, locator] of [
    ['刊头', root.locator('.juya-masthead')],
    ['条目', root.locator('.juya-entry').first()]
  ] as const) {
    const filter = await locator.evaluate((el) => getComputedStyle(el).backdropFilter)
    expect(filter, `${name}毛玻璃半径`).toContain('blur(18px)')
  }

  // 刊头描边（#34 review）：亮侧改深紫低透；沿用暗侧的近白紫会在白卡上等于没有描边
  const stroke = await root.locator('.juya-masthead h1').evaluate((el) => ({
    color: getComputedStyle(el).webkitTextStrokeColor,
    width: getComputedStyle(el).webkitTextStrokeWidth
  }))
  expect(stroke.width, '1px 描边').toBe('1px')
  expect(stroke.color, '亮侧描边取 --jy-heading #4a0736 的 28% alpha').toBe(
    'rgba(74, 7, 54, 0.28)'
  )
})

test('蒸汽梦核式（#44）：网格纹理层改用合成层位移，父层不再 animate 背景', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'dark')
  await openFirstArticle(page)

  const plane = activeTab(page).locator('.juya-scene-grid.juya-scene-grid-persp')
  await expect(plane).toBeVisible()

  // 静态守卫只读 CSS 文本；这里读的是真实 computed style —— 确认动画真的挂在纹理层伪元素上
  const read = await plane.evaluate((el) => {
    const parent = getComputedStyle(el)
    const tex = getComputedStyle(el, '::after')
    return {
      parentAnimation: parent.animationName,
      parentWillChange: parent.willChange,
      textureAnimation: tex.animationName,
      textureDuration: tex.animationDuration,
      textureWillChange: tex.willChange,
      textureTop: tex.top,
      textureHeight: tex.height,
      parentHeight: parent.height,
      textureTransform: tex.transform
    }
  })
  expect(read.parentAnimation, '父层不再有动画').toBe('none')
  expect(read.parentWillChange, '父层不再 will-change background-position').not.toContain(
    'background-position'
  )
  expect(read.textureAnimation, '动画落在纹理层').toContain('jy-grid-scroll')
  expect(read.textureDuration).toBe('3.2s')
  expect(read.textureWillChange).toBe('transform')
  expect(read.textureTop, '纹理层上移一个周期').toBe('-56px')
  expect(parseFloat(read.textureHeight), '纹理层高度多出一个周期').toBe(
    parseFloat(read.parentHeight) + 56
  )

  /** computed transform → translateY（matrix 第 6 位 / matrix3d 第 14 位） */
  const translateY = (value: string): number => {
    const m = value.match(/matrix(3d)?\(([^)]+)\)/)
    if (!m) return Number.NaN
    const nums = (m[2] ?? '').split(',').map(Number)
    return m[1] ? (nums[13] as number) : (nums[5] as number)
  }

  const y0 = translateY(read.textureTransform)
  await page.waitForTimeout(500)
  const y1 = translateY(await plane.evaluate((el) => getComputedStyle(el, '::after').transform))
  expect(Number.isFinite(y0) && Number.isFinite(y1), '纹理层应带 translateY 位移').toBe(true)
  expect(y1, '两次采样之间 transform 必须变化（动画真的在跑）').not.toBe(y0)
  expect(Math.abs(y1 - y0), '3.2s / 56px ⇒ 500ms 约 8.75px').toBeGreaterThan(1)
})

/* ---- #45 边界回归：网格搬进合成层之后的确定性断言 ---- */

/** 纹理层在任意相位都必须盖住父层高度：缺口 > 0 就是地面底色透出来的「露底」。
 *  左右 0 内缩 + 平面居中于滚动口 = 纹理与地面仍在同一个透视平面上（否则网格线与地平线错位）。 */
function assertTextureCoversPlane(facts: GridPlaneFacts, label: string): void {
  expect(facts.texture.animationName, `${label}：动画挂在纹理层`).toContain('jy-grid-scroll')
  expect(facts.texture.animationDuration, `${label}：周期 3.2s`).toBe('3.2s')
  expect(facts.texture.willChange, `${label}：位移在合成层`).toBe('transform')
  expect(Number.isFinite(facts.texture.translateY), `${label}：纹理层应带 translateY 位移`).toBe(true)
  expect(facts.topGap, `${label}：纹理层上缘缺口（>0 即露底）`).toBeLessThanOrEqual(0.5)
  expect(facts.bottomGap, `${label}：纹理层下缘缺口（>0 即露底）`).toBeLessThanOrEqual(0.5)
  expect(facts.texture.left, `${label}：纹理层左缘贴父层`).toBe(0)
  expect(facts.texture.right, `${label}：纹理层右缘贴父层`).toBe(0)
  expect(
    Math.abs(facts.plane.centerX - facts.port.centerX),
    `${label}：透视平面应居中于滚动口`
  ).toBeLessThanOrEqual(1)
}

/** 两次采样之间 translateY 必须真的变化：证明动画在跑，而不是只有一条静态声明。 */
async function expectGridAnimating(
  page: import('@playwright/test').Page,
  plane: import('@playwright/test').Locator,
  label: string
): Promise<{ before: GridPlaneFacts; after: GridPlaneFacts }> {
  const before = await readGridPlane(plane)
  await page.waitForTimeout(450)
  const after = await readGridPlane(plane)
  expect(after.texture.translateY, `${label}：两次采样 translateY 必须变化（动画在跑）`).not.toBe(
    before.texture.translateY
  )
  expect(
    Math.abs(after.texture.translateY - before.texture.translateY),
    `${label}：3.2s / 56px ⇒ 450ms 约 7.9px`
  ).toBeGreaterThan(1)
  return { before, after }
}

// 四组合之阅读页两条：亮 / 暗 × 阅读页
for (const [scenario, variant] of [
  ['dark', 'synthwave-dark'],
  ['synthwaveLight', 'synthwave-light']
] as const) {
  test(`蒸汽梦核式（#45）阅读页 ${variant}：网格可见、底边在视口内、纹理层在跑且不露底`, async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await loadApp(page, scenario)
    await openFirstArticle(page)

    const root = activeTab(page).locator('.juya-root')
    await expect(root).toHaveAttribute('data-juya-variant', variant)
    const plane = activeTab(page).locator(SYNTHWAVE_GRID)
    await expect(plane).toBeVisible()

    const { before } = await expectGridAnimating(page, plane, variant)
    assertTextureCoversPlane(before, variant)

    // 底边必须落在滚动口可视区内（#36 的教训：CSS 可见不等于视口相交）
    expect(before.plane.height, `${variant}：投影后应可辨高度`).toBeGreaterThan(120)
    expect(before.plane.bottom, `${variant}：网格底边不得落到可视区下缘之外`).toBeLessThanOrEqual(
      before.port.bottom + 1
    )
    expect(before.plane.bottom, `${variant}：网格底边应贴住可视区下缘`).toBeGreaterThan(
      before.port.bottom - 40
    )
  })
}

test('蒸汽梦核式（#45）uiZoom 1.2：亮/暗两侧纹理层仍盖满父层、左右不错位', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  for (const [scenario, variant] of [
    ['synthwaveZoom', 'synthwave-dark'],
    ['synthwaveLightZoom', 'synthwave-light']
  ] as const) {
    await loadApp(page, scenario)
    await openFirstArticle(page)

    const root = activeTab(page).locator('.juya-root')
    await expect(root).toHaveAttribute('data-juya-variant', variant)
    // 缩放真的生效（否则这条用例测的是 1.0 的旧状态）
    const zoom = await page.evaluate(() => {
      const host = document.querySelector('.view-scroll')?.firstElementChild
      return host ? Number.parseFloat(getComputedStyle(host).zoom) : Number.NaN
    })
    expect(zoom, `${variant}：uiZoom 应为 1.2`).toBeCloseTo(1.2, 2)

    const plane = activeTab(page).locator(SYNTHWAVE_GRID)
    await expect(plane).toBeVisible()
    const { before, after } = await expectGridAnimating(page, plane, `${variant}@zoom1.2`)
    assertTextureCoversPlane(before, `${variant}@zoom1.2`)
    // 动画跑起来之后仍不能露底：缺口随相位变化，只测一个相位容易漏掉尾部露底
    assertTextureCoversPlane(after, `${variant}@zoom1.2（第二相位）`)

  }
})

test('蒸汽梦核式（#45）≤520px 窄窗：底边在视口内、纹理层不露底不横向溢出', async ({ page }) => {
  for (const width of [520, 480]) {
    for (const [scenario, variant] of [
      ['dark', 'synthwave-dark'],
      ['synthwaveLight', 'synthwave-light']
    ] as const) {
      await page.setViewportSize({ width, height: 800 })
      await loadApp(page, scenario)
      await openFirstArticle(page)

      const plane = activeTab(page).locator(SYNTHWAVE_GRID)
      await expect(plane).toBeVisible()
      const { before } = await expectGridAnimating(page, plane, `${variant}@${width}`)
      assertTextureCoversPlane(before, `${variant}@${width}`)
      expect(before.plane.bottom, `${variant}@${width}：网格底边须在可视区内`).toBeLessThanOrEqual(
        before.port.bottom + 1
      )

      // 网格比滚动口宽是设计（left/right -25%），不得因此产生横向滚动
      const overflow = await page.evaluate(() => {
        const scroller = document.querySelector('.view-scroll')
        return scroller ? scroller.scrollWidth - scroller.clientWidth : -1
      })
      expect(overflow, `${variant}@${width}：横向溢出`).toBeLessThanOrEqual(0)
    }
  }
})

test('蒸汽梦核式（#45）prefers-reduced-motion：纹理层 animation-name 为 none 且静止', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  for (const [scenario, variant] of [
    ['dark', 'synthwave-dark'],
    ['synthwaveLight', 'synthwave-light']
  ] as const) {
    await loadApp(page, scenario)
    await openFirstArticle(page)

    const plane = activeTab(page).locator(SYNTHWAVE_GRID)
    await expect(plane).toBeVisible()
    const before = await readGridPlane(plane)
    expect(before.texture.animationName, `${variant}：降级动态效果后动画必须为 none`).toBe('none')
    await page.waitForTimeout(450)
    const after = await readGridPlane(plane)
    expect(after.texture.translateY, `${variant}：降级后纹理层应静止`).toBe(
      before.texture.translateY
    )
  }
})

test('蒸汽梦核式（#45）[data-app-hidden]：纹理层 animation-play-state 转为 paused', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  for (const [scenario, variant] of [
    ['dark', 'synthwave-dark'],
    ['synthwaveLight', 'synthwave-light']
  ] as const) {
    await loadApp(page, scenario)
    await openFirstArticle(page)

    const plane = activeTab(page).locator(SYNTHWAVE_GRID)
    await expect(plane).toBeVisible()
    const running = await readGridPlane(plane)
    expect(running.texture.animationPlayState, `${variant}：可见时应为 running`).toBe('running')

    // 主进程在窗口不可见时给 documentElement 打标记（src/renderer/visibilityPause.ts）
    await page.evaluate(() => document.documentElement.setAttribute('data-app-hidden', ''))
    const paused = await readGridPlane(plane)
    expect(paused.texture.animationPlayState, `${variant}：窗口不可见时应为 paused`).toBe('paused')

    await page.evaluate(() => document.documentElement.removeAttribute('data-app-hidden'))
    const resumed = await readGridPlane(plane)
    expect(resumed.texture.animationPlayState, `${variant}：恢复可见后应回到 running`).toBe(
      'running'
    )
  }
})

test('蒸汽梦核式（#45）多标签 keep-alive：切走再切回仍在动，且每个阅读根只有一个网格纹理层', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'synthwaveTabs')

  // 每个 .juya-root 只允许一个透视网格平面（它的 ::after 才是唯一纹理层）——
  // 重复挂载会叠出两层网格（双倍亮度 + 双倍位移）
  const planesPerRoot = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.juya-root.jysynth')].map(
        (root) => root.querySelectorAll('.juya-scene-grid.juya-scene-grid-persp').length
      )
    )
  const roots = await page.evaluate(
    () => document.querySelectorAll('.juya-root.jysynth').length
  )
  expect(roots, '订阅页与阅读页应同时存活（keep-alive）').toBe(2)
  expect(await planesPerRoot(), '每个根恰好一个网格平面').toEqual([1, 1])

  const readerPlane = page
    .locator('.juya-root', { has: page.locator('.juya-issue') })
    .locator(SYNTHWAVE_GRID)
  await expect(readerPlane).toBeVisible()
  await expectGridAnimating(page, readerPlane, '切走前')

  const tabs = page.locator('[data-tab-id]')
  await tabs.nth(0).click()
  await expect(page.locator('.juya-root', { has: page.locator('.juya-feed') })).toBeVisible()
  await tabs.nth(1).click()
  await expect(readerPlane).toBeVisible()

  // 切回后仍在动：两次采样必须不同
  await expectGridAnimating(page, readerPlane, '切回后')
  // 没有叠层：文档任务数仍是两个根、每根一个平面
  expect(await planesPerRoot(), '切回后不得出现重复的网格平面').toEqual([1, 1])
})

test('波普式：结构类 jypop 挂载', async ({ page }) => {
  await loadApp(page, 'pop')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveClass(/jypop/)
  await expect(root).toHaveAttribute('data-juya-variant', 'pop-light')
})

test('90 年代报刊式：报头日期线与分栏容器', async ({ page }) => {
  await loadApp(page, 'newsprint')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveClass(/jynews/)
  await expect(root.locator('.juya-date-line')).toBeVisible()
  await expect(root.locator('.juya-entry-columns').first()).toBeVisible()
})

/** 刊头三栏几何（#26）：返回日期/期号标题/星期的包围盒与刊头自身盒子。 */
async function mastheadBoxes(masthead: import('@playwright/test').Locator) {
  return masthead.evaluate((el) => {
    const box = (n: Element) => {
      const r = n.getBoundingClientRect()
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        cx: (r.left + r.right) / 2,
        cy: (r.top + r.bottom) / 2
      }
    }
    const self = box(el)
    const date = el.querySelector('.juya-date-line')
    const title = el.querySelector('h1')
    const weekday = el.querySelector('.juya-masthead-weekday')
    if (!date || !title || !weekday) return null
    return { self, date: box(date), title: box(title), weekday: box(weekday) }
  })
}

test('90 年代报刊式刊头（#26）：1280 三栏——日期最左、期号居中、星期最右，互不重叠', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'newsprint')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.juya-masthead')
  const date = masthead.locator('.juya-date-line')
  const title = masthead.locator('h1')
  const weekday = masthead.locator('.juya-masthead-weekday')

  await expect(date).toBeVisible()
  await expect(weekday).toBeVisible()

  // 日期与星期来自同一真实发布日期（夹具 pubDate 2026-08-28T01:31:42Z），不编造期号/版次
  await expect(date).toHaveText('2026年8月28日')
  await expect(weekday).toHaveText('星期五')
  await expect(title).toHaveText('AI 早报 2026-08-28')

  // 版心 800（内容宽 752 = 800 − 2×24 内衬）
  await expect(root.locator('.juya-issue')).toHaveCSS('max-width', '800px')

  // 刊头楷体 + 38px / 6px
  await expect(masthead).toHaveCSS('font-family', /KaiTi/)
  await expect(title).toHaveCSS('font-size', '38px')
  await expect(title).toHaveCSS('letter-spacing', '6px')

  // 上沿 1px 细线、下沿 4px double
  await expect(masthead).toHaveCSS('border-top-width', '1px')
  await expect(masthead).toHaveCSS('border-top-style', 'solid')
  await expect(masthead).toHaveCSS('border-bottom-width', '4px')
  await expect(masthead).toHaveCSS('border-bottom-style', 'double')

  const assertWide = (boxes: Awaited<ReturnType<typeof mastheadBoxes>>) => {
    expect(boxes, '刊头三栏元素必须齐备').not.toBeNull()
    const g = boxes!
    // 横向顺序：日期区 < 期号标题 < 星期区，且相邻两栏不重叠
    expect(g.date.cx, '日期应在期号左侧').toBeLessThan(g.title.left)
    expect(g.title.cx, '期号应居中于日期与星期之间').toBeLessThan(g.weekday.cx)
    expect(g.date.right, '日期与期号不得重叠').toBeLessThanOrEqual(g.title.left)
    expect(g.title.right, '期号与星期不得重叠').toBeLessThanOrEqual(g.weekday.left)
    // 同一行：三者纵向范围与刊头正文区相交（不是被挤到上下两行）
    expect(Math.max(g.date.cy, g.weekday.cy) - Math.min(g.date.cy, g.weekday.cy)).toBeLessThan(
      g.self.bottom - g.self.top
    )
    // 期号大致居于版心中线（三栏中的 auto 列）
    expect(Math.abs(g.title.cx - g.self.cx), '期号标题应居中').toBeLessThan(12)
  }

  assertWide(await mastheadBoxes(masthead))

  // 暗侧：变体只替换调色板 token（结构、几何与亮侧一致），故按变体属性翻转后复测同一组几何，
  // 并验证刊头线取暗侧纸纹色 #c9bfa4（亮侧为 #2f2a20）。
  await expect(masthead).toHaveCSS('border-bottom-color', 'rgb(47, 42, 32)')
  await root.evaluate((el) => el.setAttribute('data-juya-variant', 'newsprint90s-dark'))
  await expect(masthead).toHaveCSS('border-bottom-color', 'rgb(201, 191, 164)')
  await expect(title).toHaveCSS('font-size', '38px')
  assertWide(await mastheadBoxes(masthead))
})

test('90 年代报刊式刊头（#32）：900 宽度三栏刊头与双栏正文互斥命中、不溢出 752 版心', async ({
  page
}) => {
  // 断点收敛：刊头堆叠 max-width 899 与正文双栏 min-width 900 互斥，900 恰好宽时两者同时成立
  // 是刻意的（三栏刊头在 752 内容宽内放得下），此用例把该边界钉住。
  await page.setViewportSize({ width: 900, height: 900 })
  await loadApp(page, 'newsprint')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.juya-masthead')
  const title = masthead.locator('h1')

  // 900 命中宽窗态：期号仍是 38px（堆叠态为 30px），正文两栏
  await expect(title).toHaveCSS('font-size', '38px')
  await expect(title).toHaveCSS('letter-spacing', '6px')
  const columnCount = await root
    .locator('.juya-entry-columns')
    .first()
    .evaluate((el) => getComputedStyle(el).columnCount)
  expect(columnCount, '900 宽度正文应保持双栏').toBe('2')

  // 三栏几何：日期 < 期号 < 星期，互不重叠；刊头内容不溢出自身盒子
  const g = await mastheadBoxes(masthead)
  expect(g, '刊头三栏元素必须齐备').not.toBeNull()
  expect(g!.date.right, '日期与期号不得重叠').toBeLessThanOrEqual(g!.title.left)
  expect(g!.title.right, '期号与星期不得重叠').toBeLessThanOrEqual(g!.weekday.left)
  expect(g!.self.right - g!.self.left, '刊头宽度即 752 版心').toBeLessThanOrEqual(752 + 1)
  // 期号单行（换行会让三栏刊头读成两行标题）
  expect(g!.title.bottom - g!.title.top, '900 宽度期号应保持单行').toBeLessThan(60)
  const overflow = await masthead.evaluate((el) => ({
    sw: el.scrollWidth,
    cw: el.clientWidth
  }))
  expect(overflow.sw, '刊头内容不得溢出').toBeLessThanOrEqual(overflow.cw + 1)
})

test('90 年代报刊式刊头（#26）：560 宽度回落居中堆叠、页面无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 800 })
  await loadApp(page, 'newsprint')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const masthead = root.locator('.juya-masthead')
  const title = masthead.locator('h1')

  await expect(title).toHaveCSS('font-size', '30px')
  await expect(title).toHaveCSS('letter-spacing', '4px')

  const g = await mastheadBoxes(masthead)
  expect(g, '刊头三栏元素必须齐备').not.toBeNull()
  // 竖向堆叠：日期 → 期号 → 星期，逐段不重叠
  expect(g!.date.bottom, '日期应在期号之上').toBeLessThanOrEqual(g!.title.top + 1)
  expect(g!.title.bottom, '期号应在星期之上').toBeLessThanOrEqual(g!.weekday.top + 1)
  // 居中：三者水平中心与刊头中线一致（容 2px 取整）
  for (const [name, b] of [
    ['日期', g!.date],
    ['期号', g!.title],
    ['星期', g!.weekday]
  ] as const) {
    expect(Math.abs(b.cx - g!.self.cx), `${name}应居中`).toBeLessThanOrEqual(2)
  }

  // 无横向溢出：滚动容器与刊头都不产生横向滚动（scrollWidth ≤ clientWidth）
  const overflow = await root.evaluate((el) => {
    const scroller = el.closest('.view-scroll') as HTMLElement | null
    const boxes = [el as HTMLElement, scroller].filter((n): n is HTMLElement => !!n)
    return boxes.map((n) => ({ sw: n.scrollWidth, cw: n.clientWidth }))
  })
  for (const { sw, cw } of overflow) {
    expect(sw, '横向溢出（scrollWidth 超出 clientWidth）').toBeLessThanOrEqual(cw + 1)
  }
})

test('90 年代报刊式条目版式（#28）：方角徽章、2em 缩进、宋体正文 / 黑体标题、相关链接资料条', async ({
  page
}) => {
  await loadApp(page, 'newsprint')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')

  // 序号徽章：方角、标题色底（#211d14）、纸色字（#ece2c6）——概览与条目标题同一套
  for (const badge of [
    root.locator('.juya-overview .juya-index').first(),
    root.locator('.juya-entry .juya-index').first()
  ]) {
    await expect(badge).toBeVisible()
    await expect(badge).toHaveCSS('border-radius', '0px')
    await expect(badge).toHaveCSS('background-color', 'rgb(33, 29, 20)')
    await expect(badge).toHaveCSS('color', 'rgb(236, 226, 198)')
  }

  // 正文：2em 首行缩进（按字号比例断言，不锁死像素）、段距 6px、宋体优先
  const para = root.locator('.juya-entry p:not(.juya-links-label)').first()
  const paraMetrics = await para.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { indent: cs.textIndent, fontSize: cs.fontSize }
  })
  expect(
    Number.parseFloat(paraMetrics.indent) / Number.parseFloat(paraMetrics.fontSize),
    '首行缩进应为 2em（与基准字号比例）'
  ).toBeCloseTo(2, 1)
  await expect(para).toHaveCSS('margin-bottom', '6px')
  await expect(para).toHaveCSS('font-family', /SimSun/)

  // 条目标题与栏目条：黑体优先；栏目条仍黑底反白
  await expect(root.locator('.juya-entry h3').first()).toHaveCSS('font-family', /SimHei/)
  const h2 = root.locator('.juya-section > h2').first()
  await expect(h2).toHaveCSS('font-family', /SimHei/)
  await expect(h2).toHaveCSS('background-color', 'rgb(33, 29, 20)')
  await expect(h2).toHaveCSS('letter-spacing', '4px')

  // 导语：上下 1px 细线 + 次要文字色
  const lead = root.locator('.juya-lead').first()
  await expect(lead).toHaveCSS('border-top-width', '1px')
  await expect(lead).toHaveCSS('border-bottom-width', '1px')
  await expect(lead).toHaveCSS('color', 'rgb(95, 87, 71)')

  // 相关链接资料条：上沿 1px 细线 + 墨色常驻下划线（无需 hover）
  const label = root.locator('.juya-links-label').first()
  await expect(label).toHaveCSS('border-top-width', '1px')
  await expect(label).toHaveCSS('border-top-style', 'solid')
  const link = root.locator('.juya-links a').first()
  await expect(link).toHaveCSS('color', 'rgb(43, 38, 32)')
  await expect(link).toHaveCSS('text-decoration-line', 'underline')

  // #32：概览链接与相关链接同一条常驻下划线（2px offset），标题链接保持静默的报刊例外
  const overviewLink = root.locator('.juya-overview a').first()
  await expect(overviewLink).toBeVisible()
  await expect(overviewLink).toHaveCSS('text-decoration-line', 'underline')
  await expect(overviewLink).toHaveCSS('text-underline-offset', '2px')
  const titleLink = root.locator('.juya-entry h3 a').first()
  await expect(titleLink).toHaveCSS('text-decoration-line', 'none')

  // hover 一律转报刊红（亮侧 accent #8b1a1a）：概览 / 相关链接 / 条目标题
  for (const [name, l] of [
    ['概览', overviewLink],
    ['相关链接', link],
    ['条目标题', titleLink]
  ] as const) {
    await l.hover()
    await expect(l, `${name}链接 hover 应转 accent 红`).toHaveCSS('color', 'rgb(139, 26, 26)')
  }
})

test('90 年代报刊式框线导读（#29）：真实「导读」小标、上下框线、两列、链接可点、焦点环可见', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'newsprint')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  const box = root.locator('.jynews-overview')
  await expect(box).toBeVisible()

  // 「导读」必须是真实 DOM 元素 + 真实文本节点（伪元素 content 不产生可定位元素，也不可复制/选中）
  const label = box.locator('.jynews-overview-label')
  await expect(label).toBeVisible()
  await expect(label).toHaveText('导读')
  const labelFacts = await label.evaluate((el) => ({
    hasTextNode: [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim()
    ),
    before: getComputedStyle(el, '::before').content,
    after: getComputedStyle(el, '::after').content
  }))
  expect(labelFacts.hasTextNode, '「导读」必须是真实文本节点').toBe(true)
  expect(labelFacts.before, '导读不得由 ::before 伪元素生成').not.toContain('导读')
  expect(labelFacts.after, '导读不得由 ::after 伪元素生成').not.toContain('导读')
  // 与栏目条同字体（SimHei 优先）
  await expect(label).toHaveCSS('font-family', /SimHei/)

  // 概览上下有框线：1px solid，颜色走现有纸面 token（亮侧 --jy-border #2f2a20）
  await expect(box).toHaveCSS('border-top-width', '1px')
  await expect(box).toHaveCSS('border-top-style', 'solid')
  await expect(box).toHaveCSS('border-bottom-width', '1px')
  await expect(box).toHaveCSS('border-bottom-style', 'solid')
  await expect(box).toHaveCSS('border-top-color', 'rgb(47, 42, 32)')
  await expect(box).toHaveCSS('border-bottom-color', 'rgb(47, 42, 32)')

  // 几何：上框线在「导读」之上、下框线在概览列表之下（不是只有列表自带的某一边）
  const geo = await box.evaluate((el) => {
    const b = el.getBoundingClientRect()
    const l = el.querySelector('.jynews-overview-label')!.getBoundingClientRect()
    const ul = el.querySelector('.juya-overview')!.getBoundingClientRect()
    return {
      boxTop: b.top,
      boxBottom: b.bottom,
      labelTop: l.top,
      labelBottom: l.bottom,
      ulTop: ul.top,
      ulBottom: ul.bottom
    }
  })
  expect(geo.labelTop, '上框线应在「导读」之上').toBeGreaterThan(geo.boxTop)
  expect(geo.labelBottom, '「导读」应在概览列表之上').toBeLessThanOrEqual(geo.ulTop + 1)
  expect(geo.ulBottom, '下框线应在概览列表之下').toBeLessThan(geo.boxBottom)

  // 两列（2026-10-25 用户统一指令，随基类）：第二项与第一项同行、居右格
  const rows = await box.evaluate((el) => ({
    lis: [...el.querySelectorAll('.juya-overview li')].slice(0, 2).map((n) => {
      const r = n.getBoundingClientRect()
      return { left: r.left, top: r.top, bottom: r.bottom }
    }),
    columns: getComputedStyle(el.querySelector('.juya-overview')!).gridTemplateColumns
  }))
  expect(rows.lis.length, '概览至少两项').toBeGreaterThanOrEqual(2)
  expect(rows.columns.split(' ').length, '概览应为两列轨道').toBe(2)
  expect(Math.abs(rows.lis[1].top - rows.lis[0].top), '概览两列：第二项应与第一项同行').toBeLessThanOrEqual(1)
  expect(rows.lis[1].left, '概览两列：第二项应在右侧格').toBeGreaterThan(rows.lis[0].left)

  // 焦点环：键盘 Tab 到概览链接，2px solid 主题焦点色（行为不变）
  const link = box.locator('.juya-overview a').first()
  await expect(link).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  let reached = false
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await link.evaluate((el) => el === document.activeElement).catch(() => false)
  }
  expect(reached, '键盘 Tab 应能到达概览链接').toBe(true)
  const focus = await link.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      focusVisible: (el as HTMLElement).matches(':focus-visible'),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth
    }
  })
  expect(focus.focusVisible, '键盘 Tab ⇒ :focus-visible 命中').toBe(true)
  expect(focus.outlineStyle, '焦点环必须显式 solid').toBe('solid')
  expect(focus.outlineWidth, '焦点环宽度 2px').toBe('2px')
  // index.css 的 outline-color 有 0.2s 过渡，轮询到过渡结束值（亮侧 --jy-focus #8b1a1a）
  await expect(link).toHaveCSS('outline-color', 'rgb(139, 26, 26)')

  // 点击行为不变：默认外链设置 system ⇒ 记录 openExternal，且不原地导航
  const urlBefore = page.url()
  await link.click()
  const calls = await page.evaluate(() =>
    window.__stubCalls.filter(([kind]) => kind === 'openExternal')
  )
  expect(calls).toEqual([['openExternal', 'https://example.com/news/1']])
  expect(page.url(), '概览链接不得导致原地导航').toBe(urlBefore)
})

test('90 年代报刊式框线导读（#29）：560 宽度无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 800 })
  await loadApp(page, 'newsprint')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root.locator('.jynews-overview')).toBeVisible()
  await expect(root.locator('.jynews-overview-label')).toBeVisible()

  // 滚动容器与橘鸦根都不产生横向滚动（scrollWidth ≤ clientWidth）
  const overflow = await root.evaluate((el) => {
    const scroller = el.closest('.view-scroll') as HTMLElement | null
    const boxes = [el as HTMLElement, scroller].filter((n): n is HTMLElement => !!n)
    return boxes.map((n) => ({ sw: n.scrollWidth, cw: n.clientWidth }))
  })
  for (const { sw, cw } of overflow) {
    expect(sw, '横向溢出（scrollWidth 超出 clientWidth）').toBeLessThanOrEqual(cw + 1)
  }
})

test('千禧网页式：结构类 jyy2k 挂载', async ({ page }) => {
  await loadApp(page, 'y2k')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveClass(/jyy2k/)
})

test('folio 签名件：栏目题文武线与条目朱菱分隔符', async ({ page }) => {
  await loadApp(page, 'default')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  // ⑥ 文武线：h2 的 ::after 为 2px 全宽朱色粗线（细线由 h2 自身 border-bottom 提供；
  //    toHaveCSS 不支持伪元素，改用 evaluate 取 getComputedStyle(h2, '::after')）
  const h2 = activeTab(page).locator('.jyfolio .juya-section > h2').first()
  const wenwu = await h2.evaluate((el) => {
    const cs = getComputedStyle(el, '::after')
    return { borderTopWidth: cs.borderTopWidth, borderTopColor: cs.borderTopColor }
  })
  expect(wenwu.borderTopWidth).toBe('2px')
  expect(wenwu.borderTopColor).toBe('rgb(179, 69, 46)')
  // ⑧ 朱菱分隔符：全文恰 2 个（要闻/产品应用两栏目各 1；单条目栏目与首条目前不出现）
  await expect(root.locator('.jyfolio-divider')).toHaveCount(2)
  // 相邻三元组「条目—分隔符—条目」恰 2 个：排除 divider 误置栏目交界或栏目末尾的错误实现
  // （仅 count=2 + 首个位置断言不足：那两种误置各恰好 2 个且首个仍在首个条目之后）
  await expect(root.locator('.juya-entry + .jyfolio-divider + .juya-entry')).toHaveCount(2)
  // 第一个分隔符必须位于第一个条目之后（同栏目相邻条目之间，而非栏目交界处）
  const afterFirstEntry = await root.evaluate((el) => {
    const entry = el.querySelector('.juya-entry')
    const divider = el.querySelector('.jyfolio-divider')
    if (!entry || !divider) return false
    return (entry.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })
  expect(afterFirstEntry).toBe(true)
})

test('基层规则：相关链接标签为 12px 小标签，相关链接 hover 有下划线反馈', async ({ page }) => {
  await loadApp(page, 'default')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  // ③：base 段落规则排除标签后，「相关链接」标签按自身 12px 生效（此前被 14.5px 段落规则压制）
  await expect(root.locator('.juya-links-label').first()).toHaveCSS('font-size', '12px')
  // ⑦：相关链接 hover 出现下划线（与条目标题链接的 hover 反馈一致）
  const link = root.locator('.juya-links a').first()
  await link.hover()
  await expect(link).toHaveCSS('text-decoration-line', 'underline')
  // #38 未传图标开关的风格：文本箭头仍在（基础层 ::after），DOM 不变
  expect(await link.evaluate((el) => getComputedStyle(el, '::after').content)).toContain('↗')
  await expect(link.locator('svg')).toHaveCount(0)
})

test('蒸汽梦核式相关链接（#38）：外链箭头为 12px SVG 图标，基础层文本 ↗ 关闭', async ({ page }) => {
  await loadApp(page, 'dark')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root.jysynth')
  const link = root.locator('.juya-links a').first()
  await expect(link).toBeVisible()
  const icon = link.locator('svg')
  await expect(icon).toHaveCount(1)
  await expect(icon).toHaveAttribute('aria-hidden', 'true')
  const size = await icon.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return { w: Math.round(rect.width), h: Math.round(rect.height) }
  })
  expect(size).toEqual({ w: 12, h: 12 })
  // 文本箭头与 SVG 不得并存：::after 置空，链接文本里也没有 ↗ 字符
  expect(await link.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none')
  expect(await link.evaluate((el) => (el.textContent ?? '').includes('↗'))).toBe(false)
})

test('序号徽章统一宽度：与位数无关（一位数与两位数同宽，全风格 base 约定）', async ({ page }) => {
  await loadApp(page, 'default')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  // 夹具概览均为一位数，无法暴露 1 位 vs 2 位的宽度差——克隆一个空徽章与 "10" 徽章并排实测：
  // min-width 兜底下两者同宽；若兜底缺失，空徽章（仅内边距）显著窄于两位数徽章
  const widths = await root.evaluate((el) => {
    const li = el.querySelector('.juya-overview li')
    const chip = li?.querySelector('.juya-index')
    if (!(chip instanceof HTMLElement)) return null
    const empty = chip.cloneNode() as HTMLElement
    const double = chip.cloneNode() as HTMLElement
    double.textContent = '10'
    li?.append(empty, double)
    return [chip, empty, double].map((c) => c.getBoundingClientRect().width)
  })
  expect(widths).not.toBeNull()
  const [w0, wEmpty, wDouble] = widths as number[]
  expect(w0).toBeCloseTo(wEmpty, 6)
  expect(w0).toBeCloseTo(wDouble, 6)
})

test('nocturne 图文回流（真实图源）：右列限 2 张、其余回流通栏带，几何可复现（#9 用内联 SVG 场景）', async ({
  page
}) => {
  // 为什么用 'nocturneSvg' 而不是夹具：tests/fixtures/juya-content.html 的 6 张图全指向
  // 不可达的 assets.example.com（高度塌陷 ⇒ 任何几何断言都测不到真值），且该目录被 gitignore
  // （新克隆没有它）。本场景的图源是 data:image/svg+xml（480×320 固有尺寸）⇒ 几何真实且可复现。
  await loadApp(page, 'nocturneSvg')
  await openFirstArticle(page)

  const entry = activeTab(page).locator('article.juya-entry').first()
  await expect(entry).toBeVisible()

  // ① 决策 13 的结构面：右列恰好 2 张 plate，第 3/4 张进 .jynoct-overflow-media 通栏带
  await expect(entry.locator('.juya-entry-figure .juya-plate')).toHaveCount(2)
  await expect(entry.locator('.jynoct-overflow-media img')).toHaveCount(2)
  await expect(entry.locator('.jynoct-overflow-media .juya-plate')).toHaveCount(0)

  // ② 真实几何：右列图片按 200px 列宽等比缩放（480×320 ⇒ 200×133.3），高度非零
  const geo = await entry.evaluate((el) => {
    const row = el.querySelector('.juya-entry-row') as HTMLElement
    const body = el.querySelector('.juya-entry-body') as HTMLElement
    const fig = el.querySelector('.juya-entry-figure') as HTMLElement
    const overflow = el.querySelector('.jynoct-overflow-media') as HTMLElement
    const img = el.querySelector('.juya-entry-figure img') as HTMLImageElement
    return {
      bodyH: body.getBoundingClientRect().height,
      figH: fig.getBoundingClientRect().height,
      rowH: row.getBoundingClientRect().height,
      imgW: img.getBoundingClientRect().width,
      imgH: img.getBoundingClientRect().height,
      overflowH: overflow.getBoundingClientRect().height
    }
  })
  expect(geo.imgW).toBeCloseTo(200, 0)
  expect(geo.imgH, '图源真实可渲染（坏链会塌到 0）').toBeGreaterThan(100)

  // ③ 空洞（= 右列高 − 正文列高）的**已接受偏差的回归闸门**：实测 167px（3:2 图源 + 导语 + 2 段正文）。
  // 票面 #8 写「约 270px 降到约 100px 内」—— **该目标未达成**（167px），原因：溢出带
  // .jynoct-overflow-media 落在行**之下**，填不上右列旁空白；空洞 = 右列 2 张高度 − 正文列高度，
  // 把图移出行并不缩小右列高度。用户已裁决**保持通栏实现、以实测值收口**（见 templates/nocturne.tsx
  // 的几何实测结论注释；坏链夹具下实测 145.8px）。
  // 该值随图源纵横比与正文长度变化，故不锁死数值；闸门只拦「图全回到右列」这类回归——
  // 4 张全堆右列时 figH ≈ 700、空洞 > 500。
  const hole = geo.figH - geo.bodyH
  expect(hole, '右列只装 2 张时空洞应显著小于全堆右列').toBeGreaterThan(0)
  expect(hole, '空洞回归闸门（4 张全堆右列会 >500）').toBeLessThan(300)
  expect(geo.rowH, '行高即右列高（图文并排，正文不足时留白）').toBeCloseTo(geo.figH, 0)
  expect(geo.overflowH, '回流带自身有高度（2 张通栏图）').toBeGreaterThan(100)
})

test('nocturne 窄窗单列回落：图宽跟随内容列、两图竖向堆叠（#15 / SPEC B2 附，560 视口）', async ({
  page
}) => {
  // 病根见 juya.css 的复位规则头：宽屏 200px 的图列宽度在 ≤640px 单列回落时没有同步重置，
  // 于是单列里图仍占 200px、右侧留空白，与满宽回流带并置成两种图宽。
  // 本断言用 `getBoundingClientRect` 的**相对关系**（图/正文列/栏目标题线三者对齐），
  // 不锁绝对坐标 —— zoom、滚动条宽度、窗口内衬变化都不该让它变红。
  await page.setViewportSize({ width: 560, height: 800 })
  await loadApp(page, 'nocturneSvg')
  await openFirstArticle(page)

  const entry = activeTab(page).locator('article.juya-entry').first()
  await expect(entry).toBeVisible()

  const geo = await entry.evaluate((el) => {
    const box = (n: Element): { left: number; right: number; width: number; top: number; height: number } => {
      const r = n.getBoundingClientRect()
      return { left: r.left, right: r.right, width: r.width, top: r.top, height: r.height }
    }
    const row = el.querySelector('.juya-entry-row') as HTMLElement
    const body = el.querySelector('.juya-entry-body') as HTMLElement
    const fig = el.querySelector('.juya-entry-figure') as HTMLElement
    const h2 = el.closest('.juya-section')?.querySelector('h2') ?? null
    const imgs = [...el.querySelectorAll('.juya-entry-figure img')]
    return {
      direction: getComputedStyle(row).flexDirection,
      body: box(body),
      fig: box(fig),
      h2: h2 ? box(h2) : null,
      imgs: imgs.map(box)
    }
  })

  // eslint-disable-next-line no-console
  console.log(
    `[T4 560 实测] direction=${geo.direction} 图列=${geo.fig.width.toFixed(2)} 内容列=${geo.body.width.toFixed(2)} ` +
      `h2线=${geo.h2 ? geo.h2.width.toFixed(2) : 'n/a'} 图宽=${geo.imgs.map((i) => i.width.toFixed(2)).join('/')} ` +
      `左缘(图/内容/h2)=${geo.fig.left.toFixed(2)}/${geo.body.left.toFixed(2)}/${geo.h2 ? geo.h2.left.toFixed(2) : 'n/a'}`
  )

  expect(geo.direction, '≤640px 应回落为单列纵排').toBe('column')

  // ① 图列左右缘 == 正文列左右缘（内容列）
  expect(geo.fig.left, '图列左缘应与内容列左缘一致').toBeCloseTo(geo.body.left, 1)
  expect(geo.fig.right, '图列右缘应与内容列右缘一致').toBeCloseTo(geo.body.right, 1)
  // ② 与栏目标题线一致（票面验收「左右缘与栏目标题线一致」）。
  // 容差 2px 的来源曾是 `.jynoct .juya-entry { padding: 4px 2px 18px }`（#8 期就有的条目内衬）；
  // #16 已把暗侧该内衬的水平分量置 0（T5 右边缘对齐），故此处实测为 0.00px。
  // 断言保留 ≤2 作取整余量，不放宽也不收紧 —— 它锁的仍是「图列与栏目线同一内容栏边界」。
  expect(geo.h2, '栏目 h2 应可取到').toBeTruthy()
  expect(Math.abs(geo.fig.left - geo.h2!.left), '图列左缘与栏目标题线左端应在条目内衬 2px 内一致').toBeLessThanOrEqual(2)
  expect(Math.abs(geo.fig.right - geo.h2!.right), '图列右缘与栏目标题线右端应在条目内衬 2px 内一致').toBeLessThanOrEqual(2)
  // ③ 两张图竖向堆叠且都铺满内容列（票面「两张竖向堆叠、铺满可用宽度」）
  expect(geo.imgs, '右列仍是 2 张').toHaveLength(2)
  for (const [i, img] of geo.imgs.entries()) {
    expect(img.width, `第 ${i + 1} 张图宽应等于内容列宽`).toBeCloseTo(geo.body.width, 1)
    expect(img.left, `第 ${i + 1} 张图左缘应贴内容列左缘`).toBeCloseTo(geo.body.left, 1)
  }
  // 竖向堆叠：第二张的顶边在第一张底边之下（容 1px 取整误差）
  expect(geo.imgs[1].top, '两张图应竖向堆叠（不再是并排两列）').toBeGreaterThanOrEqual(
    geo.imgs[0].top + geo.imgs[0].height - 1
  )
})

test('nocturne 概览键盘焦点（#20）：Tab 到目录链接时焦点环 + 整行高亮同时可见', async ({ page }) => {
  // 票面验收：键盘 Tab 到概览项，焦点环（2px solid --jy-focus）与整行高亮同时可见，
  // 且不被列表/行容器裁切。断言语义面 = 计算样式 + 焦点态伪类，不是截图目测；
  // 截图作为可视证据附到 Playwright 报告（不写仓库文件）。
  await loadApp(page, 'nocturneSvg')
  await openFirstArticle(page)

  const tab = activeTab(page)
  const link = tab.locator('.juya-overview a').first()
  await expect(link).toBeVisible()

  // 从文档起点 Tab（先 blur，避免焦点停在触发打开的控件上）
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  let reached = false
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await link.evaluate((el) => el === document.activeElement).catch(() => false)
  }
  expect(reached, '键盘 Tab 应能到达概览目录链接').toBe(true)

  const focus = await link.evaluate((el) => {
    const a = el as HTMLElement
    const li = a.closest('li') as HTMLElement
    const ul = a.closest('.juya-overview') as HTMLElement
    const cs = getComputedStyle(a)
    return {
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      outlineOffset: cs.outlineOffset,
      rowBg: getComputedStyle(li).backgroundColor,
      rowHighlighted: li.matches(':has(a:focus-visible)'),
      ulOverflow: getComputedStyle(ul).overflow,
      liOverflow: getComputedStyle(li).overflow,
      focusVisible: a.matches(':focus-visible')
    }
  })

  // :focus-visible 只在键盘/非指针模态命中（鼠标点击不触发 ⇒ 行高亮不会误闪）
  expect(focus.focusVisible, '键盘 Tab ⇒ :focus-visible 命中').toBe(true)
  // 完整声明（Chromium UA 的 auto 圈忽略作者 outline-color，必须显式 solid + 变量）
  expect(focus.outlineStyle, '焦点环样式必须是 solid').toBe('solid')
  expect(focus.outlineWidth, '焦点环宽度 2px').toBe('2px')
  expect(focus.outlineOffset, '与文字留 2px 间隙').toBe('2px')
  // 颜色走 index.css 既有的 0.2s outline-color 过渡（基态是 transparent 的 solid 圈），
  // 故用 Playwright 的 CSS 断言轮询到过渡结束值，而不是瞬时快照（会读到 rgba(...,0)）。
  await expect(link).toHaveCSS('outline-color', 'rgb(139, 151, 255)')
  // 整行高亮（li:has(a:focus-visible)），与 hover 同底色
  expect(focus.rowHighlighted, '行高亮选择器形态 li:has(a:focus-visible) 命中').toBe(true)
  expect(focus.rowBg, '整行底色 = hover 同值 rgba(110,123,255,0.06)').toBe(
    'rgba(110, 123, 255, 0.06)'
  )
  // 环不被裁切：概览列表与行都没有 overflow 裁剪
  expect(focus.ulOverflow, '概览列表不得裁切焦点环').toBe('visible')
  expect(focus.liOverflow, '概览行不得裁切焦点环').toBe('visible')

  await test.info().attach('nocturne-overview-focus', {
    body: await page.screenshot(),
    contentType: 'image/png'
  })
})

test('蒸汽梦核式：透视网格在四档窗高下都落在视口内', async ({ page }) => {
  // #36 回归：旧实现投影高 70.9px，低于窗口 chrome 130px，整块永远在视口下方，
  // 而 toBeVisible() 只查 CSS 可见性、不查视口相交，所以一直绿灯。
  for (const height of [620, 800, 1000, 1440]) {
    await page.setViewportSize({ width: 1280, height })
    await loadApp(page, 'dark')
    await openFirstArticle(page)
    const m = await activeTab(page)
      .locator('.juya-scene-grid-persp')
      .evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { bottom: r.bottom, height: r.height }
      })
    const content = height - 130
    expect(m.bottom, `${height}px 窗高：网格底边须在视口内`).toBeLessThanOrEqual(height + 1)
    expect(m.bottom, `${height}px 窗高：网格底边须贴近视口下缘`).toBeGreaterThan(height - 40)
    expect(m.height, `${height}px 窗高：投影高占内容区 35%–65%`).toBeGreaterThan(content * 0.35)
    expect(m.height, `${height}px 窗高：投影高占内容区 35%–65%`).toBeLessThan(content * 0.65)
  }
})
