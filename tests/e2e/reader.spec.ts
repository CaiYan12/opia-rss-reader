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
