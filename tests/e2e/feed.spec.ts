import { test, expect, type Locator } from '@playwright/test'
import { loadApp, openFirstArticle, activeTab } from './setup'

/** 订阅页（HomeView 橘鸦源）风格化 + 响应式基线（Playwright 可覆盖部分）。
 *  keep-alive 下断言限定活动标签容器。 */

test('默认（纸感精读式）：橘鸦订阅页渲染风格化期号列表', async ({ page }) => {
  await loadApp(page, 'default')
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'folio-light')
  const feed = root.locator('.juya-feed')
  await expect(feed).toBeVisible()
  await expect(feed.locator('.juya-feed-title')).toHaveText(['2026-08-28'])
  await expect(feed.locator('.juya-feed-cover')).toHaveAttribute('loading', 'lazy')
})

test('短内容（单篇）：纸面铺满订阅页视口（.juya-root 高度 ≥ 滚动容器）', async ({ page }) => {
  // default 场景仅 1 篇期号 = 短内容：修复前 zoom div 高度 auto，
  // .juya-root { min-height: 100% } 百分比解析失败，纸面在内容尽头截断。
  await loadApp(page, 'default')
  const main = activeTab(page).locator('main.flex-1.overflow-y-auto')
  // 用 main 的 boundingRect 高度（浮点）作参照，规避 clientHeight 取整的半像素差
  const viewportH = await main.evaluate((el) => el.getBoundingClientRect().height)
  const root = activeTab(page).locator('.juya-root')
  const h = (await root.boundingBox())?.height ?? 0
  expect(h).toBeGreaterThanOrEqual(viewportH)
})

test('风格关闭：订阅页回退通用 ArticleList（卡片网格）', async ({ page }) => {
  await loadApp(page, 'off')
  const tab = activeTab(page)
  await expect(tab.locator('.juya-feed')).toHaveCount(0)
  await expect(tab.locator('main article').first()).toBeVisible()
  await expect(tab.locator('.juya-root')).toHaveCount(0)
})

test('点击风格化期号卡片打开阅读页（定制模板）', async ({ page }) => {
  await loadApp(page, 'default')
  await page.locator('.juya-feed-item').first().click()
  await expect(activeTab(page).locator('.juya-root .juya-issue')).toBeVisible()
})

test('窄窗口（480px）：定制阅读页无横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 })
  await loadApp(page, 'default')
  await openFirstArticle(page)
  await expect(activeTab(page).locator('.juya-root')).toBeVisible()
  const overflow = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('.overflow-y-auto')]
    const scroller = scrollers.find((el) => el.closest('div:not([class*="hidden"])')) ?? document.scrollingElement
    if (!scroller) return -1
    return scroller.scrollWidth - scroller.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
})

test('窄窗口（480px）：风格化订阅页无横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 })
  await loadApp(page, 'newsprint')
  await expect(activeTab(page).locator('.juya-feed')).toBeVisible()
  const overflow = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('.overflow-y-auto')]
    const scroller = scrollers.find((el) => el.closest('div:not([class*="hidden"])')) ?? document.scrollingElement
    if (!scroller) return -1
    return scroller.scrollWidth - scroller.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
})

test('reduced-motion：梦核背景漂移动画停用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadApp(page, 'dark')
  await openFirstArticle(page)
  const animated = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('.juya-root')] as HTMLElement[]
    const visible = roots.find((r) => r.offsetParent !== null)
    if (!visible) return null
    return getComputedStyle(visible).animationName
  })
  expect(animated === 'none' || animated === '' || animated === null).toBeTruthy()
})

test('八风格逐一断言阅读页根节点结构类', async ({ page }) => {
  const cases: Array<{
    scenario: 'default' | 'y2k' | 'pop' | 'newsprint' | 'dark' | 'nocturne' | 'editorial' | 'wabi'
    cls: string
  }> = [
    { scenario: 'default', cls: 'jyfolio' },
    { scenario: 'y2k', cls: 'jyy2k' },
    { scenario: 'pop', cls: 'jypop' },
    { scenario: 'newsprint', cls: 'jynews' },
    { scenario: 'dark', cls: 'jysynth' },
    { scenario: 'nocturne', cls: 'jynoct' },
    { scenario: 'editorial', cls: 'jyedit' },
    { scenario: 'wabi', cls: 'jywabi' }
  ]
  for (const c of cases) {
    await loadApp(page, c.scenario)
    await openFirstArticle(page)
    await expect(activeTab(page).locator(`.juya-root.${c.cls}`)).toBeVisible()
  }
})

test('场景层：蒸汽梦核暗侧挂 synthwave 场景、千禧亮侧隐藏场景、暗夜暗侧挂 dust + nebula 氛围层', async ({
  page
}) => {
  await loadApp(page, 'dark')
  await openFirstArticle(page)
  const synthRoot = activeTab(page).locator('.juya-root.jysynth')
  await expect(synthRoot.locator('.juya-scene-sun')).toBeVisible()
  await expect(synthRoot.locator('.juya-scene-grid-persp')).toBeVisible()

  await loadApp(page, 'y2k')
  await openFirstArticle(page)
  await expect(activeTab(page).locator('.juya-root .juya-scene')).toBeHidden()

  // #2 起 nocturne-dark 挂载 dust + nebula（旧断言「计数为 0」锁的是改造前状态，非回归）
  await loadApp(page, 'nocturne')
  await openFirstArticle(page)
  const noctScene = activeTab(page).locator('.juya-root .juya-scene')
  await expect(noctScene).toHaveCount(1)
  await expect(noctScene).toBeVisible()
  await expect(noctScene.locator('.juya-scene-dust')).toHaveCount(1)
  await expect(noctScene.locator('.juya-scene-nebula')).toHaveCount(1)
})

test('订阅页场景（#40）：蒸汽梦核式订阅页挂完整场景，folio 订阅页无场景节点', async ({ page }) => {
  await loadApp(page, 'dark')
  const root = activeTab(page).locator('.juya-root.jysynth')
  const scene = root.locator('.juya-scene')
  await expect(scene).toHaveCount(1)
  await expect(scene).toBeVisible()
  await expect(scene.locator('.juya-scene-sun')).toBeVisible()
  const grid = scene.locator('.juya-scene-grid.juya-scene-grid-persp')
  await expect(grid).toBeVisible()

  // 场景挂在 .juya-root 内、.juya-feed 之前（z-index 0 的固定层必须位于内容之下）
  const order = await root.evaluate((el) => {
    const kids = [...el.children].map((c) => c.className.split(' '))
    return {
      scene: kids.findIndex((c) => c.includes('juya-scene')),
      feed: kids.findIndex((c) => c.includes('juya-feed'))
    }
  })
  expect(order.scene, '.juya-scene 应是 .juya-root 的直接子节点').toBeGreaterThanOrEqual(0)
  expect(order.feed).toBeGreaterThan(order.scene)

  // 网格底边必须落在订阅页滚动容器的可视区内：只断言 CSS 可见性会让「网格被推到视口外」漏检（#36 教训）
  const main = activeTab(page).locator('main.flex-1.overflow-y-auto')
  const scrollBox = (await main.boundingBox())!
  const gridBox = (await grid.boundingBox())!
  const gridBottom = gridBox.y + gridBox.height
  expect(gridBox.height, '透视投影后网格应有可辨高度').toBeGreaterThan(120)
  expect(gridBottom, '网格底边不得落到滚动容器下缘之外').toBeLessThanOrEqual(
    scrollBox.y + scrollBox.height + 1
  )
  expect(gridBottom, '网格底边应贴住可视区下缘').toBeGreaterThan(scrollBox.y + scrollBox.height - 40)

  // 可选插槽不外溢：folio（默认）订阅页没有任何场景节点
  await loadApp(page, 'default')
  await expect(activeTab(page).locator('.juya-root.jyfolio .juya-feed')).toBeVisible()
  await expect(activeTab(page).locator('.juya-root .juya-scene')).toHaveCount(0)
})

test('订阅页图标（#38）：蒸汽梦核式日期与来源前各有 12px 图标，folio 无图标节点', async ({ page }) => {
  await loadApp(page, 'dark')
  const tabs = activeTab(page)
  const item = tabs.locator('.juya-feed-item').first()
  await expect(item).toBeVisible()
  const meta = item.locator('.juya-feed-meta')
  // 未读点（.juya-feed-read-dot）是 span，不计入；日期 Calendar + 来源 Rss 各一枚
  await expect(meta.locator('svg')).toHaveCount(2)
  const icons = await meta.locator('svg').evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        hidden: el.getAttribute('aria-hidden')
      }
    })
  )
  expect(icons).toEqual([
    { w: 12, h: 12, hidden: 'true' },
    { w: 12, h: 12, hidden: 'true' }
  ])
  // 图标必须落在对应文字之前（日期前 / 来源前），而不是独立成组
  const order = await meta.evaluate((el) => {
    const date = el.querySelector('.juya-feed-date')
    const source = el.querySelector('.juya-feed-source')
    const first = (host: Element | null): string =>
      host?.firstElementChild?.tagName.toLowerCase() ?? ''
    return { date: first(date), source: first(source) }
  })
  expect(order).toEqual({ date: 'svg', source: 'svg' })

  // 外链箭头是 SVG 图标，基础层的文本 ↗ 在 synthwave 内关闭
  await item.click()
  const link = activeTab(page).locator('.juya-links a').first()
  await expect(link).toBeVisible()
  await expect(link.locator('svg')).toHaveCount(1)
  expect(await link.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none')

  // 其它风格不传开关：folio 订阅页 DOM 与观感保持原样（无图标节点）
  await loadApp(page, 'default')
  const folioItem = activeTab(page).locator('.juya-feed-item').first()
  await expect(folioItem).toBeVisible()
  await expect(folioItem.locator('.juya-feed-meta svg')).toHaveCount(0)
})

test('橘鸦订阅页遵循「布局」预设 grid 的列数（gridColumns=4）', async ({ page }) => {
  await loadApp(page, 'grid4')
  const grid = activeTab(page).locator('.juya-feed-grid')
  await expect(grid).toHaveCount(1)
  const colCount = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(colCount).toBe(4)
})

test('橘鸦订阅页遵循「布局」预设 compact（单列行式）', async ({ page }) => {
  await loadApp(page, 'compact')
  const feed = activeTab(page).locator('.juya-feed-compact')
  await expect(feed).toBeVisible()
  await expect(feed.locator('.juya-feed-item')).toHaveCount(4)
  await expect(feed.locator('.juya-feed-title').first()).toHaveText('2026-08-28')
})

test('橘鸦订阅页遵循「布局」预设 magazine（首条大幅 + 其余网格）', async ({ page }) => {
  await loadApp(page, 'magazine')
  const tab = activeTab(page)
  await expect(tab.locator('.juya-feed-featured')).toHaveCount(1)
  await expect(tab.locator('.juya-feed-grid .juya-feed-item')).toHaveCount(4)
})

test('橘鸦订阅页遵循「布局」显示字段：默认展示摘要与来源', async ({ page }) => {
  await loadApp(page, 'default')
  const feed = activeTab(page).locator('.juya-feed')
  await expect(feed.locator('.juya-feed-summary')).toHaveText(['示例摘要占位文本'])
  await expect(feed.locator('.juya-feed-source')).toHaveText(['橘鸦AI早报'])
})

test('橘鸦订阅页遵循「布局」显示字段：全关后隐藏封面/摘要/日期/来源', async ({ page }) => {
  await loadApp(page, 'fieldsoff')
  const feed = activeTab(page).locator('.juya-feed')
  await expect(feed.locator('.juya-feed-cover')).toHaveCount(0)
  await expect(feed.locator('.juya-feed-summary')).toHaveCount(0)
  await expect(feed.locator('.juya-feed-source')).toHaveCount(0)
  // 元信息仅剩未读圆点，日期被隐藏
  await expect(feed.locator('.juya-feed-meta > span:not(.juya-feed-read-dot)')).toHaveCount(0)
})

/* ---- #30 订阅页头版（newsprint90s card/grid） ---- */

test('newsprint 头版（card/grid）：160×4:3 图版与标题并排、标题 18px 黑体、条目去卡片化', async ({ page }) => {
  await loadApp(page, 'newsprintGrid')
  const tab = activeTab(page)
  const grid = tab.locator('.juya-feed-grid')
  const items = grid.locator('> .juya-feed-item')
  await expect(items).toHaveCount(4)

  // 列数设置继续生效（2 列）
  const colCount = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(colCount).toBe(2)

  const first = items.first()
  // 图版：160px × 4:3
  const cover = (await first.locator('.juya-feed-cover').boundingBox())!
  expect(cover.width).toBeCloseTo(160, 0)
  expect(cover.height).toBeCloseTo(120, 0)
  expect(cover.width / cover.height).toBeCloseTo(4 / 3, 1)

  // 去卡片化：无底色/边框/阴影，条目之间以 1px 细线分隔
  const box = await first.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      bg: cs.backgroundColor,
      topBorder: cs.borderTopWidth,
      bottomBorder: cs.borderBottomWidth,
      bottomStyle: cs.borderBottomStyle,
      shadow: cs.boxShadow,
      radius: cs.borderTopLeftRadius
    }
  })
  expect(box.bg).toBe('rgba(0, 0, 0, 0)')
  expect(box.topBorder).toBe('0px')
  expect(box.bottomBorder).toBe('1px')
  expect(box.bottomStyle).toBe('solid')
  expect(box.shadow).toBe('none')
  expect(box.radius).toBe('0px')

  // 标题第一视觉：18px 黑体优先；摘要 13px
  const title = await first.locator('.juya-feed-title').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { size: cs.fontSize, family: cs.fontFamily }
  })
  expect(title.size).toBe('18px')
  expect(title.family.split(',')[0].trim().replace(/["']/g, '')).toBe('SimHei')
  expect(await first.locator('.juya-feed-summary').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    '13px'
  )

  // 图版与标题/摘要并排：图版右缘在图版正文左缘之前，顶端大致对齐。
  // 容差 6px：CI runner 的中文字体度量与亚像素舍入会让 flex 顶端差出几 px（实测 4.29px），
  // 相对 120px 高的图版仍属于「顶端对齐」，不把跨平台字形差异当成布局回归。
  const body = (await first.locator('.juya-feed-body').boundingBox())!
  expect(cover.x + cover.width).toBeLessThanOrEqual(body.x + 1)
  expect(Math.abs(cover.y - body.y)).toBeLessThanOrEqual(6)
})

test('newsprint 头版 hover：标题下划线 + 纸面微亮，不再产生上浮位移', async ({ page }) => {
  await loadApp(page, 'newsprintGrid')
  const tab = activeTab(page)
  const grid = tab.locator('.juya-feed-grid')
  const item = grid.locator('> .juya-feed-item').first()
  // 等基础入场动画（jy-enter 的 translateY(8px)）结束，否则位移量会混入动画相位
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running')
  )
  // 相对网格顶部量取（hover 可能触发滚动，绝对视口坐标会被滚动污染）
  const relTop = async (): Promise<number> =>
    (await item.boundingBox())!.y - (await grid.boundingBox())!.y
  const before = await relTop()
  await item.hover()
  // 上浮被覆盖：transform 无位移（toHaveCSS 带重试，等过渡结束）
  await expect(item).toHaveCSS('transform', 'none')
  expect(await relTop()).toBeCloseTo(before, 0)
  // 纸面微亮 + 标题下划线
  await expect(item).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(item.locator('.juya-feed-title')).toHaveCSS('text-decoration-line', 'underline')
})

test('newsprint 头版元信息：来源为无框小字，未读点为 4px 方形', async ({ page }) => {
  await loadApp(page, 'newsprintGrid')
  const first = activeTab(page).locator('.juya-feed-grid > .juya-feed-item').first()
  const source = await first.locator('.juya-feed-source').evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      border: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      bg: cs.backgroundColor,
      padding: cs.paddingLeft
    }
  })
  expect(source.border, '来源无边框').toBe('0px')
  expect(source.radius, '来源无胶囊').toBe('0px')
  expect(source.bg, '来源无底色').toBe('rgba(0, 0, 0, 0)')
  expect(source.padding, '来源无内衬').toBe('0px')

  const dot = await first.locator('.juya-feed-read-dot').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height, radius: getComputedStyle(el).borderTopLeftRadius }
  })
  expect(dot.w).toBeCloseTo(4, 0)
  expect(dot.h).toBeCloseTo(4, 0)
  expect(dot.radius, '未读点方角').toBe('0px')
})

test('newsprint 头版：关闭封面字段后无封面，标题独占整行', async ({ page }) => {
  await loadApp(page, 'newsprintNoCover')
  const tab = activeTab(page)
  await expect(tab.locator('.juya-feed-cover')).toHaveCount(0)
  const item = tab.locator('.juya-feed-grid > .juya-feed-item').first()
  const itemBox = (await item.boundingBox())!
  const bodyBox = (await item.locator('.juya-feed-body').boundingBox())!
  // 条目无水平内衬，正文列铺满整行
  expect(bodyBox.width).toBeCloseTo(itemBox.width, 0)
  await expect(item.locator('.juya-feed-summary')).toBeVisible()
})

test('窄窗口（480/560px）：newsprint 头版无横向溢出', async ({ page }) => {
  for (const width of [480, 560]) {
    await page.setViewportSize({ width, height: 800 })
    await loadApp(page, 'newsprintGrid')
    await expect(activeTab(page).locator('.juya-feed-grid')).toBeVisible()
    const overflow = await page.evaluate(() => {
      const scrollers = [...document.querySelectorAll('.overflow-y-auto')]
      const scroller = scrollers.find((el) => el.closest('div:not([class*="hidden"])')) ?? document.scrollingElement
      if (!scroller) return -1
      return scroller.scrollWidth - scroller.clientWidth
    })
    expect(overflow, `${width}px 视口横向溢出`).toBeLessThanOrEqual(0)
  }
})

/* ---- #31 订阅页其余三态（newsprint90s compact / magazine / 空态） ---- */

test('newsprint compact：小缩略图直角、标题 14px、行式结构与元信息同 #30 一致', async ({ page }) => {
  await loadApp(page, 'newsprintCompact')
  const tab = activeTab(page)
  const feed = tab.locator('.juya-feed-compact')
  await expect(feed).toBeVisible()
  // 预设继续生效：单列行式 4 条
  await expect(feed.locator('.juya-feed-item')).toHaveCount(4)
  // 等基础入场动画（jy-enter 的 translateY(8px)）结束：否则两次 boundingBox 落在
  // 动画的不同相位上，垂直居中的比较会被位移差污染（与 #30 hover 用例同一处理）
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))

  const first = feed.locator('.juya-feed-item').first()
  const coverEl = first.locator('.juya-feed-cover')
  const cover = (await coverEl.boundingBox())!
  expect(cover.width, '保留 72px 小缩略图').toBeCloseTo(72, 0)
  expect(cover.height).toBeCloseTo(40, 0)
  expect(
    await coverEl.evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    '缩略图直角'
  ).toBe('0px')

  const title = await first.locator('.juya-feed-title').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { size: cs.fontSize, family: cs.fontFamily }
  })
  expect(title.size, '行式标题 14px').toBe('14px')
  expect(title.family.split(',')[0].trim().replace(/["']/g, '')).toBe('SimHei')

  // 行式结构不变：图版在正文左侧，两者垂直居中
  const body = (await first.locator('.juya-feed-body').boundingBox())!
  expect(cover.x + cover.width).toBeLessThanOrEqual(body.x + 1)
  expect(Math.abs(cover.y + cover.height / 2 - (body.y + body.height / 2))).toBeLessThanOrEqual(2)

  // 去卡片化：与 #30 同一套纸面语言（无底色/上边框/阴影，细线分隔）
  const box = await first.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      bg: cs.backgroundColor,
      topBorder: cs.borderTopWidth,
      bottomBorder: cs.borderBottomWidth,
      bottomStyle: cs.borderBottomStyle,
      shadow: cs.boxShadow
    }
  })
  expect(box.bg).toBe('rgba(0, 0, 0, 0)')
  expect(box.topBorder).toBe('0px')
  expect(box.bottomBorder).toBe('1px')
  expect(box.bottomStyle).toBe('solid')
  expect(box.shadow).toBe('none')

  // 元信息与 #30 一致：来源无框小字、未读点 4px 方形
  const source = await first.locator('.juya-feed-source').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, padding: cs.paddingLeft }
  })
  expect(source.border, '来源无边框').toBe('0px')
  expect(source.radius, '来源无胶囊').toBe('0px')
  expect(source.bg, '来源无底色').toBe('rgba(0, 0, 0, 0)')
  expect(source.padding, '来源无内衬').toBe('0px')
  const dot = await first.locator('.juya-feed-read-dot').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height, radius: getComputedStyle(el).borderTopLeftRadius }
  })
  expect(dot.w).toBeCloseTo(4, 0)
  expect(dot.h).toBeCloseTo(4, 0)
  expect(dot.radius, '未读点方角').toBe('0px')
})

test('newsprint magazine：首条封面 3:2、标题 26px；其余条目仍走 #30 网格形态', async ({ page }) => {
  await loadApp(page, 'newsprintMagazine')
  const tab = activeTab(page)
  const featured = tab.locator('.juya-feed-featured')
  await expect(featured).toHaveCount(1)

  // 首条大图：3:2（基础层是 21:9），直角
  const coverEl = featured.locator('.juya-feed-cover')
  const cover = (await coverEl.boundingBox())!
  expect(cover.width / cover.height, '首条封面 3:2').toBeCloseTo(3 / 2, 1)
  expect(await coverEl.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('0px')

  const title = await featured.locator('.juya-feed-title').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { size: cs.fontSize, family: cs.fontFamily }
  })
  expect(title.size, '首条标题 26px').toBe('26px')
  expect(title.family.split(',')[0].trim().replace(/["']/g, '')).toBe('SimHei')

  // 首条元信息与 #30 同一口径（首条不经网格，需单独覆盖）：来源无框小字、未读点方形
  const source = await featured.locator('.juya-feed-source').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, padding: cs.paddingLeft }
  })
  expect(source.border, '首条来源无边框').toBe('0px')
  expect(source.radius, '首条来源无胶囊').toBe('0px')
  expect(source.bg, '首条来源无底色').toBe('rgba(0, 0, 0, 0)')
  expect(source.padding, '首条来源无内衬').toBe('0px')
  const dot = await featured.locator('.juya-feed-read-dot').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height, radius: getComputedStyle(el).borderTopLeftRadius }
  })
  expect(dot.w).toBeCloseTo(4, 0)
  expect(dot.h).toBeCloseTo(4, 0)
  expect(dot.radius, '首条未读点方角').toBe('0px')

  // 其余条目继续沿用 #30 的卡片网格形态（160 × 4:3 图版、18px 标题、无卡片底色）
  const grid = tab.locator('.juya-feed-grid')
  await expect(grid.locator('> .juya-feed-item')).toHaveCount(4)
  const small = grid.locator('> .juya-feed-item').first()
  const smallCover = (await small.locator('.juya-feed-cover').boundingBox())!
  expect(smallCover.width).toBeCloseTo(160, 0)
  expect(smallCover.height).toBeCloseTo(120, 0)
  expect(await small.locator('.juya-feed-title').evaluate((el) => getComputedStyle(el).fontSize)).toBe('18px')
  expect(await small.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
})

test('newsprint 空态：上下 1px 细线的通栏公告框，黑体标题 + 小字刷新提示', async ({ page }) => {
  await loadApp(page, 'newsprintEmpty')
  const tab = activeTab(page)
  const empty = tab.locator('.juya-feed-empty')
  await expect(empty).toBeVisible()
  // #32 空态由本风格模板自渲染：两个真实元素（标题 + 提示），不再是共享骨架的一整行字符串
  const heading = empty.locator('strong')
  const hint = empty.locator('span')
  await expect(heading).toHaveText('暂无内容')
  await expect(hint).toHaveText('点击右上角刷新获取')
  await expect(empty).toHaveCSS('text-align', 'center')
  await expect(empty).toHaveCSS('border-top-width', '1px')
  await expect(empty).toHaveCSS('border-top-style', 'solid')
  await expect(empty).toHaveCSS('border-bottom-width', '1px')
  await expect(empty).toHaveCSS('border-bottom-style', 'solid')

  // 两级排印：标题 15px 黑体（标题字体 token）、提示 12px 次要文字色，两者块级居中、间距 4px
  await expect(heading).toHaveCSS('font-size', '15px')
  const family = await heading.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(family.split(',')[0].trim().replace(/["']/g, ''), '公告标题黑体').toBe('SimHei')
  await expect(hint).toHaveCSS('font-size', '12px')
  await expect(hint).toHaveCSS('color', 'rgb(95, 87, 71)')
  expect(await heading.evaluate((el) => getComputedStyle(el).display), '标题为块级').toBe('block')
  expect(await hint.evaluate((el) => getComputedStyle(el).display), '提示为块级').toBe('block')
  await expect(hint).toHaveCSS('margin-top', '4px')

  // 通栏：默认 grid 预设为 2 列，公告框必须横跨整个订阅页内容宽而非被挤进第一列
  const feed = tab.locator('.juya-feed')
  const feedBox = (await feed.boundingBox())!
  const emptyBox = (await empty.boundingBox())!
  const padding = await feed.evaluate((el) => {
    const cs = getComputedStyle(el)
    return Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight)
  })
  expect(emptyBox.width).toBeCloseTo(feedBox.width - padding, 0)
})

test('窄窗口（480/560px）：newsprint compact / magazine 无横向溢出', async ({ page }) => {
  for (const width of [480, 560]) {
    for (const scenario of ['newsprintCompact', 'newsprintMagazine'] as const) {
      await page.setViewportSize({ width, height: 800 })
      await loadApp(page, scenario)
      await expect(activeTab(page).locator('.juya-feed')).toBeVisible()
      const overflow = await page.evaluate(() => {
        const scrollers = [...document.querySelectorAll('.overflow-y-auto')]
        const scroller = scrollers.find((el) => el.closest('div:not([class*="hidden"])')) ?? document.scrollingElement
        if (!scroller) return -1
        return scroller.scrollWidth - scroller.clientWidth
      })
      expect(overflow, `${scenario} @${width}px 横向溢出`).toBeLessThanOrEqual(0)
    }
  }
})

/* ---- 程序化视觉合理性断言（无视觉模型，纯几何校验） ---- */

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number }

async function boxesOf(locator: Locator): Promise<Box[]> {
  return locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    })
  )
}

/** 返回第一个重叠对，无重叠返回 null（容忍 1px 舍入） */
function firstOverlap(boxes: Box[]): string | null {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlap = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
      if (overlap) return `item ${i} 与 ${j} 重叠`
    }
  }
  return null
}

test('视觉合理性（几何）：grid4 卡片无重叠、行内对齐、不溢出容器', async ({ page }) => {
  await loadApp(page, 'grid4')
  const tab = activeTab(page)
  const container = tab.locator('.juya-feed-grid')
  const items = container.locator('.juya-feed-item')
  await expect(items).toHaveCount(6)

  const boxes = await boxesOf(items)
  expect(firstOverlap(boxes)).toBeNull()

  const cRect = await container.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right }
  })
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(cRect.left - 1)
    expect(b.right).toBeLessThanOrEqual(cRect.right + 1)
  }

  // 行内对齐：同一 top 的分组内高度一致，每行不超过 4 项
  const rows = new Map<number, number[]>()
  boxes.forEach((b, i) => {
    const key = Math.round(b.top)
    rows.set(key, [...(rows.get(key) ?? []), i])
  })
  for (const idxs of rows.values()) {
    expect(idxs.length).toBeLessThanOrEqual(4)
    const heights = idxs.map((i) => boxes[i].height)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
  }
})

test('视觉合理性（几何）：magazine 首条大幅与其余网格无重叠', async ({ page }) => {
  await loadApp(page, 'magazine')
  const tab = activeTab(page)
  const featured = tab.locator('.juya-feed-featured')
  await expect(featured).toHaveCount(1)
  const featuredBox = (await boxesOf(featured))[0]
  const gridBoxes = await boxesOf(tab.locator('.juya-feed-grid .juya-feed-item'))
  expect(firstOverlap([featuredBox, ...gridBoxes])).toBeNull()
})

test('视觉合理性（几何）：compact 单列垂直堆叠、行式紧凑', async ({ page }) => {
  await loadApp(page, 'compact')
  const tab = activeTab(page)
  const items = tab.locator('.juya-feed-item')
  await expect(items).toHaveCount(4)
  const boxes = await boxesOf(items)

  // 单列：全部左对齐，后一行 top > 前一行 bottom
  const lefts = boxes.map((b) => b.left)
  expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(1)
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1)
  }
  // 行式：每行高度紧凑
  for (const b of boxes) {
    expect(b.height).toBeLessThan(100)
  }
})
