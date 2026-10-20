import { test, expect } from '@playwright/test'
import { loadApp, openFirstArticle, activeTab } from './setup'

/** nocturne-dark 右边缘几何（2026-10-20，#16 / SPEC 批次 B2b）。
 *
 *  基准 = 栏目 h2 横线右缘（即正文文字右缘）；不用 issue 外缘 —— issue 外缘到内容栏之间是
 *  容器内衬（`.juya-issue` 的 24px），不是设计边界。
 *
 *  三处必须收在同一内容栏边界上：
 *    ① 栏目 h2 发丝线（基准）；
 *    ② 概览条目分隔线（`li + li::after`，绝对定位的伪元素）；
 *    ③ 阅读页图片：宽屏右列图版 + 窄窗单列图 + 通栏回流带。
 *
 *  断言一律用**相对值**（两个元素边缘的差值），不锁绝对坐标 —— 绝对坐标随视口、滚动条宽度、
 *  zoom、字体度量漂移；差值才是「同一条边界」这个设计意图本身。
 *  覆盖 560（窄窗）/ 800（常规）/ 1320（宽屏）三视口。
 *
 *  分隔线的量法：绝对定位伪元素的客户区矩形不能直接 `getBoundingClientRect`，但 `left`/`right`
 *  的 CSSOM resolved value 对定位元素是**使用值**（px），故 `li` 的 padding-box 右缘 − right 内缩
 *  = 分隔线右缘。containing block 是 li 的 padding box，而 li 无边框 ⇒ padding-box 边缘 == li
 *  边框盒边缘。这样量到的仍是真实布局结果，不是把 CSS 声明抄一遍当断言。 */

const VIEWPORTS = [560, 800, 1320] as const

type Box = { left: number; right: number; width: number }

for (const width of VIEWPORTS) {
  test(`nocturne 右边缘三处对齐内容栏边界（${width} 视口）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await loadApp(page, 'nocturneSvg')
    await openFirstArticle(page)

    const root = activeTab(page).locator('.juya-root')
    await expect(root).toBeVisible()

    const geo = await root.evaluate((el) => {
      const box = (n: Element | null): Box | null => {
        if (!n) return null
        const r = n.getBoundingClientRect()
        return { left: r.left, right: r.right, width: r.width }
      }
      const h2 = el.querySelector('.juya-section > h2')
      const plateImg = el.querySelector('.juya-entry-figure img')
      const overflowImgs = [...el.querySelectorAll('.jynoct-overflow-media img')]
      const lis = [...el.querySelectorAll('.juya-overview li')]
      const sepLi = lis[1] ?? null
      const sep = sepLi ? getComputedStyle(sepLi, '::after') : null
      const liBox = box(sepLi)
      // 分隔线左右内缩的**使用值**（定位元素的 CSSOM resolved value 为 px）
      const insetLeft = sep ? Number.parseFloat(sep.left) : Number.NaN
      const insetRight = sep ? Number.parseFloat(sep.right) : Number.NaN
      return {
        h2: box(h2),
        h2BorderBottom: h2 ? getComputedStyle(h2).borderBottomWidth : '',
        plate: box(plateImg),
        overflowFirst: box(overflowImgs[0] ?? null),
        overflowLast: box(overflowImgs.at(-1) ?? null),
        overflowCount: overflowImgs.length,
        sepLi: liBox,
        sepInsetLeft: insetLeft,
        sepInsetRight: insetRight,
        // 分隔线的真实边缘 = li padding-box 边缘 ∓ 内缩量
        sepLeft: liBox && Number.isFinite(insetLeft) ? liBox.left + insetLeft : Number.NaN,
        sepRight: liBox && Number.isFinite(insetRight) ? liBox.right - insetRight : Number.NaN
      }
    })

    // 基准本身必须存在：栏目线是 1px 实线，否则「对齐基准」无从谈起
    expect(geo.h2, '栏目 h2 应可取到').toBeTruthy()
    expect(geo.h2BorderBottom, '栏目 h2 应有 1px 发丝线（对齐基准）').toBe('1px')
    expect(geo.h2!.width, '内容栏应有非零宽度').toBeGreaterThan(100)
    expect(Number.isFinite(geo.sepLeft), '分隔线左内缩应为可用值').toBe(true)
    expect(Number.isFinite(geo.sepRight), '分隔线右内缩应为可用值').toBe(true)

    // eslint-disable-next-line no-console
    console.log(
      `[T5 ${width} 实测] h2=[${geo.h2!.left.toFixed(2)}, ${geo.h2!.right.toFixed(2)}] ` +
        `plate=[${geo.plate?.left.toFixed(2)}, ${geo.plate?.right.toFixed(2)}] ` +
        `sep=[${geo.sepLeft.toFixed(2)}, ${geo.sepRight.toFixed(2)}] ` +
        `overflowLast=[${geo.overflowLast?.left.toFixed(2) ?? 'n/a'}, ${geo.overflowLast?.right.toFixed(2) ?? 'n/a'}] ` +
        `偏差(plate/sep 右)=${(geo.plate!.right - geo.h2!.right).toFixed(2)}/${(geo.sepRight - geo.h2!.right).toFixed(2)}`
    )

    // ① 概览分隔线 == 栏目线（左右缘同式）
    expect(Math.abs(geo.sepLeft - geo.h2!.left), `概览分隔线左缘应贴内容栏左边界`).toBeLessThanOrEqual(1)
    expect(Math.abs(geo.sepRight - geo.h2!.right), `概览分隔线右缘应贴内容栏右边界`).toBeLessThanOrEqual(1)

    // ② 图片（右列图版）右缘 == 栏目线右缘。宽屏右列是 200px 图列（左缘是正文/图列分界，
    // 不是内容栏边界），故左缘只在 ≤640px 单列回落、图铺满内容列时才成立 —— 条件断言，不硬套。
    expect(geo.plate, '首条应有右列图版').toBeTruthy()
    expect(Math.abs(geo.plate!.right - geo.h2!.right), '右列图版右缘应贴内容栏右边界').toBeLessThanOrEqual(1)
    if (width <= 640) {
      expect(Math.abs(geo.plate!.left - geo.h2!.left), '窄窗单列图左缘应贴内容栏左边界').toBeLessThanOrEqual(1)
    }

    // ③ 通栏回流带（含窄窗单列回流图）：首图左缘 + 末图右缘 == 栏目线
    expect(geo.overflowCount, '首条应有回流图（2 张）').toBe(2)
    expect(geo.overflowFirst, '回流带首图应可取到').toBeTruthy()
    expect(geo.overflowLast, '回流带末图应可取到').toBeTruthy()
    expect(Math.abs(geo.overflowFirst!.left - geo.h2!.left), '回流带左缘应贴内容栏左边界').toBeLessThanOrEqual(1)
    expect(Math.abs(geo.overflowLast!.right - geo.h2!.right), '回流带右缘应贴内容栏右边界').toBeLessThanOrEqual(1)

    // ④ 悬停底色仍允许外溢：li 自身（hover 背景盒）必须比内容栏宽 —— 这是交互反馈，不是漂移。
    // 「底色比线宽」的形态由此结构保证：li 盒 = 内容栏 ± 同一记号，而分隔线已内缩回内容栏。
    expect(geo.sepLi, '概览条目 li 应可取到').toBeTruthy()
    expect(
      geo.sepLi!.width - geo.h2!.width,
      'hover 背景盒应比内容栏宽（底色外溢、分隔线内缩）'
    ).toBeGreaterThan(4)
  })
}
