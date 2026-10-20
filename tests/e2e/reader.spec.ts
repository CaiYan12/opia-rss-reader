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
  // 容差 2px 的**唯一**来源是既有的 `.jynoct .juya-entry { padding: 4px 2px 18px }`（#8 期就有的
  // 条目内衬，正文段落同样吃这 2px），不是本票引入的几何 —— 本票只复位图宽，不碰条目内衬。
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


