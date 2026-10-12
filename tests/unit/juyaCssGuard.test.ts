import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JUYA_STYLES } from '../../src/renderer/juya/juyaStyles'

// juya.css 静态守卫（与 ipcContract 静态守卫同思路，不渲染、纯文本断言）：
// 1) 变体覆盖必须写成复合选择器（[data-juya-variant='x'].jyY…）。
//    空格后代形式要求风格类是 variant 元素的后代，而两者恒挂同一根元素，
//    规则永不匹配（曾致 folio-dark / y2k-dark / nocturne-light 覆盖整体失效的死代码）。
// 2) folio 亮/暗变体的 muted 文本对其出现的两种底色（bg / lead-bg）须达 WCAG AA（≥4.5）。
// 3) y2k 视觉审计守卫组（2026-10-11，建议①-⑦）：中文字体栈、段首缩进、条目标题层级、
//    亮侧铬字对比度（WCAG 实算）、星光瓷砖降噪、地平网格入视口、装饰伪元素 AT 静默 + @supports 回退。

const css = readFileSync(join(process.cwd(), 'src/renderer/juya/juya.css'), 'utf-8')

/** 块内某声明的完整右值（`prop: value;` → `value`；找不到返空串）。
 *  提升为模块级供 #5 阅读窗守卫组复用（此前各守卫组内各写一份） */
const decl = (block: string, prop: string): string =>
  block.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;}]+)`))?.[1]?.trim() ?? ''

/** 声明里的 px 数值列表（`px(rule, prop)` 的便捷签名见 #5 守卫组内 `pxOf`） */
const pxValues = (value: string): number[] =>
  [...value.matchAll(/([\d.]+)px/g)].map((m) => Number.parseFloat(m[1]))

/** 相对亮度（WCAG sRGB 公式） */
const lum = (rgb: number): number => {
  const channels = [rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** 对比度（1..21） */
const contrast = (a: number, b: number): number => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** 取变体 token 块（首个 `[data-juya-variant='<variant>'] {` 块） */
const variantBlock = (variant: string): string =>
  css.match(new RegExp(`\\[data-juya-variant='${variant}'\\]\\s*\\{[^}]*\\}`))?.[0] ?? ''

/** 取变体 token 块内 6 位 hex 颜色值 */
const tokenHex = (block: string, name: string): number => {
  const hex = block.match(new RegExp(`${name.replace(/-/g, '\\-')}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? ''
  return Number.parseInt(hex.slice(1), 16)
}

/** 首条形如 `.jyy2k <rest> { … }` 的规则块（行首锚定，排除变体前缀复合选择器同名规则） */
const y2kRule = (rest: string): string =>
  css.match(new RegExp(`(?:^|\\n)\\.jyy2k ${rest} \\{[^}]*\\}`))?.[0] ?? ''

/** 首条形如 `.jypop <rest> { … }` 的规则块（行首锚定，同 y2kRule） */
const popRule = (rest: string): string =>
  css.match(new RegExp(`(?:^|\\n)\\.jypop ${rest} \\{[^}]*\\}`))?.[0] ?? ''

/** 首条形如 `.jynoct <rest> { … }` 的规则块（行首锚定，排除变体前缀复合选择器同名规则）；
 *  nocturne 各守卫组共用（#3 字体、#8 图文回流） */
const noctRule = (rest: string): string =>
  css.match(new RegExp(`(?:^|\\n)\\.jynoct ${rest} \\{[^}]*\\}`))?.[0] ?? ''

/** 取首个匹配 opener 的完整块（花括号配平，可正确处理嵌套规则的媒体查询/支持查询块） */
const extractBlock = (src: string, opener: RegExp): string => {
  const m = src.match(opener)
  if (!m || m.index === undefined) return ''
  let depth = 0
  for (let i = m.index + m[0].length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(m.index, i + 1)
    }
  }
  return ''
}

/** 取全部匹配 opener 的完整块（同名媒体查询可能分散多处） */
const extractBlocks = (src: string, opener: RegExp): string[] => {
  const blocks: string[] = []
  let rest = src
  for (;;) {
    const block = extractBlock(rest, opener)
    if (!block) break
    blocks.push(block)
    rest = rest.replace(block, '')
  }
  return blocks
}

describe('juya.css 静态守卫', () => {
  it('变体覆盖不得使用「变体前缀 + 空格 + 风格类」的死形态', () => {
    const dead = css.match(/\[data-juya-variant='[^']+'\]\s+\.jy[\w-]*/g) ?? []
    expect(dead).toEqual([])
  })

  it('folio 亮/暗 muted 文本对 bg 与 lead-bg 的对比度 ≥ 4.5（WCAG AA）', () => {
    for (const variant of ['folio-light', 'folio-dark']) {
      const block = variantBlock(variant)
      const muted = tokenHex(block, '--jy-muted')
      const bg = tokenHex(block, '--jy-bg')
      const leadBg = tokenHex(block, '--jy-lead-bg')
      expect(muted, `${variant} --jy-muted 应为 6 位 hex`).not.toBeNaN()
      expect(bg, `${variant} --jy-bg 应为 6 位 hex`).not.toBeNaN()
      expect(leadBg, `${variant} --jy-lead-bg 应为 6 位 hex`).not.toBeNaN()
      expect(contrast(muted, bg), `${variant} muted/bg`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(muted, leadBg), `${variant} muted/lead-bg`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('y2k 视觉审计守卫（2026-10-11 建议①-⑦）', () => {
  it('① 中文字体栈落地：正文衬线 SimSun/NSimSun/DengXian、标题黑体 SimHei/雅黑、伪标题栏等宽', () => {
    for (const variant of ['y2k-light', 'y2k-dark']) {
      const block = variantBlock(variant)
      expect(
        block,
        `${variant} --jy-font-body 应为中文衬线栈`
      ).toMatch(/--jy-font-body:\s*'SimSun',\s*'NSimSun',\s*'DengXian',\s*serif/)
      expect(
        block,
        `${variant} --jy-font-heading 应为中文黑体栈`
      ).toMatch(/--jy-font-heading:\s*'SimHei',\s*'Microsoft YaHei',\s*sans-serif/)
      expect(block, `${variant} 不应残留 Noto Sans SC 兜底`).not.toContain('Noto Sans SC')
    }
    expect(
      y2kRule('.juya-masthead::before'),
      '伪标题栏（等宽装饰件）应为 Courier New'
    ).toContain("font-family: 'Courier New', monospace")
  })

  it('② 正文段落段首缩进 2em，且排除「相关链接」标签', () => {
    const rule = y2kRule('\\.juya-entry p:not\\(\\.juya-links-label\\)')
    expect(rule).toBeTruthy()
    expect(rule).toContain('text-indent: 2em')
  })

  it('③ 共享层条目标题改后代形态：EntrySplit 嵌套 h3 恢复 17px（y2k 兜底移除）', () => {
    // `.juya-entry > h3` 子选择器打不中 EntrySplit 的 .juya-entry-row 嵌套
    // （曾致 y2k/nocturne/editorial 阅读页标题丢失样式）；共享层锁定后代形态。
    const shared = css.match(/(?:^|\n)\.juya-entry h3 \{[^}]*\}/)?.[0] ?? ''
    expect(shared, '共享层 .juya-entry h3 应存在且 17px').toContain('font-size: 17px')
    expect(css.match(/(?:^|\n)\.juya-entry h3 a \{[^}]*\}/)?.[0] ?? '', '共享层标题链接应为后代形态').toBeTruthy()
    expect(css, '共享层不得残留 .juya-entry > h3 子选择器死形态').not.toMatch(/(?:^|\n)\.juya-entry > h3/)
    // editorial 同用 EntrySplit，自有覆盖必须同步后代形态
    const edit = css.match(/(?:^|\n)\.jyedit \.juya-entry h3 \{[^}]*\}/)?.[0] ?? ''
    expect(edit, 'editorial 覆盖应为后代形态且 20px').toContain('font-size: 20px')
    expect(css, '共享层修复后 y2k 兜底应已移除').not.toMatch(/(?:^|\n)\.jyy2k \.juya-entry h3 \{/)
  })

  it('④ 亮侧铬面刊头字渐变末端对亮底 ≥ 3:1（大文本 AA），暗侧渐变保持不变', () => {
    // 守卫只锚定共享 `.jyy2k .juya-masthead h1` 规则（亮侧生效档）；暗侧有完整覆盖规则不受影响
    const shared = y2kRule('.juya-masthead h1')
    expect(shared).toBeTruthy()
    const stops = [...shared.matchAll(/#([0-9a-fA-F]{6})/g)].map((m) => Number.parseInt(m[1], 16))
    expect(stops.length, '铬面渐变应有 ≥3 个停靠点').toBeGreaterThanOrEqual(3)
    const end = stops[stops.length - 1]
    const light = variantBlock('y2k-light')
    const card = tokenHex(light, '--jy-card')
    const leadBg = tokenHex(light, '--jy-lead-bg')
    expect(card, 'y2k-light --jy-card 应为 6 位 hex').not.toBeNaN()
    expect(leadBg, 'y2k-light --jy-lead-bg 应为 6 位 hex').not.toBeNaN()
    expect(contrast(end, card), '渐变末端/卡底').toBeGreaterThanOrEqual(3)
    expect(contrast(end, leadBg), '渐变末端/导语底').toBeGreaterThanOrEqual(3)
    // 上白高光 + 下暗描边双影（text-shadow 在 background-clip:text 下会盖住渐变填充，落地用 drop-shadow）
    expect(
      css.match(/\[data-juya-variant='y2k-light'\]\.jyy2k \.juya-masthead h1 \{[^}]*\}/)?.[0] ?? ''
    ).toContain('filter: drop-shadow')
    // 暗侧 3.73:1 已合格，勿破坏：末端深档锁定 #5c77a8
    const darkRule = css.match(/\[data-juya-variant='y2k-dark'\]\.jyy2k \.juya-masthead h1 \{[^}]*\}/)?.[0] ?? ''
    expect(darkRule).toContain('#5c77a8')
  })

  it('⑤ 星光瓷砖降噪：160px 双层错相平铺，透明度亮 0.4 / 暗 0.3', () => {
    for (const [variant, opacity] of [
      ['y2k-light', '0.4'],
      ['y2k-dark', '0.3']
    ] as const) {
      const block = variantBlock(variant)
      expect(block, `${variant} 应保留星光 SVG 材质`).toContain('data:image/svg+xml')
      expect(
        [...block.matchAll(/width='160' height='160'/g)].length,
        `${variant} 星光砖应为 160px 且双层`
      ).toBe(2)
      expect(block, `${variant} 不应残留 56px 旧砖`).not.toContain("width='56'")
      expect(
        [...block.matchAll(new RegExp(`fill-opacity='${opacity}'`, 'g'))].length,
        `${variant} 星光透明度应为 ${opacity}（双层各一）`
      ).toBe(2)
      expect(block, `${variant} 双层应错相平铺`).toContain('background-position:')
    }
  })

  it('⑥ y2k 暗地平网格抬入视口：bottom 136px，网格线透明度 0.28→0.35', () => {
    expect(
      css.match(/\[data-juya-variant='y2k-dark'\]\.jyy2k \.juya-scene-grid \{[^}]*\}/)?.[0] ?? ''
    ).toContain('bottom: 136px')
    expect(css).toContain('--jy-scene-grid-line: rgba(91, 157, 255, 0.35)')
    expect(css, '旧透明度 0.28 不应残留').not.toContain('--jy-scene-grid-line: rgba(91, 157, 255, 0.28)')
  })

  it('⑦ 装饰性伪元素对辅助技术静默（content 空 alt 语法）+ 刊头字 @supports 回退', () => {
    expect(y2kRule('.juya-masthead::before'), '伪标题栏装饰文案应静默').toContain("/ '';")
    expect(css).toContain("content: '×' / '';")
    expect(css).toContain("content: ' ↗' / '';")
    expect(css).toContain("content: '» ' / '';")
    const fallback = css.match(/@supports not \(background-clip: text\) \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(fallback, '应存在铬字 @supports 回退块').toBeTruthy()
    expect(fallback).toContain('.jyy2k .juya-masthead h1')
    expect(fallback).toContain('color: var(--jy-heading)')
  })
})

describe('pop 视觉审计守卫（2026-10-11 建议①a②b③④⑤⑥⑦，用户批准）', () => {
  it('⑦ 暗色减黄：heading 米白 #f2f2ea、border 仍荧光黄 #ffe957，硬阴影暗侧深紫覆盖（三选择器复合形态）', () => {
    const dark = variantBlock('pop-dark')
    expect(dark).toContain('--jy-heading: #f2f2ea')
    expect(dark, 'border 保留荧光黄（减黄只减 heading）').toContain('--jy-border: #ffe957')
    expect(variantBlock('pop-light'), '亮色 heading 不得被误改').toContain('--jy-heading: #141414')
    const override =
      css.match(
        /\[data-juya-variant='pop-dark'\]\.jypop \.juya-entry,\n\[data-juya-variant='pop-dark'\]\.jypop \.juya-masthead,\n\[data-juya-variant='pop-dark'\]\.jypop \.juya-feed-item \{[^}]*\}/
      )?.[0] ?? ''
    expect(override, '暗侧硬阴影覆盖（entry/masthead/feed-item）应存在且为复合选择器').toBeTruthy()
    expect(override).toContain('box-shadow: 6px 6px 0 #4a2d7a')
  })

  it('④ 暗 chip：亮色共享规则保持 #141414，暗侧覆盖米白底 + 深底字且对比 ≥4.5', () => {
    const light = popRule('\\.juya-section:nth-of-type\\(3n \\+ 3\\) > h2')
    expect(light, '亮色 #141414 字节不变').toContain('background: #141414')
    const override =
      css.match(
        /\[data-juya-variant='pop-dark'\]\.jypop \.juya-section:nth-of-type\(3n \+ 3\) > h2 \{[^}]*\}/
      )?.[0] ?? ''
    expect(override, '暗侧覆盖应存在').toBeTruthy()
    expect(override).toContain('background: var(--jy-heading)')
    expect(override).toContain('color: var(--jy-bg)')
    const dark = variantBlock('pop-dark')
    const heading = tokenHex(dark, '--jy-heading')
    const bg = tokenHex(dark, '--jy-bg')
    expect(heading, 'pop-dark --jy-heading 应为 6 位 hex').not.toBeNaN()
    expect(contrast(heading, bg), 'pop-dark chip 米白字对深底').toBeGreaterThanOrEqual(4.5)
  })

  it('③ 爆炸星整体移出 h1 文字盒：left -40px 且 -30px 无残留', () => {
    const star = popRule('\\.juya-masthead h1::before')
    expect(star).toContain('left: -40px')
    expect(css, '旧值 -30px 不应残留').not.toContain('left: -30px')
  })

  it('①a 中文标题印刷感：h1 硬位移 text-shadow；字体栈锁死（①b 未批准，禁改）', () => {
    const h1 = popRule('\\.juya-masthead h1')
    expect(h1).toContain('text-shadow: 3px 3px 0 rgba(0, 0, 0, 0.28)')
    for (const variant of ['pop-light', 'pop-dark']) {
      expect(variantBlock(variant)).toMatch(
        /--jy-font-heading:\s*Impact,\s*'Arial Black',\s*'Noto Sans SC',\s*sans-serif/
      )
    }
  })

  it('⑤ RM 击穿修复：两条 pop hover 规则只存在于 no-preference 媒体内', () => {
    const hoverSelectors = ['.jypop .juya-entry > h3 .juya-index:hover', '.jypop .juya-feed-item:hover']
    const noPrefBlocks = extractBlocks(css, /@media \(prefers-reduced-motion: no-preference\) \{/)
    expect(noPrefBlocks.length, 'no-preference 媒体块应存在').toBeGreaterThan(0)
    const noPrefAll = noPrefBlocks.join('\n')
    for (const sel of hoverSelectors) expect(noPrefAll, `「${sel}」应在媒体块内`).toContain(sel)
    let outside = css
    for (const block of noPrefBlocks) outside = outside.split(block).join('')
    for (const sel of hoverSelectors) {
      expect(outside.includes(sel), `「${sel}」不应存在于媒体块外`).toBe(false)
    }
  })

  it('⑥ 日期贴纸 nowrap + 窄窗降级：主规则 nowrap，≤520px 退化为普通 meta 文本', () => {
    const sticker = popRule('\\.juya-feed-meta > span:not\\(\\[class\\]\\)')
    expect(sticker).toContain('white-space: nowrap')
    const narrow = extractBlocks(css, /@media \(max-width: 520px\) \{/).join('\n')
    expect(narrow, '520px 窄窗媒体块应存在').toBeTruthy()
    const deg = narrow.match(/\.jypop \.juya-feed-meta > span:not\(\[class\]\) \{[^}]*\}/)?.[0] ?? ''
    expect(deg, '贴纸窄窗降级规则应存在').toBeTruthy()
    expect(deg).toContain('white-space: normal')
    expect(deg).toContain('border: 0')
  })

  it('②b 相关链接标签爆炸框化：星形 SVG 底 + 粗体，文字对星底对比 ≥4.5（实算）', () => {
    const label = popRule('\\.juya-links-label')
    expect(label, '应有爆炸星 SVG 背景').toContain('data:image/svg+xml')
    expect(label).toContain('font-weight: 700')
    const fill = Number.parseInt(label.match(/fill='%23([0-9a-fA-F]{6})'/)?.[1] ?? 'zz', 16)
    expect(fill, '星形填充应为 6 位 hex').not.toBeNaN()
    const text = label.match(/color:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? ''
    expect(text, '标签文字应为显式 6 位 hex（不得沿用 muted）').toBeTruthy()
    expect(contrast(fill, Number.parseInt(text.slice(1), 16)), '标签文字/星形底色').toBeGreaterThanOrEqual(4.5)
  })

  it('②b 刊头超大斜置期号：pop.tsx 渲染装饰性期号（aria-hidden + 条件渲染，缺失不塌）', () => {
    const tsx = readFileSync(join(process.cwd(), 'src/renderer/juya/templates/pop.tsx'), 'utf-8')
    expect(tsx).toContain('jypop-issue-no')
    expect(tsx).toContain('aria-hidden="true"')
    expect(tsx, '期号字段缺失时应条件渲染').toMatch(/issueNo\s*&&/)
    // 2026-10-11 刊头拼贴改版：白字对品红底的主体由期号（已入黄面板）改为 h1 标题面板，
    // 断言与数值不变（accent token 仍为两变体刊头品红，白字大文本 ≥3）
    const accent = tokenHex(variantBlock('pop-dark'), '--jy-accent')
    expect(contrast(0xffffff, accent), '白字/品红（大文本）').toBeGreaterThanOrEqual(3)
  })
})

describe('pop 刊头多面板拼贴守卫（2026-10-11 用户指令：刊头由单方块改多色矩形拼贴，不影响正文阅读）', () => {
  const titlePanel = () => popRule('\\.jypop-title-panel')
  const issuePanel = () => popRule('\\.jypop-issue-panel')
  const strip = () => popRule('\\.jypop-strip')
  const masthead = () => popRule('\\.juya-masthead')
  const issueNo = () => popRule('\\.jypop-issue-no')

  it('① 拼贴构成存在：刊头网格容器 + 标题面板/期号面板/色带 ≥3 个新面板选择器（pop.tsx 结构同步）', () => {
    expect(masthead(), '刊头应为网格拼贴容器').toContain('display: grid')
    expect(masthead(), '网格分区应含底缘色带行').toContain("'strip strip'")
    for (const [name, rule] of [
      ['标题面板', titlePanel()],
      ['期号面板', issuePanel()],
      ['色带', strip()]
    ] as const) {
      expect(rule, `${name}规则应存在`).toBeTruthy()
    }
    const tsx = readFileSync(join(process.cwd(), 'src/renderer/juya/templates/pop.tsx'), 'utf-8')
    expect(tsx).toContain('jypop-title-panel')
    expect(tsx).toContain('jypop-issue-panel')
    expect(tsx).toContain('jypop-strip')
  })

  it('② 期号黄面板：#ffe957 底 + 期号黑字对比 ≥4.5（黑/黄波普经典对），暗侧不得改底色', () => {
    const panel = issuePanel()
    expect(panel).toContain('background: #ffe957')
    const no = issueNo()
    expect(no, '期号颜色必须随黄底新配，不得沿用 on-accent 白字').not.toContain('var(--jy-on-accent)')
    const color = Number.parseInt(no.match(/color:\s*(#[0-9a-fA-F]{6})/)?.[1]?.slice(1) ?? 'zz', 16)
    expect(color, '期号颜色应为显式 6 位 hex').not.toBeNaN()
    expect(contrast(color, 0xffe957), '期号黑字/黄面板').toBeGreaterThanOrEqual(4.5)
    const darkOverride =
      css.match(/\[data-juya-variant='pop-dark'\]\.jypop \.jypop-issue-panel \{[^}]*\}/)?.[0] ?? ''
    expect(darkOverride, '暗侧期号面板覆盖应存在（描边改黑防黄边融底）').toBeTruthy()
    expect(darkOverride, '暗侧不得改期号面板底色（换底须重算对比）').not.toContain('background')
  })

  it('③ 标题白字对品红面板（两变体）≥3（大文本 AA）', () => {
    for (const variant of ['pop-light', 'pop-dark']) {
      const accent = tokenHex(variantBlock(variant), '--jy-accent')
      expect(contrast(0xffffff, accent), `${variant} h1 白字/品红面板`).toBeGreaterThanOrEqual(3)
    }
  })

  it('④ 色带：黑底 Ben-Day 白点纹理；暗侧蓝色带覆盖存在（黑带融进暗底不可辨）', () => {
    const band = strip()
    expect(band).toContain('background-color: #141414')
    expect(band, '色带应有 Ben-Day 网点纹理').toContain('radial-gradient')
    const darkBand = css.match(/\[data-juya-variant='pop-dark'\]\.jypop \.jypop-strip \{[^}]*\}/)?.[0] ?? ''
    expect(darkBand, '暗侧蓝色带覆盖应存在').toContain('background-color: #1f4fd8')
  })

  it('⑤ 星形几何自查（基础 + ≤520px 窄窗两上下文）：面板左留白 ≥44px（星 left:-40px 收在标题面板内）+ 顶部 ≥12px；min-width:0 防长标题撑破', () => {
    // 解析 padding 简写（1/2/3/4 值）或显式 padding-left/top
    const padSide = (block: string, side: 'top' | 'left'): number => {
      const explicit = block.match(new RegExp(`padding-${side}:\\s*(-?[\\d.]+)px`))
      if (explicit) return Number.parseFloat(explicit[1])
      const vals = (block.match(/padding:\s*([^;]+);/)?.[1] ?? '')
        .trim()
        .split(/\s+/)
        .map((v) => Number.parseFloat(v))
      if (vals.length === 1) return vals[0]
      if (vals.length === 2) return side === 'top' ? vals[0] : vals[1]
      if (vals.length === 3) return side === 'top' ? vals[0] : vals[1]
      if (vals.length === 4) return side === 'top' ? vals[0] : vals[3]
      return NaN
    }
    const panelBlocks = extractBlocks(css, /(?:^|\n)[ \t]*\.jypop \.jypop-title-panel \{/)
    const h1Blocks = extractBlocks(css, /(?:^|\n)[ \t]*\.jypop \.juya-masthead h1 \{/)
    const narrow = extractBlocks(css, /@media \(max-width: 520px\) \{/).join('\n')
    const inNarrow = (block: string): boolean => narrow.includes(block)
    const maxMargin = (blocks: string[]): number =>
      Math.max(
        0,
        ...blocks
          .map((b) => Number.parseFloat(b.match(/margin-left:\s*(-?[\d.]+)px/)?.[1] ?? 'NaN'))
          .filter(Number.isFinite)
      )
    // 基础上下文：面板 padding-left + 媒体块外 h1 margin-left ≥ 44（星宽外缘 40 + 4px 富余）
    const basePanel = panelBlocks.find((b) => !inNarrow(b)) ?? ''
    expect(basePanel, '基础标题面板规则应存在').toBeTruthy()
    expect(
      padSide(basePanel, 'left') + maxMargin(h1Blocks.filter((b) => !inNarrow(b))),
      '基础面板左留白合计 ≥ 44'
    ).toBeGreaterThanOrEqual(44)
    expect(padSide(basePanel, 'top'), '面板 padding-top ≥ 12（星形 top:-12px 不出面板）').toBeGreaterThanOrEqual(12)
    // 窄窗上下文：520px 块内面板 padding-left + h1 margin-left 同样 ≥ 44
    const narrowPanel = panelBlocks.find((b) => inNarrow(b)) ?? ''
    expect(narrowPanel, '窄窗标题面板补值规则应存在').toBeTruthy()
    expect(
      padSide(narrowPanel, 'left') + maxMargin(h1Blocks.filter((b) => inNarrow(b))),
      '窄窗面板左留白合计 ≥ 44'
    ).toBeGreaterThanOrEqual(44)
    expect(basePanel, 'grid 行内防长标题撑破面板').toContain('min-width: 0')
  })

  it('⑥ 期号面板 padding ≥10px：56px 期号 -7° 斜置角不出黄面板（旋转 bbox 高约 73px > 56px 内容盒）', () => {
    const padding = (issuePanel().match(/padding:\s*([^;]+);/)?.[1] ?? '')
      .trim()
      .split(/\s+/)
      .map((v) => Number.parseFloat(v))
    expect(padding[0], '期号面板 padding-top 覆盖斜置外溢角').toBeGreaterThanOrEqual(10)
  })

  it('⑦ 新面板规则零 animation/transition（静态构成，.juya-root 永无 animation）', () => {
    for (const [name, rule] of [
      ['刊头', masthead()],
      ['标题面板', titlePanel()],
      ['期号面板', issuePanel()],
      ['色带', strip()]
    ] as const) {
      expect(rule, `${name}不得新增动效`).not.toMatch(/animation|transition/)
    }
  })

  it('⑧ 暗侧拼贴：刊头沟槽改暗 + 面板硬阴影随暗侧语言（深紫 #4a2d7a），全部复合选择器形态', () => {
    const darkMasthead =
      css.match(/\[data-juya-variant='pop-dark'\]\.jypop \.juya-masthead \{[^}]*\}/)?.[0] ?? ''
    expect(darkMasthead, '暗侧刊头沟槽覆盖应存在').toContain('background: #141414')
    const darkTitle =
      css.match(/\[data-juya-variant='pop-dark'\]\.jypop \.jypop-title-panel \{[^}]*\}/)?.[0] ?? ''
    expect(darkTitle, '暗侧标题面板阴影应随暗侧硬阴影语言').toContain('box-shadow: 6px 6px 0 #4a2d7a')
  })
})

describe('nocturne 排版层级守卫（2026-10-12，#6；同日合并复核修正 A/B）', () => {
  // 需求：docs/juyathemesworks/nocturne-dark.md §6（决策 10 导语高亮窗）+ §7.1（决策 11 栏目 h2 发丝线），仅暗侧。
  // 真值一律从 CSS 规则里 regex 抠出后再断言（注释可自证，规则才是被浏览器消费的东西）；
  // 对比度一律自己按 alpha 合成后实算（tokenHex 读不了 rgba）。
  //
  // 合并复核修掉两处真实缺陷，本组随之改口径：
  //   A) 对比度守卫原断言 **4.80** 面 —— 那是「首层雾覆盖为 0、且不含导语自身 drop-shadow 底面贡献」
  //      的**不可达面**。`.juya-scene` 是 `position: sticky; top: 0`（**视口锚定**，不是文档锚定），
  //      滚动时导语会移到滚动口顶端，正落在顶部锚定的雾层最强处 ⇒ 最坏面出现在「滚动到顶端的窄窗」。
  //      本组⑥ 改为锁**可达最坏面**（真实浏览器实测 + 静态模型复算）。旧 4.80 面不再作为断言面（只在
  //      注释里留作对照：它比可达最坏面高 ≈0.55，正是「用错可达性模型」的量化后果）。
  //   B) 本票两条规则原写作**共享** `.jynoct`，把 nocturne-light 也改了（需求 §0 声明范围仅暗侧、
  //      §9 把「nocturne-light 任何改动」列为不做）。现收窄为
  //      `[data-juya-variant='nocturne-dark'].jynoct …`；本组新增静态守卫锁死该形态。
  const NIGHT = 'nocturne-dark'

  /** 暗侧变体专属复合规则块（缺陷 B 修正后的正确形态）：`[data-juya-variant='nocturne-dark'].jynoct <rest> { … }` */
  const darkRule = (rest: string): string =>
    extractBlock(css, new RegExp(`\\[data-juya-variant='nocturne-dark'\\]\\.jynoct ${rest} \\{`))

  /** 暗侧 `.juya-lead` 的两个复合规则块：[0] 底色/内衬、[1] 左侧发光（同选择器两块，按出现顺序） */
  const leadDarkBlocks = (): string[] =>
    extractBlocks(css, /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-lead \{/)

  /** 取 token 块内 rgba() 颜色（alpha 合成实算用；同 #3 守卫） */
  const tokenRgba = (block: string, name: string): { rgb: number; alpha: number } => {
    const m = block.match(
      new RegExp(
        `${name.replace(/-/g, '\\-')}:\\s*rgba\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\s*\\)`
      )
    )
    if (!m) return { rgb: Number.NaN, alpha: Number.NaN }
    return { rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]), alpha: Number(m[4]) }
  }

  /** 半透明前景按 alpha 合成到不透明底色之上（WCAG 不定义半透明色，必须先合成再算） */
  const over = (fg: { rgb: number; alpha: number }, bg: number): number => {
    const mix = (shift: number): number => {
      const f = (fg.rgb >> shift) & 0xff
      const b = (bg >> shift) & 0xff
      return Math.round(fg.alpha * f + (1 - fg.alpha) * b)
    }
    return (mix(16) << 16) | (mix(8) << 8) | mix(0)
  }

  /** 块内某声明的完整右值（`prop: value;` → `value`；找不到返空串） */
  const decl = (block: string, prop: string): string =>
    block.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;}]+)`))?.[1]?.trim() ?? ''

  /** 声明里的 4 个长度值（padding 简写；2 值简写按 CSS 规则展开为 4 值） */
  const lengths = (value: string): number[] =>
    value
      .split(/\s+/)
      .map((v) => Number.parseFloat(v))
      .filter((n) => !Number.isNaN(n))

  /** 声明里的 px 数值列表 */
  const px = (value: string): number[] =>
    [...value.matchAll(/([\d.]+)px/g)].map((m) => Number.parseFloat(m[1]))

  /** nocturne 段（「暗夜精修式」段头 → 下一段「杂志编辑式」段头）：新规则必须落在此区间 */
  const noctSection = (): string => css.slice(css.indexOf('暗夜精修式'), css.indexOf('杂志编辑式'))

  /** 导语区（暗侧两个复合规则块的合并文本）：发光规则须在此区间内 */
  const leadArea = (): string => leadDarkBlocks().join('\n')

  it('① 导语底色 alpha 从 4% 白提到 0.08–0.10（从规则抠真值，非注释）', () => {
    // 缺陷 B 修正后导语规则是暗侧复合形态（原共享 `.jynoct` 会把内衬一并施加到 nocturne-light）
    const lead = decl(darkRule('\\.juya-lead'), 'background')
    const leadBg = tokenRgba(variantBlock(NIGHT), '--jy-lead-bg')
    expect(lead, "[data-juya-variant='nocturne-dark'].jynoct .juya-lead 应有 background 声明").toBeTruthy()
    expect(leadBg.alpha, 'nocturne-dark --jy-lead-bg 应为 rgba').not.toBeNaN()
    // 底色可能落在 token 上（background: var(--jy-lead-bg)）或规则内字面 rgba，两条路径都还原成同一个 alpha 真值
    const alpha = /var\(--jy-lead-bg\)/.test(lead)
      ? leadBg.alpha
      : Number.parseFloat(lead.match(/rgba\([^)]*?,\s*([\d.]+)\s*\)/)?.[1] ?? 'NaN')
    expect(alpha, `导语底色 alpha 实测 ${alpha} 应落在 0.08–0.10`).toBeGreaterThanOrEqual(0.08)
    expect(alpha, `导语底色 alpha 实测 ${alpha} 应落在 0.08–0.10`).toBeLessThanOrEqual(0.1)
    expect(alpha, '不得残留近不可见的 4% 白').toBeGreaterThan(0.04)
    // 非文本 UI 门槛：底色块本身是装饰性高亮窗，不承载文字，但须确认它确实提亮（对 --jy-bg 可分辨）
    expect(contrast(over(leadBg, tokenHex(variantBlock(NIGHT), '--jy-bg')), tokenHex(variantBlock(NIGHT), '--jy-bg')),
      '导语底色对 --jy-bg 应可分辨（>1）').toBeGreaterThan(1)
  })

  it('② 导语左侧发光竖线：颜色取该风格 --jy-focus，辉光只用 drop-shadow（禁用 text-shadow）', () => {
    const rule = darkRule('\\.juya-lead')
    const focusRule = leadDarkBlocks()[1] ?? ''
    const left = decl(rule, 'border-left') || decl(focusRule, 'border-left-color')
    expect(left, '基层已有 border-left，本条票须把它换成 focus 色').toBeTruthy()
    expect(left, '左侧竖线颜色须走 var(--jy-focus)（#8b97ff）').toContain('var(--jy-focus)')
    // 竖线宽度以基层声明为真值（3px）：本票允许「只覆写 color」的写法，故宽度从基层读
    const baseLeft = decl(css.match(/(?:^|\n)\.juya-lead \{[^}]*\}/)?.[0] ?? '', 'border-left')
    expect(px(baseLeft)[0] || px(left)[0], '竖线宽度应保持基层 3px').toBe(3)
    // 发光：只认 filter: drop-shadow（background-clip:text 陷阱的同类口径，仓库统一禁 text-shadow）
    expect(leadArea(), '导语区（暗侧两个复合规则块）应可提取').toBeTruthy()
    expect(leadArea(), '导语区须有 drop-shadow 发光').toContain('drop-shadow')
    expect(leadArea(), '导语区禁用 text-shadow').not.toMatch(/text-shadow\s*:\s*[^n\s]/)
    // 发光强度克制：模糊半径 ≤ 8px，且 alpha ≤ 0.6（不得抢正文）
    // 只认真正的函数调用 `drop-shadow(` —— 区块注释里用反引号提到 `filter: drop-shadow`，不带左括号，天然不命中
    const glow = leadArea().match(/drop-shadow\(([^)]*)\)/)?.[1] ?? ''
    expect(glow, '导语区应有 drop-shadow 函数调用').toBeTruthy()
    expect(glow, 'drop-shadow 应带取色来源（focus 色通道 139,151,255）').toContain('139, 151, 255')
    expect(px(glow)[1], '发光模糊半径应克制（≤8px）').toBeLessThanOrEqual(8)
    // alpha 值从 rgba 的参数里按逗号切出（不用嵌套正则：`[^)]*?` 在 `[^)]*` 已吃掉右括号的场景下语义绕）
    const glowAlpha = Number.parseFloat(glow.split(',').pop()?.trim() ?? 'NaN')
    expect(Number.isNaN(glowAlpha), `drop-shadow 末位参数应为 alpha（实测 ${glowAlpha}）`).toBe(false)
    expect(glowAlpha, '发光 alpha 应克制（≤0.6）').toBeLessThanOrEqual(0.6)
    // 文字色（危险组合的来源）：本票不改，须仍是基层的 --jy-muted —— 只在有人覆写时才校验覆写值
    const leadColor = decl(rule, 'color') || decl(css.match(/(?:^|\n)\.juya-lead \{[^}]*\}/)?.[0] ?? '', 'color')
    expect(leadColor, '导语文字色应走 --jy-muted（需求 §3.1 点名的危险组合）').toContain(
      'var(--jy-muted)'
    )
  })

  it('③ 导语内边距加大：4 边均大于基层 padding: 8px 12px，与正文段落形成层级差', () => {
    const rule = leadDarkBlocks()[0] ?? ''
    const own = lengths(decl(rule, 'padding'))
    expect(own.length, "[data-juya-variant='nocturne-dark'].jynoct .juya-lead 须自带 padding 覆写").toBe(4)
    const [top, right, bottom, left] = own
    // 基层 .juya-lead { padding: 8px 12px } = 8px 12px 8px 12px
    expect(top, '上内边距应大于基层 8px').toBeGreaterThan(8)
    expect(right, '右内边距应大于基层 12px').toBeGreaterThan(12)
    expect(bottom, '下内边距应大于基层 8px').toBeGreaterThan(8)
    expect(left, '左内边距应大于基层 12px（竖线之外再让出呼吸）').toBeGreaterThan(12)
    // 层级差：正文段落是 14.5px/1.8 且零内边距（基层 .juya-entry p:not(.juya-links-label)），
    // 导语自带 ≥12px 四边内衬 + 13.5px 字号 —— 本断言锁住「零内边距」对照面的存在，防上游把段落也加上内衬
    expect(
      css.match(/\.juya-entry p:not\(\.juya-links-label\) \{[^}]*\}/)?.[0] ?? '',
      '正文段落对照面（14.5px/1.8、无 padding）应保持'
    ).toMatch(/font-size:\s*14\.5px/)
  })

  it('④ 栏目 h2：padding-bottom 8px + 1px 发丝线，线 alpha 单独提到 ≈0.22（实测对比度留档）', () => {
    const rule = darkRule('\\.juya-section > h2')
    expect(rule, "[data-juya-variant='nocturne-dark'].jynoct .juya-section > h2 规则应存在").toBeTruthy()
    expect(decl(rule, 'padding-bottom'), 'h2 下内边距应为 8px').toBe('8px')
    const border = decl(rule, 'border-bottom')
    expect(border, 'h2 下边框应为 1px 发丝线').toBeTruthy()
    expect(px(border)[0], '发丝线宽度 1px').toBe(1)
    const rgba = border.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/)
    expect(rgba, '栏目线应为字面 rgba（须带注释与对比度）').toBeTruthy()
    const ruleColor = {
      rgb: (Number(rgba![1]) << 16) | (Number(rgba![2]) << 8) | Number(rgba![3]),
      alpha: Number(rgba![4])
    }
    // 需求 §7.1 决策值：栏目线 alpha 单独提到 ≈0.22（白线；与 --jy-border 同源只提 alpha）
    expect(ruleColor.rgb, '栏目线取色来源应为白（与 --jy-border 同源）').toBe(0xffffff)
    expect(ruleColor.alpha, `栏目线 alpha 实测 ${ruleColor.alpha} 应 ≈0.22`).toBeCloseTo(0.22, 2)
    // 实算：线合成到 --jy-bg 后的对比度（票面实测口径：全局 0.08 仅 1.19:1）
    const block = variantBlock(NIGHT)
    const bg = tokenHex(block, '--jy-bg')
    const borderToken = tokenRgba(block, '--jy-border')
    expect(borderToken.alpha, '--jy-border 应为 rgba').not.toBeNaN()
    const oldLine = over(borderToken, bg)
    expect(contrast(oldLine, bg), '全局 0.08 老线的实测基线应≈1.19（对照面，防漂移）').toBeCloseTo(1.19, 1)
    const newLine = over(ruleColor, bg)
    const measured = contrast(newLine, bg)
    // 实测差额留档（票面验收标准写「达 3:1」）：alpha 0.22 的白线合成到 #0a0a0c 得 #404041，实算仅
    // **1.91:1** —— 数学上达不到 3:1。真正够 3:1 需 alpha ≈0.34（合成 #5d5d5f ⇒ 3.01:1），但那样栏目线
    // 会比条目线（0.08）亮一倍以上，直接违反需求 §7.1「只对栏目线提 alpha…提了与『克制』冲突」的红线。
    // 故按票面明写的决策值 0.22 落地，并把「相对老线的可见度提升倍数」锁进守卫（1.91/1.19 ≈ 1.61）：
    // 这条断言把实测值钉死，任何想把 alpha 往 3:1 抬的动作都会同时撞红本断言与「克制」红线。
    expect(measured, `栏目线 alpha ${ruleColor.alpha} 对 --jy-bg 实测 ${measured.toFixed(2)}`).toBeGreaterThan(1.9)
    expect(measured, '实测值锁定带宽 ±0.02，防静默改 alpha').toBeCloseTo(1.91, 2)
    expect(measured / contrast(oldLine, bg), '相对全局 0.08 老线的可见度提升 ≈1.61 倍').toBeCloseTo(1.61, 2)
    // 反证：0.22 确实达不到 3:1；够 3:1 的最小 alpha ≥0.33（证明取舍是数学事实而非疏漏）
    for (const a of [0.22, 0.3, 0.32]) {
      expect(contrast(over({ rgb: 0xffffff, alpha: a }, bg), bg), `alpha ${a} 应仍 <3`).toBeLessThan(3)
    }
    expect(contrast(over({ rgb: 0xffffff, alpha: 0.34 }, bg), bg), 'alpha 0.34 才够 3:1').toBeGreaterThanOrEqual(3)
    // 最坏叠加面（三层 nebula 全重叠 #18192a）留档：同一 alpha 在此面上约 2.05，明确低于 3 —— 见 CSS 注释
    const nebula = [
      { rgb: 0x6e7bff, alpha: 0.07 },
      { rgb: 0x5aa0ff, alpha: 0.04 },
      { rgb: 0xc85ab4, alpha: 0.025 }
    ]
    const nebulaComp = [nebula[2], nebula[1], nebula[0]].reduce((acc, l) => over(l, acc), bg)
    expect(nebulaComp, '三层 nebula 全重叠合成底应为 #18192a（与 #2 守卫同值）').toBe(0x18192a)
    const stacked = contrast(over(ruleColor, nebulaComp), nebulaComp)
    expect(stacked, '最坏叠加面上栏目线约 2.05（低于 3，已注释留档）').toBeGreaterThan(2)
    expect(stacked, '最坏叠加面上栏目线约 2.05（低于 3）').toBeLessThan(3)
  })

  it('⑤ 反证：条目分隔线仍用 --jy-border 0.08，未被一并提到 0.22（票面红线）', () => {
    const entry = noctRule('\\.juya-entry')
    expect(entry, '.jynoct .juya-entry 规则应存在').toBeTruthy()
    expect(decl(entry, 'border-bottom'), '条目分隔线应维持 var(--jy-border)').toBe(
      '1px solid var(--jy-border)'
    )
    // --jy-border token 本身不得被提到 0.22（提了会同时抬高条目线/图边/回流带，与「克制」冲突）
    expect(
      tokenRgba(variantBlock(NIGHT), '--jy-border').alpha,
      '--jy-border 应保持 0.08'
    ).toBeCloseTo(0.08, 3)
    // 整份 css 不得出现把条目分隔线抬到 0.22 的覆写
    expect(css, '不得存在提高条目分隔线 alpha 的覆盖规则').not.toMatch(
      /\.jynoct \.juya-entry \{[^}]*0\.22/
    )
    expect(css, 'nocturne 段不得把 --jy-border 提到 0.22').not.toMatch(
      /\[data-juya-variant='nocturne-(?:dark|light)'\][^{}]*\{[^}]*--jy-border:[^;}]*0\.22/
    )
    // 回流带（#8）用同一条 --jy-border 语言，同样不得被抬
    expect(noctRule('\\.jynoct-overflow-media'), '回流带仍走 --jy-border').toContain(
      'border-top: 1px solid var(--jy-border)'
    )
  })

  it('⑥ 可达最坏面：导语滚到滚动口顶端时 --jy-muted 对真实合成底 ≥ 实测下界（票面目标 4.5，缺口留档）', () => {
    const block = variantBlock(NIGHT)
    const bg = tokenHex(block, '--jy-bg')
    const muted = tokenHex(block, '--jy-muted')
    const leadBg = tokenRgba(block, '--jy-lead-bg')
    expect(muted, `${NIGHT} --jy-muted 应为 6 位 hex`).not.toBeNaN()

    // ---- 前提 1：场景层是**视口锚定**（sticky top:0）而非文档锚定 —— 这是「最坏面可达」的根因。
    //      原守卫用文档坐标（y≈45%）论证「导语不被 nebula 覆盖」，前提本身不成立。 ----
    const scene = extractBlock(css, /(?:^|\n)\.juya-scene \{/)
    expect(scene, '.juya-scene 规则应存在').toBeTruthy()
    expect(
      decl(scene, 'position'),
      '根因：.juya-scene 是 sticky（视口锚定）⇒ 滚动到顶端时导语正落在顶部锚定的雾层最强处'
    ).toBe('sticky')
    expect(Number.parseFloat(decl(scene, 'top')), '根因：sticky top: 0（场景盒与滚动口顶端对齐）').toBe(0)
    expect(decl(scene, 'height'), '场景盒 100vh（未扣 128px chrome，见 #2/#1 约定）').toBe('100vh')

    // ---- 前提 2：最上层雾 --jy-nebula-1 锚在场景左上角（0% 0%）：滚动到顶端 + 窄窗时在导语文字左缘最强 ----
    const neb = extractBlock(
      css,
      /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula \{/
    )
    expect(neb, 'nocturne-dark 的 nebula 规则应存在').toBeTruthy()
    const grad = neb.match(
      /radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%\s*,\s*var\(--jy-nebula-1\)\s*,\s*transparent\s+([\d.]+)%\s*\)/
    )
    expect(grad, '首层雾应为 var(--jy-nebula-1) 的椭圆径向渐变').toBeTruthy()
    const rxPct = Number(grad![1])
    const ryPct = Number(grad![2])
    expect(Number(grad![3]), '首层雾锚在场景左边缘（x=0%，最坏面即在文字左缘）').toBe(0)
    expect(Number(grad![4]), '首层雾锚在场景顶边（y=0%，滚动到顶端时最强）').toBe(0)
    const stopPct = Number(grad![5])
    const n1 = tokenRgba(neb, '--jy-nebula-1')
    expect(n1.alpha, '--jy-nebula-1 应为 rgba').not.toBeNaN()

    // ---- 前提 3：导语自身的 drop-shadow 垫在**半透明**导语矩形底下，属于文字背景的一部分 ----
    const glowRule = leadDarkBlocks()[1] ?? ''
    const glow = glowRule.match(
      /drop-shadow\(\s*[\d.]+px\s+[\d.]+(?:px)?\s+[\d.]+px\s+rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)\s*\)/
    )
    expect(glow, '发光规则应为 filter: drop-shadow(… rgba(…)）').toBeTruthy()
    const glowColor = {
      rgb: (Number(glow![1]) << 16) | (Number(glow![2]) << 8) | Number(glow![3]),
      alpha: Number(glow![4])
    }
    expect(glowColor.rgb, '发光取色应为该变体 --jy-focus #8b97ff').toBe(tokenHex(block, '--jy-focus'))

    // ---- 可达最坏面几何（浏览器实测口径：六档视口里 vw=700 最坏；导语文字左缘 = 47px，
    //      由 .juya-issue(760px 居中/24px 内衬) + .juya-entry(2px) + 3px 竖线 + 18px 左内衬 推出）----
    const VW = 700
    const VH = 800
    const TEXT_LEFT = 47
    const r = Math.hypot(TEXT_LEFT / ((rxPct / 100) * VW), 0 / ((ryPct / 100) * VH))
    const cover = Math.max(0, 1 - r / (stopPct / 100))
    const fog = { rgb: n1.rgb, alpha: n1.alpha * cover }
    // 导语底 → 发光垫底 → 场景雾 → 底色（source-over 逐层合成，顺序即 CSS 绘制顺序的逆）
    const shadow = { rgb: glowColor.rgb, alpha: glowColor.alpha * leadBg.alpha }
    const surface = over(leadBg, over(shadow, over(fog, bg)))
    const model = contrast(muted, surface)

    // 六档视口真实浏览器实测（Playwright，独立端口 4198，deviceScaleFactor=1；把带导语的条目滚到
    // 滚动口顶端、导语文字贴顶；dust 为 1~1.6px 装饰微粒，中性化后取背景梯度真值；鼠标移出条目以免
    // `.juya-entry:hover` 的**同色第二层**底叠加 —— 那是独立交互态，不计入本守卫最坏面）。
    // 下表为**合入 #5（正文列收窄到 700px）之后**的复测值（#5 之前 vw≥800 各档略低；最坏档两次都是 vw=700）：
    //   --jy-lead-bg 0.09（修前）560/700/800/900/1024/1280 = 4.2731 / 4.2563 / 4.3357 / 4.3984 / 4.4609 / 4.5642
    //   --jy-lead-bg 0.08（现值）                            = 4.4915 / 4.4744 / 4.5541 / 4.6164 / 4.6735 / 4.7801
    // 旧守卫断言的 4.80 面（首层雾覆盖为 0、且不含发光垫底贡献）比可达最坏面高 ≈0.55，是**不可达面**。
    const MEASURED_WORST = 4.4744
    expect(model, `静态模型复算 ${model.toFixed(3)} 不得高于实测（模型应保守）`).toBeLessThanOrEqual(
      MEASURED_WORST + 0.02
    )
    expect(
      MEASURED_WORST - model,
      `静态模型与实测差 ${(MEASURED_WORST - model).toFixed(3)} 应在保守带内（≤0.15）`
    ).toBeLessThan(0.15)
    expect(model, `可达最坏面静态复算 ${model.toFixed(3)} ≥ 锁定下界 4.30`).toBeGreaterThanOrEqual(4.30)
    expect(
      MEASURED_WORST,
      '可达最坏面实测下界（改 --jy-lead-bg alpha 或发光 alpha 会撞这条，须同步复测）'
    ).toBeGreaterThanOrEqual(4.47)
    // 已知缺口如实留档（不是笔误）：票面 AA 目标 4.5 **当前未达成**，差 0.0256。
    // 唯一剩余分量是导语自身 `filter: drop-shadow` 以 0.35×leadBgAlpha 整片垫在矩形底下（实测去掉
    // filter：0.08→4.6567、0.09→4.4899）。修它要动发光 alpha 或把发光挪到只承载 3px 竖线的伪元素，
    // 两者都超出「把 --jy-lead-bg 降到 0.08」这一预授权候选 —— 实测数字已上报待裁决；
    // 裁决落地后把上面 MEASURED_WORST 与本条断言一起抬到 4.5，并删除本条。
    expect(
      MEASURED_WORST,
      '票面 AA 目标 4.5 当前**未达成**（缺口 0.0256）——根因与备选见 CSS 注释与回报'
    ).toBeLessThan(4.5)
  })

  it('⑦ 范围未越界：nocturne-light 的导语/栏目线相关取值与形态字节不变（本轮仅暗侧）', () => {
    const light = variantBlock('nocturne-light')
    expect(light, 'nocturne-light --jy-lead-bg 应保持 4% 暗' ).toContain(
      '--jy-lead-bg: rgba(15, 15, 24, 0.04);'
    )
    expect(css, '不得出现 nocturne-light 的导语/栏目线覆写').not.toMatch(
      /\[data-juya-variant='nocturne-light'\][^{}]*\{[^}]*(?:juya-lead|juya-section)/
    )
    // 缺陷 B 静态守卫：本票两条规则必须是**暗侧复合形态**，且不得存在共享 `.jynoct` 版本
    // （共享版会把内衬 / 1px 白线一并施加到 nocturne-light —— 需求 §0/§9 明确不做）。
    expect(darkRule('\\.juya-lead'), "导语规则应为 [data-juya-variant='nocturne-dark'].jynoct .juya-lead").toBeTruthy()
    expect(
      darkRule('\\.juya-section > h2'),
      "栏目线规则应为 [data-juya-variant='nocturne-dark'].jynoct .juya-section > h2"
    ).toBeTruthy()
    expect(css, '不得再有共享 .jynoct 的导语规则（会波及亮侧）').not.toMatch(
      /(?:^|\n)\.jynoct \.juya-lead \{/
    )
    expect(css, '不得再有共享 .jynoct 的栏目线规则（会波及亮侧）').not.toMatch(
      /(?:^|\n)\.jynoct \.juya-section > h2 \{/
    )
    // 暗侧观感与数值不得因收窄而改变：内衬 / padding-bottom+线 仍从暗侧复合规则读到（见 ③/④）
    expect(decl(darkRule('\\.juya-section > h2'), 'padding-bottom'), '收窄后暗侧 h2 下内衬仍在').toBe('8px')
    // 新规则只允许挂在 .jynoct 或 [data-juya-variant='nocturne-dark'].jynoct 作用域
    const headers = [...css.matchAll(/([^{}]*\.juya-lead[^{}]*)\{/g)]
      .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter((sel) => sel && !sel.startsWith('@'))
    for (const header of headers) {
      for (const part of header.split(',').map((s) => s.trim())) {
        if (!part.includes('.juya-lead')) continue
        expect(
          /^(?:\.[a-z][\w-]*|\[data-juya-variant='[^']+'\]\.jy\w+)/.test(part) ||
            /\.juya-lead$/.test(part),
          `导语规则必须带风格作用域（不得打基层）：${part}`
        ).toBe(true)
      }
    }
  })
})

describe('滚动条风格适配守卫（2026-10-11 用户指令：橘鸦风格激活时内容区滚动条跟随风格色板）', () => {
  // 约束：滚动条伪元素挂在滚动容器（.juya-root 的祖先）上，而 --jy-* 变量定义在 .juya-root（后代）
  // —— CSS 自定义属性只向下继承，滚动容器读不到任何 var(--jy-*)/var(--t-*)，
  // 因此规则形态只能是 .view-scroll:has([data-juya-variant='…'])::-webkit-scrollbar-thumb + 每变体字面色。
  const scrollbarThumbRule = (variant: string): string =>
    extractBlock(
      css,
      new RegExp(
        `(?:^|\\n)\\.view-scroll:has\\(\\[data-juya-variant='${variant}'\\]\\)::-webkit-scrollbar-thumb \\{`
      )
    )

  it('① 变体清单驱动：注册表 16 变体各有一条 .view-scroll:has()::-webkit-scrollbar-thumb 规则（未来加变体自动纳入守卫）', () => {
    // 计数闸门：新增变体时此数须同步 bump，防止静默漏写滚动条规则
    expect(JUYA_STYLES, '注册表应为 16 变体').toHaveLength(16)
    for (const { id } of JUYA_STYLES) {
      expect(scrollbarThumbRule(id), `${id} 滚动条 thumb 规则应存在`).toBeTruthy()
    }
  })

  it('② 每条规则 background 为字面 6 位 hex（:has 容器读不到变量），且不引用任何 var()', () => {
    for (const { id } of JUYA_STYLES) {
      const rule = scrollbarThumbRule(id)
      expect(rule, `${id} background 应为字面 hex`).toMatch(/background:\s*#[0-9a-fA-F]{6}\s*;/)
      expect(rule, `${id} 不得引用 var()（滚动容器读不到 --jy-*/--t-*）`).not.toContain('var(')
    }
  })

  it('③ 宽度/圆角/track（透明）继承全局：juya.css 不重复声明滚动条尺寸规则与 track 规则，区块零动效', () => {
    expect(css, '不得重复声明 ::-webkit-scrollbar 尺寸规则（width/height 归全局）').not.toMatch(
      /::-webkit-scrollbar\s*\{/
    )
    expect(css, '不得声明 track 规则（track 透明继承全局）').not.toContain('::-webkit-scrollbar-track')
    const start = css.indexOf('/* ==== 滚动条风格适配')
    expect(start, '滚动条风格适配区块应存在').toBeGreaterThanOrEqual(0)
    const section = css.slice(start)
    expect(section, '滚动条规则零新增 animation/transition').not.toMatch(/animation|transition/)
  })

  it('④ 全局 index.css 滚动条块字节不动（通用 UI 继续用主题滚动条）', () => {
    const index = readFileSync(join(process.cwd(), 'src/renderer/styles/index.css'), 'utf-8')
    expect(index).toMatch(/::-webkit-scrollbar \{\s*width: 8px;\s*height: 8px;\s*\}/)
    expect(index).toMatch(/::-webkit-scrollbar-thumb \{\s*background: var\(--t-border\);\s*border-radius: 4px;\s*\}/)
    expect(index).toMatch(/::-webkit-scrollbar-track \{\s*background: transparent;\s*\}/)
  })

  it('⑤ view-scroll 挂类：HomeView/ReaderView 滚动容器均挂，MiniView 不在范围（Mini 无橘鸦风格）', () => {
    const home = readFileSync(join(process.cwd(), 'src/renderer/components/HomeView.tsx'), 'utf-8')
    const reader = readFileSync(join(process.cwd(), 'src/renderer/components/ReaderView.tsx'), 'utf-8')
    const mini = readFileSync(join(process.cwd(), 'src/renderer/components/MiniView.tsx'), 'utf-8')
    expect(home, 'HomeView 滚动容器应挂 view-scroll').toMatch(
      /<main className="view-scroll flex-1 overflow-y-auto">/
    )
    expect(reader, 'ReaderView 滚动容器应挂 view-scroll').toMatch(
      /<div className="view-scroll flex-1 overflow-y-auto">/
    )
    expect(mini, 'MiniView 不应挂 view-scroll').not.toContain('view-scroll')
  })
})

describe('nocturne 刊头 neon 守卫（2026-10-12，#4）', () => {
  // 需求：docs/juyathemesworks/nocturne-dark.md §4.2（静态辉光近层 .28 / 远层 .12；呼吸 9s alternate，
  // 近层 alpha .22 ↔ .32 摆动；alpha 沿用 --jy-accent #6e7bff）。区间两端以关键帧声明为真值断言。
  // 硬约束（AGENTS.md / §10 红线 2）：background-clip:text 上禁用 text-shadow——它会盖住渐变填充
  // （Chromium 绘制顺序，y2k 已踩坑），辉光只能用 filter: drop-shadow。
  // 结构约束（红线 3）：动画只挂刊头子层，.juya-root 永无 animation。
  const DARK = "\\[data-juya-variant='nocturne-dark'\\]"
  const masthead = `${DARK}\\.jynoct \\.juya-masthead h1`
  /** 基础刊头规则 `.jynoct .juya-masthead h1 { … }`（行首锚定：暗侧变体前缀规则不始于行首故不误命中） */
  const mastheadRule = (): string =>
    extractBlock(css, /(?:^|\n)\.jynoct \.juya-masthead h1 \{/).replace(/^\n/, '')
  /** 决定本条票的暗侧复合选择器规则（辉光 + 呼吸挂载点） */
  const darkRule = (): string =>
    extractBlock(css, new RegExp(`(?:^|\\n)${masthead} \\{`)).replace(/^\n/, '')
  /** 首条形如 `<selector> { … }` 的规则块（行首锚定，避免被变体前缀复合选择器规则包含匹配） */
  const ruleOf = (selector: string): string =>
    extractBlock(css, new RegExp(`(?:^|\\n)${selector} \\{`)).replace(/^\n/, '')
  /** 全部 drop-shadow 的 (半径, alpha) 对 */
  const shadows = (block: string): { radius: number; alpha: number }[] =>
    [...block.matchAll(/drop-shadow\(0 0 ([\d.]+)px rgba\([^)]*?([\d.]+)\)\)/g)].map((m) => ({
      radius: Number.parseFloat(m[1]),
      alpha: Number.parseFloat(m[2])
    }))
  /** 块内是否真有 text-shadow 声明（`text-shadow: none` 是显式解除，不算） */
  const hasTextShadow = (block: string): boolean => /text-shadow:\s*[^n\s]/.test(block)
  const nocturneKeyframes = (): string => extractBlock(css, /@keyframes jy-noct-glow \{/)
  /** 暗侧刊头区块（含前置说明注释 + 规则 + 关键帧及其注释）：供「取色来源 / 摆动区间注释可追溯」断言 */
  const darkArea = (): string => {
    const rule = css.indexOf("\n[data-juya-variant='nocturne-dark'].jynoct .juya-masthead h1 {")
    const from = css.lastIndexOf('/*', rule)
    const keyframes = nocturneKeyframes()
    const to = keyframes ? css.indexOf(keyframes) + keyframes.length : css.length
    return rule < 0 ? '' : css.slice(from, to)
  }
  /** 呼吸关键帧内的数值字面量（用于双色霓虹排除项扫描） */
  const keyframeNumbers = (): number[] => (nocturneKeyframes().match(/[\d.]+/g) ?? []).map(Number)
  /** 单个关键帧声明块（`from` / `to` / `0%` / `100%`） */
  const keyframeStep = (block: string, step: string): string =>
    block.match(new RegExp(`(?:^|[\\s{])${step}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  /** 声明块内 drop-shadow 的 (半径, alpha) 对（顺序即声明顺序：近层在前、远层在后） */
  const stepGlow = (block: string): { radius: number; alpha: number }[] =>
    [...block.matchAll(/drop-shadow\(0 0 ([\d.]+)px rgba\([^)]*?([\d.]+)\)\)/g)].map((m) => ({
      radius: Number.parseFloat(m[1]),
      alpha: Number.parseFloat(m[2])
    }))
  const rmBlock = (): string =>
    extractBlocks(css, /@media \(prefers-reduced-motion: reduce\) \{/).join('\n')
  const supportsFallbackBlock = (): string =>
    extractBlocks(css, /@supports not \(background-clip: text\) \{/).join('\n')

  it('① 复合选择器规则存在：双层 drop-shadow，半径 18px/40px，alpha .28/.12（accent #6e7bff 同源）', () => {
    const rule = darkRule()
    expect(
      rule,
      "规则 [data-juya-variant='nocturne-dark'].jynoct .juya-masthead h1 应存在（复合选择器形态）"
    ).toBeTruthy()
    const glow = shadows(rule)
    expect(glow.map((s) => s.radius), '辉光应为两层：近层 18px + 远层 40px').toEqual([18, 40])
    expect(glow[0].alpha, '近层 alpha .28').toBeCloseTo(0.28, 5)
    expect(glow[1].alpha, '远层 alpha .12').toBeCloseTo(0.12, 5)
    expect(darkArea(), 'accent 取色来源须可追溯（中文注释 #6e7bff 与 rgba 110,123,255 同值）').toMatch(
      /#6e7bff/
    )
    expect(rule, 'rgba 通道须与 #6e7bff 同值').toContain('rgba(110, 123, 255')
  })

  it('② 禁用 text-shadow：刊头规则与 nocturne 呼吸关键帧均不得出现 text-shadow 声明', () => {
    expect(hasTextShadow(darkRule()), 'background-clip:text 上 text-shadow 会盖住渐变填充').toBe(false)
    expect(nocturneKeyframes(), '呼吸关键帧应存在（@keyframes jy-noct-glow）').toBeTruthy()
    expect(hasTextShadow(nocturneKeyframes()), '关键帧内同样禁用 text-shadow').toBe(false)
  })

  it('③ 呼吸：9s 周期 + alternate，关键帧 from/to 近层 alpha 实测 .22 / .32（下界真值，非注释自证）', () => {
    const rule = darkRule()
    const kf = nocturneKeyframes()
    expect(rule, 'animation 简写应含 9s 周期与 alternate 方向').toMatch(
      /animation:\s*jy-noct-glow 9s[^;]*alternate/
    )
    expect(kf, '呼吸关键帧应存在（@keyframes jy-noct-glow）').toBeTruthy()
    // 从关键帧声明里抠出数值断言，而不是断言「注释里写了 .22↔.32」——注释可自证，关键帧才是被浏览器插值的真值。
    const from = stepGlow(keyframeStep(kf, 'from'))
    const to = stepGlow(keyframeStep(kf, 'to'))
    expect(from.map((s) => s.radius), 'from 两层几何应保持 18px 近层 + 40px 远层').toEqual([18, 40])
    expect(to.map((s) => s.radius), 'to 两层几何应保持 18px 近层 + 40px 远层').toEqual([18, 40])
    // 近层（glow[0]）：区间下界 .22 出在 from、上界 .32 出在 to —— 两端都在声明里、运行期可达
    expect(from[0]?.alpha, 'from 近层 alpha 实测应为下界 .22').toBeCloseTo(0.22, 5)
    expect(to[0]?.alpha, 'to 近层 alpha 实测应为上界 .32').toBeCloseTo(0.32, 5)
    // 远层（glow[1]）：保持 .12 恒定（本区块注释写明不随近层缩放的理由），两端同值
    expect(from[1]?.alpha, 'from 远层 alpha 应恒为 .12').toBeCloseTo(0.12, 5)
    expect(to[1]?.alpha, 'to 远层 alpha 应恒为 .12').toBeCloseTo(0.12, 5)
    // 静态 / 降级态辉光（基础规则的 filter）是与关键帧不同的值：近层 .28（决策 5 原文）
    const stat = shadows(darkRule())
    expect(stat[0]?.alpha, '静态近层 alpha 应为 .28').toBeCloseTo(0.28, 5)
    expect(stat[1]?.alpha, '静态远层 alpha 应为 .12').toBeCloseTo(0.12, 5)
    // 区间语义可追溯（辅助）：注释说明近层 .22↔.32 呼吸、静态 .28；真值断言以上面关键帧为准
    expect(darkArea(), '区块注释应说明近层 .22 ↔ .32 呼吸').toMatch(/\.22\s*↔\s*\.32/)
    // 单色微光排除项：双色霓虹 = 青 rgba(90,160,255) + 品红 rgba(200,90,180)，其一即可判否
    const nums = keyframeNumbers()
    expect(nums, '不得出现双色霓虹青通道 160').not.toContain(160)
    expect(nums, '不得出现双色霓虹品红 R 200').not.toContain(200)
  })

  it('④ reduced-motion：取消动画（animation: none !important）且保留静态辉光', () => {
    const rm = rmBlock()
    expect(rm, 'RM 块应存在').toBeTruthy()
    const cancel = rm.match(new RegExp(`${masthead} \\{[^}]*\\}`))?.[0] ?? ''
    expect(cancel, 'RM 块内应有取消该动画的规则').toBeTruthy()
    expect(cancel, '取消动画用 animation: none !important').toMatch(/animation:\s*none\s*!important/)
    expect(cancel, 'RM 下不得改动 filter（静态辉光须保留）').not.toMatch(/\bfilter\s*:/)
    expect(cancel, 'RM 下不得改动 filter（静态辉光须保留）').not.toMatch(/\bfilter\s*:/)
  })

  it('⑤ @supports not (background-clip: text)：nocturne 刊头退回实色 var(--jy-heading)，无透明字', () => {
    const fallback = supportsFallbackBlock()
    expect(fallback, '@supports not (background-clip: text) 块应存在（审计 F-11）').toBeTruthy()
    const rule =
      fallback.match(/(?:^|\n)[ \t]*\.jynoct \.juya-masthead h1 \{[^}]*\}/)?.[0] ?? ''
    expect(rule, '回退块内应命中 nocturne 刊头（覆盖亮暗两变体）.juya-masthead h1').toBeTruthy()
    expect(rule, '回退用实色标题色').toContain('color: var(--jy-heading)')
    expect(rule, '回退须清掉被裁剪的渐变背景，不得残留 color: transparent').toMatch(
      /background:\s*none/
    )
    expect(rule, '回退块内不得残留 color: transparent').not.toContain('color: transparent')
  })

  it('⑥ .juya-root 全份 css 内无 animation（动画只挂刊头子层，reduced-motion E2E 断言依赖）', () => {
    const start = css.indexOf('.juya-root {')
    expect(start, '.juya-root 规则应存在').toBeGreaterThanOrEqual(0)
    const end = css.indexOf('}', start)
    const root = css.slice(start, end)
    expect(root, '.juya-root 不得出现 animation（含 -webkit- 前缀）').not.toMatch(
      /-?webkit-?animation|animation\s*:/
    )
    expect(darkRule(), '动画确实挂在刊头子层而非 .juya-root').toMatch(/animation:\s*jy-noct-glow/)
  })

  it('⑦ nocturne-light 刊头规则字节不变（本轮仅暗侧）', () => {
    const base = mastheadRule()
    expect(
      base,
      "base 规则原文（暗侧辉光挂在此条；亮侧仅覆盖渐变，不重复 background-clip/color）"
    ).toContain(`.jynoct .juya-masthead h1 {
  letter-spacing: -0.02em;
  font-size: 30px;
  background: linear-gradient(180deg, #ffffff, #b9bcc7);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;`)
    const light = ruleOf(`\\[data-juya-variant='nocturne-light'\\]\\.jynoct \\.juya-masthead h1`)
    expect(light, '亮侧刊头覆盖规则应存在').toBeTruthy()
    expect(light, 'nocturne-light 刊头规则须逐字节不变').toBe(
      `[data-juya-variant='nocturne-light'].jynoct .juya-masthead h1 {
  background: linear-gradient(180deg, #17181d, #3a3b44);
  -webkit-background-clip: text;
  background-clip: text;
}`
    )
    expect(light, '亮侧规则不得继承暗侧辉光/动画').not.toMatch(/drop-shadow|animation/)
    // 亮侧原有字面首帧不得被暗侧文案改动
    expect(css, '亮侧 token 块不得改动').toContain("--jy-accent: #4f5ed8;")
  })
})

describe('nocturne 图文回流守卫（2026-10-12，#8：右列限 2 张，其余回流通栏）', () => {
  const TSX = () => readFileSync(join(process.cwd(), 'src/renderer/juya/templates/nocturne.tsx'), 'utf-8')
  const overflowRules = () => css.match(/^[^\n]*jynoct-overflow-media[^\n]*\{/gm) ?? []

  it('① 新增通栏容器的样式只写在 jynoct 作用域内（不新增基层/其他变体规则）', () => {
    const rules = overflowRules()
    expect(rules.length, '通栏容器应有基础规则 + 窄窗降级各一条').toBe(2)
    for (const rule of rules) {
      expect(rule, `通栏容器规则必须挂 .jynoct 作用域：${rule.trim()}`).toMatch(/^\s*\.jynoct \.jynoct-overflow-media \{/)
    }
    expect(css, '新类名不得出现在变体前缀复合选择器之外的作用域').not.toMatch(
      /\[data-juya-variant='[^']+'\]\s*\.jynoct-overflow-media/
    )
  })

  it('② 通栏带基础规则：发丝上边线（var(--jy-border)）+ 与右列稳定间距，零动效', () => {
    const rule = noctRule('\\.jynoct-overflow-media')
    expect(rule, '通栏带基础规则应存在').toBeTruthy()
    expect(rule).toContain('border-top: 1px solid var(--jy-border)')
    expect(rule).toContain('margin-top: 18px')
    expect(rule, 'padding-top 用于阻断与内层 .juya-media 外边距的合并').toContain('padding-top: 14px')
    expect(rule, '回流带不引入动效').not.toMatch(/animation|transition/)
  })

  it('③ 窄窗降级：≤640px 时去掉发丝线与内衬（此时右列已回落纵排，无左右并置语义）', () => {
    const narrow = extractBlocks(css, /@media \(max-width: 640px\) \{/).find((b) =>
      b.includes('jynoct-overflow-media')
    )
    expect(narrow, '应存在含通栏容器的窄窗降级媒体块').toBeTruthy()
    expect(narrow).toContain('border-top: none')
    expect(narrow).toContain('padding-top: 0')
  })

  it('④ 模板接线：nocturne.tsx 自写骨架（不再引用共享 EntrySplit），保留既有基类与新类名', () => {
    const tsx = TSX()
    expect(tsx, '零共享层改动：不得从 parts 导入共享 EntrySplit').not.toMatch(
      /import \{[^}]*\bEntrySplit\b[^}]*\} from '\.\/parts'/
    )
    expect(tsx, '零共享层改动：不得渲染共享 EntrySplit').not.toContain('<EntrySplit')
    for (const cls of ['juya-entry juya-entry-split', 'juya-entry-row', 'juya-entry-body', 'juya-entry-figure']) {
      expect(tsx, `应保留既有基类 ${cls}`).toContain(cls)
    }
    expect(tsx, '通栏容器类名应与 CSS 同步').toContain('jynoct-overflow-media')
    // 只断言类名字符串形态（注释里可以提到该基类名，那不影响渲染）
    expect(tsx, '纪律签名：永不把 juya-entry-alt 挂上 className（图恒在右不交替）').not.toMatch(
      /className=[^\n]*juya-entry-alt/
    )
  })
})

describe('nocturne 概览目录守卫（2026-10-12，#7：序号 accent 微光 + 发丝线 + hover 整行微亮）', () => {
  // 需求：docs/juyathemesworks/nocturne-dark.md §7.2（决策 10）。真值一律从 juya.css 规则里
  // regex 抠出后**自行 alpha 合成再实算**——tokenHex 读不了 rgba，本票相关 token 全是 rgba 字面量。
  // 底色口径：概览区在页面上部，取三层 nebula **最坏全重叠**合成底（#2 已接线，正文列中心区不再是纯 #0a0a0c）。

  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  /** 以字面量选择器取规则块（extractBlock 收 regex，此处转义字面量，避免手写转义漂移） */
  const ruleOf = (opener: string): string => extractBlock(css, new RegExp(esc(opener)))
  /** 取紧贴在规则之前的注释块（两者之间只允许空白，否则视为无关注释） */
  const leadingComment = (selector: string): string => {
    const i = css.indexOf(selector)
    if (i < 0) return ''
    const before = css.slice(0, i)
    const open = before.lastIndexOf('/*')
    if (open < 0) return ''
    const close = before.indexOf('*/', open)
    if (close < 0 || before.slice(close + 2).trim() !== '') return ''
    return before.slice(open, close + 2)
  }
  /** source-over alpha 合成（sRGB 8bit，逐层取整） */
  const over = (fg: number, alpha: number, bg: number): number => {
    const ch = (v: number, shift: number): number => (v >> shift) & 0xff
    const mix = (f: number, d: number): number => Math.round(f * alpha + d * (1 - alpha))
    return (mix(ch(fg, 16), ch(bg, 16)) << 16) | (mix(ch(fg, 8), ch(bg, 8)) << 8) | mix(ch(fg, 0), ch(bg, 0))
  }
  /** 从规则里抠出 `background: rgba(r, g, b, α)` 的实参（本文件 rgba 一律用 0..1 小数 alpha） */
  const rgbaOf = (rule: string, prop: string): { color: number; alpha: number } => {
    const m = rule.match(
      new RegExp(`${prop}:\\s*rgba\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*\\)`)
    )
    expect(m, `${prop} 应为 rgba() 字面量（实值可从规则抠出）：${rule.trim()}`).toBeTruthy()
    return {
      color: (Number(m![1]) << 16) | (Number(m![2]) << 8) | Number(m![3]),
      alpha: Number(m![4])
    }
  }
  /** 三层 nebula 最坏全重叠合成底：绘制顺序为列表首个在最上，故合成序 3 → 2 → 1 */
  const worstCaseSceneBase = (): number => {
    const neb = ruleOf("[data-juya-variant='nocturne-dark'].jynoct .juya-scene-nebula {")
    expect(neb, 'nocturne 的 nebula 覆盖规则应存在（依赖 #2 已接线）').toBeTruthy()
    const layers = [3, 2, 1].map((n) => {
      const m = neb.match(
        new RegExp(`--jy-nebula-${n}:\\s*rgba\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*\\)`)
      )
      expect(m, `--jy-nebula-${n} 应为 rgba() 字面量`).toBeTruthy()
      return { layer: (Number(m![1]) << 16) | (Number(m![2]) << 8) | Number(m![3]), alpha: Number(m![4]) }
    })
    const bg = tokenHex(variantBlock('nocturne-dark'), '--jy-bg')
    return layers.reduce((acc, l) => over(l.layer, l.alpha, acc), bg)
  }

  const INDEX_RULE = "[data-juya-variant='nocturne-dark'].jynoct .juya-overview .juya-index {"
  const ROW_RULE = "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li {"
  const SEP_RULE = "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li + li::after {"
  const HOVER_RULE = "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li:hover {"

  it('① 序号微光的作用域收窄到概览条目；条目标题序号徽章的既有规则零改动（反证）', () => {
    const glow = ruleOf(INDEX_RULE)
    expect(glow, '概览序号微光规则应存在').toBeTruthy()
    expect(glow, '作用域必须带 .juya-overview 中缀').toContain('.juya-overview')

    // 反证：全文件里「jynoct + juya-index」同现的规则，除既有那条无中缀的 `.jynoct .juya-index`
    //（条目内序号徽章重置）外，都必须带 .juya-overview —— 不得新增无中缀规则去连带命中条目标题。
    const heads = (css.match(/^[^\n{}]*jynoct[^\n{}]*juya-index[^\n{}]*\{/gm) ?? []).map((h) => h.trim())
    expect(heads.filter((h) => !h.includes('.juya-overview'))).toEqual(['.jynoct .juya-index {'])

    // 既有徽章规则逐字未改：仍是 muted 灰、无辉光/无 accent/无 filter（条目标题序号带 # 的小字上下文）
    const badge = noctRule('\\.juya-index')
    expect(badge, '条目标题序号既有规则应存在').toContain('color: var(--jy-muted)')
    expect(badge, '条目标题序号不得被概览微光连带点亮').not.toMatch(/drop-shadow|text-shadow|--jy-accent|filter/)

    // 全仓口径：jynoct 作用域内零 text-shadow（辉光一律 filter: drop-shadow）
    expect(css.match(/^[^\n{}]*jynoct[^\n{}]*\{[^}]*text-shadow/gm) ?? []).toEqual([])
  })

  it('② 序号色走本变体 --jy-accent、辉光为 filter: drop-shadow 且单层克制、零动效、无 text-shadow', () => {
    const glow = ruleOf(INDEX_RULE)
    expect(glow).toContain('color: var(--jy-accent)')
    expect(glow, '禁用 text-shadow（background-clip:text 绘制顺序陷阱，本仓口径）').not.toContain('text-shadow')
    expect(glow, '辉光只能写成 filter: drop-shadow').toMatch(/filter:\s*drop-shadow\(/)
    expect(glow, '静态微光：不起动画/过渡').not.toMatch(/animation|transition/)
    // 克制标定：单层、半径远小于刊头近层（18px）——12px 小字上等强度会糊成一团抢正文
    const radii = [...glow.matchAll(/drop-shadow\(0 0 (\d+)px/g)].map((m) => Number(m[1]))
    expect(radii, '应为单层 drop-shadow').toHaveLength(1)
    expect(radii[0], '半径须明显小于刊头近层 18px').toBeLessThanOrEqual(8)
    expect(glow, 'accent 色值取自 token，不得硬编码 hex').not.toMatch(/#6e7bff/i)
  })

  it('③ 条目间发丝线：绝对定位落在既有 6px gap 内（零占位、无 border 叠加）、alpha 明显低于 #6 栏目线决策值 0.22', () => {
    const sep = ruleOf(SEP_RULE)
    expect(sep, '概览条目分隔线规则应存在').toBeTruthy()
    expect(sep, '基层 .juya-overview 是 flex column，须用零占位绝对定位').toContain('position: absolute')
    expect(sep, '线落在 gap 正中（-(6px/2) - 1px/2）').toMatch(/top:\s*-3\.5px/)
    expect(sep, '不得用 border 直接叠在 flex gap 上（线上下各半格 → 双倍间距错觉）').not.toMatch(
      /border-(top|bottom)/
    )
    // 边缘用相邻兄弟：首条无上线、无末条下线；不用 :first-child/:last-child 兜（flex 重排下会漏）
    expect(css).not.toMatch(/jynoct[^\n{}]*\.juya-overview[^\n{}]*:(first|last)-child/)
    // 极淡：抠 alpha 实值。上界两条——①本仓 --jy-border 档 0.08（超过就不叫极淡）；
    // ②#6 栏目线的决策值 0.22（两张票的线值不得互相打架）
    const { alpha } = rgbaOf(sep, 'background')
    expect(alpha).toBeGreaterThan(0)
    expect(alpha, '「极淡」不得强过基层 --jy-border 的 0.08 档').toBeLessThanOrEqual(0.08)
    expect(alpha, '必须明显低于 #6 栏目线决策值 0.22').toBeLessThan(0.22)
    const note = leadingComment(SEP_RULE)
    expect(note, '构成色硬编码必须带注释').toBeTruthy()
    expect(note, '注释须注明取色来源').toMatch(/--jy-border|--jy-accent|110, 123, 255|255, 255, 255/)
    expect(note, '注释须给出对该底色的 WCAG 实算值').toMatch(/\d+\.\d+:1/)
  })

  it('④ hover 整行微亮：li:hover 背景存在 + 带注释与对比度实算，叠加后目录正文仍 ≥ 4.5', () => {
    const row = ruleOf(ROW_RULE)
    expect(row, '概览条目行规则应存在（承载行内衬与定位上下文）').toBeTruthy()
    expect(row, '分隔线绝对定位需要 li 作定位上下文').toContain('position: relative')

    const hover = ruleOf(HOVER_RULE)
    expect(hover, 'hover 整行背景规则应存在（底层已有下划线，本票只补底色）').toBeTruthy()
    const { alpha } = rgbaOf(hover, 'background')
    expect(alpha).toBeGreaterThan(0)
    expect(alpha, '微亮不得亮成色块（克制）').toBeLessThanOrEqual(0.1)
    const note = leadingComment(HOVER_RULE)
    expect(note, 'hover 背景色必须带注释（取色来源）').toMatch(/--jy-accent|#6e7bff/)
    expect(note, '注释须给出对该底色的对比度实算').toMatch(/\d+\.\d+:1/)

    // 实算：hover 底色 = accent @alpha 叠在 nebula 最坏合成底上，其上 --jy-text 不得跌破 4.5
    const block = variantBlock('nocturne-dark')
    const hoverBg = over(tokenHex(block, '--jy-accent'), alpha, worstCaseSceneBase())
    expect(contrast(tokenHex(block, '--jy-text'), hoverBg), 'hover 态目录正文对比度').toBeGreaterThanOrEqual(4.5)
  })

  it('⑤ 目录区文本对「叠加 nebula 后」底色 ≥ 4.5（自写 alpha 合成，不经 tokenHex 读 rgba）', () => {
    const base = worstCaseSceneBase()
    expect(base, '三层 nebula 最坏全重叠合成底应为 #18192a（与 #2 记录一致，独立复算）').toBe(0x18192a)
    const block = variantBlock('nocturne-dark')
    // 概览条目文本继承 .juya-root 的 --jy-text（.juya-overview a 只写 color: inherit）
    expect(css, '概览文本色应继承 --jy-text').toMatch(/\.juya-root \{[\s\S]*?color: var\(--jy-text\)/)
    expect(contrast(tokenHex(block, '--jy-text'), base), '目录正文/合成底').toBeGreaterThanOrEqual(4.5)
    // 序号是承载目录序号的**文本**，同按 4.5 门槛
    expect(contrast(tokenHex(block, '--jy-accent'), base), '概览序号/合成底').toBeGreaterThanOrEqual(4.5)
  })

  it('⑥ 窄窗（≤520px）退化：撤掉横向外扩 + 微光收一档（该断点 .juya-issue 内边距仅 14px）', () => {
    const narrow = extractBlocks(css, /@media \(max-width: 520px\) \{/).find(
      (b) => b.includes('nocturne-dark') && b.includes('.juya-overview')
    )
    expect(narrow, '应存在含概览目录的 nocturne ≤520px 退化媒体块').toBeTruthy()
    expect(narrow, '撤掉负向外扩，线/高亮块留在文字列内').toMatch(/\.juya-overview li \{[^}]*margin: 0/)
    const narrowGlow = extractBlock(narrow!, new RegExp(esc(INDEX_RULE)))
    expect(narrowGlow, '窄窗须覆写序号微光强度').toBeTruthy()
    const baseRadius = Number(ruleOf(INDEX_RULE).match(/drop-shadow\(0 0 (\d+)px/)?.[1])
    const narrowRadius = Number(narrowGlow.match(/drop-shadow\(0 0 (\d+)px/)?.[1])
    expect(narrowRadius, '窄列里同半径占更大视觉比重，须收一档').toBeLessThan(baseRadius)
  })
})

describe('nocturne 字体语言守卫（2026-10-12，#3）', () => {
  // 需求：docs/juyathemesworks/nocturne-dark.md §2 —— 三档无衬线分工（零衬线），仅暗侧。
  // 本机实测（Fonts 注册表 596 条）：Inter / SF Pro Text / SF Pro Display 均未安装，
  // 原栈整体落回 Segoe UI + Noto Sans SC = 与应用 UI 字体无差别，风格识别度归零。
  // 可用中文黑体只有 Segoe UI / Noto Sans SC / 微软雅黑 / SimHei / DengXian，故首选必须在其中。
  const NIGHT = 'nocturne-dark'

  /** 去掉 CSS 注释：注释里可以提到被淘汰的字体名，断言只应针对声明本身 */
  const noComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '')

  /** 取 token 块内 rgba() 颜色（alpha 合成实算用） */
  const tokenRgba = (block: string, name: string): { rgb: number; alpha: number } => {
    const m = block.match(
      new RegExp(`${name.replace(/-/g, '\\-')}:\\s*rgba\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\s*\\)`)
    )
    if (!m) return { rgb: Number.NaN, alpha: Number.NaN }
    return { rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]), alpha: Number(m[4]) }
  }

  /** 半透明前景按 alpha 合成到不透明底色之上（WCAG 不定义半透明，必须先合成再算） */
  const over = (fg: { rgb: number; alpha: number }, bg: number): number => {
    const mix = (shift: number): number => {
      const f = (fg.rgb >> shift) & 0xff
      const b = (bg >> shift) & 0xff
      return Math.round(fg.alpha * f + (1 - fg.alpha) * b)
    }
    return (mix(16) << 16) | (mix(8) << 8) | mix(0)
  }

  /** 正文可能落在其上的半透明环境层：变体 background-image 全部 rgba + --jy-lead-bg */
  const ambientLayers = (block: string): Array<{ rgb: number; alpha: number }> => {
    const decl = block.match(/background-image:[^;]*/)?.[0] ?? ''
    const layers = [...decl.matchAll(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g)].map((m) => ({
      rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
      alpha: Number(m[4])
    }))
    const lead = tokenRgba(block, '--jy-lead-bg')
    if (!Number.isNaN(lead.alpha)) layers.push(lead)
    return layers
  }

  it('① 标题（h1/h2/h3）栈以 DengXian 起，正文栈以 Noto Sans SC 起', () => {
    const block = variantBlock(NIGHT)
    expect(block, `${NIGHT} --jy-font-heading 应为等线起始的三档无衬线栈`).toMatch(
      /--jy-font-heading:\s*'DengXian',\s*'Noto Sans SC',\s*'Segoe UI',\s*sans-serif/
    )
    expect(block, `${NIGHT} --jy-font-body 应为 Noto Sans SC 起始的正文栈`).toMatch(
      /--jy-font-body:\s*'Noto Sans SC',\s*'Segoe UI',\s*sans-serif/
    )
  })

  it('② 不引入本机未安装字体作首选：块内无 Inter / SF Pro，且两栈均以通用族 sans-serif 收尾（零衬线）', () => {
    const block = noComments(variantBlock(NIGHT))
    expect(block, `${NIGHT} 不应残留未安装的 Inter`).not.toContain('Inter')
    expect(block, `${NIGHT} 不应残留未安装的 SF Pro`).not.toContain('SF Pro')
    for (const decl of ['--jy-font-heading', '--jy-font-body']) {
      const declText = block.match(new RegExp(`${decl}:[^;]*`))?.[0] ?? ''
      expect(declText, `${decl} 须以通用族 sans-serif 收尾`).toMatch(/sans-serif$/)
      expect(declText.replace(/sans-serif/g, ''), `${decl} 不得含衬线族（零衬线）`).not.toContain('serif')
    }
  })

  it('③ 元信息/序号维持既有等宽栈（JetBrains Mono 首选），未被标题/正文档次污染', () => {
    for (const rest of ['\\.juya-feed-meta', '\\.juya-plate figcaption', '\\.juya-index']) {
      const rule = noctRule(rest)
      expect(rule, `.jynoct ${rest} 规则应存在`).toBeTruthy()
      expect(rule, `.jynoct ${rest} 应维持 JetBrains Mono 首选等宽栈`).toContain(
        "font-family: 'JetBrains Mono', 'SF Mono', Consolas, 'Noto Sans SC', monospace"
      )
    }
  })

  it('④ 变量被真实消费：h1/h2/h3 走 --jy-font-heading，正文根走 --jy-font-body', () => {
    expect(css, '.juya-root 正文应消费 --jy-font-body').toMatch(
      /\.juya-root \{[^}]*font-family: var\(--jy-font-body/
    )
    expect(css, 'h1 应消费 --jy-font-heading').toMatch(
      /\.juya-masthead h1 \{[^}]*font-family: var\(--jy-font-heading/
    )
    expect(css, 'h2 应消费 --jy-font-heading').toMatch(
      /\.juya-section > h2 \{[^}]*font-family: var\(--jy-font-heading/
    )
    expect(css, 'h3 应消费 --jy-font-heading').toMatch(
      /\.juya-entry h3 \{[^}]*font-family: var\(--jy-font-heading/
    )
  })

  it('⑤ 范围未越界：nocturne-light 字体栈字节不变（本轮仅暗侧）', () => {
    const light = variantBlock('nocturne-light')
    expect(light, `${'nocturne-light'} --jy-font-body 应保持原 Inter 栈`).toMatch(
      /--jy-font-body:\s*Inter,\s*'SF Pro Text',\s*'Segoe UI',\s*'Noto Sans SC',\s*sans-serif/
    )
    expect(light, `${'nocturne-light'} --jy-font-heading 应保持原 Inter 栈`).toMatch(
      /--jy-font-heading:\s*Inter,\s*'SF Pro Display',\s*'Segoe UI',\s*'Noto Sans SC',\s*sans-serif/
    )
  })

  it('⑥ 正文色对正文底 / 导语底 / 条目 hover 底（alpha 合成实算）均 ≥ 4.5', () => {
    const block = variantBlock(NIGHT)
    const text = tokenHex(block, '--jy-text')
    const bg = tokenHex(block, '--jy-bg')
    const lead = tokenRgba(block, '--jy-lead-bg')
    expect(text, `${NIGHT} --jy-text 应为 6 位 hex`).not.toBeNaN()
    expect(bg, `${NIGHT} --jy-bg 应为 6 位 hex`).not.toBeNaN()
    expect(lead.alpha, `${NIGHT} --jy-lead-bg 应为 rgba`).not.toBeNaN()
    expect(contrast(text, bg), 'text/bg').toBeGreaterThanOrEqual(4.5)
    const leadOverBg = over(lead, bg)
    expect(contrast(text, leadOverBg), 'text/lead-bg（合成到底色之上）').toBeGreaterThanOrEqual(4.5)
    // 条目 hover 底色即 --jy-lead-bg：先锁规则形态，再断言同一合成底色
    expect(noctRule('\\.juya-entry:hover'), '条目 hover 底色应走 --jy-lead-bg').toContain(
      'background: var(--jy-lead-bg)'
    )
    expect(contrast(text, leadOverBg), 'text/条目 hover 底（合成）').toBeGreaterThanOrEqual(4.5)
  })

  it('⑦ 叠加态：全部半透明环境层（background-image rgba + 导语底）全强度叠加后正文仍 ≥ 4.5', () => {
    const block = variantBlock(NIGHT)
    const text = tokenHex(block, '--jy-text')
    const bg = tokenHex(block, '--jy-bg')
    const layers = ambientLayers(block)
    expect(layers.length, '至少应有 --jy-lead-bg 一层可实算环境层').toBeGreaterThan(0)
    const stacked = layers.reduce((acc, layer) => over(layer, acc), bg)
    expect(contrast(text, stacked), 'text/环境层全叠加（最坏情形）').toBeGreaterThanOrEqual(4.5)
  })
})

describe('Scene 预设守卫（2026-10-12，#1）', () => {
  // 共享层预置票：Scene 新增 dust（尘埃级微粒）/ nebula（静态渐层雾）两个氛围预设，
  // 但本票**不做任何风格接线**（隔离爆炸半径：#2 才把 Scene 挂到 nocturne-dark）。
  const templatesDir = join(process.cwd(), 'src/renderer/juya/templates')
  const partsTsx = readFileSync(join(templatesDir, 'parts.tsx'), 'utf-8')
  // 不用花括号配平取 Scene（`({ … }: { … })` 的解构 `}` 先于类型 `{` 闭合，配平会截断）：
  // 以组件起点到下一个顶层导出的区间为准，同样不依赖行号
  const sceneSrc = (): string => {
    const start = partsTsx.indexOf('export function Scene(')
    const end = partsTsx.indexOf('export interface FeedGates')
    return start >= 0 && end > start ? partsTsx.slice(start, end) : ''
  }
  const dustRule = (): string => extractBlock(css, /(?:^|\n)\.juya-scene-dust \{/)
  const nebulaRule = (): string => extractBlock(css, /(?:^|\n)\.juya-scene-nebula \{/)
  /** 场景固定层区块（「场景固定层」段头 → 下一段「暗夜精修式」段头）：新规则必须落在此区间 */
  const sceneSection = (): string =>
    css.slice(css.indexOf('场景固定层（.juya-scene）'), css.indexOf('暗夜精修式'))
  /** 选择器所在的规则头文本（精确选择器比行号抗漂移；先剥注释，注释里的示例选择器不参与判定） */
  const selectorHeaders = (keyword: RegExp): string[] =>
    [...css.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter((sel) => keyword.test(sel))

  it('① dust / nebula 为可选预设（同 sun/grid/stars 机制），四者全假仍返回 null', () => {
    const scene = sceneSrc()
    expect(scene, 'Scene 组件应可提取').toBeTruthy()
    expect(scene, 'dust 应为可选 boolean 预设').toMatch(/dust\?:\s*boolean/)
    expect(scene, 'nebula 应为可选 boolean 预设').toMatch(/nebula\?:\s*boolean/)
    expect(scene, 'dust 默认关闭').toMatch(/dust = false/)
    expect(scene, 'nebula 默认关闭').toMatch(/nebula = false/)
    // falsy 门槛必须把既有三个与新增两个 prop 全部纳入（漏一个就会渲染空的场景容器）
    const gate = scene.match(/if \([^\n]*\) return null/)?.[0] ?? ''
    expect(gate, 'Scene 应有 falsy 门槛行').toBeTruthy()
    for (const prop of ['!sun', '!grid', '!stars', '!dust', '!nebula']) {
      expect(gate, `falsy 门槛应含 ${prop}`).toContain(prop)
    }
    // 各渲染一个 .juya-scene-* 子层（不是根层）
    expect(scene, 'dust 应渲染 .juya-scene-dust 子层').toMatch(
      /<div className="juya-scene-dust"[^>]*\/>/
    )
    expect(scene, 'nebula 应渲染 .juya-scene-nebula 子层').toMatch(
      /<div className="juya-scene-nebula"[^>]*\/>/
    )
  })

  it('② 两条新子层规则存在且落在场景层区块内；选择器一律场景层限定（不新增命中既有风格的通用选择器）', () => {
    expect(dustRule(), '.juya-scene-dust 规则应存在').toBeTruthy()
    expect(nebulaRule(), '.juya-scene-nebula 规则应存在').toBeTruthy()
    const section = sceneSection()
    expect(section, '场景固定层区块应可定位').toBeTruthy()
    expect(section, 'dust 基础规则应落在场景层区块内').toContain(dustRule())
    expect(section, 'nebula 基础规则应落在场景层区块内').toContain(nebulaRule())
    // 选择器白名单：只允许 .juya-scene-dust/nebula 本体 + 变体复合前缀（[data-juya-variant='…'] / .jy<abbr>）+
    // 组合子；其余任何东西（.juya-entry/.juya-feed/.jyxxx 裸类等通用选择器）都视为越界
    const headers = selectorHeaders(/juya-scene-(?:dust|nebula)/)
    expect(headers.length, '应至少两条新规则头').toBeGreaterThanOrEqual(2)
    for (const header of headers) {
      // 只校验确实涉及新子层的选择器分片（同一选择器列表里的既有 sun/stars 等不重判）
      const parts = header
        .split(',')
        .map((s) => s.trim())
        .filter((p) => /juya-scene-(?:dust|nebula)/.test(p))
      for (const part of parts) {
        const remainder = part
          .replace(/\.juya-scene-(?:dust|nebula)/g, '')
          .replace(/\[data-juya-variant='[^']*'\]/g, '')
          .replace(/\.jy[\w-]*/g, '')
          .replace(/[\s>+~]/g, '')
        expect(remainder, `「${part}」不得引入场景层以外的选择器`).toBe('')
      }
    }
  })

  it('③ dust：平铺 radial-gradient 点阵达一两千点量级（非 DOM 节点）+ 极低透明度 + 极慢漂浮/呼吸', () => {
    const rule = dustRule()
    expect(rule, '点阵应为平铺 radial-gradient').toContain('radial-gradient')
    expect(rule, '点数量级靠 background-size 平铺').toContain('background-size')
    // 点数量级实算（独立几何，不依赖实现）：1280×800 参考视口下 Σ 瓦片数 × 每瓦片停靠点
    const sizes = (rule.match(/background-size:\s*([^;]+);/)?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().split(/\s+/).map((v) => Number.parseFloat(v)))
    const stops = [...rule.matchAll(/radial-gradient\(/g)].length
    expect(stops, '应有多层点阵').toBeGreaterThanOrEqual(2)
    expect(sizes, '每个 radial-gradient 停靠点应有对应 background-size').toHaveLength(stops)
    const points = sizes.reduce((sum, [w, h]) => sum + (1280 / w) * (800 / h), 0)
    expect(points, '1280×800 下尘埃点数应为一两千点量级').toBeGreaterThanOrEqual(1000)
    expect(points, '不得堆到万点量级（会抢正文）').toBeLessThanOrEqual(2500)
    // 极低透明度：点色 alpha ≤ 0.2
    const alpha = Number.parseFloat(rule.match(/rgba\([^)]*?,\s*([\d.]+)\)/)?.[1] ?? 'NaN')
    expect(alpha, '尘埃点色应为极低 alpha').toBeLessThanOrEqual(0.2)
    // 极慢漂浮/呼吸，动画挂子层自身
    const anim = rule.match(/animation:\s*([^;]+);/)?.[1] ?? ''
    expect(anim, 'dust 动画应挂 .juya-scene-dust 子层').toContain('jy-dust')
    expect(anim, '极慢：单周期 ≥ 60s').toContain('96s')
    expect(Number.parseFloat(anim.match(/([\d.]+)s/)?.[1] ?? 'NaN')).toBeGreaterThanOrEqual(60)
    expect(anim, '应为往复呼吸（alternate + infinite）').toContain('infinite')
    expect(extractBlock(css, /@keyframes jy-dust[\w-]* \{/), 'dust 关键帧应存在').toBeTruthy()
    // 不造 DOM 节点：模板只有一个空子层 div，且无数量类 prop（点数量级由 CSS 平铺承担）
    expect(sceneSrc(), 'dust 子层应为单个空 div').toMatch(/<div className="juya-scene-dust"\s*\/>/)
    expect(sceneSrc(), 'dust 不应引入数量/节点类 prop').not.toMatch(/dustCount|dustNodes|dustQuantity/)
  })

  it('④ prefers-reduced-motion: reduce 下 dust 动画完全停止（并入既有场景 RM 块），nebula 不受影响', () => {
    const rmBlocks = extractBlocks(css, /@media \(prefers-reduced-motion: reduce\) \{/)
    const sceneRm = rmBlocks.find((b) => b.includes('.juya-scene-sun')) ?? ''
    expect(sceneRm, '既有场景 RM 块（sun/grid-persp/stars）应存在').toBeTruthy()
    expect(sceneRm, 'dust 应并入既有场景 RM 块').toContain('.juya-scene-dust')
    expect(sceneRm, 'dust 在 RM 下须完全停动画').toContain('animation: none')
    // nebula 本无动画，且不得被 RM 隐藏/改写（视觉不受影响）
    expect(css, 'nebula 不得声明 animation').not.toMatch(/\.juya-scene-nebula[^{}]*\{[^{}]*animation/)
    expect(css, 'nebula 不得声明 transition').not.toMatch(/\.juya-scene-nebula[^{}]*\{[^{}]*transition/)
    for (const block of rmBlocks) {
      expect(block, 'nebula 不应出现在任何 reduce 媒体块内（视觉不受影响）').not.toContain(
        '.juya-scene-nebula'
      )
    }
  })

  it('⑤ 动画只挂场景子层：整份 css 中 .juya-root 自身选择器无 animation 声明', () => {
    // 排除 `.juya-root *`（既有 reduce 块的全局动画时长压制，通配符不是 root 自身）
    const offenders = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, sel]) => /\.juya-root(?![\w-])/.test(sel) && !sel.includes('*'))
      .filter(([, body]) => /(?:^|[\s;])animation(?:-[\w]+)?\s*:/.test(body))
      .map(([, sel]) => sel.trim())
    expect(offenders, '.juya-root 永无 animation（reduced-motion 断言的结构保证）').toEqual([])
    expect(dustRule(), 'dust 动画须确实挂在子层').toMatch(/animation:\s*jy-dust/)
  })

  it('⑥ 其余风格回归（静态面）：模板目录内除 parts.tsx 与 nocturne.tsx（#2 接线）外零 dust/nebula 引用', () => {
    // #1 时本守卫锁的是「除定义处外零引用」（预置不接线）；#2 把 nocturne-dark 接上后必然变红，
    // 故按票面收窄为「除 parts.tsx / nocturne.tsx 外零引用」—— 守卫的价值是「其余六风格零影响」。
    const files = readdirSync(templatesDir).filter((f) => f.endsWith('.tsx'))
    expect(files.length, '模板目录应含全部风格模板').toBeGreaterThanOrEqual(10)
    const wired = new Set(['parts.tsx', 'nocturne.tsx'])
    for (const f of files) {
      if (wired.has(f)) continue
      const src = readFileSync(join(templatesDir, f), 'utf-8')
      expect(src, `${f} 不应引用 dust/nebula（接线仅限 nocturne-dark）`).not.toMatch(
        /\b(dust|nebula)\b/
      )
    }
  })

  it('⑦ 128px chrome 抬升：共享 .juya-scene 高度不改，根因与「段内抬升」约定显式记录，y2k 缓解保留', () => {
    expect(
      extractBlock(css, /(?:^|\n)\.juya-scene \{/),
      '共享 .juya-scene 高度不得改动（会波及 dreamcore/y2k 的既有观感）'
    ).toContain('height: 100vh')
    const section = sceneSection()
    expect(section, '须显式记录 128px chrome 未扣的根因').toContain('128px')
    expect(section, '须记录「各风格段内抬升」的处置约定').toContain('段内抬升')
    expect(section, 'y2k 既有段内缓解须保留').toContain('bottom: 136px')
    expect(
      css,
      '变体专属覆盖不得用带空格的后代形式（永不匹配）'
    ).not.toMatch(/\[data-juya-variant='[^']+'\]\s+\.juya-scene-/)
  })

  it('⑧ nebula 三层为 CSS 自定义属性（中性默认）；叠加到 nocturne-dark bg 后 muted 仍 ≥ 4.5（WCAG 实算）', () => {
    const rule = nebulaRule()
    const layers = [1, 2, 3].map((n) => {
      const m = rule.match(
        new RegExp(`--jy-nebula-${n}:\\s*rgba\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\s*\\)`)
      )
      expect(m, `--jy-nebula-${n} 应为 rgba 字面值（供变体覆盖的单一入口）`).toBeTruthy()
      return { r: Number(m?.[1]), g: Number(m?.[2]), b: Number(m?.[3]), a: Number(m?.[4]) }
    })
    layers.forEach((l, i) => {
      expect(l.r, `--jy-nebula-${i + 1} 应为中性灰（不预设任何变体色相，避免与其余五风格撞色）`).toBe(l.g)
      expect(l.g, `--jy-nebula-${i + 1} 应为中性灰`).toBe(l.b)
      expect(l.a, `--jy-nebula-${i + 1} 中性默认 alpha 应浅（≤0.1）`).toBeLessThanOrEqual(0.1)
    })
    // 独立实算：三层按 CSS 绘制顺序（下层→上层）source-over 合成到 nocturne-dark bg 上
    const dark = variantBlock('nocturne-dark')
    const bg = tokenHex(dark, '--jy-bg')
    const muted = tokenHex(dark, '--jy-muted')
    expect(bg, 'nocturne-dark --jy-bg 应为 6 位 hex').not.toBeNaN()
    expect(muted, 'nocturne-dark --jy-muted 应为 6 位 hex').not.toBeNaN()
    let channels = [(bg >> 16) & 0xff, (bg >> 8) & 0xff, bg & 0xff]
    for (const l of [...layers].reverse()) {
      channels = channels.map((c, i) => Math.round(c * (1 - l.a) + [l.r, l.g, l.b][i] * l.a))
    }
    const composited = (channels[0] << 16) | (channels[1] << 8) | channels[2]
    expect(contrast(muted, composited), 'nebula 叠加后 muted/合成底 ≥ AA 4.5').toBeGreaterThanOrEqual(4.5)
  })

  it('⑨ 新增构成色硬编码带注释：dust / nebula 规则前须注明取色来源与对比度', () => {
    for (const [name, rule] of [
      ['dust', dustRule()],
      ['nebula', nebulaRule()]
    ] as const) {
      const idx = css.indexOf(rule)
      expect(idx, `${name} 规则应存在`).toBeGreaterThanOrEqual(0)
      const preceding = css.slice(Math.max(0, idx - 1200), idx)
      expect(preceding, `${name} 硬编码色须注明取色来源与 WCAG 对比度`).toMatch(/WCAG/)
      expect(preceding, `${name} 硬编码色须给出对比度数值`).toMatch(/对比度|:1/)
    }
  })
})

describe('nocturne 场景接线守卫（2026-10-12，#2）', () => {
  // #2 把 #1 预置的 dust（尘埃微粒）/ nebula（静态渐层雾）接到 nocturne-dark 阅读页。
  // 断言面全部是独立可复算的量：源码顺序、规则实值（regex 抠取，不读注释文字）、
  // 中心区零覆盖的椭圆几何推导、叠加态 WCAG 实算、窄窗退化、reduced-motion 分流。
  const templatesDir = join(process.cwd(), 'src/renderer/juya/templates')
  const nocturneTsx = readFileSync(join(templatesDir, 'nocturne.tsx'), 'utf-8')
  /** nocturne 段（「暗夜精修式」段头 → 「杂志编辑式」段头） */
  const noctSection = (): string => css.slice(css.indexOf('暗夜精修式'), css.indexOf('杂志编辑式'))
  /** nocturne-dark 的变体作用域 nebula 覆盖（复合选择器形态；首个匹配即基础规则，窄窗规则在其后） */
  const nebulaOverride = (): string =>
    extractBlock(css, /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula \{/)
  /** 抠出覆盖规则里 --jy-nebula-N 的 rgba 实值（断言实现值，不读注释） */
  const nebulaLayers = (rule: string): { r: number; g: number; b: number; a: number }[] =>
    [1, 2, 3].map((n) => {
      const m = rule.match(
        new RegExp(`--jy-nebula-${n}:\\s*rgba\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\s*\\)`)
      )
      return { r: Number(m?.[1]), g: Number(m?.[2]), b: Number(m?.[3]), a: Number(m?.[4]) }
    })
  /** 三层雾的定位参数（椭圆半径 / 中心 / transparent 停靠点，单位 %） */
  const nebulaEllipses = (
    rule: string
  ): { rx: number; ry: number; cx: number; cy: number; stop: number; token: string }[] =>
    [
      ...rule.matchAll(
        /radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%\s*,\s*var\((--jy-nebula-\d)\)\s*,\s*transparent\s+([\d.]+)%\s*\)/g
      )
    ].map((m) => ({
      rx: Number(m[1]),
      ry: Number(m[2]),
      cx: Number(m[3]),
      cy: Number(m[4]),
      token: m[5],
      stop: Number(m[6])
    }))
  /** 把 rgba 层按自下而上顺序 source-over 合成到纯色底上（返回 0xRRGGBB） */
  const over = (bg: number, layers: { r: number; g: number; b: number; a: number }[]): number => {
    let ch = [(bg >> 16) & 0xff, (bg >> 8) & 0xff, bg & 0xff]
    for (const l of layers) {
      ch = ch.map((c, i) => Math.round(c * (1 - l.a) + [l.r, l.g, l.b][i] * l.a))
    }
    return (ch[0] << 16) | (ch[1] << 8) | ch[2]
  }

  it('① 模板接线：IssueView 挂 <Scene dust nebula />，源码顺序在 .juya-issue 之前（与 y2k/dreamcore 同位）', () => {
    const partsImport = nocturneTsx.match(/^import \{([^}]*)\} from '\.\/parts'$/m)?.[1] ?? ''
    expect(partsImport, 'Scene 须从共享层 ./parts 引入').toMatch(/\bScene\b/)
    const tag = nocturneTsx.match(/<Scene\b[^>]*\/>/)?.[0] ?? ''
    expect(tag, 'IssueView 须挂载 Scene').toBeTruthy()
    expect(tag, 'dust 预设须开启').toMatch(/\bdust\b/)
    expect(tag, 'nebula 预设须开启').toMatch(/\bnebula\b/)
    const issueView = nocturneTsx.slice(
      nocturneTsx.indexOf('function IssueView'),
      nocturneTsx.indexOf('function FeedList')
    )
    expect(issueView, 'Scene 须落在 IssueView 内（订阅页不挂场景）').toContain('<Scene')
    const sceneIdx = nocturneTsx.indexOf('<Scene')
    const issueIdx = nocturneTsx.indexOf('className="juya-issue"')
    expect(issueIdx, '.juya-issue 容器须存在').toBeGreaterThan(-1)
    expect(sceneIdx, 'Scene 须在 .juya-issue 之前（场景在内容之下，z-index 0）').toBeLessThan(issueIdx)
  })

  it('② 三层 alpha 取减半值 0.07 / 0.04 / 0.025、色相沿用需求 §3.1 左列，且覆盖写复合选择器', () => {
    const rule = nebulaOverride()
    expect(
      rule,
      "须有 [data-juya-variant='nocturne-dark'].jynoct .juya-scene-nebula 覆盖规则"
    ).toBeTruthy()
    // 死形态（变体前缀 + 空格 + 风格类）永不匹配：nocturne-dark 覆盖不得依赖它
    expect(css, 'nocturne-dark 覆盖不得写带空格的后代形态').not.toMatch(
      /\[data-juya-variant='nocturne-dark'\]\s+\.jynoct/
    )
    const layers = nebulaLayers(rule)
    expect(layers.map((l) => [l.r, l.g, l.b]), '色相沿用需求 §3.1 左列').toEqual([
      [110, 123, 255],
      [90, 160, 255],
      [200, 90, 180]
    ])
    expect(layers.map((l) => l.a), '三层 alpha 须为全强度的一半').toEqual([0.07, 0.04, 0.025])
  })

  it('③ 叠加态实算：减半三层叠加后 --jy-muted ≥ 4.5；全强度跌破 4.5（锁死禁用取值）', () => {
    const dark = variantBlock('nocturne-dark')
    const bg = tokenHex(dark, '--jy-bg')
    const muted = tokenHex(dark, '--jy-muted')
    expect(bg, 'nocturne-dark --jy-bg 应为 6 位 hex').not.toBeNaN()
    expect(muted, 'nocturne-dark --jy-muted 应为 6 位 hex').not.toBeNaN()
    const half = nebulaLayers(nebulaOverride())
    // CSS 首个 background-image 画在最上层 ⇒ 自下而上合成时 --jy-nebula-1 最后叠（同 #1 守卫⑧实算）
    const composited = over(bg, [...half].reverse())
    expect(
      contrast(muted, composited),
      '减半叠加（最坏情况三层全重叠）后 muted/合成底'
    ).toBeGreaterThanOrEqual(4.5)
    const full = half.map((l, i) => ({ ...l, a: [0.14, 0.08, 0.05][i] }))
    expect(
      contrast(muted, over(bg, [...full].reverse())),
      '全强度必须跌破 AA —— 该取值禁止'
    ).toBeLessThan(4.5)
  })

  it('④ 正文列中心区零覆盖：三层雾锚在水平边缘，椭圆可见范围不得伸入中央带 35%–65%', () => {
    const ellipses = nebulaEllipses(nebulaOverride())
    expect(ellipses, '三层雾应各为一条定位 radial-gradient').toHaveLength(3)
    expect(ellipses.map((e) => e.token)).toEqual([
      '--jy-nebula-1',
      '--jy-nebula-2',
      '--jy-nebula-3'
    ])
    expect(
      ellipses.filter((e) => e.cy <= 5).length,
      '至少两层贴着页面顶部（需求「顶部与两侧边缘」）'
    ).toBeGreaterThanOrEqual(2)
    const CENTER_LO = 35
    const CENTER_HI = 65
    for (const e of ellipses) {
      expect(Math.min(e.cx, 100 - e.cx), `${e.token} 须锚在左右边缘`).toBeLessThanOrEqual(15)
      // 可见水平半幅 = 水平半径 × transparent 停靠点（alpha 在该停靠点归零）
      const reach = e.rx * (e.stop / 100)
      const inner = e.cx <= 50 ? e.cx + reach : e.cx - reach
      // 椭圆径向距离沿 y 单调不减 ⇒ 峰值行不可达即整条水平线全高不可达
      const ok = e.cx <= 50 ? inner <= CENTER_LO : inner >= CENTER_HI
      expect(ok, `${e.token} 可见内缘 ${inner.toFixed(1)}% 侵入了中央带 ${CENTER_LO}–${CENTER_HI}%`).toBe(
        true
      )
    }
  })

  it('⑤ 窄窗（≤520px）退化：正文列撑满全宽时 nebula 收束为顶部窄带（不占左右边缘，与 #5 遮罩互斥面为零）', () => {
    const blocks = extractBlocks(css, /@media \(max-width: 520px\) \{/)
    const scoped = blocks.filter((b) =>
      b.includes("[data-juya-variant='nocturne-dark'].jynoct .juya-scene-nebula")
    )
    expect(scoped, '≤520px 须有 nocturne-dark 专属的 nebula 退化规则').toHaveLength(1)
    const rule = extractBlock(
      scoped[0],
      /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula \{/
    )
    expect(rule, '退化规则体应可提取').toBeTruthy()
    const ellipses = nebulaEllipses(rule)
    expect(ellipses, '收束为单条顶带（左右边缘雾全部撤除）').toHaveLength(1)
    expect(ellipses[0].cy, '只贴页面顶部').toBeLessThanOrEqual(5)
    expect(ellipses[0].ry, '纵向只覆盖刊头区（≤30% 场景高）').toBeLessThanOrEqual(30)
    expect(rule, '不得引入贴底偏移').not.toMatch(/(?:^|[;\s])bottom\s*:/)
  })

  it('⑥ 128px chrome：本变体无贴底装饰故不需段内抬升（判断显式记录，共享高度与 y2k 缓解均不动）', () => {
    const scopedSceneRules = [
      ...css.matchAll(/\[data-juya-variant='nocturne-dark'\][^{}]*\.juya-scene[\w-]*[^{}]*\{[^{}]*\}/g)
    ].map((m) => m[0])
    expect(
      scopedSceneRules.length,
      'nocturne-dark 应有场景层专属规则（nebula 覆写 + 窄窗退化）'
    ).toBeGreaterThanOrEqual(1)
    for (const rule of scopedSceneRules) {
      expect(rule, '无贴底装饰 ⇒ 不得引入无意义的 bottom 偏移量').not.toMatch(
        /(?:^|[;\s])bottom\s*:/
      )
    }
    const section = noctSection()
    expect(section, '抬升判断须写在 nocturne 段内').toContain('本变体无贴底装饰，故不需段内抬升')
    expect(section, '须给出被免除的 128px chrome 依据').toContain('128px')
    expect(section, '须记录两层均 inset:0 铺满场景盒').toContain('inset: 0')
    expect(extractBlock(css, /(?:^|\n)\.juya-scene \{/), '共享场景高度不改').toContain(
      'height: 100vh'
    )
    expect(extractBlock(css, /(?:^|\n)\.juya-scene-nebula \{/), 'nebula 铺满场景盒').toContain(
      'inset: 0'
    )
    expect(extractBlock(css, /(?:^|\n)\.juya-scene-dust \{/), 'dust 铺满场景盒').toContain('inset: 0')
    expect(css, 'y2k 段内缓解须保留').toContain('bottom: 136px')
  })

  it('⑦ RM 分流：dust 在 reduce 块内 animation:none，nebula 保留（本无动画，不得被一并取消）', () => {
    const rmBlocks = extractBlocks(css, /@media \(prefers-reduced-motion: reduce\) \{/)
    const sceneRm = rmBlocks.find((b) => b.includes('.juya-scene-dust')) ?? ''
    expect(sceneRm, 'dust 须并入既有场景 RM 块').toBeTruthy()
    const dustRuleRm = sceneRm.match(/\{[^{}]*\.juya-scene-dust[^{}]*\{[^{}]*\}/)?.[0] ?? ''
    expect(dustRuleRm, 'dust 在 RM 下须整条 animation 关闭（含 animation-name）').toContain(
      'animation: none'
    )
    for (const block of rmBlocks) {
      expect(block, 'nebula 本无动画 ⇒ 不得出现在任何 reduce 块内（静态雾保留）').not.toContain(
        '.juya-scene-nebula'
      )
    }
    expect(nebulaOverride(), 'nebula 覆盖规则不得引入动画/过渡').not.toMatch(
      /\b(?:animation|transition)\s*:/
    )
  })

  it('⑧ dust 沿用共享层中性默认：本变体不覆写 --jy-scene-dust（覆写只会抬高存在感）', () => {
    // 剥注释后判定：注释里引用选择器形态（写作规范示例）不算实现
    const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const overrides = cssCode.match(/\[data-juya-variant='nocturne-dark'\][^{}]*\.juya-scene-dust/g) ?? []
    expect(overrides, 'nocturne-dark 不覆写 dust token（需求 §3.2「不抢正文」）').toEqual([])
    const rule = extractBlock(css, /(?:^|\n)\.juya-scene-dust \{/)
    const alpha = Number.parseFloat(
      rule.match(/--jy-scene-dust:\s*rgba\([^)]*?,\s*([\d.]+)\)/)?.[1] ?? 'NaN'
    )
    expect(alpha, '尘埃点色 alpha 应极低（≤0.2）').toBeLessThanOrEqual(0.2)
    expect(noctSection(), '沿用判断须在 nocturne 段内留痕').toContain('--jy-scene-dust')
  })
})

/**
 * #5 正文阅读窗守卫（2026-10-12）：收窄列（680–720px，变体作用域覆写）+ 左右渐隐遮罩（20–30px / alpha 0.3）。
 * 断言面全部是从规则体 regex 抠出的**实值**（注释只是留痕，不读注释文字）：
 * 复合选择器形态 + max-width 落值 / 遮罩 alpha 与宽度 / 100% 停靠点使内缘 alpha 归零（文本区零衰减的
 * 几何证明）/ 叠加 nebula 后的 WCAG 实算（tokenHex 只读 hex ⇒ rgba 自写 alpha 合成）/
 * 遮罩不引入横向溢出面与越界定位。构成色与两条实现路径的取舍依据见实现处注释。
 */
describe('nocturne 阅读窗守卫（2026-10-12，#5）', () => {
  /** 剥注释后的代码视图：注释里出现的 `{` `}` `,` `%` 会破坏结构抠取与色标扫描（#2 守卫⑧同思路） */
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const ISSUE_SEL = "[data-juya-variant='nocturne-dark'].jynoct .juya-issue"
  const MASK_VAR = '--jy-window-mask'
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  /** 取某选择器**独占规则头**（行首、选择器后直接跟 `{`）的规则块：
   *  ① 排除缩进的媒体查询内规则；② 排除分组规则头里的同名分片（如共用规则 `X::before,\nX::after {`） */
  const blk = (selector: string): string => {
    const re = new RegExp(`(?:^|\\n)${esc(selector)}(?=[ \\t]*\\{)`)
    return re.test(code) ? extractBlock(code, re) : ''
  }
  const pxOf = (block: string, prop: string): number => pxValues(decl(block, prop))[0] ?? Number.NaN

  /** 某选择器在**每个**匹配位置的完整规则块（同一选择器可先出现在分组规则头、再作为独立规则头） */
  const blocks = (selector: string): string[] => {
    const re = new RegExp(`(?:^|\\n)${esc(selector)}(?=[ \\t]*\\{)`, 'g')
    const out: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(code)) !== null) {
      const from = m.index + (m[0].startsWith('\n') ? 1 : 0)
      const end = code.indexOf('}', from)
      if (end > from) out.push(code.slice(from, end + 1))
    }
    return out
  }
  /** 取某选择器的**行为规则**块：分组规则头里只有共享声明（定位/宽度/深度），
   *  行为声明（background / left / right）落在紧随其后的独立规则头里 ⇒ 优先取含该声明的块 */
  const behavior = (selector: string, probe: RegExp): string =>
    blocks(selector).find((b) => probe.test(b)) ?? ''

  const issueRule = (): string => blk(ISSUE_SEL)
  /** 两侧遮罩的共用规则（分组选择器 `X::before,\nX::after {`） */
  const maskCommon = (): string =>
    extractBlock(
      code,
      new RegExp(`(?:^|\\n)${esc(ISSUE_SEL)}::before,[\\s\\S]*?${esc(ISSUE_SEL)}::after[ \\t]*\\{`)
    )
  /** 左右两条渐变规则（各自的 background/left|right）；须跳过分组规则头里的同名分片 */
  const maskSide = (side: 'before' | 'after'): string =>
    behavior(`${ISSUE_SEL}::${side}`, /linear-gradient\(/)
  /** 规则的 `background` 声明值（`background-repeat` 是另一条声明，故按「background + 可选空白 + :」精确取） */
  const bgOf = (rule: string): string =>
    rule.replace(/\/\*[\s\S]*?\*\//g, '').match(/(?:^|[;{\s])background[ \t]*:[ \t]*([^;}]+)/)?.[1]?.trim() ??
    ''

  /** 抠 linear-gradient 的方向与色标（色标一律写成「色词 偏移%」；深度档引用共用 token） */
  const gradientOf = (rule: string): { dir: string; stops: { color: string; off: number }[] } => {
    const value = bgOf(rule)
    const dir = value.match(/linear-gradient\(\s*([^,]+),/)?.[1]?.trim() ?? ''
    const stops = [
      ...value.matchAll(/(var\(--[\w-]+\)|rgba?\([^)]*\)|transparent)\s+([\d.]+)%/g)
    ].map((m) => ({ color: m[1], off: Number(m[2]) }))
    return { dir, stops }
  }

  /** 抠规则里某个自定义属性的 rgba 实值（tokenHex 读不了 rgba） */
  const rgbaOf = (block: string, name: string): [number, number, number, number] => {
    const m = block.match(
      new RegExp(
        `${name.replace(/-/g, '\\-')}:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\d.]+)\\s*\\)`
      )
    )
    if (!m) throw new Error(`${name} 未解析到 rgba`)
    return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  }

  /** source-over 合成半透明层到不透明底色（WCAG 不定义半透明色，必须先合成再算） */
  const over = (layer: [number, number, number, number], base: number): number => {
    const ch = [16, 8, 0].map((shift) => {
      const l = (layer[0] >> shift) & 0xff
      return Math.round(layer[3] * l + (1 - layer[3]) * ((base >> shift) & 0xff))
    })
    return (ch[0] << 16) | (ch[1] << 8) | ch[2]
  }
  const hex = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`

  it('① 收窄列：变体作用域复合选择器覆写 max-width，实值落 680–720 且仍居中', () => {
    const rule = issueRule()
    expect(rule, `须有 ${ISSUE_SEL} 收窄规则`).toBeTruthy()
    // 基层 760px 是八风格共享（改它会波及其余 7 风格与订阅页）⇒ 必须仍在，收窄只能靠变体覆写
    expect(extractBlock(css, /(?:^|\n)\.juya-issue \{/), '基层 .juya-issue 不得被改').toContain(
      'max-width: 760px'
    )
    const maxWidth = pxOf(rule, 'max-width')
    expect(Number.isNaN(maxWidth), 'max-width 须写成 px 绝对值').toBe(false)
    expect(maxWidth, '收窄列实值须落 680–720px').toBeGreaterThanOrEqual(680)
    expect(maxWidth, '收窄列实值须落 680–720px').toBeLessThanOrEqual(720)
    expect(decl(rule, 'margin'), '收窄后仍须居中').toMatch(/\bauto\b/)
    // 死形态（变体前缀 + 空格 + 风格类）永不匹配
    expect(code, 'nocturne-dark 覆写不得写带空格的后代形态').not.toMatch(
      /\[data-juya-variant='nocturne-dark'\]\s+\.jynoct/
    )
    // 回归红线：宽度覆写不得动高度链（zoom.spec 断 zoom2 下 .juya-issue 高度 >1.5×；feed.spec 断 .juya-root 高度 ≥ 滚动容器）
    expect(rule, '宽度覆写不得引入高度/溢出声明').not.toMatch(
      /(?:^|[;\s])(?:height|max-height|min-height|overflow[\w-]*)\s*:/
    )
  })

  it('② 遮罩深度实值 = alpha 0.3（票面锁定）；0.4 与 0.2 均不得出现', () => {
    const common = maskCommon()
    expect(common, '两侧遮罩须有共用规则（定位/宽度/深度）').toBeTruthy()
    // 深度只允许有一处字面 rgba ⇒ 两侧必然同深（改深度只能改这一处）
    const literals = [...code.matchAll(new RegExp(`${MASK_VAR}:\\s*(rgba\\([^)]*\\))`, 'g'))].map(
      (m) => m[1].replace(/\s+/g, '')
    )
    expect(literals, '深度 token 须全份唯一（避免两侧深度漂移）').toEqual(['rgba(10,10,12,0.3)'])
    const depth = rgbaOf(common, MASK_VAR)
    expect(depth[3], '遮罩最深处 alpha 须取票面决策值 0.3').toBe(0.3)
    const seen = [common, maskSide('before'), maskSide('after')]
    expect(seen.filter(Boolean), '共用规则 + 左右两条渐变规则须齐备').toHaveLength(3)
    for (const rule of seen) {
      const alphas = [...rule.matchAll(/rgba\([^)]*?,\s*([\d.]+)\s*\)/g)].map((m) =>
        Number.parseFloat(m[1])
      )
      for (const a of alphas) expect(a, '规则内 rgba 深度只允许 0.3').toBe(0.3)
      expect(rule, '0.4 会致正文 4.63:1 逼近 AA 底线 —— 禁止').not.toMatch(/,\s*0\.4\s*\)/)
      expect(rule, '0.2 存在感弱于决策值 —— 不得取代').not.toMatch(/,\s*0\.2\s*\)/)
    }
    for (const side of ['before', 'after'] as const) {
      const rule = maskSide(side)
      expect(bgOf(rule), `${side} 须引用共用深度 token`).toContain(`var(${MASK_VAR})`)
      // 单条渐变恰好铺满 24px 宽的遮罩盒；显式 no-repeat 不依赖 background-size 退化行为
      expect(decl(rule, 'background-repeat'), `${side} 渐变不得平铺`).toBe('no-repeat')
    }
  })

  it('③ 遮罩宽度 20–30px，且止于文字列缘（不压字）—— 范围受 .juya-issue 内边距约束', () => {
    const rule = issueRule()
    // padding 简写按 CSS 展开：1 值=四边同；2 值=上下/水平；3 值=上/水平/下；4 值=上/右/下/左
    const pad = decl(rule, 'padding')
      .split(/\s+/)
      .map((v) => Number.parseFloat(v))
    expect(pad.length, '收窄规则须显式写 padding（守卫据此算正文列缘）').toBeGreaterThanOrEqual(3)
    expect(pad.every((n) => !Number.isNaN(n)), 'padding 须为 px 数值').toBe(true)
    const padX = pad.length === 4 ? pad[3] : pad.length === 2 ? pad[0] : pad[1]
    expect(padX, '收窄规则的水平内边距须等于基层 24px').toBe(24)
    const common = maskCommon()
    const w = pxOf(common, 'width')
    expect(Number.isNaN(w), '遮罩须用 width 显式定宽').toBe(false)
    expect(w, '遮罩宽度须落 20–30px').toBeGreaterThanOrEqual(20)
    expect(w, '遮罩宽度须落 20–30px').toBeLessThanOrEqual(30)
    // 宽度 = 水平内边距 ⇒ 内缘恰好停在文字列缘：文字像素处遮罩 alpha 恒为 0（不削减正文对比度）
    expect(w, '遮罩内缘须止于文字列缘（不侵入正文）').toBeLessThanOrEqual(padX)
    expect(decl(common, 'position'), '遮罩须绝对定位于 .juya-issue 内').toBe('absolute')
    expect(decl(common, 'pointer-events'), '遮罩不得拦截正文点击').toBe('none')
    expect(decl(common, 'top'), '纵向贴齐 .juya-issue').toBe('0')
    expect(decl(common, 'bottom'), '纵向贴齐 .juya-issue').toBe('0')
  })

  it('④ 渐隐方向：外缘（贴边）为最深处 0%，内缘停在 transparent 100%（alpha 归零）', () => {
    const sides = [
      { side: 'before' as const, edge: 'left', deg: '90deg' },
      { side: 'after' as const, edge: 'right', deg: '270deg' }
    ]
    for (const { side, edge, deg } of sides) {
      const rule = maskSide(side)
      expect(rule, `${side} 规则须存在`).toBeTruthy()
      // top/bottom 已贴齐，故 0%/100% 两停靠点即横跨整条遮罩宽度
      expect(decl(rule, edge), `遮罩须贴 ${edge} 缘`).toBe('0')
      const { dir, stops } = gradientOf(rule)
      expect(stops, '遮罩应为两端色标（深度 0% → transparent 100%）').toHaveLength(2)
      expect(stops[0].color, '最深处须引用共用深度 token').toBe(`var(${MASK_VAR})`)
      expect(stops[0].off, '0% 处即最深处（贴边）').toBe(0)
      expect(stops[1].color, '内缘须渐隐到 transparent ⇒ alpha 0').toBe('transparent')
      expect(stops[1].off, '停靠点须覆盖整条遮罩宽度').toBe(100)
      // 双位置写法 `transparent 100% 100%`：末档把「100% 及其后」显式钉为全透明，
      // 不依赖单位置色标的隐式延续（语义更强，等价于几何上「内缘起 alpha 恒 0」）
      expect(bgOf(rule), '内缘全透明须显式到尾（100% 100%）').toMatch(/transparent\s+100%\s+100%/)
      expect(dir, `渐隐方向须自${edge === 'left' ? '左' : '右'}缘指向列内`).toBe(deg)
    }
    expect(gradientOf(maskSide('before')).dir, '两侧方向须互为镜像').not.toBe(
      gradientOf(maskSide('after')).dir
    )
  })

  it('⑤ 叠加 nebula 后正文对比度 ≥ 4.5（自写 alpha 合成；同时反证全强度与 0.4 两条失效侧）', () => {
    const dark = variantBlock('nocturne-dark')
    const bg = tokenHex(dark, '--jy-bg')
    const text = tokenHex(dark, '--jy-text')
    const muted = tokenHex(dark, '--jy-muted')
    for (const [label, v] of [
      ['--jy-bg', bg],
      ['--jy-text', text],
      ['--jy-muted', muted]
    ] as const) {
      expect(v, `nocturne-dark ${label} 应为 6 位 hex`).not.toBeNaN()
    }
    // 遮罩色相须取自本变体 --jy-bg（只做渐隐不做染色）
    const mask = rgbaOf(maskCommon(), MASK_VAR)
    const bgRgb = [(bg >> 16) & 0xff, (bg >> 8) & 0xff, bg & 0xff]
    /** rgba 抠出的是 [r,g,b,a] 通道数组；合成函数吃 0xRRGGBB ⇒ 打包成 [rgb, r, g, a] */
    const layerOf = (rgba: number[], alpha = rgba[3]): [number, number, number, number] => [
      (rgba[0] << 16) | (rgba[1] << 8) | rgba[2],
      rgba[0],
      rgba[1],
      alpha
    ]
    expect([mask[0], mask[1], mask[2]], '遮罩色相须等于 --jy-bg').toEqual(bgRgb)

    // 三层 nebula alpha/色相抠自 #2 落地的变体覆写规则（行首顶条，非窄窗态）
    const nebulaRules = [
      ...code.matchAll(
        /(?:^|\n)\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula \{[^}]*\}/g
      )
    ].map((m) => m[0])
    const nebulaRule = nebulaRules.find((r) => r.includes('--jy-nebula-1')) ?? ''
    expect(nebulaRule, '须能抠到 #2 的三层 nebula 取值').toBeTruthy()
    // CSS 首个 background-image 画在最上层 ⇒ 自下而上合成时 --jy-nebula-1 最后叠（同 #2 守卫③）
    const layers = [1, 2, 3].map((n) => layerOf(rgbaOf(nebulaRule, `--jy-nebula-${n}`)))
    const composited = [...layers].reverse().reduce((acc, l) => over(l, acc), bg)
    expect(hex(composited), '减半三层全重叠的最坏合成底').toBe('#18192a')

    // 正文列中心区底色 = 该合成底（#2 已把雾锚在左右水平边缘，中心区零覆盖）。
    // 文本像素处遮罩 alpha = 0（几何闭环见 ③④：遮罩宽度 = 水平内边距）⇒ 正文对比度即下式。
    expect(contrast(text, bg), '裸 --jy-bg 上的正文对比度（未叠雾的基线）').toBeGreaterThan(
      contrast(text, composited)
    )
    expect(contrast(text, composited), '正文 --jy-text 对 nebula 合成底').toBeGreaterThanOrEqual(4.5)
    expect(contrast(text, composited), '正文实测值应显著高于门槛（锁住当前真值）').toBeGreaterThan(9)
    expect(contrast(text, composited), '正文实测值（1e-4 容差，防止注释数值漂移）').toBeCloseTo(
      10.0762,
      3
    )
    expect(
      contrast(muted, composited),
      '栏内 muted 文本（导语/元信息）对同一合成底亦须 ≥ 4.5'
    ).toBeGreaterThanOrEqual(4.5)
    expect(contrast(muted, composited), 'muted 实测值（1e-4 容差）').toBeCloseTo(5.1192, 3)

    // 反证 a：#2 已禁的全强度三层 ⇒ muted 跌破 AA
    const full = layers.map((l, i) => layerOf([l[1], l[2], l[0] & 0xff], [0.14, 0.08, 0.05][i]))
    const fullBase = [...full].reverse().reduce((acc, l) => over(l, acc), bg)
    expect(hex(fullBase), '全强度合成底').toBe('#262845')
    expect(contrast(muted, fullBase), '全强度取值必须跌破 4.5').toBeLessThan(4.5)

    // 反证 b：票面 §5「遮罩越深 → 对比度越低，0.4 逼近 AA 底线、不得采用」的失败侧。
    // 口径：把「文字像素处戴着 alpha 深的遮罩」合成为最终字色，再对最坏合成底计对比度
    // （遮罩色 = --jy-bg，即向底色衰减）。实测 0.3 仍有余量、0.4 跌破 4.5 —— 与票面判定同侧
    //（本票几何使文字像素 alpha 恒为 0，故此式只是失败侧的反证，不代表本实现的实际字色）。
    const fade = (a: number): number => contrast(over(layerOf(bgRgb, a), text), composited)
    expect(fade(0.3), 'alpha 0.3 在最坏合成底上仍须达标').toBeGreaterThanOrEqual(4.5)
    expect(fade(0.4), 'alpha 0.4 必须跌破 4.5（票面「不得采用」的失败侧）').toBeLessThan(4.5)
    expect(fade(0.4), '0.4 必须明显劣于 0.3').toBeLessThan(fade(0.3))
    // muted 文本同口径更早跌破：这正是本票选「遮罩内缘止于文字列缘、文字零衰减」几何的原因
    expect(
      contrast(over(layerOf(bgRgb, 0.3), muted), composited),
      'muted 若同深衰减会跌破 AA'
    ).toBeLessThan(4.5)
  })

  it('⑥ 遮罩不得产生横向滚动条：无 overflow 声明、无越界定位、不脱离 .juya-issue 盒', () => {
    const common = maskCommon()
    expect(common, '两侧遮罩共用规则须可抠取').toBeTruthy()
    expect(decl(common, 'position'), '遮罩须绝对定位（不参与布局计算）').toBe('absolute')
    for (const rule of [common, maskSide('before'), maskSide('after')]) {
      expect(rule, '遮罩不得引入任何 overflow 面（480px 横向滚动条红线）').not.toMatch(
        /(?:^|[;\s])overflow(?:-x|-y)?\s*:/
      )
      expect(rule, '不得用 transform 参与定位（会把遮罩推出 .juya-issue 盒）').not.toMatch(
        /(?:^|[;\s])transform\s*:/
      )
      expect(rule, '遮罩不得用 fixed/sticky 逃出 issue 盒').not.toMatch(
        /(?:^|[;\s])position\s*:\s*(?:fixed|sticky)/
      )
      for (const prop of ['left', 'right', 'margin', 'margin-left', 'margin-right']) {
        expect(decl(rule, prop), `遮罩 ${prop} 不得取负值/越界值`).not.toMatch(/^-/)
      }
    }
    const rule = issueRule()
    // .juya-issue 自身不得设 width/min-width（会与 auto 居中冲突并撑出溢出）
    expect(rule, '收窄规则不得出现 width/min-width').not.toMatch(/(?:^|[;\s])(?:width|min-width)\s*:/)
    // 遮罩的绝对定位包含块 = .juya-issue（position: relative 由共享层提供，本票不得撤）
    expect(
      css,
      '.juya-issue / .juya-feed 的 position: relative 包含块须保留'
    ).toContain('.juya-issue,\n.juya-feed {\n  position: relative;')
  })

  it('⑦ 窄窗（≤520px）退化自成一块：遮罩按该断点内边距收窄，仍不侵入正文；与 #2 窄窗退化不互斥', () => {
    const blocks = extractBlocks(code, /@media \(max-width: 520px\) \{/)
    const scoped = blocks.filter((b) => b.includes(`${ISSUE_SEL}::before`))
    expect(scoped, '≤520px 须有 nocturne-dark 专属遮罩退化块（自成一块）').toHaveLength(1)
    const narrow = extractBlock(
      scoped[0],
      new RegExp(`${esc(ISSUE_SEL)}::before,[\\s\\S]*?\\{`)
    )
    expect(narrow, '退化块体应可提取（须同时覆盖 ::before/::after）').toBeTruthy()
    expect(narrow, '退化须同时覆盖右缘遮罩').toContain(`${ISSUE_SEL}::after`)
    const narrowW = pxOf(narrow, 'width')
    expect(Number.isNaN(narrowW), '退化宽度须写成 px').toBe(false)
    // 该断点共享层把 .juya-issue 内边距收到 20px 14px 48px（既有规则）⇒ 遮罩同步收到 14px
    const narrowIssue = extractBlock(blocks.find((b) => b.includes('padding: 20px 14px 48px')) ?? '', /\.[\w-]*juya-issue \{/)
    expect(narrowIssue, '≤520px 基层 .juya-issue 收紧 padding 须保留').toContain(
      'padding: 20px 14px 48px'
    )
    expect(narrowW, '窄窗遮罩不得超出该断点水平内边距 14px').toBeLessThanOrEqual(14)
    expect(narrowW, '窄窗遮罩仍须可见（非归零）').toBeGreaterThan(0)
    // #2 的 nebula 窄窗退化（收束为顶部单带、左右边缘雾全撤）须保留：两者不在同一像素叠加
    const nebulaNarrow = extractBlock(
      blocks.find((b) => b.includes('.juya-scene-nebula')) ?? '',
      /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula \{/
    )
    expect(nebulaNarrow, '#2 的 nebula 窄窗退化须保留（本票不退它）').toBeTruthy()
    expect(nebulaNarrow, '窄窗下 nebula 左右边缘雾仍须全撤（遮罩与雾互斥面为零）').not.toMatch(
      /at\s+100%\s/
    )
    // 窄窗下遮罩同样只作用于内边距带 ⇒ 与雾零叠加
    expect(narrowW, '窄窗遮罩内缘仍止于文字列缘').toBeLessThanOrEqual(14)
  })
})

