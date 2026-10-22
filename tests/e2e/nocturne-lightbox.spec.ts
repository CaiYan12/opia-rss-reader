import { test, expect, type Page, type Locator } from '@playwright/test'
import { loadApp, openFirstArticle, activeTab } from './setup'

/** 点击图片放大查看（#21 / SPEC 批次 B5b）。
 *  口径：只断言**外部可观察行为** —— 原生 `<dialog>` 是否进入模态、大图 src 与源图一致、
 *  浏览器是否发起新请求、外链分流是否被吞、RM 下动画是否真被撤掉。
 *  负对照：被 `<a>` 包裹的图**不得**打开放大视图（否则会吞掉「点图跳原文」）。 */

/** 打开阅读页并返回第一条条目（场景自带 1 张裸图 + 1 张链接图 + 1 张裸图回流带）。 */
async function openLightboxEntry(page: Page): Promise<Locator> {
  await loadApp(page, 'nocturneLightbox')
  await openFirstArticle(page)
  return activeTab(page).locator('article.juya-entry').first()
}

/** 放大视图根（portal 到 document.body，不在活动标签容器内，故用页面级定位）。 */
function lightbox(page: Page): Locator {
  return page.locator('dialog.jynoct-lightbox')
}

test('点击裸图：原生 dialog 放大视图打开，大图 src 与源图一致且不发新请求', async ({ page }) => {
  const entry = await openLightboxEntry(page)
  const bare = entry.locator('img[alt="裸图"]')
  await expect(bare).toBeVisible()
  const src = await bare.getAttribute('src')
  expect(src, '夹具裸图应有 src').toBeTruthy()
  // 关闭态不渲染 dialog（零常驻 DOM、零常驻焦点陷阱）
  await expect(lightbox(page)).toHaveCount(0)

  const imageRequests: string[] = []
  page.on('request', (r) => {
    if (r.resourceType() === 'image') imageRequests.push(r.url())
  })

  await bare.click()

  const dialog = lightbox(page)
  await expect(dialog).toBeVisible()
  // 原生模态能力：open 属性 + dialog 语义 + 无障碍名（焦点陷阱 / ESC 由浏览器提供，不手写）
  await expect(dialog).toHaveAttribute('open', '')
  await expect(page.getByRole('dialog', { name: '图片放大查看' })).toBeVisible()

  const big = dialog.locator('img')
  await expect(big).toHaveAttribute('src', src as string)
  // T3 留下的义务：正文流 brightness(.88) 不得作用于放大图；按比例完整可见不裁切
  const style = await big.evaluate((el) => {
    const s = getComputedStyle(el)
    return { filter: s.filter, objectFit: s.objectFit }
  })
  expect(style, '放大图必须 filter: none + object-fit: contain').toEqual({
    filter: 'none',
    objectFit: 'contain'
  })
  expect(imageRequests, '只用已加载的 src，不发起新请求').toEqual([])
})

test('事件委托覆盖任意张数：第 3 张裸图（通栏回流带）同样能放大', async ({ page }) => {
  const entry = await openLightboxEntry(page)
  const overflow = entry.locator('.jynoct-overflow-media img').first()
  await expect(overflow).toBeVisible()
  const src = await overflow.getAttribute('src')
  await overflow.click()
  await expect(lightbox(page).locator('img')).toHaveAttribute('src', src as string)
})

test('链接包裹的图：不打开放大视图，仍走既有外链分流', async ({ page }) => {
  const entry = await openLightboxEntry(page)
  const linked = entry.locator('a img[alt="链接图"]')
  await expect(linked).toBeVisible()

  await linked.click()

  await expect(lightbox(page), '链接图不得被放大视图拦截').toHaveCount(0)
  const external = await page.evaluate(() =>
    window.__stubCalls.filter(([kind]) => kind === 'openExternal')
  )
  expect(external, '链接图应走既有外链分流（openExternal）').toEqual([
    ['openExternal', 'https://example.com/linked-image']
  ])
  expect(page.url(), '不得发生页内导航').toBe('http://localhost:4173/')
})

test('ESC 关闭放大视图', async ({ page }) => {
  const entry = await openLightboxEntry(page)
  await entry.locator('img[alt="裸图"]').click()
  await expect(lightbox(page)).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(lightbox(page)).toHaveCount(0)
})

test('点击遮罩关闭放大视图', async ({ page }) => {
  const entry = await openLightboxEntry(page)
  await entry.locator('img[alt="裸图"]').click()
  await expect(lightbox(page)).toBeVisible()

  // 视口左上角必在 dialog 盒外的 ::backdrop 上
  await page.mouse.click(6, 6)

  await expect(lightbox(page)).toHaveCount(0)
})

test('prefers-reduced-motion：放大视图无开合动画（对照：正常态确有动画）', async ({ page }) => {
  const entry = await openLightboxEntry(page)
  const bare = entry.locator('img[alt="裸图"]')
  const readMotion = () =>
    lightbox(page).evaluate((el) => {
      const img = el.querySelector('img')
      const backdrop = getComputedStyle(el, '::backdrop')
      return {
        panel: img ? getComputedStyle(img).animationName : 'missing',
        backdrop: backdrop.animationName,
        animations: el.getAnimations({ subtree: true }).length
      }
    })

  // 对照档：正常偏好下确实挂了开合动画（证明下面 RM 的 none 不是「本来就没有」）
  await bare.click()
  await expect(lightbox(page)).toBeVisible()
  const normal = await readMotion()
  expect(normal.panel).toContain('jy-noct-lightbox')
  // 160ms 入场动画在 CI 上可能在读取前就结束，getAnimations() 计数会假阴性；
  // 用计算样式证明动画确实挂载且时长为非零（RM 档再单独断言计数为 0）。
  const normalDuration = await lightbox(page).evaluate((el) => {
    const img = el.querySelector('img')
    return img ? getComputedStyle(img).animationDuration : 'missing'
  })
  expect(normalDuration).not.toBe('0s')
  await page.keyboard.press('Escape')
  await expect(lightbox(page)).toHaveCount(0)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await bare.click()
  await expect(lightbox(page)).toBeVisible()
  expect(await readMotion(), 'RM 下面板与遮罩均无动画').toEqual({
    panel: 'none',
    backdrop: 'none',
    animations: 0
  })
})
