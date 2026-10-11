import { test, expect } from '@playwright/test'
import { loadApp, openFirstArticle, activeTab } from './setup'

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

test('暗色模式 + 梦核式：变体切换为 dreamcore-dark', async ({ page }) => {
  await loadApp(page, 'dark')
  await openFirstArticle(page)

  const root = activeTab(page).locator('.juya-root')
  await expect(root).toHaveAttribute('data-juya-variant', 'dreamcore-dark')
  await expect(root).toHaveClass(/jydream/)
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
})
