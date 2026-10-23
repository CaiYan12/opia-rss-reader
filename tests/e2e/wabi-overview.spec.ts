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
      const titleElement = [...item.children].find((child) => !child.classList.contains('juya-index')) as HTMLElement
      const range = document.createRange()
      range.selectNodeContents(titleElement)
      const textRects = [...range.getClientRects()].map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      }))
      const rect = item.getBoundingClientRect()
      return {
        title: titleElement.textContent?.trim() ?? '',
        href: titleElement instanceof HTMLAnchorElement ? titleElement.href : null,
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
    'titles, numbering, links, and source order remain intact'
  ).toEqual(overview.map(({ title, href, index }) => ({ title: title.trim(), href, index })))
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
  const firstLink = activeTab(page).locator('.juya-overview a').first()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  let reachedFirstLink = false
  for (let step = 0; step < 100 && !reachedFirstLink; step++) {
    await page.keyboard.press('Tab')
    reachedFirstLink = await firstLink.evaluate((element) => element === document.activeElement)
  }
  expect(reachedFirstLink, 'keyboard Tab reaches the first overview link').toBe(true)

  await expect
    .poll(() => firstLink.evaluate((element) => getComputedStyle(element).outlineColor))
    .not.toBe('rgba(0, 0, 0, 0)')
  const focus = await firstLink.evaluate((element) => {
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

  const keyboardHrefs: string[] = []
  for (let index = 0; index < expectedHrefs.length; index++) {
    keyboardHrefs.push(
      await page.evaluate(() =>
        document.activeElement instanceof HTMLAnchorElement ? document.activeElement.href : ''
      )
    )
    if (index < expectedHrefs.length - 1) await page.keyboard.press('Tab')
  }
  expect(keyboardHrefs, 'Tab order follows the visible row-major link order').toEqual(expectedHrefs)

  for (let step = 1; step < expectedHrefs.length; step++) await page.keyboard.press('Shift+Tab')
  await expect(firstLink).toBeFocused()
  const urlBeforeActivation = page.url()
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
