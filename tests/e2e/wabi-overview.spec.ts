import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { activeTab, loadApp, openFirstArticle } from './setup'

const OVERVIEW_SIZE = 32
const NO_LINK_INDEX = 24
const MISSING_INDEX = 17

const overview = Array.from({ length: OVERVIEW_SIZE }, (_, offset) => {
  const number = offset + 1
  const title =
    number === 1
      ? `第一条中文标题需要完整折行 ${'UnbrokenEnglishSequence'.repeat(5)}`
      : `Overview ${String(number).padStart(2, '0')} 中文标题 ${'Long heading segment '.repeat(3)}`
  const itemTitle = number === NO_LINK_INDEX ? title : `<a href="https://example.com/wabi/${number}">${title}</a>`
  const index = number === MISSING_INDEX ? '' : `<code>#${number}</code>`
  return { number, title, href: number === NO_LINK_INDEX ? null : `https://example.com/wabi/${number}`, index: number === MISSING_INDEX ? null : String(number), html: `<li>${itemTitle} ${index}</li>` }
})

const overviewArticleHtml = `<div>
  <h1>Wabi overview</h1>
  <h2>概览</h2>
  <ul>${overview.map((item) => item.html).join('')}</ul>
  <h2>First section</h2>
  <h3>First entry <code>#1</code></h3>
  <p>The full issue remains available after the overview.</p>
</div>`

async function installArticle(page: Page, contentHtml: string, uiZoom: number): Promise<void> {
  await page.addInitScript(`(() => {
    const data = window.__stubData;
    data.articles[0].contentHtml = ${JSON.stringify(contentHtml)};
    data.settings.uiZoom = ${uiZoom};
  })()`)
  await page.reload()
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  await openFirstArticle(page)
}

async function inspectOverview(page: Page) {
  const root = activeTab(page).locator('.juya-root.jywabi')
  const list = root.locator('.juya-overview')
  await expect(list).toBeVisible()

  const facts = await list.evaluate((element) => {
    const items = [...element.querySelectorAll('li')].map((item) => {
      const index = item.querySelector('.juya-index')?.textContent?.trim() ?? null
      const titleElement = item.querySelector('.juya-overview-text') as HTMLElement
      // 只量标题文字：外链图标是 24×24 命中区，允许溢出文字行盒，不能混进文字矩形断言
      const titleSource = item.querySelector('.juya-overview-jump') ?? titleElement.firstChild
      const range = document.createRange()
      range.selectNodeContents(titleSource as Node)
      const textRects = [...range.getClientRects()].map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      }))
      const rect = item.getBoundingClientRect()
      return {
        title: titleElement.textContent?.trim() ?? '',
        href: item.querySelector('.juya-overview-ext')?.getAttribute('href') ?? null,
        jump: item.querySelector('.juya-overview-jump')?.getAttribute('href') ?? null,
        index,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        textRects,
        scrollWidth: item.scrollWidth,
        clientWidth: item.clientWidth
      }
    })
    const issue = element.closest('.juya-issue') as HTMLElement
    const issueRect = issue.getBoundingClientRect()
    const listRect = element.getBoundingClientRect()
    const rootElement = element.closest('.juya-root') as HTMLElement
    let scroller: HTMLElement | null = rootElement.parentElement
    while (scroller && getComputedStyle(scroller).overflowY !== 'auto') scroller = scroller.parentElement
    return {
      items,
      issueWidth: issueRect.width,
      listWidth: listRect.width,
      scrollOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : null
    }
  })

  expect(facts.items, 'all overview entries remain rendered').toHaveLength(OVERVIEW_SIZE)
  expect(
    facts.items.map(({ title, href, index }) => ({ title, href, index })),
    'titles, numbering, external links, and source order remain intact'
  ).toEqual(overview.map(({ title, href, index }) => ({ title: title.trim(), href, index })))
  expect(facts.items[0].jump, 'the uniquely matched first item gets an in-page jump').toMatch(
    /-entry-0$/
  )
  expect(
    facts.items.slice(1).every(({ jump }) => jump === null),
    'only the uniquely matched entry gets an in-page jump'
  ).toBe(true)
  const hrefs = facts.items.map(({ href }) => href).filter((href): href is string => href !== null)
  expect(hrefs, 'all existing external link targets remain present').toHaveLength(OVERVIEW_SIZE - 1)
  expect(new Set(hrefs).size, 'link targets are unique').toBe(OVERVIEW_SIZE - 1)
  expect(facts.items.every((item) => item.scrollWidth <= item.clientWidth + 1), 'overview rows do not clip horizontally').toBe(true)
  expect(
    facts.items.every((item) => item.textRects.every((rect) => rect.left >= item.left - 1 && rect.right <= item.right + 1 && rect.bottom <= item.bottom + 1)),
    'every title fragment stays inside its row'
  ).toBe(true)
  expect(facts.scrollOverflow, 'reader scroller has no horizontal overflow').toBeLessThanOrEqual(1)

  const columns = new Set(facts.items.map(({ left }) => Math.round(left * 100) / 100)).size
  const visualOrder = [...facts.items]
    .sort((a, b) => Math.round(a.top) - Math.round(b.top) || a.left - b.left)
    .map(({ title }) => title)
  expect(visualOrder, 'visual order advances left to right, then top to bottom').toEqual(overview.map(({ title }) => title.trim()))
  return { columns, geometry: { issueWidth: facts.issueWidth, listWidth: facts.listWidth, scrollOverflow: facts.scrollOverflow } }
}

test('wabi overview uses the zoomed reading width and preserves all 32 entries in row-major order', async ({ page }) => {
  const evidence = join(process.cwd(), 'out', 'wabi-ticket', 'evidence')
  mkdirSync(evidence, { recursive: true })

  await page.setViewportSize({ width: 1280, height: 900 })
  await loadApp(page, 'wabi')
  await installArticle(page, overviewArticleHtml, 1)
  const wide = await inspectOverview(page)
  expect(wide.columns, '1280px at 100% has two columns').toBe(2)
  await page.screenshot({ path: join(evidence, 'overview-1280-100.png'), fullPage: true })

  const expectedHrefs = overview
    .map(({ href }) => href)
    .filter((href): href is string => href !== null)
  const firstJump = activeTab(page).locator('.juya-overview-jump').first()
  const firstExt = activeTab(page).locator('.juya-overview-ext').first()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  let reachedFirstLink = false
  for (let step = 0; step < 100 && !reachedFirstLink; step++) {
    await page.keyboard.press('Tab')
    reachedFirstLink = await firstJump.evaluate((element) => element === document.activeElement)
  }
  expect(reachedFirstLink, 'keyboard Tab reaches the first overview jump link').toBe(true)

  await expect
    .poll(() => firstJump.evaluate((element) => getComputedStyle(element).outlineColor))
    .not.toBe('rgba(0, 0, 0, 0)')
  const focus = await firstJump.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      visible: element.matches(':focus-visible'),
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor
    }
  })
  expect(focus.visible, 'keyboard focus remains visible').toBe(true)
  expect(focus.outlineWidth).toBe('2px')
  expect(focus.outlineStyle).toBe('solid')
  expect(focus.outlineColor).not.toBe('rgba(0, 0, 0, 0)')
  await page.screenshot({ path: join(evidence, 'overview-1280-100-focus.png') })

  // Tab 从标题跳转链接开始：其后依次是各目录项的外链图标（无外链的第 24 项不占位）
  const keyboardHrefs: string[] = []
  for (let index = 0; index < expectedHrefs.length; index++) {
    await page.keyboard.press('Tab')
    keyboardHrefs.push(
      await page.evaluate(() =>
        document.activeElement instanceof HTMLAnchorElement
          ? document.activeElement.getAttribute('href') ?? ''
          : ''
      )
    )
  }
  expect(keyboardHrefs, 'Tab order follows the visible row-major external-link order').toEqual(expectedHrefs)

  // 循环结束时焦点在最后一个外链图标；Shift+Tab 31 次回到标题跳转链接
  for (let step = 0; step < expectedHrefs.length; step++) await page.keyboard.press('Shift+Tab')
  await expect(firstJump).toBeFocused()
  const firstJumpHref = (await firstJump.getAttribute('href')) ?? ''
  const urlBeforeActivation = page.url()

  // 标题 Enter = 页内跳转：焦点转移到目标条目标题，不打开外链
  await page.keyboard.press('Enter')
  await expect(activeTab(page).locator(firstJumpHref)).toBeFocused()
  const afterJump = await page.evaluate(() =>
    (window as unknown as { __stubCalls: Array<[string, string]> }).__stubCalls.filter(
      ([kind]) => kind === 'openExternal'
    )
  )
  expect(afterJump, 'in-page jump must not open the external link').toEqual([])
  expect(page.url(), 'in-page jump does not navigate the reader page').toBe(urlBeforeActivation)

  // 末尾图标 Enter = 外链：仍走 SafeLink → openExternal，且不原地导航
  await firstExt.focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __stubCalls: Array<[string, string]> }).__stubCalls.filter(
          ([kind]) => kind === 'openExternal'
        )
      )
    )
    .toEqual([['openExternal', expectedHrefs[0]]])
  expect(page.url(), 'SafeLink activation does not navigate the reader page').toBe(urlBeforeActivation)

  await page.setViewportSize({ width: 687, height: 900 })
  await installArticle(page, overviewArticleHtml, 1)
  const belowBreakpoint = await inspectOverview(page)
  expect(belowBreakpoint.geometry.listWidth, 'measured usable content width is below 640px').toBeLessThan(640)
  expect(belowBreakpoint.columns, 'below the usable-width breakpoint stays single-column').toBe(1)

  await page.setViewportSize({ width: 688, height: 900 })
  await installArticle(page, overviewArticleHtml, 1)
  const atBreakpoint = await inspectOverview(page)
  expect(atBreakpoint.geometry.listWidth, 'measured usable content width reaches 640px').toBeGreaterThanOrEqual(640)
  expect(atBreakpoint.columns, 'at the usable-width breakpoint the grid opens two columns').toBe(2)

  await page.setViewportSize({ width: 720, height: 900 })
  await installArticle(page, overviewArticleHtml, 1)
  const medium = await inspectOverview(page)
  expect(medium.columns, '720px at 100% has room for two columns').toBe(2)

  await installArticle(page, overviewArticleHtml, 1.2)
  const zoomedMedium = await inspectOverview(page)
  expect(zoomedMedium.columns, 'the same viewport at 120% narrows the usable reading width to one column').toBe(1)

  await page.setViewportSize({ width: 560, height: 900 })
  const narrow = await inspectOverview(page)
  expect(narrow.columns, '560px at 120% uses one column').toBe(1)
  await page.screenshot({ path: join(evidence, 'overview-560-120.png'), fullPage: true })
  console.log(
    '[wabi-overview geometry]',
    JSON.stringify({ wide: wide.geometry, belowBreakpoint: belowBreakpoint.geometry, atBreakpoint: atBreakpoint.geometry, medium: medium.geometry, zoomedMedium: zoomedMedium.geometry, narrow: narrow.geometry })
  )
})

test('wabi overview remains absent when the issue has no overview', async ({ page }) => {
  await loadApp(page, 'wabi')
  await installArticle(
    page,
    '<div><h1>Issue without an overview</h1><h2>Section</h2><h3>First entry</h3><p>Section content stays visible.</p></div>',
    1
  )

  const root = activeTab(page).locator('.juya-root.jywabi')
  await expect(root.locator('.juya-overview')).toHaveCount(0)
  await expect(root.getByText('Section content stays visible.')).toBeVisible()
})
