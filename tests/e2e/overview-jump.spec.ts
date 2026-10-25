import { expect, test, type Page } from '@playwright/test'
import { activeTab, loadApp, openFirstArticle } from './setup'
import { readEntryPortFacts, type Scenario } from './helpers'

/** 概览标题 = 页内跳转；末尾图标 = 原文外链（2026-10-25）。
 *  跳转落点固定为「目标条目标题顶边距滚动口顶边 24px」，与 uiZoom 无关；
 *  焦点随跳转落到条目标题（tabindex=-1），键盘用户不会丢位置。 */

const FILLER = `<p>${'用于把后续条目标题推到滚动口下方的长段落。'.repeat(14)}</p>`

const JUMP_HTML = `<div>
  <h1>概览跳转样本</h1>
  <h2>概览</h2>
  <ul>
    <li><a href="https://example.com/jump/1">跳转条目一</a> <code>#1</code></li>
    <li><a href="https://example.com/jump/2">跳转条目二</a> <code>#2</code></li>
    <li>无外链条目三 <code>#3</code></li>
    <li><a href="https://example.com/jump/4">目录标题漂移</a> <code>#9</code></li>
    <li><a href="https://example.com/unmatched">未匹配目录项</a></li>
  </ul>
  <h2>栏目甲</h2>
  <h3><a href="https://example.com/jump/1">跳转条目一</a> <code>#1</code></h3>
  <p>条目一开头。</p>
  ${FILLER.repeat(4)}
  <h3><a href="https://example.com/jump/2">跳转条目二</a> <code>#2</code></h3>
  <p>条目二开头。</p>
  ${FILLER.repeat(4)}
  <h2>栏目乙</h2>
  <h3>无外链条目三 <code>#3</code></h3>
  <p>条目三开头。</p>
  ${FILLER.repeat(4)}
  <h3><a href="https://example.com/jump/4">正文标题与目录不同</a> <code>#4</code></h3>
  <p>条目四开头。</p>
  ${FILLER.repeat(5)}
</div>`

const JUMP_SUFFIXES = ['0', '1', '2', '3']

async function installArticle(page: Page, uiZoom: number): Promise<void> {
  await page.addInitScript(`(() => {
    const data = window.__stubData;
    data.articles[0].contentHtml = ${JSON.stringify(JUMP_HTML)};
    data.settings.uiZoom = ${uiZoom};
  })()`)
  await page.reload()
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  await openFirstArticle(page)
}

/** 记录下一次 scrollTo 的 options（仍执行原调用），用来证伪「平滑 / RM 即时」分支。 */
async function recordScrollTo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __scrollCalls: ScrollToOptions[] }
    w.__scrollCalls = []
    const original = Element.prototype.scrollTo
    Element.prototype.scrollTo = function (
      this: Element,
      options?: ScrollToOptions | number,
      y?: number
    ): void {
      if (typeof options === 'object') {
        w.__scrollCalls.push(options)
        // 必须只传一个参数：传第二个参数会命中坐标重载，把 options 对象当 x 解释
        return original.call(this, options)
      }
      return original.call(this, options as number, y as number)
    } as typeof Element.prototype.scrollTo
  })
}

test('概览标题跳页内条目：24px 落点、缩放、焦点与 reduced-motion', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await loadApp(page, 'wabi')
  await installArticle(page, 1)
  // 点击期号卡片后鼠标残留位置可能正落在概览首项上：先移出并等颜色过渡结束再取默认态
  await page.mouse.move(4, 4)
  await page.waitForTimeout(300)

  const tab = activeTab(page)
  const overview = tab.locator('.juya-overview')
  const jumps = overview.locator('.juya-overview-jump')
  const ext = overview.locator('.juya-overview-ext')
  const items = overview.locator('li')

  // 唯一命中才生成跳转；编号重复/标题漂移/无外链三种边界都在夹具里
  await expect(jumps).toHaveCount(4)
  const jumpHrefs = await jumps.evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  )
  expect(jumpHrefs.map((href) => href.match(/-entry-(\d+)$/)?.[1])).toEqual(JUMP_SUFFIXES)
  for (const href of jumpHrefs) await expect(tab.locator(href)).toHaveCount(1)
  await expect(ext).toHaveCount(4)
  // 第 3 项无外链 ⇒ 不生成图标；第 5 项未唯一命中 ⇒ 标题是纯文本，只保留外链图标
  await expect(items.nth(2).locator('.juya-overview-ext')).toHaveCount(0)
  await expect(items.nth(4).locator('.juya-overview-jump')).toHaveCount(0)
  await expect(items.nth(4).locator('.juya-overview-ext')).toHaveCount(1)

  const icon = await ext.first().evaluate((el) => {
    const box = el.getBoundingClientRect()
    const svg = el.querySelector('svg') as SVGElement
    const svgBox = svg.getBoundingClientRect()
    const path = svg.querySelector('path') as SVGPathElement
    const title = el.closest('li')?.querySelector('.juya-overview-jump') as HTMLAnchorElement
    return {
      width: box.width,
      height: box.height,
      iconWidth: svgBox.width,
      iconHeight: svgBox.height,
      fill: getComputedStyle(path).fill,
      color: getComputedStyle(el).color,
      linkColor: getComputedStyle(title).color,
      decoration: getComputedStyle(el).textDecorationLine,
      afterTitle: Boolean(title.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
      titleRight: title.getBoundingClientRect().right,
      iconLeft: box.left,
      label: el.getAttribute('aria-label')
    }
  })
  expect(icon.width, '外链图标命中区宽').toBeGreaterThanOrEqual(24)
  expect(icon.height, '外链图标命中区高').toBeGreaterThanOrEqual(24)
  expect(icon.iconWidth, '图标视觉宽 12px').toBeCloseTo(12, 0)
  expect(icon.iconHeight, '图标视觉高 12px').toBeCloseTo(12, 0)
  expect(icon.fill, '图标取标题链接同色（currentColor）').toBe(icon.linkColor)
  expect(icon.color, '图标链接本身继承链接色').toBe(icon.linkColor)
  expect(icon.decoration, '图标链接不继承概览链接下划线').toBe('none')
  expect(icon.afterTitle, '图标在标题链接之后').toBe(true)
  expect(icon.iconLeft, '图标排在标题文字末尾').toBeGreaterThanOrEqual(icon.titleRight - 1)
  expect(icon.label).toBe('打开原文外链：跳转条目一')

  // 平滑滚动：标题点击走 behavior=smooth；落点 24px；焦点转移到条目标题
  const urlBefore = page.url()
  const target2 = tab.locator(jumpHrefs[1])
  expect((await readEntryPortFacts(target2)).gap, '跳转前目标在滚动口下方').toBeGreaterThan(24)
  await recordScrollTo(page)
  await overview.getByRole('link', { name: '跳转条目二', exact: true }).click()
  await expect
    .poll(async () => Math.abs((await readEntryPortFacts(target2)).gap - 24))
    .toBeLessThanOrEqual(1)
  expect(Math.abs((await readEntryPortFacts(target2)).gap - 24)).toBeLessThanOrEqual(1)
  expect(
    await target2.evaluate((el) => el === document.activeElement),
    '跳转后焦点落到条目标题'
  ).toBe(true)
  expect(
    await page.evaluate(() => (window as unknown as { __scrollCalls: ScrollToOptions[] }).__scrollCalls.at(-1)?.behavior)
  ).toBe('smooth')
  expect(
    await page.evaluate(() =>
      (window as unknown as { __stubCalls: Array<[string, string]> }).__stubCalls.filter(
        ([kind]) => kind === 'openExternal'
      )
    )
  ).toEqual([])
  expect(page.url(), '页内跳转不改地址').toBe(urlBefore)

  // 键盘激活标题：同样跳转，且焦点环可见
  const target1 = tab.locator(jumpHrefs[0])
  await recordScrollTo(page)
  await jumps.first().focus()
  await page.keyboard.press('Enter')
  await expect(target1).toBeFocused()
  await expect
    .poll(async () => Math.abs((await readEntryPortFacts(target1)).gap - 24))
    .toBeLessThanOrEqual(1)
  const focused = await target1.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      visible: el.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth
    }
  })
  expect(focused.visible, '键盘跳转后标题命中 :focus-visible').toBe(true)
  expect(focused.outlineStyle).toBe('solid')
  expect(focused.outlineWidth).toBe('2px')

  // 外链图标：openExternal，且不改变页内滚动位置（先回到顶部，避免 Playwright 为点击自动滚动）
  await tab.locator('.view-scroll').evaluate((el) => {
    ;(el as HTMLElement).scrollTop = 0
  })
  const offsetBeforeIcon = (await readEntryPortFacts(target1)).scrollTop
  await ext.first().click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __stubCalls: Array<[string, string]> }).__stubCalls.filter(
          ([kind]) => kind === 'openExternal'
        )
      )
    )
    .toEqual([['openExternal', 'https://example.com/jump/1']])
  expect(
    Math.abs((await readEntryPortFacts(target1)).scrollTop - offsetBeforeIcon)
  ).toBeLessThanOrEqual(1)
  expect(page.url(), '外链图标不改地址').toBe(urlBefore)

  // reduced-motion：走 behavior=auto，点击返回时已到位（不等动画）
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await recordScrollTo(page)
  await overview.getByRole('link', { name: '无外链条目三', exact: true }).click()
  const rm = await readEntryPortFacts(tab.locator(jumpHrefs[2]))
  expect(Math.abs(rm.gap - 24), 'RM 下即时落点').toBeLessThanOrEqual(1)
  expect(
    await page.evaluate(() => (window as unknown as { __scrollCalls: ScrollToOptions[] }).__scrollCalls.at(-1)?.behavior)
  ).toBe('auto')

  // uiZoom 1.2：同一套落点公式（rect 差值不受 zoom 影响）
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await installArticle(page, 1.2)
  const zoomed = activeTab(page)
  const zoomHref =
    (await zoomed.locator('.juya-overview-jump').nth(3).getAttribute('href')) ?? ''
  const zoomTarget = zoomed.locator(zoomHref)
  expect((await readEntryPortFacts(zoomTarget)).gap, '缩放档跳转前目标在下方').toBeGreaterThan(24)
  await zoomed.getByRole('link', { name: '目录标题漂移', exact: true }).click()
  await expect
    .poll(async () => Math.abs((await readEntryPortFacts(zoomTarget)).gap - 24))
    .toBeLessThanOrEqual(1)
  expect(Math.abs((await readEntryPortFacts(zoomTarget)).gap - 24), 'uiZoom 1.2 落点').toBeLessThanOrEqual(1)
})

test('八种风格：概览标题跳转与末尾外链图标的分工/命中区一致', async ({ context }) => {
  test.setTimeout(90_000)
  const scenarios: Scenario[] = [
    'default',
    'editorial',
    'newsprint',
    'pop',
    'y2k',
    'wabi',
    'dark',
    'nocturne'
  ]
  for (const scenario of scenarios) {
    const page = await context.newPage()
    try {
      await loadApp(page, scenario)
      await openFirstArticle(page)
      // 同上：取默认态颜色（鼠标移出内容区，等 0.2s 颜色过渡结束）
      await page.mouse.move(4, 4)
      await page.waitForTimeout(300)
      const root = activeTab(page).locator('.juya-root')
      // 默认夹具 5 条概览与 5 个条目按编号一一对应；第 5 项无外链
      await expect(root.locator('.juya-overview-jump'), scenario).toHaveCount(5)
      await expect(root.locator('.juya-overview-ext'), scenario).toHaveCount(4)
      const first = root.locator('.juya-overview-ext').first()
      const facts = await first.evaluate((el) => {
        const box = el.getBoundingClientRect()
        const svg = el.querySelector('svg') as SVGElement
        const svgBox = svg.getBoundingClientRect()
        const path = svg.querySelector('path') as SVGPathElement
        const title = el.closest('li')?.querySelector('.juya-overview-jump') as
          | HTMLAnchorElement
          | null
        const jump = title?.getAttribute('href') ?? null
        const readingRoot = el.closest('.juya-root')
        return {
          width: box.width,
          height: box.height,
          iconWidth: svgBox.width,
          iconHeight: svgBox.height,
          fill: getComputedStyle(path).fill,
          color: getComputedStyle(el).color,
          linkColor: title ? getComputedStyle(title).color : null,
          decoration: getComputedStyle(el).textDecorationLine,
          jump,
          targetInsideRoot: Boolean(jump && readingRoot?.querySelector(jump))
        }
      })
      expect(facts.width, `${scenario} 命中区宽`).toBeGreaterThanOrEqual(24)
      expect(facts.height, `${scenario} 命中区高`).toBeGreaterThanOrEqual(24)
      expect(facts.iconWidth, `${scenario} 图标宽`).toBeCloseTo(12, 0)
      expect(facts.iconHeight, `${scenario} 图标高`).toBeCloseTo(12, 0)
      expect(facts.linkColor, `${scenario} 标题链接色可读`).not.toBeNull()
      expect(facts.fill, `${scenario} 图标取链接色`).toBe(facts.linkColor)
      expect(facts.color, `${scenario} 图标链接继承链接色`).toBe(facts.linkColor)
      expect(facts.decoration, `${scenario} 图标不继承概览链接下划线`).toBe('none')
      expect(facts.jump, `${scenario} 同项标题跳转锚点`).toMatch(/-entry-0$/)
      expect(facts.targetInsideRoot, `${scenario} 锚点命中本风格条目标题`).toBe(true)

      // 每种风格都实际跳一次：统一 24px 落点 + 焦点转移，排除某风格丢锚点/丢滚动口
      const target = root.locator(facts.jump as string)
      expect((await readEntryPortFacts(target)).gap, `${scenario} 跳转前目标在下方`).toBeGreaterThan(24)
      await root.locator('.juya-overview-jump').first().click()
      await expect
        .poll(async () => Math.abs((await readEntryPortFacts(target)).gap - 24))
        .toBeLessThanOrEqual(1)
      expect(
        await target.evaluate((el) => el === document.activeElement),
        `${scenario} 跳转后焦点落到条目标题`
      ).toBe(true)
    } finally {
      await page.close()
    }
  }
})

test('keep-alive 双阅读标签：锚点 id 全文档唯一，跳转只动当前阅读页', async ({ page }) => {
  await loadApp(page, 'many')
  const feedItems = page.locator('.juya-feed-item')
  await feedItems.nth(0).click()
  await activeTab(page).locator('.juya-masthead').waitFor({ state: 'visible' })

  // 回主页开第二个期号：两篇来自同一夹具，没有实例前缀时锚点 id 会重复
  await page.locator('[data-tab-id]').filter({ hasText: '主页' }).first().click()
  await feedItems.nth(1).click()
  await activeTab(page).locator('.juya-masthead').waitFor({ state: 'visible' })

  // 活动面板是 min-h-0 w-full，隐藏的 keep-alive 面板是 hidden；只取这一层的面板
  const readers = page.locator(
    'div.flex.h-full > :is(div.min-h-0.w-full, div.hidden):has(.juya-masthead)'
  )
  await expect(readers).toHaveCount(2)
  const facts = await readers.evaluateAll((roots) =>
    roots.map((root) => {
      const scroller = root.querySelector('.view-scroll') as HTMLElement | null
      const jump = root.querySelector('.juya-overview-jump')
      const href = jump?.getAttribute('href') ?? null
      return {
        ids: [...root.querySelectorAll('.juya-entry h3')].map((h) => h.id),
        href,
        targetInsideRoot: Boolean(href && root.querySelector(href)),
        scrollTop: scroller?.scrollTop ?? Number.NaN,
        visible: root.checkVisibility ? root.checkVisibility() : true
      }
    })
  )
  const allIds = facts.flatMap((f) => f.ids)
  expect(allIds, '两个阅读页各 5 个条目锚点').toHaveLength(10)
  expect(new Set(allIds).size, '全文档锚点 id 不重复').toBe(10)
  expect(facts.every((f) => f.href && f.targetInsideRoot), '每个跳转目标都在自己的阅读页内').toBe(true)
  expect(facts[0].href, '两个阅读页的锚点前缀不同').not.toBe(facts[1].href)

  // 在活动阅读页点跳转：只有它滚动，隐藏的另一页保持原位
  const activeIndex = facts.findIndex((f) => f.visible)
  const hiddenIndex = facts.findIndex((f) => !f.visible)
  expect(activeIndex).toBeGreaterThanOrEqual(0)
  expect(hiddenIndex).toBeGreaterThanOrEqual(0)
  const activeHref = facts[activeIndex].href as string
  const activeTarget = readers.nth(activeIndex).locator(activeHref)
  await readers.nth(activeIndex).locator('.juya-overview-jump').first().click()
  await expect
    .poll(async () => Math.abs((await readEntryPortFacts(activeTarget)).gap - 24))
    .toBeLessThanOrEqual(1)
  const after = await readers.evaluateAll((roots) =>
    roots.map((root) => {
      const scroller = root.querySelector('.view-scroll') as HTMLElement | null
      return scroller?.scrollTop ?? Number.NaN
    })
  )
  expect(after[activeIndex], '活动阅读页已滚动').toBeGreaterThan(0)
  expect(after[hiddenIndex], '隐藏阅读页不滚动').toBe(0)
  expect(facts[hiddenIndex].scrollTop, '跳转前隐藏页原位').toBe(0)
})
