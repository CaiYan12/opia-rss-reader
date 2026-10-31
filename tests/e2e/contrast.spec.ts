import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { loadApp, openFirstArticle, activeTab } from './setup'

/** 红线 7 的**栅格化实证**（issue #9）：叠加态对比度不能只靠解析式模型，这里量真实像素。
 *
 *  为什么是「滚到滚动口顶端」：`.juya-scene` 是 `position: sticky; top: 0` —— **视口锚定**而非
 *  文档锚定。内容一旦滚上去就落进顶部雾层的峰值区，所以「导语在文档 y≈45%、不被雾覆盖」的
 *  前提不成立；本用例把导语文字行顶到滚动口顶端后取样，即**可达最坏面**。
 *
 *  做法（不采信目测，也不改任何背景层）：
 *    ① 把导语文字设为透明（只去掉字形绘制，雾/底色/遮罩全在）；
 *    ② 截「文字列宽 × 首行 6 行」的条带 → 自写 PNG 解码读真实像素；
 *    ③ **逐列取 6 行中位数**（滤掉 dust 的 1~1.6px 中性点；亮星是 4~7px 稀疏大 tile 装饰层，
 *       落在条带内的概率极低，偶尔命中也被 6 行中位数滤掉）→ 列间取最坏；
 *    ④ 对该像素的合成底算导语文字记号（#13 起为 --jy-lead-text）的 WCAG 对比度。
 *  解析式实算（scripts/nocturne-contrast-audit.mjs）与实测的关系：解析式取雾峰像素（y=0、x=文字
 *  列左缘）并逐层取整，比实测**保守**（当前星尘夜空档：700 +0.089 / 800 +0.159）。
 */

const decodePng = (buf: Buffer) => {
  let off = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat: Buffer[] = []
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`不支持的 PNG：bitDepth=${bitDepth} colorType=${colorType}`)
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + i] : 0
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0
      const x = row[i]
      let v: number
      switch (filter) {
        case 0:
          v = x
          break
        case 1:
          v = x + a
          break
        case 2:
          v = x + b
          break
        case 3:
          v = x + ((a + b) >> 1)
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default:
          throw new Error(`未知 PNG filter ${filter}`)
      }
      out[y * stride + i] = v & 0xff
    }
  }
  const rows: number[][] = []
  for (let y = 0; y < height; y++) {
    const px: number[] = []
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * bpp
      px.push((out[i] << 16) | (out[i + 1] << 8) | out[i + 2])
    }
    rows.push(px)
  }
  return { width, height, rows }
}

// lum / contrast 与 scripts/nocturne-contrast-audit.mjs **同源**（同一套 WCAG sRGB 公式与合成口径）；
// 改动任一处必须同步另一处，否则审计脚本与实测会悄悄分叉。
const lum = (rgb: number) => {
  const ch = [16, 8, 0].map((s) => {
    const v = ((rgb >> s) & 0xff) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
const contrast = (a: number, b: number) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** 从 juya.css 实读 nocturne 变体块的导语专用文字记号 `--jy-lead-text`（#13 / SPEC B1）。
 *  硬编码会让 token 一改就静默测错颜色；取首个 `[data-juya-variant='<variant>'] {` 块内的
 *  6 位 hex —— 与 juyaCssGuard 的 tokenHex、审计脚本的 hex() 同口径。
 *  （#13 起导语不再复用 --jy-muted；仍读 muted 会系统性低估导语对比度。）
 *  2026-10-31 破晓：亮侧也有自己的 --jy-lead-text（#5b5c65），本函数按变体读取。 */
const readLeadText = (variant = 'nocturne-dark'): number => {
  const css = readFileSync(join(__dirname, '../../src/renderer/juya/juya.css'), 'utf-8')
  const block =
    css.match(new RegExp(`\\[data-juya-variant='${variant}'\\]\\s*\\{[^}]*\\}`))?.[0] ?? ''
  const hex = block.match(/--jy-lead-text:\s*#([0-9a-fA-F]{6})/)?.[1]
  if (!hex) throw new Error(`juya.css 的 ${variant} 变体块未解析到 --jy-lead-text`)
  return Number.parseInt(hex, 16)
}
const LEAD_TEXT_LUM = lum(readLeadText('nocturne-dark'))
const LEAD_TEXT_LIGHT_LUM = lum(readLeadText('nocturne-light'))

/** 冻结动效：暗侧刊头 9s 呼吸 + dust 96s 漂移 + 亮星 11s/14s 慢闪、亮侧晨雾 120s
 *  都会让像素逐次不同；冻结后测量可复现（暗侧 dust/亮星关键帧没有静态 opacity ⇒ 冻结保留在 1，
 *  是对己方最不利的一侧，偏保守）。 */
const FREEZE =
  '*, *::before, *::after { animation: none !important; transition: none !important; }'

/** 同一口径的栅格实测：把导语文字行顶到滚动口顶端，隐藏字形后采样真实背景像素。
 *  暗侧（星尘夜空）与亮侧（破晓）共用；差异只在场景与 hover 层，故两者都跑。 */
async function runLeadContrastCase(
  page: Page,
  opts: {
    scenario: 'nocturneSvg' | 'nocturneLightSvg'
    leadLum: number
    vw: number
    label: string
  }
): Promise<void> {
  const { scenario, leadLum, vw, label } = opts
  await page.setViewportSize({ width: vw, height: 800 })
  await loadApp(page, scenario)
  await openFirstArticle(page)
  await page.addStyleTag({ content: FREEZE })
  await page.mouse.move(0, 0) // 默认态：鼠标不在条目上

  const tab = activeTab(page)
  const lead = tab.locator('.juya-lead').first()
  await lead.waitFor({ state: 'visible' })
  await page.addStyleTag({ content: '.juya-lead { color: transparent !important; }' })

  const scroller = tab.locator('.view-scroll').first()
  const padTop = await lead.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingTop))
  const padLeft = await lead.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))
  const padRight = await lead.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingRight))
  const before = { lead: await lead.boundingBox(), port: await scroller.boundingBox() }
  expect(before.lead && before.port, '导语与滚动口的几何量可取').toBeTruthy()
  await scroller.evaluate(
    (el, d) => {
      el.scrollTop += d
    },
    before.lead!.y + padTop - before.port!.y
  )
  await page.waitForTimeout(150)
  const after = { lead: await lead.boundingBox(), port: await scroller.boundingBox() }
  const x0 = after.lead!.x + padLeft
  const x1 = after.lead!.x + after.lead!.width - padRight

  const measure = async (): Promise<number> => {
    await page.waitForTimeout(120)
    const buf = await page.screenshot({
      clip: { x: Math.round(x0), y: Math.round(after.port!.y), width: Math.round(x1 - x0), height: 6 }
    })
    const { rows, width } = decodePng(buf)
    const perColumn: number[] = []
    for (let cx = 0; cx < width; cx++) {
      const lumas = rows.map((r) => lum(r[cx])).sort((a, b) => a - b)
      const surface = lumas[Math.floor(lumas.length / 2)]
      // 暗侧文字比背景亮、亮侧文字比背景暗 —— 必须按亮度大小取比值，不能写死方向。
      const [hi, lo] = surface > leadLum ? [surface, leadLum] : [leadLum, surface]
      perColumn.push((hi + 0.05) / (lo + 0.05))
    }
    return Math.min(...perColumn)
  }

  const defaultWorst = await measure()
  // eslint-disable-next-line no-console
  console.log(
    `[对比度实测] ${label} vw=${vw} 可达最坏面（默认态，导语滚到滚动口顶端）= ${defaultWorst.toFixed(4)}:1`
  )
  expect(
    defaultWorst,
    `${label}：导语 --jy-lead-text 对合成底须 ≥ 4.5（实测 ${defaultWorst.toFixed(4)}）`
  ).toBeGreaterThanOrEqual(4.5)

  // hover 态：暗侧已撤背景微亮（边框提亮不参与文字合成）；亮侧保留共享 4% 暗层 ——
  // 两种路径都必须 ≥ 4.5，亮侧的 4% 层正是 muted 旧账 4.32 的来源，必须实测确认新 token 有余量。
  const entry = tab.locator('article.juya-entry').first()
  const eb = await entry.boundingBox()
  expect(eb, '条目几何可取').toBeTruthy()
  await page.mouse.move(eb!.x + eb!.width / 2, eb!.y + Math.min(60, eb!.height / 2))
  const hoverWorst = await measure()
  // eslint-disable-next-line no-console
  console.log(`[对比度实测] ${label} vw=${vw} 条目 hover ∩ 导语 = ${hoverWorst.toFixed(4)}:1`)
  expect(
    hoverWorst,
    `${label}（hover 态）：悬停条目时导语 --jy-lead-text 仍须 ≥ 4.5（实测 ${hoverWorst.toFixed(4)}）`
  ).toBeGreaterThanOrEqual(4.5)
}

for (const vw of [480, 700, 800]) {
  test(`暗侧叠加态可达最坏面（${vw}px）：导语 --jy-lead-text ≥ 4.5（含 hover）`, async ({ page }) => {
    await runLeadContrastCase(page, {
      scenario: 'nocturneSvg',
      leadLum: LEAD_TEXT_LUM,
      vw,
      label: '暗侧星尘夜空'
    })
  })
  test(`亮侧破晓可达最坏面（${vw}px）：导语 --jy-lead-text ≥ 4.5（含 hover）`, async ({ page }) => {
    await runLeadContrastCase(page, {
      scenario: 'nocturneLightSvg',
      leadLum: LEAD_TEXT_LIGHT_LUM,
      vw,
      label: '亮侧破晓'
    })
  })
}

/** #13 / SPEC 批次 B1：条目标题编号取 accent、**无微光**；概览序号保留 accent + 微光。
 *  为什么必须在真实 DOM 上量计算样式：静态守卫只能证明 juya.css 里写了一条后代形态规则，
 *  证明不了它**真的命中**嵌套结构 —— `EntrySplit` 把 h3 嵌在 `.juya-entry-row > .juya-entry-body`，
 *  写成 `>` 子选择器时 CSS 文本完全合法、规则却静默失效（本仓已踩过两次）。此处的 computed
 *  color/filter 正是「有无微光区分两个编号角色」的落实证据。 */
test('nocturne 暗侧：条目标题编号取 accent 无微光，概览序号保留微光（选择器真的命中）', async ({
  page
}) => {
  await loadApp(page, 'nocturneSvg')
  await openFirstArticle(page)
  const tab = activeTab(page)

  const entryIndex = tab.locator('.juya-entry .juya-index').first()
  await expect(entryIndex).toBeVisible()
  const entryStyle = await entryIndex.evaluate((el) => {
    const s = getComputedStyle(el)
    return { color: s.color, filter: s.filter, opacity: s.opacity }
  })
  expect(entryStyle.color, '条目标题编号应取 --jy-accent #6e7bff').toBe('rgb(110, 123, 255)')
  expect(entryStyle.filter, '条目标题编号不得加微光（两个角色靠有无微光区分）').toBe('none')
  expect(entryStyle.opacity, '编号不得降 alpha（会掉出 AA）').toBe('1')

  const overviewIndex = tab.locator('.juya-overview .juya-index').first()
  await expect(overviewIndex).toBeVisible()
  const overviewStyle = await overviewIndex.evaluate((el) => {
    const s = getComputedStyle(el)
    return { color: s.color, filter: s.filter }
  })
  expect(overviewStyle.color, '概览序号颜色不变（accent）').toBe('rgb(110, 123, 255)')
  expect(overviewStyle.filter, '概览序号的既有微光须保留').toContain('drop-shadow')
})

/** #12 / SPEC 批次 B5a：内容区配色方案（区域级，与主题级根元素互不覆盖）。
 *  为什么只能断言计算样式：headless Chromium 不绘制滚动条（真实窗口目视由用户执行）。
 *  声明落在滚动容器 .view-scroll 上（:has 向上匹配后代 .jynoct），滚动条与原生控件取容器的
 *  used color-scheme；applyTheme 无条件写根元素是**主题级**，不得被本票改动。 */
test('nocturne 暗侧：订阅页与阅读页滚动容器计算 colorScheme 为 dark，亮色根方案不覆盖', async ({
  page
}) => {
  await loadApp(page, 'nocturne')
  const schemeOf = (locator: Locator) =>
    locator.evaluate((el) => getComputedStyle(el).colorScheme)

  const home = activeTab(page).locator('.view-scroll').first()
  await expect(home).toBeVisible()
  expect(await schemeOf(home), '订阅页滚动容器应为暗色方案').toBe('dark')

  // 模拟「亮色应用主题」：主题注入链路的唯一落点就是根元素的 colorScheme
  await page.evaluate(() => {
    document.documentElement.style.colorScheme = 'light'
  })
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    '根元素此时为亮色方案'
  ).toBe('light')
  expect(await schemeOf(home), '亮色主题叠加时订阅页内容区仍呈暗色').toBe('dark')

  await openFirstArticle(page)
  const reader = activeTab(page).locator('.view-scroll').first()
  await expect(reader).toBeVisible()
  await expect(activeTab(page).locator('.jynoct')).toHaveCount(1)
  expect(await schemeOf(reader), '阅读页滚动容器应为暗色方案（不跟随亮色根）').toBe('dark')
  // 内容根是滚动容器的后代，配色由容器声明向下继承（单一来源在滚动容器）
  expect(await reader.locator('.juya-root').count(), '内容根应在滚动容器内').toBe(1)
})
