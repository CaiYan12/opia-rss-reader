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

  it('⑥ 五风格回归（静态面）：模板目录内除 parts.tsx 外零 dust/nebula 引用（#1 只预置不接线）', () => {
    const files = readdirSync(templatesDir).filter((f) => f.endsWith('.tsx'))
    expect(files.length, '模板目录应含全部风格模板').toBeGreaterThanOrEqual(10)
    for (const f of files) {
      if (f === 'parts.tsx') continue
      const src = readFileSync(join(templatesDir, f), 'utf-8')
      expect(src, `${f} 不应引用 dust/nebula（接线属 #2）`).not.toMatch(/\b(dust|nebula)\b/)
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
