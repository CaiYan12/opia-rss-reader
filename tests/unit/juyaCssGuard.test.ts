import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JUYA_STYLES } from '../../src/renderer/juya/juyaStyles'
import {
  buildPhaseSamples,
  cycleSeconds,
  extremeTimes
} from '../../scripts/nocturne-aurora-phase.mjs'
import { APP_HIDDEN_ATTR } from '../../src/renderer/visibilityPause'

// juya.css 静态守卫（与 ipcContract 静态守卫同思路，不渲染、纯文本断言）：
// 1) 变体覆盖必须写成复合选择器（[data-juya-variant='x'].jyY…）。
//    空格后代形式要求风格类是 variant 元素的后代，而两者恒挂同一根元素，
//    规则永不匹配（曾致 folio-dark / y2k-dark / nocturne-light 覆盖整体失效的死代码）。
// 2) folio 亮/暗变体的 muted 文本对其出现的两种底色（bg / lead-bg）须达 WCAG AA（≥4.5）。
// 3) y2k 视觉审计守卫组（2026-10-11，建议①-⑦）：中文字体栈、段首缩进、条目标题层级、
//    亮侧铬字对比度（WCAG 实算）、星光瓷砖降噪、地平网格入视口、装饰伪元素 AT 静默 + @supports 回退。

// Windows CI 的 checkout 可能是 CRLF；守卫用 `\n` 字面量匹配规则原文，故先归一化。
const css = readFileSync(join(process.cwd(), 'src/renderer/juya/juya.css'), 'utf-8').replace(
  /\r\n/g,
  '\n'
)

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

/** source-over alpha 合成：把半透明前景（`0xRRGGBB` + alpha 0..1）叠到不透明底色上，逐通道取整。
 *  WCAG 不定义半透明色，必须先合成再算对比度 —— 这是全文件唯一的合成原语。
 *  各守卫组的 `over` 一律是本原语的**签名适配器**（见各组内一行定义），不再各写一份算法。 */
const alphaOver = (fg: number, alpha: number, bg: number): number => {
  const mix = (shift: number): number =>
    Math.round(alpha * ((fg >> shift) & 0xff) + (1 - alpha) * ((bg >> shift) & 0xff))
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

/** `{ rgb, alpha }` 形态的适配器（#6 排版层级组与 #3 字体语言组同用） */
const overRgba = (fg: { rgb: number; alpha: number }, bg: number): number =>
  alphaOver(fg.rgb, fg.alpha, bg)

/** nocturne 段（「暗夜精修式」段头 → 下一段「杂志编辑式」段头）：新规则必须落在此区间。
 *  提升为模块级供 #6 / #2 两组复用（此前两组内各写一份） */
const noctSection = (): string => css.slice(css.indexOf('暗夜精修式'), css.indexOf('杂志编辑式'))

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

/** 按选择器原文取规则块（选择器含 `[` `]` `.` `(` 等正则元字符时不必转义）；找不到返空串 */
const ruleBySelector = (src: string, selector: string): string => {
  const head = `\n${selector} {`
  const i = src.indexOf(head)
  return i < 0 ? '' : extractBlock(src.slice(i + 1), /^[^{]*\{/)
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
  //      注释里留作对照：它比可达最坏面高 ≈0.5，正是「用错可达性模型」的量化后果）。
  //   B) 本票两条规则原写作**共享** `.jynoct`，把 nocturne-light 也改了（需求 §0 声明范围仅暗侧、
  //      §9 把「nocturne-light 任何改动」列为不做）。现收窄为
  //      `[data-juya-variant='nocturne-dark'].jynoct …`；本组新增静态守卫锁死该形态。
  //      **交叉引用（#8 的共享形态不违反本条）**：收窄只适用于**样式取值**规则（导语底/内衬、
  //      栏目线、hover、序号微光）。#8 的 `.jynoct .jynoct-overflow-media` 是**模板结构**变化
  //      （`IssueView` 无 variantId 分支 ⇒ 两变体共用骨架），必须共享，否则 nocturne-light 会
  //      渲染出无样式的裸容器。详见「图文回流守卫」组头与 juya.css 该规则头的例外说明。
  const NIGHT = 'nocturne-dark'

  /** 暗侧变体专属复合规则块（缺陷 B 修正后的正确形态）：`[data-juya-variant='nocturne-dark'].jynoct <rest> { … }` */
  const darkRule = (rest: string): string =>
    extractBlock(css, new RegExp(`\\[data-juya-variant='nocturne-dark'\\]\\.jynoct ${rest} \\{`))

  /** 剥掉 CSS 注释（注释里可以自由解释「曾经怎么写、为什么不能那样写」，规则体才是被消费的东西） */
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '')

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

  /** 半透明前景按 alpha 合成到不透明底色之上（模块级 overRgba 的别名，签名不变） */
  const over = overRgba

  /** 声明里的 4 个长度值（padding 简写；2 值简写按 CSS 规则展开为 4 值） */
  const lengths = (value: string): number[] =>
    value
      .split(/\s+/)
      .map((v) => Number.parseFloat(v))
      .filter((n) => !Number.isNaN(n))

  /** 声明里的 px 数值列表 */
  const px = (value: string): number[] =>
    [...value.matchAll(/([\d.]+)px/g)].map((m) => Number.parseFloat(m[1]))

  /** 导语区（暗侧两个复合规则块的合并文本）：发光规则须在此区间内 */
  const leadArea = (): string => leadDarkBlocks().join('\n')

  /** 把渐变里的 `var(--jy-*)` 解析成 rgb 三元组文本（色相来源断言用：token 解析后仍须命中具体通道值）。
   *  只解析本组用到的 6 位 hex token；解析不到的原样保留（断言会因此转红，不会静默放过）。 */
  const resolveGradientHues = (grad: string, token: string): string => {
    let out = grad
    for (const m of grad.matchAll(/var\((--jy-[\w-]+)\)/g)) {
      const hex = tokenHex(token, m[1])
      if (Number.isNaN(hex)) continue
      const rgb = `rgba(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff})`
      out = out.split(m[0]).join(rgb)
    }
    return out
  }

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

  it('② 导语左侧渐变竖线：3px 进边框区、靛蓝→品红→透明（禁 text-shadow / 禁块级 drop-shadow / 禁外发光）', () => {
    // 2026-10-20 #18 / SPEC 批次 B4：竖线由「单色实线 + 外发光」改为「一条渐变光」，
    // 外发光移除（设计决策：避免渐变竖线与外发光两套光语言；与文字对比度无关）。
    // 方案 (d)：保留 3px 透明边框承载渐变，渐变用 background-image 画进 border 区，
    // origin 与 clip 同为 border-box（绝不用 padding-box —— 那会让竖线上下淡出端露出裸页面底）。
    const rule = darkRule('\\.juya-lead')
    const barRule = leadDarkBlocks().find((b) => /border-left|background-image/.test(b)) ?? ''
    expect(barRule, '导语竖线规则（暗侧复合形态）应存在').toBeTruthy()
    const body = stripComments(barRule)
    // 几何不变：基层 3px 边框宽度保留，只把颜色换成 transparent
    const baseLeft = decl(css.match(/(?:^|\n)\.juya-lead \{[^}]*\}/)?.[0] ?? '', 'border-left')
    expect(px(baseLeft)[0], '基层竖线宽度应保持 3px').toBe(3)
    const left = decl(body, 'border-left')
    expect(left, '暗侧须保留 border-left（几何由边框宽度承载）').toBeTruthy()
    expect(px(left)[0], '竖线宽度应保持 3px').toBe(3)
    expect(left, '边框本体须为 transparent（颜色由渐变绘制）').toContain('transparent')
    // 渐变只占边框条：3px 宽 × 100% 高，贴左上；origin+clip 同 border-box
    const grad = decl(body, 'background-image')
    expect(grad, '竖线渐变应写在 background-image').toContain('linear-gradient')
    expect(grad, '渐变走向应为纵向（to bottom / 180deg）').toMatch(/to bottom|180deg/)
    expect(decl(body, 'background-size'), '渐变尺寸应为 3px × 100%（只占边框条）').toMatch(/3px\s+100%/)
    expect(decl(body, 'background-position'), '渐变应贴左边框外侧').toMatch(/left top|0 0/)
    expect(decl(body, 'background-origin'), '渐变的绘制原点须为 border-box').toBe('border-box')
    expect(
      decl(body, 'background-clip'),
      '渐变的裁剪须为 border-box（底色铺进边框区，上下淡出两端才不会露出裸页面底）'
    ).toBe('border-box')
    expect(css, '绝不得用 padding-box（会让竖线上下淡出两端露出 3px 裸页面底）').not.toMatch(
      /background-(?:clip|origin)\s*:\s*padding-box/
    )
    // 色相来源：靛蓝 --jy-focus #8b97ff = 139,151,255（token 解析后核对）+ 品红字面 rgba(200,90,180,α)
    const hues = resolveGradientHues(grad, variantBlock(NIGHT))
    expect(hues, '渐变须含靛蓝色相来源 139,151,255（--jy-focus）').toContain('139, 151, 255')
    expect(grad, '渐变须含品红粉色相来源字面 rgba(200,90,180,…)').toMatch(
      /rgba\(\s*200\s*,\s*90\s*,\s*180\s*,/
    )
    const magentaAlpha = Number.parseFloat(
      grad.match(/rgba\(\s*200\s*,\s*90\s*,\s*180\s*,\s*([\d.]+)\s*\)/)?.[1] ?? 'NaN'
    )
    expect(Number.isNaN(magentaAlpha), '品红端应为字面 rgba 且带 alpha').toBe(false)
    expect(
      magentaAlpha,
      `品红端 alpha 实测 ${magentaAlpha}：复用色相但不复用 n3 雾记号 0.025（直接用几乎不可见）`
    ).toBeGreaterThanOrEqual(0.5)
    expect(magentaAlpha, '品红端仍须克制（≤0.6，不抢正文）').toBeLessThanOrEqual(0.6)
    // 两端透明：首行/末行回到「8% 白叠底」（= 导语底 token），而非裸页面底
    expect(grad, '渐变须从透明起（首行回到 8% 白叠底）').toMatch(/transparent\s+0%/)
    expect(grad, '渐变须以透明收（末行回到 8% 白叠底）').toMatch(/transparent\s+100%/)
    // 外发光移除：只禁「非 inset」的投影（保留将来加 inset 内顶高光的空间）
    const shadows = [...body.matchAll(/box-shadow\s*:\s*([^;}]+)/g)].map((m) => m[1].trim())
    for (const s of shadows) {
      expect(s, `导语规则体内不得有非 inset 的 box-shadow（实测：${s}）`).toContain('inset')
    }
    // **全量扫描**（2026-10-20 收口修正）：暗侧 `.juya-lead` 不止一条规则（底色/文字色、竖线几何、
    // 内衬各一条）。只查带 `border-left` 的那条，等于「给另一条加外发光不会转红」—— 收口 Spec 评审
    // 抓到的守卫盲区。此处按选择器前缀扫**全部**暗侧导语规则体，任一条出现非 inset 阴影即红。
    const leadBodies = [
      ...css.matchAll(
        /\[data-juya-variant='nocturne-dark'\]\.jynoct[^{}]*\.juya-lead[^{}]*\{([^}]*)\}/g
      )
    ].map((m) => m[1])
    expect(leadBodies.length, '应至少匹配到两条暗侧导语规则').toBeGreaterThanOrEqual(2)
    for (const leadBody of leadBodies) {
      for (const s of [...leadBody.matchAll(/box-shadow\s*:\s*([^;}]+)/g)].map((m) => m[1].trim())) {
        expect(s, `任意暗侧导语规则体内不得有非 inset 的 box-shadow（实测：${s}）`).toContain(
          'inset'
        )
      }
    }
    // 块级 drop-shadow 会按元素 alpha 轮廓（含导语 0.08 半透明底）整片垫在矩形底下 ——
    // 既是「整框泛光」而非票面要的「竖线发光」，也是把 muted 压到 4.4744（<AA 4.5）的唯一分量。
    expect(body, '导语规则体内不得出现 filter: drop-shadow').not.toMatch(/filter\s*:\s*drop-shadow/)
    expect(body, '导语规则体内不得出现 drop-shadow() 调用').not.toMatch(/drop-shadow\(/)
    expect(body, '导语区禁用 text-shadow').not.toMatch(/text-shadow\s*:\s*[^n\s]/)
    // 文字色：本票（#6）不改，但 #13（SPEC 批次 B1）已把暗侧导语提亮到**专用记号** --jy-lead-text，
    // 故断言随之指向新记号，并**明确禁止**再退回 muted —— 那正是 #13 要修的「导语比正文暗一倍」。
    // （口径未放宽：仍锁死一个具体 token，且多一条反向断言。）
    const leadColor = decl(rule, 'color') || decl(css.match(/(?:^|\n)\.juya-lead \{[^}]*\}/)?.[0] ?? '', 'color')
    expect(leadColor, '导语文字色须走专用记号 --jy-lead-text（#13 起）').toContain(
      'var(--jy-lead-text)'
    )
    expect(leadColor, '导语不得再复用 --jy-muted（#13 的验收红线）').not.toContain('var(--jy-muted)')
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

  it('④ 栏目 h2：padding-bottom 8px + 1px 渐变发丝线（青白→靛蓝→透明，右端淡出，几何不变）', () => {
    // 2026-10-20 #18 / SPEC 批次 B4：栏目线改为渐变并从右端淡出，与刊头极光呼应。
    // 几何不变：仍是 1px 下边框 + 8px 下内衬（nocturne-geometry.spec 以 borderBottomWidth=1px 为对齐基准）。
    const rule = darkRule('\\.juya-section > h2')
    expect(rule, "[data-juya-variant='nocturne-dark'].jynoct .juya-section > h2 规则应存在").toBeTruthy()
    expect(decl(rule, 'padding-bottom'), 'h2 下内边距应为 8px（几何不变）').toBe('8px')
    const border = decl(rule, 'border-bottom')
    expect(border, 'h2 下边框应为 1px 发丝线').toBeTruthy()
    expect(px(border)[0], '发丝线宽度仍为 1px（几何不变）').toBe(1)
    expect(border, '边框本体透明，颜色由渐变绘制').toContain('transparent')
    // 渐变：只占 1px 边框条（100% × 1px，贴左下），origin+clip 同 border-box
    const body = stripComments(rule)
    const grad = decl(body, 'background-image')
    expect(grad, '栏目线渐变应写在 background-image').toContain('linear-gradient')
    expect(grad, '栏目线为横向渐变').toMatch(/to right|90deg/)
    expect(decl(body, 'background-size'), '渐变尺寸应为 100% × 1px（只占下边框条）').toMatch(
      /100%\s+1px/
    )
    expect(decl(body, 'background-position'), '渐变应贴底边').toMatch(/left bottom|0 100%/)
    expect(decl(body, 'background-origin'), '渐变的绘制原点须为 border-box').toBe('border-box')
    expect(decl(body, 'background-clip'), '渐变的裁剪须为 border-box').toBe('border-box')
    // 色相：青白（刊头极光亮脊 rgba(214,236,255)）→ 靛蓝（--jy-accent 色相 110,123,255）→ 透明
    expect(grad, '起点须为青白色相 rgba(214,236,255,…)').toMatch(
      /rgba\(\s*214\s*,\s*236\s*,\s*255\s*,/
    )
    const startAlpha = Number.parseFloat(
      grad.match(/rgba\(\s*214\s*,\s*236\s*,\s*255\s*,\s*([\d.]+)\s*\)/)?.[1] ?? 'NaN'
    )
    expect(Number.isNaN(startAlpha), '起点 alpha 应可解析').toBe(false)
    expect(startAlpha, `起点 alpha 实测 ${startAlpha}：不得高于现有 0.22（保持发丝感）`).toBeLessThanOrEqual(
      0.22
    )
    expect(grad, '中段须为靛蓝色相 rgba(110,123,255,…)').toMatch(
      /rgba\(\s*110\s*,\s*123\s*,\s*255\s*,/
    )
    expect(grad, '右端须淡出至透明').toMatch(/transparent\s+100%/)
    // h2 不得把背景裁剪到文字形状（否则渐变会被裁成字形而不是一条线）
    expect(stripComments(noctSection()), '栏目 h2 相关规则不得出现 background-clip: text').not.toMatch(
      /juya-section[^{}]*\{[^}]*background-clip:\s*text/
    )
    // 实测留档：起点青白叠 --jy-bg 后仍可见但克制（不是 3:1 分隔件而是装饰发丝线，口径同 §7.1）
    const block = variantBlock(NIGHT)
    const bg = tokenHex(block, '--jy-bg')
    const startStop = { rgb: 0xd6ecff, alpha: startAlpha }
    const startLine = over(startStop, bg)
    const startContrast = contrast(startLine, bg)
    expect(startContrast, `青白起点对 --jy-bg 实测 ${startContrast.toFixed(3)} 应可分辨`).toBeGreaterThan(1)
    expect(
      startContrast,
      '栏目渐变线仍是装饰发丝线（<3:1，需求 §7.1 的克制口径，已留档）'
    ).toBeLessThan(3)
    // 反证：起点青白（0xd6ecff）叠到 --jy-bg 上需 alpha ≈0.40 才够 3:1 —— 那会破坏发丝感，
    // 故把上限锁在 0.22（现取值 1.78:1，与旧 0.22 白线的 1.91:1 同量级、同属装饰分隔件）。
    expect(
      contrast(over({ rgb: 0xd6ecff, alpha: 0.34 }, bg), bg),
      'alpha 0.34 仍 <3（证明 0.22 上限是取舍而非疏漏）'
    ).toBeLessThan(3)
    expect(
      contrast(over({ rgb: 0xd6ecff, alpha: 0.4 }, bg), bg),
      'alpha 0.40 才够 3:1'
    ).toBeGreaterThanOrEqual(3)
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

  it('⑥ 可达最坏面：导语滚到滚动口顶端时 --jy-muted 对真实合成底 ≥ 4.5（且留 ≥0.05 余量）', () => {
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

    // ---- 前提 3（#18 改写后的防回退断言）：外发光已移除（设计决策：避免渐变竖线与外发光
    //      两套光语言；与文字对比度无关 —— 外阴影按规范只绘在 border-box 之外，从不进入文字背景）。
    //      竖线是一条画进边框区的渐变光；块级 `filter: drop-shadow` 仍禁用（取元素 alpha 轮廓，
    //      会把矩形整片垫在底下被半透明底透出）。 ----
    const leadBody = stripComments(leadArea())
    expect(leadBody, '导语规则体内不得出现 filter: drop-shadow（须走边框区渐变竖线）').not.toMatch(
      /filter\s*:\s*drop-shadow/
    )
    expect(leadBody, '导语规则体内不得出现 drop-shadow() 调用').not.toMatch(/drop-shadow\(/)
    // 只禁「非 inset」的投影：外发光回归会转红，将来加内顶高光（inset 0 1px 0 …）仍可写
    const leadShadows = [...leadBody.matchAll(/box-shadow\s*:\s*([^;}]+)/g)].map((m) => m[1].trim())
    for (const s of leadShadows) {
      expect(s, `导语规则体内不得有非 inset 的 box-shadow（实测：${s}）`).toContain('inset')
    }

    // ---- 可达最坏面几何（浏览器实测口径：六档视口里 vw=700 最坏；导语文字左缘 = 47px，
    //      由 .juya-issue(≤700px 居中 / 24px 内衬) + .juya-entry(2px) + 3px 竖线 + 18px 左内衬 推出）----
    const VW = 700
    const VH = 800
    const TEXT_LEFT = 47
    const r = Math.hypot(TEXT_LEFT / ((rxPct / 100) * VW), 0 / ((ryPct / 100) * VH))
    const cover = Math.max(0, 1 - r / (stopPct / 100))
    const fog = { rgb: n1.rgb, alpha: n1.alpha * cover }
    // 场景雾 → 底色，再叠导语底（source-over 逐层合成，顺序即 CSS 绘制顺序的逆）
    const surface = over(leadBg, over(fog, bg))
    const model = contrast(muted, surface)

    // 六档视口真实浏览器实测（Playwright，独立端口 4198，deviceScaleFactor=1；把带导语的条目滚到
    // 滚动口顶端、导语文字贴顶；dust 为 1~1.6px 装饰微粒，中性化后取背景梯度真值；鼠标移出条目以免
    // `.juya-entry:hover` 的**同色第二层**底叠加 —— 那是独立交互态，不计入本守卫最坏面）。
    // 修正轨迹（合 #5 收窄列 700px 后的同一口径复测；最坏档三次都是 vw=700）：
    //   0.09 + 块级 drop-shadow（修前）4.2731 / 4.2563 / 4.3357 / 4.3984 / 4.4609 / 4.5642 ⇒ 4.2563
    //   0.08 + 块级 drop-shadow         4.4915 / 4.4744 / 4.5541 / 4.6164 / 4.6735 / 4.7801 ⇒ 4.4744
    //   0.08 + 外阴影竖线发光（现值）   4.6735 / 4.6567 / 4.7353 / 4.7966 / 4.8458 / 4.9105 ⇒ 4.6567
    // 旧守卫断言的 4.80 面（首层雾覆盖为 0、且不含发光垫底贡献）比可达最坏面高 ≈0.5，是**不可达面**。
    const MEASURED_WORST = 4.6567
    expect(model, `静态模型复算 ${model.toFixed(3)} 不得高于实测（模型应保守）`).toBeLessThanOrEqual(
      MEASURED_WORST + 0.02
    )
    expect(
      MEASURED_WORST - model,
      `静态模型与实测差 ${(MEASURED_WORST - model).toFixed(3)} 应在保守带内（≤0.15）`
    ).toBeLessThan(0.15)
    // 票面 §6 / 需求 §3.1 的 AA 目标：可达最坏面 ≥ 4.5
    expect(model, `可达最坏面静态复算 ${model.toFixed(3)} 须 ≥ AA 4.5`).toBeGreaterThanOrEqual(4.5)
    expect(
      MEASURED_WORST,
      '可达最坏面实测值（改 --jy-lead-bg alpha 或发光实现会撞这条，须同步复测）须 ≥ 4.5 且留 ≥0.05 余量'
    ).toBeGreaterThanOrEqual(4.55)
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

describe('nocturne 暗侧原生件配色守卫（2026-10-20，#12 / SPEC B5a）', () => {
  // 需求：内容区原生件（滚动条 / 下拉 / 输入框）跟随**内容自身**的亮暗，而非应用主题（根元素）。
  // 结构约束：滚动容器 .view-scroll 是 .juya-root 的**祖先**，故只能 :has() 向上匹配（同滚动条先例）；
  // 变体覆盖按 AGENTS「变体覆盖选择器约定」写复合形式 `[data-juya-variant='nocturne-dark'].jynoct`
  // （变体属性与风格类恒挂同一根元素，带空格的后代形式永不匹配）。
  const RULE_OPEN =
    /(?:^|\n)\.view-scroll:has\(\[data-juya-variant='nocturne-dark'\]\.jynoct\)\s*\{/
  const rule = (): string => extractBlock(css, RULE_OPEN).replace(/^\n/, '')
  /** 剥注释（就地替换为空格）：注释里提到 nocturne-light / color-scheme 不得计入声明面 */
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('① 滚动容器声明 color-scheme: dark（滚动条与原生控件取容器的 used color-scheme）', () => {
    expect(rule(), 'nocturne-dark 的 .view-scroll:has() 配色规则应存在').toBeTruthy()
    expect(decl(rule(), 'color-scheme'), '滚动容器应是暗色方案').toBe('dark')
  })

  it('② 作用域限定 nocturne 暗侧：复合形式、亮侧不声明、独此一条', () => {
    expect(RULE_OPEN.test(bare), '必须复合形式（.jynoct 紧贴变体属性，无空格后代）').toBe(true)
    const declarations = [...bare.matchAll(/color-scheme\s*:/g)]
    expect(declarations, 'juya.css 只允许本票这一条 color-scheme 声明').toHaveLength(1)
    const at = declarations[0].index ?? 0
    const host = bare.slice(bare.lastIndexOf('}', at) + 1, at)
    expect(host, '声明的宿主必须带滚动容器选择器（区域级，不写根元素）').toContain(
      ".view-scroll:has([data-juya-variant='nocturne-dark'].jynoct)"
    )
    expect(bare, 'nocturne-light 不得声明配色方案（§9 亮侧不在范围）').not.toMatch(
      /nocturne-light[^{}]*\{[^}]*color-scheme/
    )
  })

  it('③ 不落内容根与根元素，且主题注入链路无变体感知（两套配色互不覆盖）', () => {
    expect(
      extractBlock(bare, /(?:^|\n)\.juya-root\s*\{/),
      '内容根不得声明 color-scheme'
    ).not.toContain('color-scheme')
    expect(bare, 'juya.css 不得给 html/body/:root 声明 color-scheme').not.toMatch(
      /(?:^|\n)(?:html|body|:root)[^{}]*\{[^}]*color-scheme/
    )
    // 主题注入链路保持主题级原样：只写根元素，不感知 juya 变体/滚动容器
    const applyTheme = readFileSync(
      join(process.cwd(), 'src/renderer/theme/applyTheme.ts'),
      'utf-8'
    )
    expect(applyTheme, '主题注入仍写根元素 colorScheme').toContain('root.style.colorScheme')
    expect(applyTheme, '主题注入不得感知 juya 变体（区域级配色只在 juya.css）').not.toMatch(
      /juya|jynoct|view-scroll/
    )
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

describe('nocturne 刊头极光带守卫（2026-10-12，用户指令「头部过于朴素、Vista 极光几乎不存在」）', () => {
  // 本组锁的是**结构安全不变量**，不是观感（观感由 masthead 探针截图人眼判定）。
  // 核心论证（写在 juya.css 极光带注释里）：极光带取 z-index: -1，按 CSS 2.1 附录 E
  // 落在最近堆叠上下文的第 2 步，低于全部内容 —— 故**几何上不可能覆盖文字像素**，
  // 可读性由结构保证而非 alpha 调参。本组即为这条论证的静态闸门。
  // 已用栅格化差分独立验证（同取景、只切极光一变量）：字形核心像素被改写 **0/4372**（1280 视口）
  // 与 **0/13783**（560 视口），内部洗涤率 0.00%（对照：AGENTS.md 记录的 drop-shadow 为 74.2%）。
  const DARK = "\\[data-juya-variant='nocturne-dark'\\]"
  /** **字面选择器**（用于与 CSS 原文精确比对）。刻意与上面的 DARK 区分开：
   *  DARK 是正则片段（供 RegExp 使用），字面比对必须用未转义的原文 ——
   *  否则 `\[data-juya-variant…` 永远匹配不上 CSS 里的 `[data-juya-variant…`。
   *  第二版守卫即踩此坑（8 条假红），教训记于此。 */
  const PREFIX = "[data-juya-variant='nocturne-dark'].jynoct"
  const beforeSel = `${PREFIX} .juya-masthead::before`
  const afterSel = `${PREFIX} .juya-masthead::after`
  /** 本组必须**按精确选择器列表**取规则，不能用 `extractBlock` 的首次匹配：
   *  共用规则的分组头第二行正是 `… ::after {`，行首锚定正则会命中它，
   *  致使原本想取「后层」的调用返回**共用规则**（连带 z-index / mask 一起误判）。
   *  第一版守卫即踩此坑：②的「后层不得覆盖 z-index」与 ⑤/⑥/⑦ 的取值断言全部假红。
   *  教训：像 pop 守卫那样为分组规则单独建精确取用函数，别用「行首锚定 + 首次匹配」偷懒。 */
  const rules = (): { selectors: string[]; body: string }[] => {
    const masked = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    const out: { selectors: string[]; body: string }[] = []
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] !== '{') continue
      let j = i
      while (j > 0 && !'{};'.includes(masked[j - 1])) j--
      const head = masked.slice(j, i).trim()
      let depth = 0
      let end = i
      for (let k = i; k < masked.length; k++) {
        if (masked[k] === '{') depth++
        else if (masked[k] === '}') {
          depth--
          if (depth === 0) {
            end = k
            break
          }
        }
      }
      out.push({
        selectors: head.split(',').map((s) => s.trim()).filter(Boolean),
        body: css.slice(i, end + 1)
      })
    }
    return out
  }
  /** 精确匹配「无 @ 前缀的规则、选择器列表恰为 sels」的那条（顺序无关，避免误取分组规则） */
  const ruleBy = (...sels: string[]): string => {
    const want = [...sels].sort().join(' || ')
    const hit = rules().find(
      (r) =>
        r.selectors.length === sels.length &&
        !r.selectors.some((s) => s.startsWith('@')) &&
        [...r.selectors].sort().join(' || ') === want
    )
    return hit?.body ?? ''
  }
  const beforeRule = (): string => ruleBy(beforeSel)
  const afterRule = (): string => ruleBy(afterSel)
  /** 两条伪元素共用的定位/mask 规则（分组选择器：::before + ::after） */
  const sharedRule = (): string => ruleBy(beforeSel, afterSel)
  /** 规则体剥注释：判定「是否真的声明了某属性 / 某字面色」时必须用它 ——
   *  否则注释里**提到**的色值会被误判成声明里的色值（⑨ 第一版即因此假红：
   *  h1 规则的注释写了 `--jy-nebula-2 rgba(90,160,255)` 作取色溯源）。
   *  另一条同源教训：把字面选择器拼进 RegExp 时必须转义，否则 `[data-…]` 被当字符类
   *  （⑧ 第一版即此坑）。 */
  const bare = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  it('① 极光带存在且为独立装饰层：两条伪元素规则 + 共用定位/mask 规则', () => {
    expect(beforeRule(), '极光前层规则应存在').toBeTruthy()
    expect(afterRule(), '极光后层规则应存在').toBeTruthy()
    const shared = sharedRule()
    expect(shared, '两条伪元素应有共用的定位/mask 规则').toBeTruthy()
    expect(shared, '装饰层须显式声明 content').toContain("content: ''")
    expect(shared, '装饰层须 absolute 定位').toMatch(/position:\s*absolute/)
    expect(shared, '装饰层绝不可截获点击').toMatch(/pointer-events:\s*none/)
    // 定位上下文：刊头自身须建立包含块，否则 left/right:0 会横跨整个 .juya-issue
    const mast = extractBlock(
      css,
      new RegExp(`(?:^|\\n)${DARK}\\.jynoct \\.juya-masthead \\{`)
    )
    expect(mast, '刊头须为极光提供定位上下文（position: relative）').toMatch(
      /position:\s*relative/
    )
  })

  it('② 分层不变量：极光 z-index 为负（落在全部内容之下），绝不为 0/正数', () => {
    // 这是本组的核心断言。为什么 0 也不行：CSS 2.1 附录 E 中 z-index:0 的定位元素绘于第 6 步，
    // 而**非定位的正文文本**（h1、概览项）在第 5 步 ⇒ z-index:0 的极光会盖在标题字**之上**，
    // 半透明 + blur 将洗淡文字（AGENTS.md 已记录同类陷阱：drop-shadow 洗涤 74.2% 内部像素）。
    const shared = sharedRule()
    const z = decl(bare(shared), 'z-index')
    expect(z, '极光必须显式声明 z-index').toBeTruthy()
    expect(z, `极光 z-index 必须为负数（实得 ${z}）；0 或正数会盖在非定位文本之上`).toMatch(/^-\d/)
    // 反证：极光两条规则自身不得再出现 z-index 覆盖（避免把负值改回去）
    for (const [name, rule] of [['前层', beforeRule()], ['后层', afterRule()]]) {
      expect(rule, `${name}不得覆盖共用规则的 z-index`).not.toMatch(/z-index\s*:/)
    }
  })

  it('③ 零横向溢出：极光不带任何负向左右越界（.juya-issue 无 overflow:hidden，会被滚成横向滚动条）', () => {
    // 已实测：1280 与 560 两档 scrollerScrollWidth === clientWidth（溢出 0px）。
    for (const [name, rule] of [
      ['前层', beforeRule()],
      ['后层', afterRule()],
      ['共用', sharedRule()]
    ]) {
      // left/right 必须是 0（收在刊头内容盒内）；不得出现负值或超 100% 的宽度
      const left = decl(bare(rule), 'left')
      const right = decl(bare(rule), 'right')
      if (left) expect(left, `${name} left 须为 0，不得负向越界`).not.toMatch(/^-/)
      if (right) expect(right, `${name} right 须为 0，不得负向越界`).not.toMatch(/^-/)
      expect(rule, `${name}不得引入 transform: translateX 之类的横向位移`).not.toMatch(
        /translate[XY]?\(/
      )
    }
    const sharedLeft = decl(bare(sharedRule()), 'left')
    const sharedRight = decl(bare(sharedRule()), 'right')
    expect(sharedLeft, '共用规则 left 应为 0').toBe('0')
    expect(sharedRight, '共用规则 right 应为 0').toBe('0')
  })

  it('④ 两端渐隐用 mask（避免弧带被盒边硬切），且停靠点用 black 关键字不引字面色', () => {
    const shared = sharedRule()
    expect(shared, '须有 -webkit- 前缀 mask（Chromium 仍需前缀写法并存）').toMatch(
      /-webkit-mask-image:\s*linear-gradient\(/
    )
    expect(shared, '须有标准 mask-image').toMatch(/[^-]mask-image:\s*linear-gradient\(/)
    expect(shared, '首尾停靠点应为 transparent（两端渐隐）').toMatch(
      /linear-gradient\(90deg,\s*transparent 0%,\s*black/
    )
    // 这条让「共用规则」不进收口守卫组②的构成色登记表：它确实没有字面色值
    expect(bare(shared), '共用规则的 mask 不得用字面色值').not.toMatch(
      /#[0-9a-fA-F]{3,8}\b|rgba?\(/
    )
  })

  it('⑤ 冷暖谱取自既有色（零新增色相）：青白亮脊 + --jy-nebula-2 青蓝 + --jy-accent 靛蓝 + --jy-nebula-3 品红', () => {
    const near = beforeRule()
    const far = afterRule()
    // 青白亮脊（「被极光照亮的白」，由 h1 顶档 #ffffff 向 nebula-2 色相偏移）
    expect(near, '前层须有青白亮脊 rgba(214, 236, 255)').toContain('rgba(214, 236, 255')
    // 青蓝 = 既有 --jy-nebula-2 rgba(90,160,255)（§3.1 表格）
    expect(near, '前层幕帘须用既有青蓝 rgba(90, 160, 255)').toContain('rgba(90, 160, 255')
    // 靛蓝 = 本变体 --jy-accent #6e7bff
    expect(near, '前层底纹须用 accent 靛蓝 rgba(110, 123, 255)').toContain('rgba(110, 123, 255')
    // 品红 = 既有 --jy-nebula-3 rgba(200,90,180)
    expect(far, '后层反相幕帘须用既有品红 rgba(200, 90, 180)').toContain('rgba(200, 90, 180')
    expect(far, '后层须用 accent 靛蓝 rgba(110, 123, 255)').toContain('rgba(110, 123, 255')
    // 零新增色相的反证：不得出现霓虹青/品红的其他变体（双色霓虹排除项，需求 §4.2）
    const both = near + far
    const channels = [...both.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)].map(
      (m) => `${m[1]},${m[2]},${m[3]}`
    )
    expect(
      [...new Set(channels)].sort(),
      '极光带的色相集合必须恰好是这几个既有色（新增色相即撞红）'
    ).toEqual(['110,123,255', '200,90,180', '214,236,255', '90,160,255'].sort())
  })

  it('⑥ 纵深与不对称：两层不同弧心（后层水平偏心）+ 不同模糊半径，避免读作同心圆环', () => {
    const near = beforeRule()
    const far = afterRule()
    const at = (rule: string): string =>
      rule.match(/radial-gradient\(\s*[\d.]+%\s+[\d.]+%\s+at\s+([\d.]+%)\s+([\d.]+%)/)?.[0] ?? ''
    expect(at(near), '前层弧心应水平居中（50%）').toContain('at 50%')
    expect(at(far), '后层弧心应水平偏心（非 50%），制造不对称纵深').toBeTruthy()
    expect(at(far), '后层弧心不得也是居中（会让两层读作同心圆环）').not.toContain('at 50%')
    const blurOf = (rule: string): number =>
      Number.parseFloat(rule.match(/blur\(([\d.]+)px\)/)?.[1] ?? 'NaN')
    expect(blurOf(near), '前层 blur 可读').not.toBeNaN()
    expect(blurOf(far), '后层 blur 可读').not.toBeNaN()
    expect(blurOf(far), '后层应比前层更模糊（更远）').toBeGreaterThan(blurOf(near))
  })

  it('⑦ 动效：两层交错相位、只动 opacity 不动几何，且各自周期不同', () => {
    const near = beforeRule()
    const far = afterRule()
    const periodOf = (rule: string): number =>
      Number.parseFloat(rule.match(/animation:\s*jy-noct-aurora-\w+ ([\d.]+)s/)?.[1] ?? 'NaN')
    expect(periodOf(near), '前层动画周期可读').not.toBeNaN()
    expect(periodOf(far), '后层动画周期可读').not.toBeNaN()
    expect(periodOf(near), '两层周期须不同（同步会读作整体闪烁）').not.toBe(periodOf(far))
    expect(near, '前层动画须用 alternate').toContain('alternate')
    expect(far, '后层动画须用 alternate').toContain('alternate')
    // 只动 opacity：关键帧块内不得出现任何几何/颜色属性
    for (const name of ['jy-noct-aurora-near', 'jy-noct-aurora-far']) {
      const kf = extractBlock(css, new RegExp(`@keyframes ${name} \\{`))
      expect(kf, `${name} 关键帧应存在`).toBeTruthy()
      const body = kf.replace(/\/\*[\s\S]*?\*\//g, ' ')
      const props = [...body.matchAll(/(?:from|to)\s*\{([^}]*)\}/g)]
        .map((m) => m[1])
        .join(';')
      expect(props, `${name} 只能动 opacity（动几何会带来贴图滑动感，且更贵）`).not.toMatch(
        /transform|filter|background|top|left|height|width/
      )
      expect(props, `${name} 须确实声明 opacity`).toMatch(/opacity\s*:/)
    }
    // 交错相位：前层 from 暗 to 亮，后层 from 亮 to 暗
    const stepAlpha = (kfName: string, step: string): number =>
      Number.parseFloat(
        extractBlock(css, new RegExp(`@keyframes ${kfName} \\{`)).match(
          new RegExp(`(?:^|[\\s{])${step}\\s*\\{[^}]*opacity:\\s*([\\d.]+)`)
        )?.[1] ?? 'NaN'
      )
    expect(
      stepAlpha('jy-noct-aurora-near', 'from'),
      '前层 from 应为暗档'
    ).toBeLessThan(stepAlpha('jy-noct-aurora-near', 'to'))
    expect(
      stepAlpha('jy-noct-aurora-far', 'from'),
      '后层 from 应为亮档（与前层反相才算交错）'
    ).toBeGreaterThan(stepAlpha('jy-noct-aurora-far', 'to'))
  })

  it('⑧ reduced-motion：两层都被显式复位为静态中间档（不是「去掉动画就静止」）', () => {
    const rm = extractBlocks(css, /@media \(prefers-reduced-motion: reduce\) \{/).join('\n')
    for (const [name, sel, lo, hi] of [
      ['前层', beforeSel, 0.62, 1],
      ['后层', afterSel, 0.52, 1]
    ] as const) {
      const block = rm.match(new RegExp(`${esc(sel)} \\{[^}]*\\}`))?.[0] ?? ''
      expect(block, `RM 块内应有 ${name} 的复位规则（守卫⑤要求选择器级点名）`).toBeTruthy()
      expect(block, `${name} RM 复位须用 animation: none !important`).toMatch(
        /animation:\s*none\s*!important/
      )
      // 关键：必须显式钉 opacity。关键帧被撤后元素回到「无 opacity 声明」= 1，
      // 而两层都取 1 是设计上的最亮组合，会比动画平均态更亮 —— 故不能只撤动画。
      const op = Number.parseFloat(block.match(/opacity:\s*([\d.]+)/)?.[1] ?? 'NaN')
      expect(op, `${name} RM 须显式声明 opacity（不能只撤动画，否则回到最亮档 1）`).not.toBeNaN()
      expect(op, `${name} RM 的 opacity 须落在其动画区间内`).toBeGreaterThanOrEqual(lo)
      expect(op, `${name} RM 的 opacity 须落在其动画区间内`).toBeLessThanOrEqual(hi)
      expect(op, `${name} RM 的 opacity 不应取区间端点（取中间档，静态观感更接近动画平均态）`).toBeGreaterThan(lo)
      expect(op, `${name} RM 的 opacity 不应取区间端点`).toBeLessThan(hi)
    }
  })

  it('⑨ 取消双色霓虹约束的作用域收窄：h1 辉光仍是单色靛蓝（#4 决策未被本次改动推翻）', () => {
    // 需求 §4.2 原「排除双色霓虹」针对的是「两个独立光源」的硬色对（synthwave 语义）。
    // 本次用户明确要求 Vista 极光，故该排除**仅在极光带上**被取代；
    // 刊头字自身的辉光必须仍是单色靛蓝 —— 守卫①③ 的既有断言即为这条的闸门，
    // 此处额外确保极光带没有把色相渗进 h1 规则。
    // 必须剥注释 + 用精确选择器取规则：h1 规则的说明注释里**提到**了 --jy-nebula-2 的 rgba
    // 作为取色溯源，不剥会把「注释里提到的色」误判成「声明里的色」（第一版守卫即此假红）。
    const h1 = bare(ruleBy(`${PREFIX} .juya-masthead h1`))
    expect(h1, '暗侧 h1 辉光规则应存在').toBeTruthy()
    const glowColors = [...h1.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)].map(
      (m) => `${m[1]},${m[2]},${m[3]}`
    )
    expect(
      [...new Set(glowColors)],
      'h1 辉光须仍是单一 accent 靛蓝（不得混入青蓝/品红等极光色相）'
    ).toEqual(['110,123,255'])
  })
})

describe('nocturne 极光品红可辨守卫（2026-10-20，#19 T8）', () => {
  // 实测背景（scripts/nocturne-aurora-phase-probe.mjs，**逐层隔离**口径）：
  //   只留远层时 R−G 最大 16（rgb(44,28,52)）、只留近层时 R−G = 0；
  //   联合差分下近层白脊 Δ 远高于远层 ⇒ 刊头整体读作「一片蓝白」，设计里的冷 → 暖层次看不见。
  // 票面只允许抬**远层渐变自身 alpha**（0.36 → 0.5），其余一律锁死：
  //   · 不改 opacity 关键帧下限 —— 实测定论：opacity 相位不是主因（逐层隔离已排除）；
  //   · 不改近层白脊的几何与强度（它是极光唯一的硬信号）；
  //   · 零新增色相：色相仍恰为既有四色；需要非 token alpha 时写**字面 rgba(同色相, 自定 alpha)** 并注明；
  //   · 极光层 z-index 仍为 **-1**（绝不能 0，否则按 CSS 2.1 附录 E 会盖在非定位文本之上）。
  const PREFIX = "[data-juya-variant='nocturne-dark'].jynoct"
  const beforeSel = `${PREFIX} .juya-masthead::before`
  const afterSel = `${PREFIX} .juya-masthead::after`
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  /** 按**精确选择器列表**取规则体。为什么不能用 extractBlock 的首次匹配：
   *  两条伪元素共用的分组规则头第二行正是 `… ::after {`，行首锚定会命中它，
   *  取「后层」时会误得共用规则（连带 z-index / mask 一起错判）。教训见极光组同名注释。 */
  const ruleBy = (...sels: string[]): string => {
    const masked = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    const want = [...sels].sort().join(' || ')
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] !== '{') continue
      let j = i
      while (j > 0 && !'{};'.includes(masked[j - 1])) j--
      const selectors = masked
        .slice(j, i)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (
        selectors.length !== sels.length ||
        selectors.some((s) => s.startsWith('@')) ||
        [...selectors].sort().join(' || ') !== want
      ) {
        continue
      }
      let depth = 0
      for (let k = i; k < masked.length; k++) {
        if (masked[k] === '{') depth++
        else if (masked[k] === '}') {
          depth--
          if (depth === 0) return css.slice(j, k + 1)
        }
      }
    }
    return ''
  }
  const beforeRule = (): string => ruleBy(beforeSel)
  const afterRule = (): string => ruleBy(afterSel)
  const sharedRule = (): string => ruleBy(beforeSel, afterSel)
  const bare = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  /** 规则体里某色相字面量的 alpha（如 `rgba(200, 90, 180, 0.5)` → 0.5） */
  const alphaOf = (rule: string, rgb: string): number =>
    Number.parseFloat(
      bare(rule).match(new RegExp(`rgba\\(\\s*${rgb}\\s*,\\s*([\\d.]+)\\s*\\)`))?.[1] ?? 'NaN'
    )
  /** 规则体里的色相集合（去掉 alpha，仅 R,G,B） */
  const huesOf = (rule: string): string[] => [
    ...new Set([...bare(rule).matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)].map((m) => `${m[1]},${m[2]},${m[3]}`))
  ]
  const FAR_MAGENTA = '200,\\s*90,\\s*180'
  const FAR_ACCENT = '110,\\s*123,\\s*255'
  const NEAR_RIDGE = '214,\\s*236,\\s*255'
  const NEAR_CYAN = '90,\\s*160,\\s*255'

  it('① 远层品红端 alpha 已抬到下限 0.5（原 0.36 被近层亮脊压制约 1:5）', () => {
    const far = afterRule()
    expect(far, '远层规则应存在').toBeTruthy()
    const alpha = alphaOf(far, FAR_MAGENTA)
    expect(alpha, '远层品红 alpha 应为字面 rgba 小数（token 的 0.025 不适用）').not.toBeNaN()
    // 保留一个上界：极光是装饰层，继续加大 alpha 会把远层推成独立光源（需求 §4.2 排除双色霓虹）。
    expect(alpha, `远层品红 alpha 须 ≥ 0.5（实得 ${alpha}）；0.36 会被亮脊压成一片蓝白`).toBeGreaterThanOrEqual(0.5)
    expect(alpha, `远层品红 alpha 须 ≤ 0.6（实得 ${alpha}）；再高即越出「克制」装饰口径`).toBeLessThanOrEqual(0.6)
  })

  it('② 不改近层白脊的几何与强度（逐值锁死：停靠点 + alpha + top/height/blur/周期）', () => {
    const near = bare(beforeRule())
    expect(near, '近层规则应存在').toBeTruthy()
    // 亮脊：窄环带（86%→100%）、alpha 0.92，落在盒内 y≈37px
    expect(near, '亮脊青白 rgba(214,236,255) 的 alpha 与停靠点不得改动').toContain(
      'rgba(214, 236, 255, 0.92) 90%'
    )
    // 幕帘 + 底纹两层的 alpha 与停靠点
    for (const lock of [
      'rgba(90, 160, 255, 0.42) 86%',
      'rgba(110, 123, 255, 0.2) 94%',
      'rgba(110, 123, 255, 0.26) 0%',
      'rgba(110, 123, 255, 0.09) 38%',
      'transparent 72%'
    ]) {
      expect(near, `近层强度字面量不得改动：${lock}`).toContain(lock)
    }
    // 几何（伪元素盒与模糊半径）：改动会改变亮脊在刊头坐标里的落点
    expect(near, '近层 top 应保持 -26px').toContain('top: -26px')
    expect(near, '近层 height 应保持 92px').toContain('height: 92px')
    expect(near, '近层 blur 应保持 4px').toContain('blur(4px)')
    expect(near, '近层周期应保持 24s').toContain('jy-noct-aurora-near 24s')
    // 近层弧心几何（178% 118% at 50% 146% 等）不得动
    expect(near, '近层主弧几何不得改动').toContain('178% 118% at 50% 146%')
    expect(near, '近层幕帘弧几何不得改动').toContain('196% 152% at 50% 168%')
  })

  it('③ 远层的几何与尾色零改动：只许动品红端 alpha', () => {
    const far = bare(afterRule())
    expect(far, '远层弧几何应保持（偏心 at 38% 172%）').toContain('205% 140% at 38% 172%')
    expect(far, '远层品红端停靠点应保持 88%').toContain('88%')
    expect(far, '远层 accent 尾色 alpha 应保持 0.18').toContain('rgba(110, 123, 255, 0.18) 95%')
    expect(far, '远层 top 应保持 -40px').toContain('top: -40px')
    expect(far, '远层 height 应保持 104px').toContain('height: 104px')
    expect(far, '远层 blur 应保持 13px').toContain('blur(13px)')
    expect(far, '远层周期应保持 31s').toContain('jy-noct-aurora-far 31s')
  })

  it('④ 零新增色相：两层色相集合不变，且字面 alpha 在注释里注明来源', () => {
    // 色相集合（跨两层）必须恰为这四个既有色 —— 新增任何色相即撞红（同极光组 ⑤）
    const nearHues = huesOf(beforeRule())
    const farHues = huesOf(afterRule())
    expect(nearHues.sort()).toEqual(['110,123,255', '214,236,255', '90,160,255'])
    expect(farHues.sort()).toEqual(['110,123,255', '200,90,180'])
    // 取色来源必须仍是本变体既有 token（色相相同 ⇒ 不是新色相）
    const dark = variantBlock('nocturne-dark')
    expect(decl(dark, '--jy-accent').toLowerCase(), '--jy-accent 应仍是 #6e7bff（110,123,255）').toBe('#6e7bff')
    const nebula3 = bare(extractBlock(css, /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula \{/))
    expect(nebula3, '--jy-nebula-3 应仍是品红 rgba(200, 90, 180)（远层色相来源）').toContain(
      '--jy-nebula-3: rgba(200, 90, 180'
    )
    expect(nebula3, '--jy-nebula-2 应仍是青蓝 rgba(90, 160, 255)（近层色相来源）').toContain(
      '--jy-nebula-2: rgba(90, 160, 255'
    )
    // 「需要不同 alpha 时写字面 rgba(同色相, 自定 alpha) 并注明」：远层规则前的注释须点到来源且说明 alpha 已自定
    // 必须取**最后一次**出现：共用分组规则的第二行同样以该选择器行首开头（见本组 ruleBy 注释），
    // 用 indexOf 会命中分组头、把共用规则的注释误当成远层规则的前导注释（第一版守卫即此假红）。
    const i = css.lastIndexOf(`\n${afterSel} {`)
    expect(i, '远层规则应以行首形式存在').toBeGreaterThan(0)
    const before = css.slice(0, i)
    const open = before.lastIndexOf('/*')
    const close = before.lastIndexOf('*/')
    const comment = open >= 0 && close > open && before.slice(close + 2).trim() === '' ? before.slice(open, close + 2) : ''
    expect(comment, '远层规则前应有说明注释（取色来源 + alpha 自定）').toBeTruthy()
    expect(comment, '注释须注明色相来源 --jy-nebula-3').toContain('--jy-nebula-3')
    expect(comment, '注释须说明 alpha 是自定字面量（不复用雾记号的 0.025）').toMatch(/alpha/i)
  })

  it('⑤ 分层不变量不因调 alpha 松动：z-index 仍为 -1，两层规则自身不得覆盖它', () => {
    const shared = sharedRule()
    expect(shared, '伪元素共用规则应存在').toBeTruthy()
    expect(decl(bare(shared), 'z-index'), '极光 z-index 必须仍为 -1（0 会盖在非定位文本之上）').toBe('-1')
    for (const [name, rule] of [
      ['前层', beforeRule()],
      ['后层', afterRule()]
    ]) {
      expect(bare(rule), `${name}不得自行覆盖 z-index`).not.toMatch(/z-index\s*:/)
    }
  })

  it('⑥ 不动 opacity 下限：两条关键帧端点与 RM 静态档原样保留', () => {
    const step = (name: string, s: string): number =>
      Number.parseFloat(
        extractBlock(css, new RegExp(`@keyframes ${name} \\{`)).match(
          new RegExp(`(?:^|[\\s{])${s}\\s*\\{[^}]*opacity:\\s*([\\d.]+)`)
        )?.[1] ?? 'NaN'
      )
    expect(step('jy-noct-aurora-near', 'from'), '近层 from 应仍为 0.62').toBe(0.62)
    expect(step('jy-noct-aurora-near', 'to'), '近层 to 应仍为 1').toBe(1)
    expect(step('jy-noct-aurora-far', 'from'), '远层 from 应仍为 1').toBe(1)
    expect(step('jy-noct-aurora-far', 'to'), '远层 to（opacity 下限）应仍为 0.52，不得靠它补品红').toBe(0.52)
    // RM 静态档同样不动（0.81 / 0.76）
    const rm = extractBlocks(css, /@media \(prefers-reduced-motion: reduce\) \{/).join('\n')
    for (const [sel, want] of [
      [beforeSel, 0.81],
      [afterSel, 0.76]
    ] as const) {
      const block = rm.match(new RegExp(`${esc(sel)} \\{[^}]*\\}`))?.[0] ?? ''
      expect(Number.parseFloat(block.match(/opacity:\s*([\d.]+)/)?.[1] ?? 'NaN'), `${sel} RM 静态 opacity 应仍为 ${want}`).toBe(
        want
      )
    }
  })

  it('⑦ 相位探针独立新增：按层各自 duration/keyframe 算极端时刻、≥5 采样、不复用归档 FREEZE', () => {
    const probePath = join(process.cwd(), 'scripts/nocturne-aurora-phase-probe.mjs')
    const phasePath = join(process.cwd(), 'scripts/nocturne-aurora-phase.mjs')
    const probe = readFileSync(probePath, 'utf-8')
    const phaseSrc = readFileSync(phasePath, 'utf-8')

    // 独立探针：必须自己 seek 两层，且**不得**复用归档依赖的冻结方案（animation: none）
    expect(probe, '探针应引用纯相位模块').toContain("from './nocturne-aurora-phase.mjs'")
    expect(probe, '探针应逐层按关键帧名 seek').toContain('jy-noct-aurora-near')
    expect(probe, '探针应逐层按关键帧名 seek').toContain('jy-noct-aurora-far')
    expect(probe, '逐层隔离应走 visibility（display:none 会让动画从 getAnimations 消失、无法 seek）').toContain(
      'visibility: hidden'
    )
    // 只对**代码**断言，不对注释断言：脚本头注释里必然会解释「为什么不能用 animation: none」，
    // 不剥注释会把说明文字误判成用法（第一版守卫即此假红）。
    expect(
      probe.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' '),
      '不得退回 walkthrough 的 FREEZE（animation: none 会把两条极光动画从 getAnimations 移除，无法 seek；且归档图依赖它）'
    ).not.toMatch(/animation:\s*none/)
    const walkthrough = readFileSync(
      join(process.cwd(), 'scripts/nocturne-visual-walkthrough.mjs'),
      'utf-8'
    )
    expect(walkthrough, '既有归档 FREEZE 必须原样保留（本票不动它）').toContain(
      'animation: none !important'
    )

    // 相位数学：从 CSS 实读 duration / 关键帧端点，交给纯函数模块
    const durationOf = (name: string): number =>
      Number.parseFloat(css.match(new RegExp(`animation:\\s*${name}\\s+([\\d.]+)s`))?.[1] ?? 'NaN')
    const endpointsOf = (name: string): { from: number; to: number } => ({
      from: Number.parseFloat(
        extractBlock(css, new RegExp(`@keyframes ${name} \\{`)).match(
          /(?:^|[\s{])from\s*\{[^}]*opacity:\s*([\d.]+)/
        )?.[1] ?? 'NaN'
      ),
      to: Number.parseFloat(
        extractBlock(css, new RegExp(`@keyframes ${name} \\{`)).match(
          /(?:^|[\s{])to\s*\{[^}]*opacity:\s*([\d.]+)/
        )?.[1] ?? 'NaN'
      )
    })
    const config = () => ({
      near: { duration: durationOf('jy-noct-aurora-near'), ...endpointsOf('jy-noct-aurora-near') },
      far: { duration: durationOf('jy-noct-aurora-far'), ...endpointsOf('jy-noct-aurora-far') }
    })
    const cfg = config()
    const samples = buildPhaseSamples(cfg)
    expect(samples.length, '相位采样须 ≥ 5 个').toBeGreaterThanOrEqual(5)

    const nearCycle = cycleSeconds(cfg.near)
    const farCycle = cycleSeconds(cfg.far)
    // 每层 seek 时刻都按**自身**周期落在合法区间，且两层数值不同（不存在同一个 -Xs）
    for (const s of samples) {
      expect(s.nearTime, `${s.label}: 近层 seek 时刻须落在其 alternate 周期内`).toBeGreaterThanOrEqual(0)
      expect(s.nearTime, `${s.label}: 近层 seek 时刻须落在其 alternate 周期内`).toBeLessThan(nearCycle)
      expect(s.farTime, `${s.label}: 远层 seek 时刻须落在其 alternate 周期内`).toBeGreaterThanOrEqual(0)
      expect(s.farTime, `${s.label}: 远层 seek 时刻须落在其 alternate 周期内`).toBeLessThan(farCycle)
    }
    // 「不用同一个 -Xs」的正确判据不是「每条采样两层秒数都不同」——极端组合里两层各自的谷/峰值
    // 本来就可能同为 0s（远层峰 = 0s、近层谷 = 0s），那是**按层算出来的巧合**，不是统一施加。
    // 真正的判据：交错相位采样下两层的归一化周期进度相同、而秒数不同（因为 duration 各异）。
    expect(samples.some((s) => s.nearTime !== s.farTime), '两层不得被同一个时刻统一 seek').toBe(true)
    // 极端时刻按层各自 duration + 关键帧方向计算：四个组合全部出现
    const nearEx = extremeTimes(cfg.near)
    const farEx = extremeTimes(cfg.far)
    expect(nearEx.peak, '近层关键帧 0.62→1 为正、峰值应在其 duration 处').toBe(cfg.near.duration)
    expect(farEx.peak, '远层关键帧 1→0.52 为负、峰值应在 0s').toBe(0)
    expect(farEx.floor, '远层谷值应在其 duration 处').toBe(cfg.far.duration)
    for (const [nt, ft] of [
      [nearEx.peak, farEx.peak],
      [nearEx.peak, farEx.floor],
      [nearEx.floor, farEx.peak],
      [nearEx.floor, farEx.floor]
    ]) {
      expect(
        samples.some((s) => s.nearTime === nt && s.farTime === ft),
        `极端组合 近${nt}s / 远${ft}s 应在采样表中`
      ).toBe(true)
    }
    // 「按各自 duration 计算」的直接证据：同一周期进度下两层的秒数不同、但归一化进度相同
    const proportional = samples.filter(
      (s) => s.label.includes('%') && Math.abs(s.nearTime / nearCycle - s.farTime / farCycle) < 1e-9
    )
    expect(proportional.length, '交错相位采样应按各层自身周期换算（同一进度、不同秒数）').toBeGreaterThan(0)
    expect(phaseSrc, '纯相位模块应说明 alternate 的完整周期是 2×duration').toMatch(/2 × duration|2 \* duration/)
  })
})

describe('nocturne 图文回流守卫（2026-10-12，#8：右列限 2 张，其余回流通栏）', () => {
  // **与「排版层级守卫」（#6）的作用域口径差异是有意的，不是不一致**：
  //   #6 把导语/栏目线收窄为 `[data-juya-variant='nocturne-dark'].jynoct …`（§9 把
  //   「nocturne-light 任何改动」列为不做）；#8 却要求共享 `.jynoct` 形态（见 ①）。
  //   原因：#8 是**模板结构**变化而非样式取值变化 —— `NocturneEntrySplit` 由 `IssueView`
  //   渲染，而 `IssueView` 没有 variantId 分支，两变体共用同一骨架，右列同样只取前 2 张、
  //   第 3 张起同样回流。若把容器也收窄到暗侧前缀，nocturne-light 会渲染出**无任何样式**的
  //   `.jynoct-overflow-media`（裸 div 装图）—— 那才是对亮侧的真实布局改动。
  //   §9 的「不做」指样式取值，不指结构。详见 juya.css 内 `.jynoct .jynoct-overflow-media`
  //   规则头的长注释。
  const TSX = () => readFileSync(join(process.cwd(), 'src/renderer/juya/templates/nocturne.tsx'), 'utf-8')
  const overflowRules = () => css.match(/^[^\n]*jynoct-overflow-media[^\n]*\{/gm) ?? []

  it('① 新增通栏容器的样式只写在 jynoct 作用域内（不新增基层/其他变体规则）', () => {
    const rules = overflowRules()
    expect(rules.length, '通栏容器应有基础规则 + 窄窗降级各一条').toBe(2)
    for (const rule of rules) {
      // 共享形态是**要求**（不是遗漏）：见本组头部与 juya.css 的例外说明；#6 的暗侧复合
      // 形态约束的是导语/栏目线等**样式取值**规则，不约束本结构容器。
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
  /** source-over alpha 合成（模块级 alphaOver 的别名，签名不变） */
  const over = alphaOver
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
    // #13 起条目标题编号有了**显式后代形态**规则（`.juya-entry h3 .juya-index`，票面要求），它同样
    // 不带 .juya-overview 中缀。本断言改为**精确列举**这两条（仍不容忍任何第三条），守卫原意不变。
    const heads = (css.match(/^[^\n{}]*jynoct[^\n{}]*juya-index[^\n{}]*\{/gm) ?? []).map((h) => h.trim())
    const plainHeads = heads.filter((h) => !h.includes('.juya-overview'))
    expect(plainHeads).toEqual([
      '.jynoct .juya-index {',
      "[data-juya-variant='nocturne-dark'].jynoct .juya-entry h3 .juya-index {"
    ])
    expect(
      plainHeads.filter((h) => h !== '.jynoct .juya-index {'),
      '无中缀规则只允许那一条后代形态的条目标题编号规则（不得出现 `>` 子选择器死形态）'
    ).toEqual(["[data-juya-variant='nocturne-dark'].jynoct .juya-entry h3 .juya-index {"])

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

describe('nocturne 导语提亮与编号 accent 守卫（2026-10-20，#13 / SPEC 批次 B1）', () => {
  // issue #13 两条验收：
  //  ① 导语文字改用**专用**记号 --jy-lead-text（不得再复用次要文字记号 --jy-muted）：对比度按
  //     「页面底 + 8% 白底 + 可透出层最亮情形」实算，目标 ≈7:1 —— 须高于现状 muted、明显低于正文。
  //  ② 条目标题编号 `#N` 取 --jy-accent，**无微光、不降 alpha**，选择器必须是**后代形态**
  //     `.jynoct .juya-entry h3 .juya-index`（EntrySplit 把 h3 嵌在 `.juya-entry-row > .juya-entry-body`，
  //     子选择器打不中 —— 本仓已记录过两次的老坑）；概览序号的既有颜色/微光零改动。
  const NIGHT = 'nocturne-dark'
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  /** 三层 nebula 的「最亮单层」合成面：三对支撑域两两不相交（任何像素最多被一层雾覆盖），
   *  故逐层单独 source-over 后取亮度最大者即**可透出层最亮情形**。真值一律从规则抠（不手抄）。 */
  const nebulaPeak = (): number => {
    const neb =
      css.match(
        /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula\s*\{[^}]*\}/
      )?.[0] ?? ''
    expect(neb, 'nocturne 的 nebula 覆盖规则应存在（依赖 #2 已接线）').toBeTruthy()
    const bg = tokenHex(variantBlock(NIGHT), '--jy-bg')
    const faces = [1, 2, 3].map((n) => {
      const m = neb.match(
        new RegExp(
          `--jy-nebula-${n}:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\d.]+)\\s*\\)`
        )
      )
      expect(m, `--jy-nebula-${n} 应为 rgba() 字面量`).toBeTruthy()
      const rgb = (Number(m![1]) << 16) | (Number(m![2]) << 8) | Number(m![3])
      return alphaOver(rgb, Number(m![4]), bg)
    })
    return faces.reduce((a, b) => (lum(b) > lum(a) ? b : a))
  }

  /** 导语块自身的合成底 = 页面底（取最亮雾层）+ 导语底 8% 白（SPEC 明写的计算面） */
  const leadSurface = (): number => {
    const m = variantBlock(NIGHT).match(
      /--jy-lead-bg:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/
    )
    expect(m, '--jy-lead-bg 应为 8% 白底 rgba（本守卫合成层之一）').toBeTruthy()
    return alphaOver(0xffffff, Number(m![1]), nebulaPeak())
  }

  it('① 新增专用记号 --jy-lead-text：对「雾峰 + 导语底」合成面 ≈7:1（高于 muted、明显低于正文）', () => {
    const block = variantBlock(NIGHT)
    const leadText = tokenHex(block, '--jy-lead-text')
    const muted = tokenHex(block, '--jy-muted')
    const text = tokenHex(block, '--jy-text')
    expect(leadText, 'nocturne-dark 变体块须声明 --jy-lead-text（6 位 hex）').not.toBeNaN()
    const surface = leadSurface()
    const rLead = contrast(leadText, surface)
    expect(
      rLead,
      `--jy-lead-text 对合成面实算 ${rLead.toFixed(4)} 须 ≈7:1（下限 6.9）`
    ).toBeGreaterThanOrEqual(6.9)
    expect(rLead, `≈7:1 上限（实算 ${rLead.toFixed(4)}）`).toBeLessThanOrEqual(7.15)
    // 「高于现状」：同一合成面上须明显强于 muted 档（现状 4.4915）
    expect(
      rLead - contrast(muted, surface),
      `须明显强于现状 muted 档（${contrast(muted, surface).toFixed(4)}）`
    ).toBeGreaterThan(1.5)
    // 「明显低于正文」：与 --jy-text 保持一档层级差
    expect(
      contrast(text, surface) - rLead,
      `须明显低于正文档 --jy-text（${contrast(text, surface).toFixed(4)}）`
    ).toBeGreaterThan(1.5)
    // 专用记号：不得退化成复用现有两档之一
    expect([muted, text], '--jy-lead-text 不得等于 muted 或 text').not.toContain(leadText)
    // 声明点唯一（只允许落在暗侧 token 块；亮侧 §9 不在范围）
    expect(
      (css.match(/--jy-lead-text:/g) ?? []).length,
      '--jy-lead-text 只允许有一个声明点（暗侧 token 块）'
    ).toBe(1)
  })

  it('② 暗侧导语规则用新记号取色；基层（亮侧路径）仍走 --jy-muted，亮侧零改动', () => {
    const dark = extractBlock(
      css,
      /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-lead \{/
    )
    expect(dark, "暗侧导语规则 [data-juya-variant='nocturne-dark'].jynoct .juya-lead 应存在").toBeTruthy()
    expect(decl(dark, 'color'), '暗侧导语文字色须走 var(--jy-lead-text)').toBe('var(--jy-lead-text)')
    expect(dark, '暗侧导语不得再复用 --jy-muted').not.toContain('var(--jy-muted)')
    // 基层 .juya-lead 是亮侧路径：保持 muted，不得被动跟随
    const base = css.match(/(?:^|\n)\.juya-lead \{[^}]*\}/)?.[0] ?? ''
    expect(base, '基层 .juya-lead 规则应存在（亮侧走它）').toBeTruthy()
    expect(decl(base, 'color'), '基层导语色须保持 var(--jy-muted)（亮侧零改动）').toBe('var(--jy-muted)')
    expect(
      css,
      '不得出现 nocturne-light 的导语/新记号覆写（§9 亮侧不在范围）'
    ).not.toMatch(
      /\[data-juya-variant='nocturne-light'\][^{}]*\{[^}]*(?:juya-lead|--jy-lead-text)/
    )
  })

  it('③ 条目标题编号 #N：accent 取色、后代形态（严禁 `>`）、无微光、不降 alpha、对页面底 ≥4.5', () => {
    const BADGE = "[data-juya-variant='nocturne-dark'].jynoct .juya-entry h3 .juya-index {"
    const rule = extractBlock(css, new RegExp(esc(BADGE)))
    expect(rule, `条目标题编号规则应为后代形态：${BADGE}`).toBeTruthy()
    const head = rule.slice(0, rule.indexOf('{'))
    expect(head, '选择器须含后代链 .juya-entry h3 .juya-index').toContain(
      '.juya-entry h3 .juya-index'
    )
    expect(head, '严禁子选择器（EntrySplit 把 h3 嵌进 .juya-entry-body，`>` 打不中）').not.toMatch(
      /\.juya-entry\s*>\s*h3/
    )
    const body = rule.slice(rule.indexOf('{'))
    expect(body, '编号色须走 var(--jy-accent)（强调色相，零新增色）').toContain('color: var(--jy-accent)')
    // 「不加微光」：两个序号角色靠有无微光区分（辉光唯一合法写法是 filter: drop-shadow，本仓禁 text-shadow）
    expect(body, '条目标题编号不得加微光（filter / drop-shadow）').not.toMatch(/filter|drop-shadow/)
    expect(body, '全仓禁 text-shadow').not.toContain('text-shadow')
    // 「不降 alpha」：既不得用 rgba 字面量，也不得叠 opacity
    expect(body, '不得降 alpha（rgba 字面量会掉出 AA）').not.toMatch(/rgba?\(/)
    expect(body, '不得用 opacity 降透明度').not.toMatch(/opacity\s*:/)
    expect(body, '静态样式：零 animation / transition').not.toMatch(/animation|transition/)
    // 对页面底 ≥4.5（含最亮雾层的合成面也须过）
    const block = variantBlock(NIGHT)
    const accent = tokenHex(block, '--jy-accent')
    expect(contrast(accent, tokenHex(block, '--jy-bg')), '编号 accent 对 --jy-bg').toBeGreaterThanOrEqual(4.5)
    expect(contrast(accent, nebulaPeak()), '编号 accent 对最亮雾层合成面').toBeGreaterThanOrEqual(4.5)
  })

  it('④ 既有 `.jynoct .juya-index` 与概览序号规则零改动（反证：两种序号角色仍可区分）', () => {
    const badge = noctRule('\\.juya-index')
    expect(badge, '条目标题序号既有规则应存在').toContain('color: var(--jy-muted)')
    expect(badge, '既有规则不得被本票改写（新规则是独立的后代形态覆盖）').not.toMatch(
      /--jy-accent|drop-shadow|filter/
    )
    const overview =
      css.match(
        /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-overview \.juya-index\s*\{[^}]*\}/
      )?.[0] ?? ''
    expect(overview, '概览序号规则应存在').toContain('color: var(--jy-accent)')
    expect(overview, '概览序号的微光须保留（有无微光才是两个角色的区分手段）').toMatch(
      /filter:\s*drop-shadow\(/
    )
    // 全文件不得出现「jynoct + .juya-entry > h3 + juya-index」的死形态
    expect(css, '不得用子选择器打条目标题编号').not.toMatch(
      /jynoct[^\n{}]*\.juya-entry\s*>\s*h3[^\n{}]*\.juya-index/
    )
  })
})

describe('nocturne 阅读页图片压暗与发丝描边守卫（2026-10-20，#14 / SPEC 批次 B2）', () => {
  // 需求：SPEC #10「批次 B2：图片与发丝描边」——
  //   ① 阅读页图片统一 `filter: brightness(.88)`（色彩略偏移属已接受取舍，图表类有取舍）；
  //   ② 图片加 1px 发丝描边 + 极淡 accent 外发光，**不占布局**（右列 / 满宽回流带的既有几何不变）；
  //   ③ 光强必须明显低于导语左侧竖线（#13 的 box-shadow alpha 0.35）；
  //   ④ 不做 --jy-card 衬边；outline 留给焦点环；圆角走统一自定义属性、不改共享 --jy-radius。
  // 命名：这套处理叫**发丝描边**，不叫「装裱」——后者是 folio / editorial 带衬底与题注装框的概念。
  // 前置检查（本票实做，不只是引文档结论）：
  //   ① 图片自身是否烘焙圆角：下载线上当期 5 张正文图 + 1 张封面（assets.juya.uk）逐张读像素通道，
  //      全部 RGBA 但 alpha 恒 255（min = max = 255，零半透明像素）⇒ **没有**烘焙圆角或透明角，
  //      发丝描边贴 border-box 与图形边缘几何一致；测试图源同为满幅 SVG rect（方角）。
  //   ② 祖先是否 overflow: hidden 裁掉光晕：全文件仅 3 处 overflow: hidden（.juya-feed-summary /
  //      .juya-feed-item / .juya-scene），均不在阅读页图片祖先链上；最近的裁剪者是滚动容器
  //      .view-scroll（overflow-y: auto），而图落在 .juya-issue 24px 内衬之内、外发光 ≤ 8px ⇒ 不被切。
  const DARK = "[data-juya-variant='nocturne-dark'].jynoct"
  const esc2 = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ')

  /** 暗侧复合形态规则块：`[data-juya-variant='nocturne-dark'].jynoct <rest> { … }` */
  const darkBlock = (rest: string): string =>
    extractBlock(css, new RegExp(`(?:^|\\n)${esc2(DARK)} ${esc2(rest)} \\{`))

  /** 顶格逗号拆分（括号内不拆）：box-shadow 的多层就是顶层逗号 */
  const splitTop = (value: string): string[] => {
    const out: string[] = []
    let depth = 0
    let cur = ''
    for (const ch of value) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      if (ch === ',' && depth === 0) {
        out.push(cur.trim())
        cur = ''
      } else cur += ch
    }
    if (cur.trim()) out.push(cur.trim())
    return out
  }

  const rgbaOf = (layer: string): { rgb: number; alpha: number } => {
    const m = layer.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/)
    return m
      ? { rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]), alpha: Number(m[4]) }
      : { rgb: Number.NaN, alpha: Number.NaN }
  }

  const IMG_RULE = `${DARK} .juya-issue img`
  const imgRule = (): string => darkBlock('.juya-issue img')

  it('① 阅读页图片统一压暗 brightness(.88)：暗侧复合形态、只作用于阅读页', () => {
    const rule = imgRule()
    expect(rule, `图片规则应为复合形态 ${IMG_RULE}（变体属性与 .jynoct 恒挂同一根元素）`).toBeTruthy()
    expect(decl(strip(rule), 'filter'), '压暗值须为 brightness(.88)（SPEC B2 明写）').toMatch(
      /^brightness\(\.?0?88\)$/
    )
    // 只覆盖阅读页（.juya-issue 内）；订阅页封面走 .juya-feed-*，不得被压暗（归档须逐字节不变）
    expect(rule.slice(0, rule.indexOf('{')), '不得把订阅页封面一并压暗').not.toContain('juya-feed')
    // 亮侧不在本票范围（§9：nocturne-light 任何改动不做）
    expect(css, '亮侧不得出现图片压暗规则').not.toMatch(
      /\[data-juya-variant='nocturne-light'\][^{}]*\{[^}]*brightness/
    )
    // 反证：压暗必须落在规则上而不是 token 块（token 块声明会波及全变体）
    for (const v of ['nocturne-dark', 'nocturne-light']) {
      expect(variantBlock(v), `${v} token 块不得承载 filter`).not.toMatch(/filter\s*:/)
    }
  })

  it('② 发丝描边 = 1px box-shadow + 极淡 accent 外发光；outline 留给焦点环', () => {
    const body = strip(imgRule())
    const shadow = decl(body, 'box-shadow')
    expect(shadow, '描边与发光必须走 box-shadow（不占布局）').toBeTruthy()
    const layers = splitTop(shadow)
    expect(layers.length, '两层：1px 发丝环 + 极淡外发光').toBe(2)
    expect(layers[0], '发丝环须为 0 0 0 1px var(--jy-border)（SPEC B2 明写）').toBe(
      '0 0 0 1px var(--jy-border)'
    )
    // 外发光：同 accent 色相、无方向偏移（外发光而非投影）
    const glow = rgbaOf(layers[1])
    expect(glow.rgb, '外发光取色须为本变体 --jy-accent（零新增色相）').toBe(
      tokenHex(variantBlock('nocturne-dark'), '--jy-accent')
    )
    // 偏移量允许写成无单位 0（`0 0 8px`），故按空白切 token 而不是只认 px
    const glowParts = layers[1].trim().split(/\s+/)
    expect(Number.parseFloat(glowParts[0]), '外发光不得带 x 方向偏移').toBe(0)
    expect(Number.parseFloat(glowParts[1]), '外发光不得带 y 方向偏移').toBe(0)
    expect(body, 'outline 留给焦点环，描边不得占用该属性').not.toMatch(/(?:^|[;\s])outline\s*:/)
    expect(body, '不得用 border 简写追加第二条线（会与发丝环叠成 2px）').not.toMatch(
      /(?:^|[;\s])border\s*:/
    )
  })

  it('③ 外发光克制：图片 0.16 < 0.2；导语侧已无外发光（#18 起不再拿 0.35 当参照物）', () => {
    // 2026-10-20 #18：导语竖线改为边框区渐变光，其外发光被移除（避免两套光语言）。
    // 因此「图片发光强度低于导语竖线」的旧参照物已不存在；改为两条结构 + 数值断言：
    //  ① 导语侧确实没有外发光（光只落在 3px 边框条内，不形成整框泛光）；
    //  ② 图片外发光保持在既有克制带宽（0.16，< 0.2）。
    const leadBar =
      extractBlocks(css, /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-lead \{/).find((b) =>
        b.includes('background-image')
      ) ?? ''
    expect(leadBar, '导语渐变竖线规则应存在（#18 实现）').toBeTruthy()
    expect(leadBar, '导语侧不得再有外发光 box-shadow（#18 已移除）').not.toContain('box-shadow')
    expect(decl(strip(leadBar), 'background-size'), '导语的光只占 3px 边框条').toMatch(/3px\s+100%/)

    const glowLayer = splitTop(decl(strip(imgRule()), 'box-shadow'))[1]
    const glowAlpha = rgbaOf(glowLayer).alpha
    expect(glowAlpha, '图片外发光必须有可感知强度').toBeGreaterThan(0)
    expect(glowAlpha, 'SPEC B2 决策值 0.16（改动须同步本守卫）').toBeCloseTo(0.16, 2)
    expect(glowAlpha, '光强须保持克制（<0.2）').toBeLessThan(0.2)
    expect(pxValues(glowLayer)[0], '发光半径 ≤8px（克制）').toBeLessThanOrEqual(8)
    // filter: brightness 会把元素自身的 box-shadow 一并压暗 12% ⇒ 有效光强更低（记录，不另取参数）
    expect(glowAlpha * 0.88, '压暗后的有效光强仍须 <0.2').toBeLessThan(0.2)
  })

  it('④ 描边不参与盒模型：只画在边框盒之外，既有 1px 边框的占位保留', () => {
    const body = strip(imgRule())
    for (const prop of [
      'padding',
      'width',
      'min-width',
      'height',
      'min-height',
      'margin',
      'top',
      'right',
      'bottom',
      'left',
      'position',
      'transform',
      'border-width',
      'border-style'
    ]) {
      expect(body, `描边不得参与盒模型：禁止 ${prop}`).not.toMatch(
        new RegExp(`(?:^|[;\\s])${esc2(prop)}\\s*:`)
      )
    }
    // 既有基层 1px 边框**保留占位**（border-box 下改它会改变图片内容宽度 = 几何变化），只把绘制置透明
    expect(
      decl(body, 'border-color'),
      '既有 1px 边框只置透明绘色、保留占位 ⇒ 图片内容宽度逐像素不变'
    ).toBe('transparent')
    const base = css.match(/(?:^|\n)\.juya-media img \{[\s\S]*?\}/)?.[0] ?? ''
    expect(base, '基层 .juya-media img 规则须保持原样（几何来源）').toContain(
      'border: 1px solid var(--jy-border)'
    )
    // 反证：阅读页图片描边规则唯一（两条会叠成 2px，破坏「1 像素细线」）
    expect(extractBlocks(css, /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-issue img \{/)).toHaveLength(1)
  })

  it('⑤ 圆角用统一自定义属性表达，不改共享 --jy-radius', () => {
    const tokenRule =
      extractBlocks(css, /(?:^|\n)\.jynoct \{/).find((b) => b.includes('--jy-media-radius')) ?? ''
    expect(tokenRule, '统一圆角记号 --jy-media-radius 须声明在共享 .jynoct 作用域').toBeTruthy()
    expect(decl(strip(tokenRule), '--jy-media-radius'), '统一圆角值（与既有图版圆角一致）').toBe('8px')
    expect((css.match(/--jy-media-radius\s*:/g) ?? []).length, '该记号只允许一处声明').toBe(1)

    expect(decl(strip(imgRule()), 'border-radius'), '新规则须消费统一记号').toBe(
      'var(--jy-media-radius)'
    )
    const figure = css.match(/(?:^|\n)\.jynoct \.juya-entry-figure img \{[^}]*\}/)?.[0] ?? ''
    expect(figure, '既有图版圆角须同源到统一记号（计算值仍 8px，亮侧渲染不变）').toContain(
      'border-radius: var(--jy-media-radius)'
    )
    expect(imgRule(), '不得改共享 --jy-radius（改它会波及全部风格）').not.toContain('var(--jy-radius')
    for (const v of ['nocturne-light', 'nocturne-dark']) {
      expect(variantBlock(v), `${v} 的共享圆角记号须保持不变`).toContain('--jy-radius: 12px')
    }
  })

  it('⑥ 不做 --jy-card 衬边、不加背景（右列与正文 20px 呼吸间隙不得被吃掉）', () => {
    const body = strip(imgRule())
    expect(body, '不得给图片加衬底').not.toMatch(/(?:^|[;\s])background/)
    expect(body, '不得引用 --jy-card').not.toContain('--jy-card')
    expect(body, '衬边必然要内衬，本规则不得出现 padding').not.toMatch(
      /(?:^|[;\s])padding(?:-[a-z]+)?\s*:/
    )
  })

  it('⑦ lightbox（T10 / #21 已落地接棒）：放大图 filter: none + object-fit: contain，暗侧复合作用域，正文压暗不得命中', () => {
    // 守卫交棒说明（不是放宽）：本组 ⑦ 原为 T3（#14）的**范围守卫** —— 断言「本票不建 lightbox，
    // 只留 filter: none 的注释义务」。T10（#21）已按 SPEC 批次 B5b 落地 lightbox，故该断言的前提
    // 消失；此处把它换成对**同一义务**的代码级断言（注释义务 → 实现契约），并保留原「注释须点名
    // lightbox / filter: none」两条（改成代码面），断言强度只增不减：
    //   ① 放大图规则必须存在且为暗侧复合作用域（§9 亮侧不做）；
    //   ② 放大图 filter 必须恰为 `none`（T3 义务的最终落点）；
    //   ③ 放大图 object-fit: contain（按比例完整可见，不裁切）；
    //   ④ 正文流压暗规则仍只选择 `.juya-issue` 子树、不得扩到 lightbox（放大图不压暗的结构依据）；
    //   ⑤ 遮罩为暗色半透明（::backdrop 有 rgba 且 alpha 落在 0.6–0.95）。
    const code = noctSection().replace(/\/\*[\s\S]*?\*\//g, ' ')
    const bigImg =
      extractBlock(code, /\[data-juya-variant='nocturne-dark'\]\.jynoct-lightbox img \{/) ?? ''
    expect(bigImg, '放大图规则应为暗侧复合作用域 [data-juya-variant="nocturne-dark"].jynoct-lightbox img').toBeTruthy()
    expect(decl(strip(bigImg), 'filter'), 'T3 义务：放大图必须 filter: none').toBe('none')
    expect(decl(strip(bigImg), 'object-fit'), '按比例完整可见（不裁切）').toBe('contain')

    const backdrop =
      extractBlock(code, /\[data-juya-variant='nocturne-dark'\]\.jynoct-lightbox::backdrop \{/) ?? ''
    expect(backdrop, '遮罩规则应存在').toBeTruthy()
    const mask = rgbaOf(decl(strip(backdrop), 'background'))
    expect(mask.alpha, '遮罩须为暗色半透明（alpha 0.6–0.95）').toBeGreaterThanOrEqual(0.6)
    expect(mask.alpha, '遮罩须为暗色半透明（alpha 0.6–0.95）').toBeLessThanOrEqual(0.95)

    // 正文压暗不得命中放大图：压暗规则的选择器仍必须是 .juya-issue 子树
    expect(imgRule(), '正文压暗规则应保持 .juya-issue 作用域').toBeTruthy()
    expect(strip(imgRule()), '正文压暗规则不得扩到 lightbox').not.toMatch(/lightbox/i)
    // 反证：放大图规则里也确实带了 filter: none（不是靠祖先链「打不中」的巧合）
    expect(code, '全份 CSS 不得给 lightbox 大图任何 brightness 压暗').not.toMatch(
      /jynoct-lightbox[^{]*\{[^}]*brightness\(/
    )
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

  /** 半透明前景按 alpha 合成到不透明底色之上（模块级 overRgba 的别名，签名不变） */
  const over = overRgba

  /** 正文可能落在其上的半透明环境层：变体 background-image 全部 rgba + --jy-lead-bg */
  const ambientLayers = (block: string): Array<{ rgb: number; alpha: number }> => {
    // 局部变量名避开模块级 `decl` 助手，防止遮蔽（此处要的是声明文本本身，不是取值）
    const bgImageDecl = block.match(/background-image:[^;]*/)?.[0] ?? ''
    const layers = [...bgImageDecl.matchAll(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g)].map((m) => ({
      rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
      alpha: Number(m[4])
    }))
    const lead = tokenRgba(block, '--jy-lead-bg')
    if (!Number.isNaN(lead.alpha)) layers.push(lead)
    return layers
  }

  it('① 标题（h1/h2/h3）栈以 DengXian 为 CJK 首选，正文栈以 Noto Sans SC 为 CJK 首选', () => {
    // 2026-10-20（#17 / SPEC B3）追加「拉丁在前、CJK 在后」：拉丁族 'Segoe UI' 提到两个 CJK 族之前，
    // 否则拉丁字母/数字由 CJK 族自带的拉丁字形绘制（=本票要避免的回退）。CJK 面别**未变**：
    // 标题仍是 DengXian、正文仍是 Noto Sans SC，只是让位给拉丁族先接拉丁字符。
    const block = variantBlock(NIGHT)
    expect(block, `${NIGHT} --jy-font-heading 应为「拉丁在前 + 等线 CJK」的三档无衬线栈`).toMatch(
      /--jy-font-heading:\s*'Segoe UI',\s*'DengXian',\s*'Noto Sans SC',\s*sans-serif/
    )
    expect(block, `${NIGHT} --jy-font-body 应为「拉丁在前 + Noto Sans SC」的正文栈`).toMatch(
      /--jy-font-body:\s*'Segoe UI',\s*'Noto Sans SC',\s*sans-serif/
    )
  })

  it('② 不引入本机未安装字体作首选：块内无 Inter / SF Pro，且两栈均以通用族 sans-serif 收尾（零衬线）', () => {
    const block = noComments(variantBlock(NIGHT))
    expect(block, `${NIGHT} 不应残留未安装的 Inter`).not.toContain('Inter')
    expect(block, `${NIGHT} 不应残留未安装的 SF Pro`).not.toContain('SF Pro')
    // 循环变量名避开模块级 `decl` 助手（此处是 token 名，不是取值函数）
    for (const token of ['--jy-font-heading', '--jy-font-body']) {
      const declText = block.match(new RegExp(`${token}:[^;]*`))?.[0] ?? ''
      expect(declText, `${token} 须以通用族 sans-serif 收尾`).toMatch(/sans-serif$/)
      expect(declText.replace(/sans-serif/g, ''), `${token} 不得含衬线族（零衬线）`).not.toContain('serif')
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
    // 条目 hover 底色（共享规则走 --jy-lead-bg，亮侧在用）：
    // 注意 #9 G-1 修复后**暗侧由变体专属规则覆写为 background: none**（见收口守卫组 G-1 断言），
    // 故此处的共享形态断言只覆盖亮侧路径；正文对「单层导语底」的对比度仍须达标。
    expect(noctRule('\\.juya-entry:hover'), '条目 hover 共享规则底色应走 --jy-lead-bg（亮侧）').toContain(
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
          // 允许 `[data-app-hidden]` 状态门（#22 页面不可见暂停规则）：它挂在文档根元素上、
          // 不是内容选择器，也不命中场景层以外的元素；逐条锁定见「不可见暂停动画守卫」组
          .replace(/\[data-app-hidden\]/g, '')
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
      '共享 .juya-scene 高度不得改动（会波及 synthwave/y2k 的既有观感）'
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
  /** 三层雾的定位参数（椭圆半径 / 中心 / transparent 停靠点）。
   *  y 中心有两种写法：百分比（`0%`）或**贴底像素锚**（`calc(100% - 136px)`，2026-10-12 Spec 轴
   *  修正后 n3 用后者按 y2k 约定抬升）。此处两种都解析：`cy` 仅在百分比写法下有值，
   *  `cyPx` 仅在像素锚写法下有值（缺省为 undefined），调用方按需选用。 */
  const nebulaEllipses = (
    rule: string
  ): { rx: number; ry: number; cx: number; cy: number; cyPx?: number; stop: number; token: string }[] =>
    [
      ...rule.matchAll(
        /radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+(?:([\d.]+)%|calc\(100%\s*-\s*([\d.]+)px\))\s*,\s*var\((--jy-nebula-\d)\)\s*,\s*transparent\s+([\d.]+)%\s*\)/g
      )
    ].map((m) => ({
      rx: Number(m[1]),
      ry: Number(m[2]),
      cx: Number(m[3]),
      cy: m[4] === undefined ? Number.NaN : Number(m[4]),
      ...(m[5] === undefined ? {} : { cyPx: Number(m[5]) }),
      token: m[6],
      stop: Number(m[7])
    }))
  /** 把 rgba 层按自下而上顺序 source-over 合成到纯色底上（返回 0xRRGGBB）
   *  逐层调用模块级 alphaOver，与各守卫组同一套取整口径 */
  const over = (bg: number, layers: { r: number; g: number; b: number; a: number }[]): number =>
    layers.reduce((acc, l) => alphaOver((l.r << 16) | (l.g << 8) | l.b, l.a, acc), bg)

  it('① 模板接线：IssueView 挂 <Scene dust nebula />，源码顺序在 .juya-issue 之前（与 y2k/synthwave 同位）', () => {
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

  it('⑥ 128px chrome：n3 已按约定抬升 136px（正向断言），共享高度与 y2k 缓解均不动', () => {
    // 2026-10-12 Spec 轴修正：原断言是「变体场景规则里不存在 bottom: 声明」—— 那是在**锁一个假前提**
    // （「nebula 无贴底装饰 ⇒ 无需抬升」）。事实上 n3 锚在 0% 100%，是贴底装饰，不抬升时其设计峰值
    // 全落在被裁的 128px 里（可见区仅 53.4% 强度）。故改为**正向断言 n3 已抬升**。
    const neb = nebulaOverride()
    expect(neb, 'nocturne-dark 的 nebula 覆盖规则应存在').toBeTruthy()
    const ellipses = nebulaEllipses(neb)
    expect(ellipses, '三层雾应各为一条定位 radial-gradient').toHaveLength(3)
    const n3 = ellipses[2]
    expect(n3.token, '第三层应为 --jy-nebula-3').toBe('--jy-nebula-3')
    // 正向断言：n3 的 y 锚点必须写成贴底像素锚 calc(100% - 136px)（≈128px chrome + 8px 余量，同 y2k 约定）
    expect(n3.cyPx, 'n3 须按 y2k 约定抬升 136px（at 0% calc(100% - 136px)）').toBe(136)
    expect(Number.isNaN(n3.cy), 'n3 的 y 锚点不应再是裸百分比（裸 100% 即未抬升的旧形态）').toBe(true)
    // 抬升只改这一个位置值：半径 / 停靠点 / alpha 一律不动（改任一项都要撞本组 ②/③）
    expect([n3.rx, n3.ry, n3.stop], 'n3 的半径与 transparent 停靠点不得随抬升改动').toEqual([42, 44, 78])
    expect(
      nebulaLayers(neb)[2].a,
      'n3 的 alpha 不得随抬升改动（仍为设计峰值 0.025）'
    ).toBe(0.025)
    // 另两层仍是顶部锚（未被误改）
    expect(
      ellipses.slice(0, 2).map((e) => [e.cx, e.cy]),
      'n1/n2 仍锚在左右上角（本次只改 n3）'
    ).toEqual([
      [0, 0],
      [100, 0]
    ])
    const section = noctSection()
    expect(section, '修正后的抬升判断须写在 nocturne 段内').toContain('原判断建立在假前提上')
    expect(section, '须给出 128px chrome 依据').toContain('128px')
    expect(section, '须记录实测量化：可见区峰值仅设计峰值的 53.4%').toContain('53.4%')
    expect(section, '须记录上抬后恢复 100%').toContain('100%')
    expect(section, '须记录上抬对导语对比度零影响（逐档相同）').toContain('逐档相同')
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
    // #20 / SPEC B5 起，暗侧**允许且仅允许一条** dust 规则用于「破除点阵」的 background-size 覆写。
    // 本守卫的原意（测试名）是「不覆写点色 token」，不是「一条 dust 规则都不许有」；故收窄为：
    // 规则恰好一条、且其全部声明只能是 background-size —— token / 动画 / 透明度仍是零放行。
    const dustRules = [...cssCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
      ([, sel, body]) =>
        sel.includes("data-juya-variant='nocturne-dark'") &&
        sel.includes('.juya-scene-dust') &&
        // 排除 #22 的不可见暂停规则：它只声明 animation-play-state（不碰点色/透明度），
        // 逐条锁定在「不可见暂停动画守卫」组，不属于「点阵破除」覆写
        !/(?:^|[;\s])animation-play-state\s*:/.test(body)
    )
    expect(dustRules.length, '暗侧 dust 覆写规则恰好一条（#20 点阵破除）').toBe(1)
    const body = dustRules[0][2]
    expect(body, '不得覆写 dust 点色 token').not.toContain('--jy-scene-dust')
    expect(body, '不得改 dust 动画/透明度').not.toMatch(/\b(?:animation|transition|opacity)\b/)
    expect(
      body
        .split(';')
        .map((d) => d.split(':')[0]?.trim())
        .filter(Boolean),
      '唯一允许的声明是 background-size'
    ).toEqual(['background-size'])
    // 更强的一层：整份 css 里 `--jy-scene-dust:` 只出现一次（共享层声明），任何选择器都不得覆写它
    const tokenDecls = cssCode.match(/--jy-scene-dust\s*:/g) ?? []
    expect(tokenDecls, '--jy-scene-dust 只在共享层声明一次').toHaveLength(1)
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

  /** source-over 合成半透明层到不透明底色（模块级 alphaOver 的适配器：[r,g,b,a] 元组形态） */
  const over = (layer: [number, number, number, number], base: number): number =>
    alphaOver(layer[0], layer[3], base)
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

describe('nocturne 收口守卫组（2026-10-12，#9：全段扫描式回归网）', () => {
  // 本组是收口票 #9 的静态回归网：前八票各自锁「自己那几条规则」，本组做**全段扫描**——
  // 断言面覆盖整个 nocturne 段（「暗夜精修式」token 块 → 「杂志编辑式」段头），
  // 目的是让**以后任何人往这个风格里加东西**都必须满足同一套不变量：
  //   ① 变体覆盖只能是复合形态（带空格的后代形态永不匹配）
  //   ② 任何字面构成色都必须带「取色来源 + 对比度」注释（逐条登记、计数）
  //   ③ 字体栈只有三档落点，且不得回退到本机未安装的 Inter / SF Pro
  //   ④ 零 text-shadow（background-clip:text 绘制顺序陷阱）
  //   ⑤ animation 只挂子层，且每个动画承载选择器都必须在 reduced-motion 块内被显式复位
  // 与既有组的分工：①④ 是此前只拦 `.jy*` 形态 / 只查刊头单条规则的**放宽版**；
  // ②③⑤ 是此前没有的**全段面**。

  /** 剥注释但**保持字符位置**（空格替换）⇒ 同一套索引既能扫代码，也能回查原文注释 */
  const masked = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  /** 就地剥注释（用于「规则体内是否出现某声明」这类判定） */
  const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ')

  /** 紧贴在 pos 之前的注释块（两者之间只允许空白，否则视为无关注释） */
  const leadingCommentAt = (pos: number): string => {
    const before = css.slice(0, pos)
    const open = before.lastIndexOf('/*')
    if (open < 0) return ''
    const close = before.indexOf('*/', open)
    if (close < 0 || before.slice(close + 2).trim() !== '') return ''
    return before.slice(open, close + 2)
  }

  interface CssRule {
    head: string
    /** 分组规则头按 `,` 拆开、各自 trim（空串剔除） */
    selectors: string[]
    /** 规则头首字符在 css 中的位置（用于回查紧邻上文注释） */
    start: number
    /** `{` 的位置 */
    open: number
    /** 剥注释后的规则体（用于「是否含某声明」判定） */
    body: string
    /** 原文规则体（含注释，用于「构成色是否带注释」判定） */
    rawBody: string
    leading: string
  }

  /** 全份规则扫描：对每个 `{` 向前回退到最近的 `{` / `}` / `;`（声明不可能含花括号），
   *  故媒体查询内的嵌套规则与关键帧内的 from/to 都能取到；body 用花括号配平截取。 */
  const allRules: CssRule[] = (() => {
    const out: CssRule[] = []
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] !== '{') continue
      let j = i
      while (j > 0 && !'{};'.includes(masked[j - 1])) j--
      const raw = masked.slice(j, i)
      const head = raw.trim()
      const start = j + (raw.length - raw.trimStart().length)
      let depth = 0
      let end = i
      for (let k = i; k < masked.length; k++) {
        if (masked[k] === '{') depth++
        else if (masked[k] === '}') {
          depth--
          if (depth === 0) {
            end = k
            break
          }
        }
      }
      out.push({
        head,
        selectors: head
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        start,
        open: i,
        body: masked.slice(i, end + 1),
        rawBody: css.slice(i, end + 1),
        leading: leadingCommentAt(start)
      })
    }
    return out
  })()

  /** nocturne 段边界：亮侧 token 块（段首）→ 杂志编辑式 token 块（段尾，紧邻的下一风格） */
  const SEG_START = css.indexOf("[data-juya-variant='nocturne-light'] {")
  const SEG_END = css.indexOf("[data-juya-variant='editorial-light'] {")
  const NOCT = "data-juya-variant='nocturne-"
  const isKeyframeStep = (r: CssRule): boolean =>
    r.selectors.length > 0 && r.selectors.every((s) => /^(?:from|to|[\d.]+%)$/.test(s))
  /** 只装规则的容器型 @ 规则（@media / @supports / …）；@keyframes 是**叶子单元**，不在此列
   *  （关键帧里的取色同样是构成色，必须一并纳入注释网） */
  const isContainerAtRule = (r: CssRule): boolean =>
    r.selectors.every((s) => /^@(?:media|supports|layer|container)\b/.test(s))
  const segmentRules = (): CssRule[] =>
    allRules.filter((r) => r.start >= SEG_START && r.start < SEG_END)

  it('① 变体专属覆盖形态：段内（全份）所有 nocturne 前缀规则都必须紧跟 .jynoct，不得带空格后代', () => {
    expect(SEG_START, 'nocturne-light token 块应存在').toBeGreaterThan(0)
    expect(SEG_END, '杂志编辑式 token 块应存在').toBeGreaterThan(SEG_START)

    // 从「选择器开头」出现的变体前缀：抠出选择器头里的每一片，逐个检查残余部分
    const prefixed: string[] = []
    for (const r of allRules) {
      for (const sel of r.selectors) if (sel.startsWith(`[${NOCT}`)) prefixed.push(sel)
    }
    expect(
      prefixed.length,
      '扫描面非空：nocturne 段的变体专属规则数量（未来若整体删空会撞红）'
    ).toBeGreaterThanOrEqual(20)
    for (const sel of prefixed) {
      const tail = sel.replace(/^\[data-juya-variant='nocturne-(?:light|dark)'\]/, '')
      expect(
        tail === '' || tail.startsWith('.jynoct'),
        `变体专属覆盖必须写复合形态（.jynoct 紧贴选择器，无空格后代）：${sel}`
      ).toBe(true)
      // 死形态的具体形态：`[data-juya-variant='x'] .jy…`（文档记载的三次静默失效根因）
      expect(sel, `不得写带空格的后代形态：${sel}`).not.toMatch(
        /^\[data-juya-variant='nocturne-(?:light|dark)'\]\s+\.jy/
      )
    }

    // 变体前缀的**非选择器开头**出现处：只允许三种已登记形态——
    //   ① 滚动条 :has() 规则（各自列在滚动条守卫组里）；
    //   ② #12 的配色方案 :has() 规则（列在「暗侧原生件配色守卫」组里）；
    //   ③ #22 的 6 条不可见暂停规则（`[data-app-hidden] [data-juya-variant='nocturne-dark'].jynoct …`，
    //      祖先先行是为把状态门挂在文档根元素上；变体前缀与 .jynoct 仍是紧贴的复合形态，
    //      列在「不可见暂停动画守卫」组里）。该弹坑是既有死形态守卫拦不住的（`[data-juya-variant='x'] .view-scroll` 不以 .jy 开头）
    const occurrences = (masked.match(new RegExp(`\\[${NOCT}`, 'g')) ?? []).length
    expect(
      occurrences - prefixed.length,
      '非选择器开头处只允许 :has() 滚动条规则 / #12 配色规则 / #22 不可见暂停规则（改这里须同步对应守卫组）'
    ).toBe(9)
  })

  /** 规则体内的字面色值（剔除注释；含自定义属性声明——`--x: rgba()` 同样是构成色） */
  const literalColors = (rule: CssRule): string[] =>
    strip(rule.body).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []

  it('② 构成色硬编码注释：段内每条含字面色值的规则都必须带「取色来源 + 对比度」，逐条登记计数', () => {
    // 范围口径（两条，均在此明写，避免「漏检」与「越界」两种误读）：
    //  · 亮侧作用域规则（选择器含 nocturne-light）不在本组范围内 —— 需求 §9 明写
    //    「nocturne-light 任何改动」不做，本组不要求（也不允许）为亮侧补注释；
    //  · 关键帧的 from/to 不是规则（其色值归属 @keyframes 块本身，整块一个证据面）。
    const scoped = segmentRules().filter(
      (r) =>
        !isContainerAtRule(r) &&
        !isKeyframeStep(r) &&
        !r.selectors.some((s) => s.includes('nocturne-light')) &&
        literalColors(r).length > 0
    )
    const unannotated = scoped
      .filter((r) => {
        // 证据面 = 紧邻上文注释 + **原文**规则体（规则体内的行内注释同样算数）
        const evidence = r.leading + r.rawBody
        return !evidence.includes('取色来源') || !evidence.includes('对比度')
      })
      .map((r) => r.head.replace(/\s+/g, ' '))

    const registry = scoped.map((r) => r.head.replace(/\s+/g, ' '))
    expect(registry.length, '构成色登记表不得为空（空 = 扫描面失效）').toBeGreaterThanOrEqual(12)
    expect(
      unannotated,
      '以下规则的硬编码构成色缺「取色来源」或「对比度」注释（本守卫即为「以后加色必须带注释」的闸门）'
    ).toEqual([])

    // 逐条登记（改色/加色会让本表变化 ⇒ 必须同步补注释并更新登记，属预期）。
    // 不含字面色值的规则（如 .juya-lead 的 padding/底色规则 —— 全走 var()）不在表内。
    // #9 G-1/G-2 修复新增两条字面色规则，故本表由 13 → 15 条：
    //  · 第二条 .juya-scene-nebula = ≤520px 窄窗退化规则（峰值 alpha 单独收到 0.055 字面值）；
    //  · [data-juya-variant='nocturne-dark'].jynoct .juya-entry:hover = 暗侧撤掉背景微亮、
    //    改走 border-bottom-color rgba(255,255,255,0.22)（发丝线提亮，不参与文字背景合成）。
    // 刊头极光带（2026-10-12 用户指令「头部过于朴素」）再新增两条，故 15 → 17 条：
    //  · ::before（前层幕帘）/ ::after（后层反相幕帘）—— 承载多层 radial/linear 渐变的字面 rgba。
    //    同批新增的另两条**不在表内**，因为确无字面色值（说明见各自注释，避免被误认为登记遗漏）：
    //      – `.jynoct .juya-masthead { position: relative }`：纯定位；
    //      – `::before, ::after` 共用的定位/mask 规则：mask 停靠点用 `black` 关键字而非字面色；
    //      – 两条 @keyframes jy-noct-aurora-*：只动 opacity，无任何色值。
    // #14 阅读页图片发丝描边（2026-10-20，SPEC B2）再新增一条，故 17 → 18 条：
    //  · .juya-issue img = 1px 发丝环（var(--jy-border)）+ 外发光 rgba(110,123,255,0.16)；
    //    同批的 `.jynoct { --jy-media-radius: 8px }` 与改写的 `.jynoct .juya-entry-figure img`
    //    无任何字面色值（纯 token 消费），故不入表。
    // #20 概览焦点整行高亮（2026-10-20，SPEC B5）再新增一条，故 18 → 19 条：
    //  · li:has(a:focus-visible) = 与 hover 同底色 rgba(110,123,255,0.06)；
    //    同批的焦点环规则 `a:focus-visible` 只写 outline 简写（var(--jy-focus)）无字面色值，不入表。
    // #21 图片放大视图（2026-10-20，SPEC B5b）再新增一条，故 19 → 20 条：
    //  · ::backdrop = 暗色半透明遮罩 rgba(10,10,12,0.82)（--jy-bg 的 82% alpha 字面）；
    //    同批的 `.jynoct-lightbox`（面板底 var(--jy-bg)/描边 var(--jy-border)）与
    //    `.jynoct-lightbox img`（filter/object-fit/几何）全走 token 或无字面色值，不入表。
    expect(registry).toEqual([
      "[data-juya-variant='nocturne-dark']",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-scene-nebula",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-scene-nebula",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-issue::before, [data-juya-variant='nocturne-dark'].jynoct .juya-issue::after",
      '.jynoct .juya-masthead h1',
      "[data-juya-variant='nocturne-dark'].jynoct .juya-masthead h1",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-masthead::before",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-masthead::after",
      '@keyframes jy-noct-glow',
      "[data-juya-variant='nocturne-dark'].jynoct .juya-entry:hover",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-lead",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-section > h2",
      '.jynoct .juya-feed-item:hover',
      "[data-juya-variant='nocturne-dark'].jynoct .juya-issue img",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-overview .juya-index",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li + li::after",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li:hover",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li:has(a:focus-visible)",
      "[data-juya-variant='nocturne-dark'].jynoct .juya-overview .juya-index",
      "[data-juya-variant='nocturne-dark'].jynoct-lightbox::backdrop"
    ])

    // 反证（范围闸门）：段内亮侧作用域的字面色规则恰好是既有两条；新增亮侧规则会撞红本断言
    const lightScoped = segmentRules()
      .filter(
        (r) =>
          !isContainerAtRule(r) &&
          !isKeyframeStep(r) &&
          r.selectors.some((s) => s.includes('nocturne-light')) &&
          literalColors(r).length > 0
      )
      .map((r) => r.head.replace(/\s+/g, ' '))
    expect(lightScoped, '亮侧不属本票范围（需求 §9）；出现新条目即须复核').toEqual([
      "[data-juya-variant='nocturne-light']",
      "[data-juya-variant='nocturne-light'].jynoct .juya-masthead h1",
      "[data-juya-variant='nocturne-light'].jynoct .juya-feed-item:hover"
    ])
  })

  it('③ 字体栈落点：暗侧三档声明齐全、段内 font-family 无 Inter / SF Pro、token 无中段覆写', () => {
    const dark = variantBlock('nocturne-dark')
    // 2026-10-20（#17 / SPEC B3）追加「拉丁在前、CJK 在后」：拉丁族 'Segoe UI' 排到最前，
    // CJK 面别不变（标题仍 DengXian、正文仍 Noto Sans SC）。断言同样严格，只是把顺序写死。
    expect(decl(dark, '--jy-font-heading'), '标题档：拉丁族在前、等线为 CJK 首选').toMatch(
      /^'Segoe UI', 'DengXian'/
    )
    expect(decl(dark, '--jy-font-body'), '正文档：拉丁族在前、Noto Sans SC 为 CJK 首选').toMatch(
      /^'Segoe UI', 'Noto Sans SC'/
    )

    // 段内能命中暗侧的每个 font-family 声明：只允许三档（heading token / body token / 等宽元信息档）
    const families = segmentRules()
      .filter(
        (r) =>
          !isContainerAtRule(r) &&
          !isKeyframeStep(r) &&
          !r.selectors.some((s) => s.includes('nocturne-light'))
      )
      .map((r) => ({ head: r.head.trim(), value: decl(strip(r.body), 'font-family') }))
      .filter((x) => x.value !== '')
    expect(families.length, '段内等宽档落点数量（元信息 / 题注 / 序号）').toBeGreaterThanOrEqual(3)
    for (const { head, value } of families) {
      expect(value, `${head} 不得回退到本机未安装的 Inter / SF Pro`).not.toMatch(/Inter|SF Pro/)
      expect(
        /^'JetBrains Mono'/.test(value) ||
          /^var\(--jy-font-(?:heading|body)\)/.test(value),
        `${head} 的字体必须是三档之一（等宽元信息档或两条 token），实得：${value}`
      ).toBe(true)
    }

    // 两条 token 在段内的**声明点**只能各有一处（暗侧不得被中段覆写；亮侧那两处是既有形态）
    for (const name of ['--jy-font-heading', '--jy-font-body']) {
      const owners = segmentRules()
        .filter((r) => new RegExp(`${name}:`).test(strip(r.body)))
        .map((r) => r.selectors.join(', '))
      expect(owners, `${name} 的声明点应恰好是亮/暗两个 token 块`).toEqual([
        "[data-juya-variant='nocturne-light']",
        "[data-juya-variant='nocturne-dark']"
      ])
    }
    // 亮侧栈保持原样（本轮仅暗侧；需求 §9）
    expect(variantBlock('nocturne-light'), '亮侧字体栈不得改动').toContain(
      "--jy-font-heading: Inter, 'SF Pro Display'"
    )
  })

  it('④ 辉光禁用 text-shadow：段内零 text-shadow 声明，也不与 background-clip: text 同规则共现', () => {
    const seg = segmentRules().filter((r) => !isContainerAtRule(r))
    const shadows = seg
      .filter((r) => /(?:^|[;{\s])text-shadow\s*:/.test(strip(r.body)))
      .map((r) => r.head.replace(/\s+/g, ' '))
    expect(
      shadows,
      'text-shadow 在 background-clip:text 的渐变字上会盖住填充（Chromium 绘制顺序，y2k 已踩坑）'
    ).toEqual([])

    // 反证（非空断言）：段内确实有渐变字规则，否则「没有 text-shadow」毫无意义。
    // 暗侧刊头**不重复**声明 clip（继承共享 `.jynoct .juya-masthead h1`），故段内是 2 条（共享 + 亮侧）。
    const clipped = seg.filter((r) => /background-clip:\s*text/.test(strip(r.body)))
    expect(clipped.length, '段内渐变字规则数（共享刊头 + 亮侧覆盖）').toBeGreaterThanOrEqual(2)
    for (const r of clipped) {
      expect(strip(r.body), `${r.head} 渐变字不得叠 text-shadow`).not.toMatch(/text-shadow\s*:/)
    }
    // 辉光的唯一合法写法：filter: drop-shadow（暗侧刊头现为双层）
    const glow = extractBlock(
      css,
      /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-masthead h1 \{/
    )
    expect(glow, '暗侧刊头辉光规则应存在').toBeTruthy()
    expect(glow, '辉光只能写成 filter: drop-shadow').toMatch(/filter:\s*drop-shadow\(/)
  })

  it('⑤ 动画只挂子层，且每个动画承载选择器都在 reduced-motion 块内被显式复位（不靠 duration 兜底）', () => {
    // 段内动画：必须是子元素/子层（含后代组合符），不得是 .juya-root / .jynoct 自身
    const segAnim = segmentRules()
      .filter((r) => /(?:^|[;{\s])animation\s*:/.test(strip(r.body)))
      .flatMap((r) => r.selectors)
    expect(segAnim.length, '段内应有动画承载选择器（刊头呼吸）').toBeGreaterThanOrEqual(1)
    for (const sel of segAnim) {
      expect(sel, '动画不得挂根元素').not.toMatch(/^\.juya-root$|^\.jynoct$/)
      expect(sel, '动画必须挂子层/子元素（后代组合）').toMatch(/\s/)
    }

    // 全份结构保证：任何以 .juya-root 自身结尾的选择器都不得带 animation 声明
    const rootAnim = allRules
      .filter((r) => r.selectors.some((s) => /^\.juya-root$/.test(s)))
      .filter((r) => /(?:^|[;{\s])animation\s*:/.test(strip(r.body)))
    expect(rootAnim.map((r) => r.head), '.juya-root 永无 animation（RM 断言的结构保证）').toEqual([])

    // RM 覆盖：全份每个动画承载选择器都必须在某个 reduce 块里被 animation: none 显式关掉。
    // 注意基层 `.juya-root *` 只压 duration / iteration-count（!important），**不重置 animation-name**，
    // 故它不能替代复位 —— 本断言要求选择器自己的名字出现在 RM 块里。
    const rmBlocks = extractBlocks(css, /@media \(prefers-reduced-motion: reduce\) \{/)
    expect(rmBlocks.length, 'RM 块（基层 / 场景层 / 刊头）应齐备').toBeGreaterThanOrEqual(2)
    const rmText = rmBlocks.map(strip).join('\n')
    const baseBlk = rmBlocks.find((b) => b.includes('.juya-root *')) ?? ''
    expect(baseBlk, '基层 RM 块仍须有 .juya-root * 的全量兜底').toContain('.juya-root *')
    // 兜底规则只压 duration / iteration-count（!important），**不重置 animation-name** ⇒
    // 它不能替代「选择器级 animation: none」；把兜底规则单独抠出来验这一点。
    const fallback = extractBlock(
      strip(baseBlk),
      /\.juya-root \* \{/
    )
    expect(fallback, '.juya-root * 兜底规则应可抠取').toBeTruthy()
    expect(fallback, '兜底只压 duration').toContain('animation-duration')
    expect(fallback, '兜底不得重置 animation-name').not.toMatch(/animation-name/)
    expect(fallback, '兜底不得写成 animation 简写（那才会重置 name）').not.toMatch(
      /(?:^|[;{\s])animation\s*:/
    )

    const carriers = allRules
      .filter((r) => /(?:^|[;{\s])animation\s*:/.test(strip(r.body)))
      .filter((r) => !isKeyframeStep(r) && !isContainerAtRule(r))
      .flatMap((r) => r.selectors.filter((s) => !s.includes('*')))
    expect(carriers.length, '全份动画承载选择器数量').toBeGreaterThanOrEqual(6)
    for (const sel of carriers) {
      const esc2 = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 分组选择器头（`.juya-scene-sun,\n.juya-scene-grid-persp, … {`）也要认：允许逗号后再跟选择器
      const reset = extractBlocks(rmText, new RegExp(`${esc2}\\s*(?:,[^{}]*)?\\{`))
      expect(
        reset.some((b) => /animation:\s*none/.test(b)),
        `RM 下必须显式复位：${sel}（只靠 duration 兜底不算）`
      ).toBe(true)
    }
  })

  // ---- G-1 / G-2 回归锁（2026-10-12 收口审计量出的两个可达 AA 缺口，已修）----
  it('⑥ G-1 防耦合回归：暗侧条目 hover 不得再叠背景微亮（与导语底共用 --jy-lead-bg 会叠两层）', () => {
    // 病根：`.juya-entry:hover` 与 `.juya-lead` 同用 --jy-lead-bg ⇒ 悬停时导语像素叠两层 0.08 白，
    // --jy-muted 掉到 3.53–3.82（8/8 视口档 < AA 4.5）。实测**任何正 alpha 都不可行**（底色近黑时
    // 微亮成比例放大对比度分母，连 0.005 都把 vw=480 压到 4.4967），故暗侧撤掉背景、改走发丝线提亮。
    const darkHover = css.match(
      /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-entry:hover\s*\{[^}]*\}/
    )?.[0] ?? ''
    expect(darkHover, '暗侧条目 hover 覆盖规则应存在（G-1 修复的落点）').toBeTruthy()
    expect(decl(strip(darkHover), 'background'), '暗侧 hover 背景必须为 none').toMatch(/^none$/)
    expect(darkHover, '不得引用 --jy-lead-bg（耦合回归即撞红）').not.toContain('var(--jy-lead-bg)')
    // 替代线索：边框提亮（不参与文字的背景合成，故与文字对比度无关）
    expect(decl(strip(darkHover), 'border-bottom-color'), '改用边框提亮作为 hover 线索').toBeTruthy()
    // 亮侧不受影响（§9：nocturne-light 本轮不动）——共享规则仍保留原背景
    const shared = css.match(/(?:^|\n)\.jynoct \.juya-entry:hover\s*\{[^}]*\}/)?.[0] ?? ''
    expect(shared, '共享规则（亮侧路径）仍走 --jy-lead-bg').toContain('background: var(--jy-lead-bg)')
  })

  it('⑦ G-2 回归锁：≤520px 窄窗雾峰值 alpha 单独收紧（视口锚定 ⇒ 导语滚顶会落进峰值）', () => {
    // 窄窗退化带同样 sticky 视口锚定；原 0.07 时 vw=480 导语 --jy-muted 只有 4.4915 < 4.5。
    const narrowNeb = (() => {
      let rest = css
      for (;;) {
        const b = extractBlock(rest, /@media \(max-width: 520px\) \{/)
        if (!b) return ''
        if (b.includes('.juya-scene-nebula')) {
          return b.match(/\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula\s*\{[^}]*\}/)?.[0] ?? ''
        }
        rest = rest.replace(b, '')
      }
    })()
    expect(narrowNeb, '窄窗 nebula 退化规则应存在').toBeTruthy()
    /** 就地抠 rgba（本组无 tokenRgba，自备） */
    const rgbaAt = (src: string, name: string): { rgb: number; alpha: number } => {
      const m = decl(strip(src), name).match(
        /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/
      )
      return m
        ? { rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]), alpha: Number(m[4]) }
        : { rgb: NaN, alpha: NaN }
    }
    const narrowN1 = rgbaAt(narrowNeb, '--jy-nebula-1')
    // 主规则（>520px 的三层雾覆写）里才有 --jy-nebula-1 的峰值，**不在 token 块**里
    const mainNeb = css.match(
      /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula\s*\{[^}]*\}/
    )?.[0] ?? ''
    expect(mainNeb, '主规则 .juya-scene-nebula 覆写应存在').toBeTruthy()
    const mainN1 = rgbaAt(mainNeb, '--jy-nebula-1')
    expect(narrowN1.alpha, '窄窗须单独覆写 --jy-nebula-1 峰值').not.toBeNaN()
    expect(mainN1.alpha, '主规则 --jy-nebula-1 应为 rgba').not.toBeNaN()
    expect(narrowN1.alpha, '窄窗峰值必须低于主规则峰值（收一档）').toBeLessThan(mainN1.alpha)
    // 实算：窄窗峰值叠 --jy-bg 后，导语 muted 须 ≥4.5 且留 ≥0.05 余量（与审计脚本同口径）
    const bg = tokenHex(variantBlock('nocturne-dark'), '--jy-bg')
    const mix = (fg: number, alpha: number, base: number): number =>
      [16, 8, 0].reduce(
        (acc, s) =>
          acc |
          (Math.round(((fg >> s) & 0xff) * alpha + ((base >> s) & 0xff) * (1 - alpha)) << s),
        0
      )
    const fog = mix(narrowN1.rgb, narrowN1.alpha, bg)
    const leadA = rgbaAt(variantBlock('nocturne-dark'), '--jy-lead-bg').alpha
    const leadOver = mix(0xffffff, leadA, fog)
    const muted = tokenHex(variantBlock('nocturne-dark'), '--jy-muted')
    expect(
      contrast(muted, leadOver),
      '窄窗峰值下导语 muted 对合成底须 ≥4.5 且留 ≥0.05 余量'
    ).toBeGreaterThanOrEqual(4.55)
  })
})

describe('nocturne 窄窗单列回落图宽守卫（2026-10-20，#15 / SPEC 批次 B2 附）', () => {
  // 病根（票面已 git blame 查证）：`.jynoct .juya-entry-row .juya-entry-figure { width: 200px }`
  // 来自 `3e8b9e9`，提交信息只写「图文并排」、从未涉及窄窗；基层在 ≤640px 把 `.juya-entry-row`
  // 改纵排时写的是 `.juya-entry-row .juya-entry-figure { width: 100% }`（特异性 0,2,0），
  // 输给 200px 那条（0,3,0）⇒ 断点处只换了排布方向、没重置宽度，单列里图仍占 200px，
  // 同屏与满宽回流带并置出两种图宽。判定为布局模式切换后的残留，无设计意图。
  // 本组锁三件事：宽屏 200px 一字节不动、断点内确有暗侧复合形态的复位、复位值严格等于 100%
  // （不放宽成「任意非 auto 值」——那会放过 width: 320px 这类新的错误取值）。
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const FIG = 'juya-entry-row .juya-entry-figure'
  /** 暗侧窄窗复位选择器的字面量（复合形式：AGENTS「变体覆盖选择器约定」硬形态） */
  const DARK_RESET = `[data-juya-variant='nocturne-dark'].jynoct .${FIG}`
  /** 全部 ≤640px 媒体块（按花括号配平提取，剥注释；同名媒体查询可能分散多处） */
  const narrowBlocks = (): string[] =>
    extractBlocks(css, /@media \(max-width: 640px\) \{/).map(stripComments)
  /** 含 nocturne 图宽复位的那个窄窗媒体块 */
  const resetBlock = (): string =>
    narrowBlocks().find((b) => b.includes('.jynoct') && b.includes(FIG)) ?? ''
  /** 从块内抠出指定选择器的完整规则块 */
  const ruleOf = (block: string, selector: string): string =>
    block.match(new RegExp(`${esc(selector)}\\s*\\{[^}]*\\}`))?.[0] ?? ''

  it('① 宽屏并排宽度不变：`.jynoct` 图列仍是 200px，且只有这一条声明（无旁路覆写）', () => {
    const wide = css.match(/(?:^|\n)\.jynoct \.juya-entry-row \.juya-entry-figure \{([^}]*)\}/) ?? []
    expect(wide[1], '宽屏（>640px）图恒在右的 200px 列宽应原样保留').toBeTruthy()
    expect(decl(wide[1], 'width'), '宽屏图列必须是 200px（本票不得改宽屏行为）').toBe('200px')
    // 复位只允许出现在媒体块内：媒体块之外不得再出现 figure 宽度的变体覆写
    let outside = css
    for (const b of extractBlocks(css, /@media \(max-width: 640px\) \{/)) outside = outside.split(b).join('\n')
    outside = stripComments(outside)
    outside = outside.replace(/(?:^|\n)\.jynoct \.juya-entry-row \.juya-entry-figure \{[^}]*\}/, '\n')
    expect(
      outside,
      '媒体块之外不得有 [data-juya-variant=…].jynoct 的 figure 宽度覆写（宽屏几何零变化）'
    ).not.toMatch(/\[data-juya-variant='[^']+'\]\.jynoct \.juya-entry-row \.juya-entry-figure\s*\{/)
  })

  it('② 断点内存在暗侧复合形态的复位规则（不是空格后代死形态）', () => {
    const block = resetBlock()
    expect(block, '≤640px 媒体块内应有 nocturne 图宽复位').toBeTruthy()
    expect(ruleOf(block, DARK_RESET), `断点内应有规则：${DARK_RESET}`).toBeTruthy()
    // 复位必须只挂暗侧：块内不得出现共享 `.jynoct` 形态（那会把 nocturne-light 一并改掉，§9 不做）
    expect(block, '块内不得出现共享 `.jynoct` 图宽复位（亮侧不在本票范围）').not.toMatch(
      /(?:^|[;{}\s])\.jynoct \.juya-entry-row \.juya-entry-figure\s*\{/
    )
    // 非死形态：变体前缀与风格类必须复合（空格后代形式永不匹配，见 AGENTS 约定）
    expect(css, '不得写 [data-juya-variant=…] 后带空格再接 .jynoct 的死形态').not.toMatch(
      /\[data-juya-variant='nocturne-dark'\]\s+\.jynoct \.juya-entry-row/
    )
  })

  it('③ 复位值严格等于 100%（不放宽成任意值），特异性高于宽屏 200px 那条', () => {
    const block = resetBlock()
    const reset = ruleOf(block, DARK_RESET)
    expect(reset, '复位规则应存在').toBeTruthy()
    const body = reset.slice(reset.indexOf('{') + 1)
    // 严格相等：既拦「没写 / auto」，也拦 width: 320px 这类新的错误取值
    expect(decl(body, 'width'), '单列回落的图宽必须严格是 100%').toBe('100%')
    expect(body, '复位不得夹带 px 定宽（那等于把残留换成另一个定宽）').not.toMatch(/\d+px/)
    // 特异性对照：复位选择器含 4 个类/属性记号（0,4,0），宽屏那条是 3 个（0,3,0）
    const weight = (sel: string): number => (sel.match(/\[[^\]]+\]|\.[\w-]+/g) ?? []).length
    expect(weight(DARK_RESET), '复位特异性（类/属性记号数）须高于宽屏规则').toBeGreaterThan(
      weight(`.jynoct .${FIG}`)
    )
    expect(ruleOf(block, DARK_RESET)).toMatch(/width:\s*100%/m)
  })

  it('④ 图本体也铺满：暗侧窄窗内图列 img 宽度严格 100%（只命中图列，不波及回流带）', () => {
    // 为什么图也要管：固有宽（480px）在 560 视口下**小于**内容列（实测 508px），而基层只给
    // `.juya-root img { max-width: 100% }`（上限而非填充）⇒ 仅复位 figure 仍会在右侧留 26px 空白。
    const block = resetBlock()
    const DARK_IMG = `[data-juya-variant='nocturne-dark'].jynoct .juya-entry-figure img`
    const rule = ruleOf(block, DARK_IMG)
    expect(rule, `断点内应有规则：${DARK_IMG}`).toBeTruthy()
    expect(decl(rule.slice(rule.indexOf('{') + 1), 'width'), '图宽必须严格是 100%').toBe('100%')
    // 回流带 / 通用图（.juya-media img / .jynoct .juya-entry-figure img）不得被这条窄窗规则连带改掉
    expect(rule, '选择器只允许锚在图列上（不得写到 .juya-media 或裸 img）').not.toMatch(
      /\.juya-media\s+img|(?:^|[^.\w-])img\s*\{$/
    )
  })

  it('⑤ 复位块只锁暗侧窄窗：媒体查询必须是 max-width: 640px，与基层断点同档', () => {
    const narrow = narrowBlocks()
    expect(narrow.length, '既有基层 ≤640px 块应仍在（断点不得被本票挪动）').toBeGreaterThan(0)
    expect(css, '基层断点保持 640px 未改').toMatch(/@media \(max-width: 640px\) \{/)
    const block = resetBlock()
    // 复位块本身是 ≤640px 块（由 narrowBlocks 提取，天然满足）；此处锁「块内不再夹带第二个
    // 媒体/支持查询条件」——把复位藏进嵌套条件会让上面三条静态断言脱离真实生效语境
    const inner = block.replace(/^@media \(max-width: 640px\) \{/, '')
    expect(inner, '复位块不得夹带 prefers-reduced-motion 等额外条件').not.toMatch(/@media|@supports/)
  })
})


describe('nocturne 右边缘对齐记号守卫（2026-10-20，#16 / SPEC 批次 B2b）', () => {
  // 票面要求：概览的「负外边距 / 内衬 / 分隔线左右内缩」由**同一个自定义记号**驱动，
  // 改一处不会漂移；基准是栏目 h2 横线右缘（= 正文文字右缘），不是 issue 外缘。
  // 条目容器的水平内衬（`4px 2px 18px` 的 2px，来自 `3e8b9e9`）在暗侧置 0 —— 已查证不承载
  // 任何 hover 效果（暗侧 hover 走 border-bottom-color 提亮、border-radius 已置 0）。
  // 本组只锁暗侧复合形态（AGENTS「变体覆盖选择器约定」），亮侧取值一字不动。
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const ruleOf = (selector: string): string => extractBlock(css, new RegExp(esc(selector)))
  const DARK = "[data-juya-variant='nocturne-dark'].jynoct"
  const TOKEN_RULE = `${DARK} .juya-overview {`
  const ROW_RULE = `${DARK} .juya-overview li {`
  const SEP_RULE = `${DARK} .juya-overview li + li::after {`
  const ENTRY_RULE = `${DARK} .juya-entry {`
  const body = (rule: string): string => rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}'))

  it('① 概览三处由同一记号 --jy-ov-bleed 驱动，且三处都不再写字面 8px', () => {
    const token = body(ruleOf(TOKEN_RULE))
    expect(token, '概览记号的声明规则应存在').toBeTruthy()
    expect(decl(token, '--jy-ov-bleed'), '记号取值应为 8px（SPEC B2b）').toBe('8px')

    const row = body(ruleOf(ROW_RULE))
    expect(row, '概览条目行规则应存在').toBeTruthy()
    // li 内衬与负外边距必须吃同一个记号：内衬 = +bleed，margin = -bleed（两者等量 ⇒ 行宽不变）
    expect(decl(row, 'padding'), 'li 内衬须由记号驱动').toContain('var(--jy-ov-bleed)')
    expect(decl(row, 'margin'), 'li 负外边距须由同一记号驱动（等量负值）').toContain(
      'calc(-1 * var(--jy-ov-bleed))'
    )

    const sep = body(ruleOf(SEP_RULE))
    expect(sep, '概览分隔线规则应存在').toBeTruthy()
    expect(decl(sep, 'left'), '分隔线左内缩须由同一记号驱动').toBe('var(--jy-ov-bleed)')
    expect(decl(sep, 'right'), '分隔线右内缩须由同一记号驱动').toBe('var(--jy-ov-bleed)')

    // 漂移防线：三处的**横向**数值不得再写字面量（否则改记号时这些数值会被落下）。
    // 纵向 2px 内衬是既有形态、与本记号无关，不在漂移面内。
    for (const [name, value] of [
      ['margin', decl(row, 'margin')],
      ['left', decl(sep, 'left')],
      ['right', decl(sep, 'right')]
    ] as const) {
      expect(value, `${name} 不得写字面 px（须全部走 --jy-ov-bleed）`).not.toMatch(/\d+px/)
    }
    expect(decl(row, 'padding'), 'padding 的横向分量不得写字面 8px').not.toMatch(/-?8px/)
  })

  it('② 条目容器水平内衬在暗侧置 0，亮侧与基层一字不改', () => {
    const entry = body(ruleOf(ENTRY_RULE))
    expect(entry, "[data-juya-variant='nocturne-dark'].jynoct .juya-entry 覆写应存在").toBeTruthy()
    expect(decl(entry, 'padding'), '暗侧条目内衬应为 4px 0 18px（水平 0）').toBe('4px 0 18px')

    // 基层（共享）那条仍是 2px：它是亮侧 / 其他分支的取值，本票不碰
    const base = extractBlock(css, /(?:^|\n)\.jynoct \.juya-entry \{/).replace(/^\n/, '')
    expect(decl(body(base), 'padding'), '既有共享 .jynoct .juya-entry 内衬应保持 4px 2px 18px').toBe(
      '4px 2px 18px'
    )
    // 亮侧不得出现条目内衬覆写（§9：nocturne-light 任何改动都不做）
    expect(css, '不得出现 nocturne-light 的 .juya-entry 内衬覆写').not.toMatch(
      /\[data-juya-variant='nocturne-light'\]\.jynoct \.juya-entry\s*\{/
    )
    // 也不得新增共享形态的条目内衬覆写（那会连带改亮侧）
    expect(css, '不得新增共享 .jynoct .juya-entry 的第二条覆写').not.toMatch(
      /(?:^|\n)\.jynoct \.juya-entry \{[^}]*padding:[^;}]*\b0\b/
    )
  })

  it('③ 窄窗退化保留：同一记号收到 0，既有 li 退化为零外扩', () => {
    const narrow = extractBlocks(css, /@media \(max-width: 520px\) \{/)
      .map(stripComments)
      .find((b) => b.includes('nocturne-dark') && b.includes('.juya-overview'))
    expect(narrow, '应存在含概览目录的 nocturne ≤520px 退化媒体块').toBeTruthy()
    // 退化 = 把记号本身收到 0 ⇒ 三处（内衬 / 负外边距 / 分隔线内缩）同时归零，仍「改一处不漂移」
    expect(decl(narrow!, '--jy-ov-bleed'), '窄窗须把同一记号收到 0').toBe('0px')
    // 既有退化规则（li padding 2px 0 / margin 0）保留，避免窄窗出现横向外扩贴屏边
    expect(narrow, '既有窄窗 li 退化规则应保留').toMatch(/\.juya-overview li \{[^}]*margin: 0/)
    expect(narrow, '既有窄窗 li 退化规则应保留（padding 2px 0）').toMatch(
      /\.juya-overview li \{[^}]*padding: 2px 0/
    )
  })

  it('④ 分隔线内缩方向为正、hover 底色仍由 li 盒外溢（「底色比线宽」形态）', () => {
    const token = body(ruleOf(TOKEN_RULE))
    expect(Number.parseFloat(decl(token, '--jy-ov-bleed')), '记号必须是正值（负值会反向溢出）').toBeGreaterThan(0)
    const sep = body(ruleOf(SEP_RULE))
    // 分隔线内缩不可能是负值：必须使用记号本身，而不是 calc(-1 * …)
    expect(decl(sep, 'left'), '分隔线左缘朝内').not.toContain('-1 *')
    expect(decl(sep, 'right'), '分隔线右缘朝内').not.toContain('-1 *')
    // li 仍是 hover 底色承载者（底色外溢 8px 的交互反馈保留）
    const hover = ruleOf(`${DARK} .juya-overview li:hover {`)
    expect(hover, 'hover 整行底色规则应保留').toBeTruthy()
    expect(decl(body(hover), 'background'), 'hover 底色应存在').toBeTruthy()
  })
})

describe('nocturne 排印补齐守卫（2026-10-20，#17 / SPEC 批次 B3：避孤字 / 中西文间距 / 等宽数字）', () => {
  // 需求（issue #17 / SPEC B3）：
  //   ① 导语试 `text-wrap: pretty`（可与 `balance` 对比后择一）；正文暂不启用。
  //   ② `line-break: strict` 以实测决定 —— 本票实测 156 组断行样本 + 5 视口 × 3 段落零差异，故**不启用**。
  //   ③ `text-autospace` 作用于条目标题 / 概览项 / 正文段落；**h1 不单独排除**，但须实测不变。
  //   ④ 字体栈拉丁在前、CJK 在后；日期与序号 `tabular-nums`。
  // 全部只动暗侧，选择器一律复合形态（AGENTS「变体覆盖选择器约定」：变体属性与风格类恒挂同一根元素）。
  const DARK = "[data-juya-variant='nocturne-dark'].jynoct"
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  /** 取全部形如 `<selector> { … }` 的规则块（同一选择器可能被拆成多条，例如导语区两条） */
  const blocksOf = (selector: string): string[] =>
    extractBlocks(css, new RegExp(`(?:^|\\n)${escape(selector)} \\{`)).map(stripComments)
  /** 是否存在「该选择器的某条规则里 decl(prop) === value」 */
  const hasDecl = (selector: string, prop: string, value: string): boolean =>
    blocksOf(selector).some((b) => decl(b, prop) === value)

  it('① 导语 text-wrap: pretty（暗侧专属）；正文段落不启用；全仓不得出现 balance', () => {
    expect(hasDecl(`${DARK} .juya-lead`, 'text-wrap', 'pretty'), '暗侧导语应 text-wrap: pretty').toBe(true)
    // 实测对比（脚本 scripts/nocturne-typography-probe.mjs）：pretty 把末行只有 1 字的样本全部消除（三档各 2 组 → 0），
    // 总行数不变、改动只落在末尾 4 行窗口内；balance 会重排近乎全部的段落（60 组样本里 54~57 组断行变化），
    // 是标题级短块的算法，正文导语不取。
    expect(stripComments(css), '全仓不得落 text-wrap: balance（本票实测后弃用的候选）').not.toMatch(
      /text-wrap:\s*balance/
    )
    // 正文暂不启用（票面明写）：段落选择器上不得出现 text-wrap 声明
    expect(stripComments(css), '正文段落不得启用 text-wrap（票面：正文暂不启用）').not.toMatch(
      /\.juya-entry p[^{]*\{[^}]*text-wrap/
    )
  })

  it('② text-autospace 落在阅读页文本根 .juya-issue：一处作用域覆盖三类目标，且不单独排除 h1', () => {
    expect(hasDecl(`${DARK} .juya-issue`, 'text-autospace', 'normal'), '暗侧阅读页文本根应启用自动中西文间距').toBe(true)
    const rule = blocksOf(`${DARK} .juya-issue`).find((b) => b.includes('text-autospace'))
    expect(rule, 'text-autospace 规则块应存在').toBeTruthy()
    // 「h1 不得单独排除」：作用域内不得出现任何 :not(…) 排除形态
    expect(rule!, '不得用 :not(…) 把刊头/h1 排除在自动间距之外').not.toContain(':not(')
    // 也不得反向把 h1 的自动间距关掉
    expect(stripComments(css), '不得出现把 text-autospace 关掉的声明').not.toMatch(
      /text-autospace:\s*no-autospace/
    )
    // 三类目标都在 .juya-issue 子树内（结构断言，防模板改名后静默失效）：
    // 刊头与条目标题由 nocturne.tsx 直接渲染，概览项走共享原子层 OverviewItems（.juya-overview 在 shared.tsx）
    const nocturneTsx = readFileSync(join(process.cwd(), 'src/renderer/juya/templates/nocturne.tsx'), 'utf-8')
    const sharedTsx = readFileSync(join(process.cwd(), 'src/renderer/juya/templates/shared.tsx'), 'utf-8')
    for (const anchor of ['juya-masthead', 'juya-issue', 'OverviewItems', 'NocturneEntrySplit']) {
      expect(nocturneTsx, `模板应仍在阅读页内渲染 ${anchor}`).toContain(anchor)
    }
    expect(sharedTsx, '概览项类名应仍由共享原子层渲染').toContain('juya-overview')
  })

  it('③ 字体栈拉丁在前、CJK 在后（避免拉丁字符回退到 CJK 字体）', () => {
    const block = stripComments(variantBlock('nocturne-dark'))
    const heading = decl(block, '--jy-font-heading')
    const body = decl(block, '--jy-font-body')
    // 精确形态：拉丁族（Segoe UI）必须排在两个 CJK 族之前；DengXian 仍是标题的 CJK 首选（#3 的风格身份）
    expect(heading, '--jy-font-heading 应为「拉丁在前 + 等线 CJK」').toBe(
      "'Segoe UI', 'DengXian', 'Noto Sans SC', sans-serif"
    )
    expect(body, '--jy-font-body 应为「拉丁在前 + Noto Sans SC」').toBe(
      "'Segoe UI', 'Noto Sans SC', sans-serif"
    )
    for (const [name, stack] of [
      ['--jy-font-heading', heading],
      ['--jy-font-body', body]
    ] as const) {
      expect(stack.indexOf('Segoe UI'), `${name} 的拉丁族应排在 CJK 族之前`).toBeLessThan(
        stack.indexOf("'Noto Sans SC'")
      )
      expect(stack, `${name} 仍须以通用族 sans-serif 收尾（零衬线）`).toMatch(/sans-serif$/)
    }
    expect(heading.indexOf('Segoe UI'), '标题栈拉丁族应排在 DengXian 之前').toBeLessThan(
      heading.indexOf('DengXian')
    )
    // 等宽三档（元信息 / 序号 / 题注）本来就是拉丁在前：JetBrains Mono > … > Noto Sans SC
    for (const sel of ['\\.juya-feed-meta', '\\.juya-index', '\\.juya-plate figcaption']) {
      const mono = decl(noctRule(sel), 'font-family')
      expect(mono, `${sel} 等宽栈应保持 JetBrains Mono 首选`).toContain("'JetBrains Mono'")
      expect(mono.indexOf('JetBrains Mono'), `${sel} 拉丁等宽族应排在 Noto Sans SC 之前`).toBeLessThan(
        mono.indexOf('Noto Sans SC')
      )
    }
  })

  it('④ 日期与序号等宽数字：订阅页日期 / 序号徽章 / 刊头日期行均声明 tabular-nums', () => {
    // 订阅页日期（.juya-feed-meta）与序号（.juya-index，概览序号与条目 #N 徽章共用同一个类）
    expect(decl(noctRule('\\.juya-feed-meta'), 'font-variant-numeric'), '订阅页日期应等宽数字').toBe(
      'tabular-nums'
    )
    expect(decl(noctRule('\\.juya-index'), 'font-variant-numeric'), '序号应等宽数字').toBe('tabular-nums')
    // 阅读页日期承载在刊头 h1（形如「AI 早报 2026-10-12」），暗侧补声明；
    // 实测三档字体（DengXian / Segoe UI / Noto Sans SC）默认数字即等宽 ⇒ 该声明是**零像素变化**的意图锁死
    expect(
      hasDecl(`${DARK} .juya-masthead h1`, 'font-variant-numeric', 'tabular-nums'),
      '暗侧刊头日期应声明 tabular-nums'
    ).toBe(true)
  })

  it('⑤ line-break: strict 不启用（实测决定，2026-10-20）', () => {
    // 实测口径：Chromium 150 目标内核支持该值（探针 CSS.supports = true），但
    // 5 档视口（560/700/900/1280/1920）× 3 段含「」（）【】；：、——% 的简体中文，
    // 加不加 strict 的**每行字数与断点完全相同**；再把样本按长度切片扫 156 组，差异仍为 0 组。
    // 结论：默认标点禁则已覆盖简体中文，加规则只增加内核分支与误伤风险 ⇒ 不落声明。
    expect(stripComments(noctSection()), 'nocturne 段不得出现 line-break 声明').not.toMatch(/line-break:/)
  })

  it('⑥ 范围未越界：三条新声明均不出现在 nocturne-light（本轮仅暗侧）', () => {
    const light = stripComments(css)
    expect(light, '不得给 nocturne-light 加 text-wrap / text-autospace').not.toMatch(
      /\[data-juya-variant='nocturne-light'\][^{]*\{[^}]*text-(wrap|autospace)/
    )
    expect(light, '不得给 nocturne-light 加 line-break').not.toMatch(
      /\[data-juya-variant='nocturne-light'\][^{]*\{[^}]*line-break/
    )
  })
})

/**
 * #20 / SPEC 批次 B5（2026-10-20）：星尘破除点阵 + 概览焦点环。
 * 断言面全部取自**剥注释后的代码视图**（注释里复述选择器/尺寸会污染结构抠取）：
 *  · 暗侧 dust 只覆写 background-size（共享预设 44/132 与 keyframe 一字节不改）；
 *  · 六层尺寸互不相同，任意两层之比距最近整数 ≥ 0.1（票面判据，脚本搜索所得值）；
 *  · 焦点环写完整 outline 简写（只写 outline-color 在 Chromium 下不生效），取 --jy-focus；
 *  · 行高亮用 `li:has(a:focus-visible)` 且与 hover 同底色，全文件禁用 `:focus-within`；
 *  · 概览容器/行/issue 均无 overflow 裁剪，分隔线 ::after 的负 top 与焦点行底色分层正确。
 */
describe('nocturne 星尘破除点阵与概览焦点环守卫（2026-10-20，#20 / SPEC 批次 B5）', () => {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const sel = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ruleOf = (selector: string): string =>
    extractBlock(code, new RegExp(`${sel(selector)}\\s*\\{`))
  const DUST_OVERRIDE =
    "[data-juya-variant='nocturne-dark'].jynoct .juya-scene-dust"
  const FOCUS_LINK =
    "[data-juya-variant='nocturne-dark'].jynoct .juya-overview a:focus-visible"
  const FOCUS_ROW =
    "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li:has(a:focus-visible)"
  const HOVER_ROW =
    "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li:hover"
  const SEP_ROW =
    "[data-juya-variant='nocturne-dark'].jynoct .juya-overview li + li::after"
  const bodyOf = (rule: string): string => rule.match(/\{([^}]*)\}/)?.[1] ?? ''
  const propsOf = (rule: string): string[] =>
    bodyOf(rule)
      .split(';')
      .map((d) => d.split(':')[0]?.trim())
      .filter((p): p is string => Boolean(p))
  const sizesOf = (rule: string): Array<[number, number]> =>
    (decl(bodyOf(rule), 'background-size') ?? '')
      .split(',')
      .map((s) => s.trim().split(/\s+/).map((v) => Number.parseFloat(v)) as [number, number])

  it('① 暗侧 dust 只覆写 background-size：共享预设 44/132 与 96s alternate 一字节不改', () => {
    const shared = extractBlock(css, /(?:^|\n)\.juya-scene-dust \{/)
    expect(shared, '共享 dust 预设应存在').toBeTruthy()
    // 共享层是 y2k / synthwave 也在用的预置：本票**不得**改它（隔离验证由归档逐字节比对兜底）
    expect(decl(shared, 'background-size'), '共享 dust 尺寸必须保持 3×44 + 3×132').toBe(
      '44px 44px, 44px 44px, 44px 44px, 132px 132px, 132px 132px, 132px 132px'
    )
    expect(decl(shared, 'animation'), '共享 dust 的 96s 往复动画不改').toContain(
      '96s ease-in-out infinite alternate'
    )

    const override = ruleOf(DUST_OVERRIDE)
    expect(override, '暗侧 dust 覆写规则应存在').toBeTruthy()
    expect(override.split('{')[0].trim(), '必须写复合形态（变体属性与 .jynoct 同根、无空格）').toBe(
      DUST_OVERRIDE
    )
    // 只允许一条声明（背景尺寸）；点色 token / 动画 / 透明度一律不得在这里覆写
    expect(propsOf(override), '暗侧 dust 覆写只允许 background-size').toEqual(['background-size'])
    expect(override, '不得覆写尘埃点色 token（沿用共享层中性白）').not.toContain('--jy-scene-dust')
    expect(override, '不得自带 animation/transition（RM 复位继续由共享层承担）').not.toMatch(
      /\b(?:animation|transition)\b/
    )
  })

  it('② 六层尺寸互不相同且两两之比距最近整数 ≥ 0.1（脚本搜索所得值，非随手填）', () => {
    const sizes = sizesOf(ruleOf(DUST_OVERRIDE))
    expect(sizes, '六层各一个 background-size').toHaveLength(6)
    const values = sizes.map(([w, h]) => {
      expect(w, '平铺单元应为正方形（与共享层一致）').toBe(h)
      return w
    })
    expect(new Set(values).size, '每层必须各用不同尺寸（同尺寸只是同格点的偏移拷贝）').toBe(6)
    // 搜索空间：小尺寸 [38,60] × 大尺寸 [100,200]，3+3 组合共 295,137,150 组；
    // 满足判据且 1280×800 点数 ∈ [1000,2500] 的解 2,546,089 组；取「最小两两余量」最大者
    // （0.2241，判据门槛 0.1 的两倍以上），再按点数最接近共享原值 1764 定值。
    expect([...values].sort((a, b) => a - b), '锁定脚本搜索结果（防随手改）').toEqual([
      38, 47, 58, 129, 161, 199
    ])
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const ratio = Math.max(values[i], values[j]) / Math.min(values[i], values[j])
        expect(
          Math.abs(ratio - Math.round(ratio)),
          `${Math.max(values[i], values[j])}/${Math.min(values[i], values[j])} = ${ratio.toFixed(4)} 距最近整数`
        ).toBeGreaterThanOrEqual(0.1)
      }
    }
    // 点数密度与共享层同量级（不因破除周期变密/变稀）
    const points = sizes.reduce((sum, [w, h]) => sum + (1280 / w) * (800 / h), 0)
    expect(points, '1280×800 下尘埃点数仍为一两千点量级').toBeGreaterThanOrEqual(1000)
    expect(points, '不得堆到万点量级').toBeLessThanOrEqual(2500)

    // keyframe 不改：alternate 往复 ⇒ 无接缝问题，终点位移不必是 size 整数倍
    const kf = extractBlock(css, /@keyframes jy-dust-drift \{/)
    expect(kf, '漂移关键帧应存在').toContain(
      'background-position: 44px -88px, -22px 44px, 33px 22px, 132px -66px, -66px 132px, 44px 44px'
    )
  })

  it('③ 焦点环是完整声明（2px solid var(--jy-focus)）：只写 outline-color 在 Chromium 下不生效', () => {
    const rule = ruleOf(FOCUS_LINK)
    expect(rule, '概览链接焦点环规则应存在').toBeTruthy()
    expect(rule.split('{')[0].trim(), '必须写暗侧复合形态').toBe(FOCUS_LINK)
    // Chromium UA 的 auto focus 圈忽略作者 outline-color ⇒ 必须写含样式的简写
    expect(decl(bodyOf(rule), 'outline'), '完整 outline 简写（宽度 + 样式 + 取色）').toBe(
      '2px solid var(--jy-focus)'
    )
    expect(decl(bodyOf(rule), 'outline-offset'), '与底座留 2px 间隙，不压字').toBe('2px')
    expect(bodyOf(rule), '不得退化成 outline: auto / none').not.toMatch(
      /outline\s*:\s*(?:auto|none)\b/
    )
    expect(bodyOf(rule), '不得只改 outline-color（UA auto 圈不读它）').not.toMatch(/outline-color/)
    // 反证：亮侧不新增同名焦点环规则（本轮只动暗侧）
    expect(code).not.toContain("[data-juya-variant='nocturne-light'].jynoct .juya-overview a:focus-visible")
  })

  it('④ 行高亮用 li:has(a:focus-visible)，与 hover 同底色；全文件严禁 :focus-within', () => {
    const row = ruleOf(FOCUS_ROW)
    const hover = ruleOf(HOVER_ROW)
    expect(row, '焦点行高亮规则应存在').toBeTruthy()
    expect(hover, '既有 hover 行高亮规则应存在').toBeTruthy()
    expect(decl(bodyOf(row), 'background'), '焦点态与 hover 必须同底色').toBe(
      decl(bodyOf(hover), 'background')
    )
    expect(row.split('{')[0]).not.toContain(':focus-within')
    expect(code, ':focus-within 会被鼠标点击触发，全文件禁用').not.toContain(':focus-within')
    // 概览区所有 focus 相关选择器都必须用 :focus-visible（而不是 :focus）
    const focusHeads = [...code.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((h) => h.includes('.juya-overview') && h.includes(':focus'))
    expect(focusHeads.length, '概览区应恰有两条焦点规则').toBe(2)
    for (const h of focusHeads) expect(h, `焦点规则必须用 :focus-visible：${h}`).toContain(':focus-visible')
  })

  it('⑤ 焦点环不被裁切：概览容器/行/issue 无 overflow；分隔线 ::after 与焦点行底色分层正确', () => {
    const rules = [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, s, b]) => ({
      sel: s.trim(),
      body: b
    }))
    const clippers = rules.filter(
      (r) =>
        /\.juya-overview\b|\.juya-issue\b/.test(r.sel) &&
        /(?:^|[;\s])overflow(?:-[xy])?\s*:/.test(r.body)
    )
    expect(clippers.map((r) => r.sel), '概览列表/行/issue 不得有 overflow 裁剪（会切掉 2px+2px 焦点环）').toEqual([])

    const sep = ruleOf(SEP_ROW)
    expect(sep, '既有条目间发丝线规则应保留').toBeTruthy()
    expect(decl(bodyOf(sep), 'top'), '发丝线落在 6px 间隙中点（行盒之外）').toBe('-3.5px')
    expect(decl(bodyOf(sep), 'left'), '线与内容栏同界（#16 记号）').toBe('var(--jy-ov-bleed)')
    expect(decl(bodyOf(sep), 'background'), '线色不改').toBe('rgba(255, 255, 255, 0.05)')
    // 叠层：焦点行底色画在 li 的 background 层，发丝线是 li 的 ::after（更上层），
    // 且 top 为负 ⇒ 线在行盒之外，不会被行底色覆盖；焦点规则不得另画/隐藏分隔线。
    expect(ruleOf(FOCUS_ROW), '焦点行规则不得触碰分隔线伪元素').not.toContain('::after')
    expect(ruleOf(FOCUS_ROW), '焦点行规则不得改用 outline 之外的元素做环').not.toContain('outline')
  })
})

describe('nocturne 不可见暂停动画守卫（2026-10-20，#22 / SPEC 批次 B6）', () => {
  // 剥注释后的 CSS 代码（注释里引用选择器形态/属性名不算实现）
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const HIDDEN = `[${APP_HIDDEN_ATTR}]`
  const DARK = "[data-juya-variant='nocturne-dark'].jynoct"

  /** 本变体全部动画承载者（含伪元素）—— 逐一列举；新增动画必须同步加入本清单。
   *  · `.juya-scene-dust`：Scene 的 dust 预设（96s 尘埃漂移）；
   *  · `.juya-masthead h1`：刊头呼吸（9s）；
   *  · `.juya-masthead::before` / `::after`：极光幕帘两层（24s / 31s，伪元素必须单独选中）；
   *  · `.juya-feed-item`：订阅页入场（220ms，共享规则但本变体订阅页同样命中）；
   *  · `.jynoct-lightbox img`：放大视图入场（160ms，dialog portal 到 body，变体标记挂 dialog 自身）。 */
  const CARRIERS = [
    `${DARK} .juya-scene-dust`,
    `${DARK} .juya-masthead h1`,
    `${DARK} .juya-masthead::before`,
    `${DARK} .juya-masthead::after`,
    `${DARK} .juya-feed-item`,
    "[data-juya-variant='nocturne-dark'].jynoct-lightbox img"
  ]

  /** 非 nocturne 场景层（太阳/透视网格/星空只有 synthwave 与 y2k 暗挂载，本变体模板不渲染）。
   *  透视网格自 #36 起用双类选择器（.juya-scene-grid.juya-scene-grid-persp）压过地平网格规则；
   *  #44 起网格动画挂在纹理层伪元素上，载体是 `…-persp::after`。 */
  const FOREIGN_SCENE = [
    '.juya-scene-sun',
    '.juya-scene-grid.juya-scene-grid-persp',
    '.juya-scene-grid.juya-scene-grid-persp::after',
    '.juya-scene-stars'
  ]

  /** 全 css 的叶规则（花括号内的声明块；媒体查询/@keyframes 外壳天然不匹配） */
  const rules = [...cssCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, s, b]) => ({
    sels: s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    body: b
  }))
  const pauseRules = rules.filter((r) =>
    /(?:^|[;\s])animation-play-state\s*:\s*paused/.test(r.body)
  )
  const pausedSels = pauseRules.flatMap((r) => r.sels)

  it('① 暂停规则逐一选中全部动画载体（含 ::before / ::after），且只声明 animation-play-state', () => {
    // 2026-10-22（#36）：synthwave 也进入暂停清单，全文件不再只有一条暂停规则块；
    // 本组只校验 nocturne 暗侧那一条，逐块声明与选择器集合仍完整覆盖其载体。
    const noctPauseRules = pauseRules.filter((r) =>
      r.sels.every((s) => s.includes("data-juya-variant='nocturne-dark'"))
    )
    expect(noctPauseRules.length, 'nocturne 暗侧应恰有一条不可见暂停规则块').toBe(1)
    const declarations = noctPauseRules[0]!.body
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
    expect(declarations, '暂停态只能改动画播放状态，不得夹带 opacity/filter/animation 等可见属性').toEqual([
      'animation-play-state: paused'
    ])
    expect([...noctPauseRules[0]!.sels].sort(), '暂停选择器集合须与载体清单逐一对应').toEqual(
      CARRIERS.map((c) => `${HIDDEN} ${c}`).sort()
    )
  })

  it('② 完整性：本变体可出现的每一条 animation 声明都被暂停规则覆盖（漏一个即红，并报出漏项）', () => {
    const animationRules = rules.filter((r) => /(?:^|[;\s])animation\s*:/.test(r.body))
    const pausedSet = new Set(pausedSels)
    const covered = (sel: string): boolean => {
      if (FOREIGN_SCENE.some((f) => sel === f || sel.endsWith(` ${f}`))) return true
      if (sel.includes("data-juya-variant='nocturne-light'")) return false
      // 暗侧复合形态直接用；共享类名（.juya-scene-dust / .juya-feed-item）必须挂上暗侧作用域
      const scoped = sel.includes("data-juya-variant='nocturne-dark'") ? sel : `${DARK} ${sel}`
      return pausedSet.has(`${HIDDEN} ${scoped}`)
    }
    const uncovered = animationRules.flatMap((r) => r.sels).filter((s) => !covered(s))
    expect(uncovered, '动画载体必须逐一暂停（animation-play-state 不继承）——上面列出漏项').toEqual(
      []
    )
    // 扫描面非空：dust + 呼吸 + 两条极光 + 订阅页入场 + 放大视图入场
    expect(animationRules.length, 'animation 声明扫描面非空').toBeGreaterThanOrEqual(5)
  })

  it('③ 状态标记挂 documentElement，不挂内容根容器（.juya-root 的结构不变量）', () => {
    const hook = readFileSync(join(process.cwd(), 'src/renderer/visibilityPause.ts'), 'utf-8')
    const hookCode = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(hookCode, '只在文档根元素上置/清标记').toContain('document.documentElement')
    expect(hookCode, '属性名必须与守卫同源').toContain(`APP_HIDDEN_ATTR = '${APP_HIDDEN_ATTR}'`)
    expect(hookCode, '必须监听 visibilitychange').toContain('visibilitychange')
    expect(hookCode, '只做 document.hidden 判据').toContain('document.hidden')
    expect(hookCode, '不得把标记挂到内容根容器（.juya-root）上').not.toContain('.juya-root')
    expect(noctSection(), '暂停规则必须落在 nocturne 段内（不改共享层）').toContain(HIDDEN)
    for (const s of pausedSels) {
      expect(s, '暂停选择器不得命中内容根容器本身').not.toContain('.juya-root')
      expect(s, '只做暗侧；nocturne-light 本轮范围外（§9）').not.toContain('nocturne-light')
    }
  })

  it('④ 项目文档写明「不做动画 filter→opacity 重构」及其理由', () => {
    // 2026-10-21 /retro 后：施工历史下沉到 docs/STYLE-WORKLOG.md，AGENTS.md 只留导航指针。
    // 故断言改为「两份文档合起来必须有」，而不是钉死在哪一个文件里 —— 否则每次重组文档都会误报。
    const agents = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf-8')
    const worklog = readFileSync(join(process.cwd(), 'docs/STYLE-WORKLOG.md'), 'utf-8')
    const docs = `${agents}\n${worklog}`
    expect(docs, '项目文档须记录本次不做该重构').toContain('`filter`→`opacity` 重构')
    expect(docs, '须写明理由：无实测数据').toContain('无实测数据')
  })
})

describe('newsprint90s 旧纸面守卫（#27：纸纹最不利行 AA，链接墨色）', () => {
  // 实测（本文件实算，纹理全叠的保守上界）：亮 muted 纸 5.09 / 卡片 5.79 / 导语 4.55；
  // 暗 5.65 / 5.66 / 4.98。先前提交信息里写的 5.02/4.52、5.86/5.13 是初版写错的数字，以此处为准。
  // 本票已确认的取值集合（grilling 结论，SPEC 2026-10-21 §「字体与颜色」）。
  // 断言取值而非规则文本：改色必须同步改这里，避免纸面被静默改回纯色。
  const EXPECTED = {
    'newsprint90s-light': {
      bg: 0xece2c6,
      card: 0xf0e7cf,
      text: 0x33301f,
      heading: 0x211d14,
      muted: 0x5f5747,
      link: 0x2b2620,
      accent: 0x8b1a1a,
      leadAlpha: 0.07
    },
    'newsprint90s-dark': {
      bg: 0x1e1913,
      card: 0x262019,
      text: 0xd6cbb2,
      heading: 0xefe6cf,
      muted: 0xa2997b,
      link: 0x9fb4e8,
      accent: 0xd05555,
      leadAlpha: 0.12
    }
  } as const

  /** 变体块背景层里的全部 rgba() 纹理层（纤维噪点 / 暗角 / 3px 横纹） */
  const textureLayers = (block: string): { rgb: number; alpha: number }[] =>
    [...decl(block, 'background-image').matchAll(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g)].map(
      (m) => ({
        rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
        alpha: Number(m[4])
      })
    )

  /** 「最不利纸纹行」：所有纹理层叠到纸底色上（各层可同处一行，取上界；比单层更保守）。
   *  WCAG 不定义半透明色，故先按 source-over 合成再算对比度。 */
  const worstPaper = (variant: keyof typeof EXPECTED): number => {
    const block = variantBlock(variant)
    return textureLayers(block).reduce(
      (surface, layer) => alphaOver(layer.rgb, layer.alpha, surface),
      EXPECTED[variant].bg
    )
  }

  it('rgba 纹理层解析 helper 自身可用（颜色 + alpha 逐个还原）', () => {
    const layers = textureLayers(
      "[data-juya-variant='x'] { background-image: repeating-linear-gradient(0deg, rgba(120, 100, 60, 0.035) 0 1px, transparent 1px 3px); }"
    )
    expect(layers).toEqual([{ rgb: 0x78643c, alpha: 0.035 }])
  })

  it('纸色 / 卡片 / 正文 / 标题 / 次要文字 / 链接 / accent 均取本轮决定的集合', () => {
    for (const [variant, want] of Object.entries(EXPECTED)) {
      const block = variantBlock(variant)
      expect(tokenHex(block, '--jy-bg'), `${variant} --jy-bg`).toBe(want.bg)
      expect(tokenHex(block, '--jy-card'), `${variant} --jy-card`).toBe(want.card)
      expect(tokenHex(block, '--jy-text'), `${variant} --jy-text`).toBe(want.text)
      expect(tokenHex(block, '--jy-heading'), `${variant} --jy-heading`).toBe(want.heading)
      expect(tokenHex(block, '--jy-muted'), `${variant} --jy-muted`).toBe(want.muted)
      expect(tokenHex(block, '--jy-link'), `${variant} --jy-link`).toBe(want.link)
      expect(tokenHex(block, '--jy-accent'), `${variant} --jy-accent`).toBe(want.accent)
    }
  })

  it('链接为墨色而非 Web 蓝（亮侧 #1a3c8b 已退役）', () => {
    const light = variantBlock('newsprint90s-light')
    expect(tokenHex(light, '--jy-link'), '亮侧链接应改墨色').toBe(0x2b2620)
    expect(light, '旧 Web 蓝 #1a3c8b 不应残留').not.toContain('#1a3c8b')
    // 墨色：R>G>B 且彩度（max-min）≤ 0x20，排除任何高饱和蓝
    const link = tokenHex(light, '--jy-link')
    const [r, g, b] = [(link >> 16) & 0xff, (link >> 8) & 0xff, link & 0xff]
    expect(Math.max(r, g, b) - Math.min(r, g, b), '墨色彩度应很低').toBeLessThanOrEqual(0x20)
    expect(tokenHex(variantBlock('newsprint90s-dark'), '--jy-link'), '暗侧灯下链接').toBe(0x9fb4e8)
  })

  it('次要文字对纸纹最不利行 / 卡片 / 导语底均 ≥ 4.5（两变体）', () => {
    for (const [variant, want] of Object.entries(EXPECTED)) {
      const block = variantBlock(variant)
      const paper = worstPaper(variant as keyof typeof EXPECTED)
      const leadSurface = alphaOver(want.accent, want.leadAlpha, paper)
      expect(contrast(want.muted, paper), `${variant} muted/纸纹最不利行`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(want.muted, want.card), `${variant} muted/卡片`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(want.muted, leadSurface), `${variant} muted/导语底`).toBeGreaterThanOrEqual(4.5)
      // 正文与标题不得低于次要文字（层级不倒挂）
      expect(contrast(want.text, paper), `${variant} text/纸纹`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(want.heading, paper), `${variant} heading/纸纹`).toBeGreaterThanOrEqual(4.5)
      // 导语底必须是 accent 的同色相半透明层，而不是另一种灰
      const lead = decl(block, '--jy-lead-bg')
      expect(lead, `${variant} --jy-lead-bg 应为 accent 色相`).toContain(
        `rgba(${(want.accent >> 16) & 0xff}, ${(want.accent >> 8) & 0xff}, ${want.accent & 0xff}, ${want.leadAlpha})`
      )
    }
  })

  it('订阅页 hover 面（#32）：中性微层叠加纸纹后 muted / 正文 / 标题仍 ≥4.5', () => {
    for (const [variant, want] of Object.entries(EXPECTED)) {
      const block = variantBlock(variant)
      const hover = decl(block, '--jy-feed-hover')
      const m = hover.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/)
      expect(m, `${variant} --jy-feed-hover 应为 rgba 中性层`).not.toBeNull()
      const fg = (Number(m![1]) << 16) | (Number(m![2]) << 8) | Number(m![3])
      // 中性：低彩度（不是 accent 色相），避免 hover 微亮带红
      const channels = [(fg >> 16) & 0xff, (fg >> 8) & 0xff, fg & 0xff]
      expect(Math.max(...channels) - Math.min(...channels), `${variant} hover 微层应为中性`).toBeLessThanOrEqual(
        0x20
      )
      const surface = alphaOver(fg, Number(m![4]), worstPaper(variant as keyof typeof EXPECTED))
      expect(contrast(want.muted, surface), `${variant} muted/订阅页 hover 面`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(want.text, surface), `${variant} text/订阅页 hover 面`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(want.heading, surface), `${variant} heading/订阅页 hover 面`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('纸纹只存在于背景层：3px 横纹 + 纤维噪点 + 暗角，零 filter、零动画', () => {
    for (const variant of Object.keys(EXPECTED)) {
      const block = variantBlock(variant)
      const image = decl(block, 'background-image')
      expect(image, `${variant} 须保留 3px 横纹`).toMatch(/repeating-linear-gradient\(\s*0deg/)
      expect(image, `${variant} 横纹仍为 3px 周期`).toContain('transparent 3px')
      expect(image, `${variant} 须叠加纤维噪点/暗角（radial-gradient）`).toContain('radial-gradient')
      expect(textureLayers(block).length, `${variant} 纹理层数 ≥ 3`).toBeGreaterThanOrEqual(3)
      expect(block, `${variant} 不得用 filter 作用于文字`).not.toContain('filter:')
      expect(block, `${variant} 不新增动画`).not.toMatch(/animation|@keyframes/)
    }
  })

  it('滚动条字面 thumb 色注释按新纸色更新（亮 7.19 / 暗 4.25，均 ≥3）', () => {
    // 用 indexOf 切片取规则块：选择器含 `::`/`-` 与 `:has()`，正则转义易错且无收益
    const thumb = (variant: string): string => {
      const at = css.indexOf(`[data-juya-variant='${variant}'])::-webkit-scrollbar-thumb`)
      return at < 0 ? '' : css.slice(at, css.indexOf('}', at) + 1)
    }
    expect(thumb('newsprint90s-light'), '亮侧注释须引用新纸色').toContain('#ece2c6')
    expect(thumb('newsprint90s-light'), '亮侧旧纸色注释应退役').not.toContain('#f2ecd9')
    expect(thumb('newsprint90s-dark'), '暗侧注释须引用新纸色').toContain('#1e1913')
    expect(thumb('newsprint90s-dark'), '暗侧旧纸色注释应退役').not.toContain('#221f19')
    // 字面色本身不变，仍对纯纸底 ≥3（非文本件）
    expect(contrast(0x8b1a1a, 0xece2c6), '亮 thumb/纸').toBeGreaterThanOrEqual(3)
    expect(contrast(0xd05555, 0x1e1913), '暗 thumb/纸').toBeGreaterThanOrEqual(3)
  })
})

describe('newsprint90s 条目版式守卫（#28：字体栈 / 方角徽章 / 2em 缩进 / 资料条）', () => {
  // 只锁 #28 票面的印刷记号：字体栈顺序、方角徽章、2em 首行缩进与收紧段距、
  // 导语上下细线、相关链接上沿细线 + 常驻下划线、1px 栏线。不锁规则文本之外的实现细节。
  const newsSection = (): string =>
    css.slice(css.indexOf('90 年代报刊式'), css.indexOf('蒸汽梦核式'))
  /** 首条形如 `.jynews <rest> { … }` 的规则块（行首锚定，同 y2kRule） */
  const newsRule = (rest: string): string =>
    css.match(new RegExp(`(?:^|\\n)\\.jynews ${rest} \\{[^}]*\\}`))?.[0] ?? ''

  it('字体 token：正文宋体优先（SimSun），标题黑体优先（SimHei），刊头楷体优先（KaiTi）', () => {
    for (const variant of ['newsprint90s-light', 'newsprint90s-dark']) {
      const block = variantBlock(variant)
      expect(decl(block, '--jy-font-body'), `${variant} 正文宋体优先`).toContain('SimSun')
      expect(decl(block, '--jy-font-heading'), `${variant} 标题黑体优先`).toContain('SimHei')
      expect(decl(block, '--jy-font-masthead'), `${variant} 刊头楷体优先`).toContain('KaiTi')
    }
    // 关键规则消费 token，而不是各自复制字面字体栈（#32 收敛）
    expect(decl(newsRule('\\.juya-masthead'), 'font-family'), '刊头应使用刊头字体 token').toBe(
      'var(--jy-font-masthead)'
    )
    expect(decl(newsRule('\\.juya-masthead h1'), 'font-family'), '期号标题应使用刊头字体 token').toBe(
      'var(--jy-font-masthead)'
    )
    for (const [rest, label] of [
      ['\\.juya-section > h2', '栏目条'],
      ['\\.juya-links-label', '相关链接小标'],
      ['\\.juya-feed-grid \\.juya-feed-title', '订阅页网格标题'],
      ['\\.juya-feed-featured \\.juya-feed-title', '订阅页首条标题']
    ] as const) {
      expect(decl(newsRule(rest), 'font-family'), `${label}应使用标题字体 token`).toBe(
        'var(--jy-font-heading)'
      )
    }
  })

  it('序号徽章方角：标题色底、纸色字，且 newsprint 段不再出现 999px 胶囊', () => {
    const badge = newsRule('\\.juya-index')
    expect(badge, '徽章规则应存在（概览与条目标题共用 .juya-index）').toBeTruthy()
    expect(decl(badge, 'border-radius'), '徽章必须方角').toBe('0')
    expect(decl(badge, 'background'), '徽章底改为标题色').toBe('var(--jy-heading)')
    expect(decl(badge, 'color'), '徽章字改为纸色').toBe('var(--jy-bg)')
    expect(newsSection(), '段内不得残留 999px 胶囊').not.toContain('999px')
  })

  it('正文 2em 首行缩进、段距收紧（不靠空行），且保留两端对齐', () => {
    const para = newsRule('\\.juya-entry p:not\\(\\.juya-links-label\\)')
    expect(para, '正文段落规则应存在').toBeTruthy()
    expect(decl(para, 'text-indent'), '首行缩进 2em').toBe('2em')
    expect(decl(para, 'margin'), '段距应比基类 10px 收紧').toBe('0 0 6px')
    expect(decl(para, 'text-align'), '正文仍两端对齐').toBe('justify')
  })

  it('导语保留上下 1px 细线与浅底、文字走 --jy-muted', () => {
    const lead = newsRule('\\.juya-lead')
    expect(decl(lead, 'border-top')).toBe('1px solid var(--jy-border)')
    expect(decl(lead, 'border-bottom')).toBe('1px solid var(--jy-border)')
    expect(decl(lead, 'background')).toBe('var(--jy-lead-bg)')
    expect(decl(lead, 'color'), '导语文字用次要文字色').toBe('var(--jy-muted)')
  })

  it('相关链接：上沿 1px 细线 + 小标 + 墨色常驻下划线', () => {
    const label = newsRule('\\.juya-links-label')
    expect(label, '相关链接小标规则应存在').toBeTruthy()
    expect(decl(label, 'border-top'), '资料条上沿细线').toBe('1px solid var(--jy-border)')
    const link = newsRule('\\.juya-links a')
    expect(decl(link, 'color'), '链接走墨色 token').toBe('var(--jy-link)')
    expect(decl(link, 'text-decoration'), '相关链接常驻下划线').toContain('underline')
  })

  it('1px 栏线保持（双栏与条目分隔）', () => {
    const columns = css.match(/\.jynews \.juya-entry-columns \{[^}]*\}/)?.[0] ?? ''
    expect(decl(columns, 'column-rule'), '双栏 1px 栏线不回退').toBe('1px solid var(--jy-border)')
    const entry = newsRule('\\.juya-entry')
    expect(decl(entry, 'border-bottom'), '条目分隔线仍为 1px').toBe('1px solid var(--jy-border)')
  })
})

describe('newsprint90s 框线导读守卫（#29：概览上下框线 / 单列 / 不新增色值）', () => {
  // 只锁 #29 的样式面：概览块上下 1px 框线、单列（沿用基类 flex column），且框线与字色
  // 全部走现有 token（本段不得出现字面颜色）。「导读」真实 DOM 由 reader E2E 覆盖
  // （#32 删除了读模板源码 + 正则锁 JSX 的脆弱守卫）。
  const newsSection = (): string =>
    css.slice(css.indexOf('90 年代报刊式'), css.indexOf('蒸汽梦核式'))
  /** 行首锚定的 `.jynews-overview… { … }` 规则块 */
  const overviewRule = (rest: string): string =>
    css.match(new RegExp(`(?:^|\n)\\.jynews-overview${rest} \\{[^}]*\\}`))?.[0] ?? ''

  it('概览块上下各 1px 框线，颜色走 --jy-border token', () => {
    const box = overviewRule('')
    expect(box, '概览框线块规则应存在').toBeTruthy()
    expect(decl(box, 'border-top'), '上框线').toBe('1px solid var(--jy-border)')
    expect(decl(box, 'border-bottom'), '下框线').toBe('1px solid var(--jy-border)')
  })

  it('「导读」小标与栏目条同字体（标题 token），并为真实块级元素', () => {
    const label = overviewRule('-label')
    expect(label, '导读小标规则应存在').toBeTruthy()
    expect(decl(label, 'font-family')).toBe('var(--jy-font-heading)')
    expect(decl(label, 'display'), '小标需自成一行且可被定位').toBe('inline-block')
  })

  it('概览保持单列：基类 flex column 不变，newsprint 段不改成多列/网格', () => {
    const base = css.match(/(?:^|\n)\.juya-overview \{[^}]*\}/)?.[0] ?? ''
    expect(decl(base, 'display')).toBe('flex')
    expect(decl(base, 'flex-direction')).toBe('column')
    const code = newsSection().replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code, 'newsprint 段不得把概览改成多列或网格').not.toMatch(
      /\.jynews-overview[^{]*\{[^}]*(?:column-count|grid-template-columns)/
    )
  })

  it('「导读」不得由伪元素生成，且概览框线/小标不新增字面颜色', () => {
    const code = newsSection().replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code, '不得用 ::before/::after 生成导读小标').not.toMatch(
      /\.jynews-overview(?:-label)?::(?:before|after)/
    )
    expect(code, '不得用 content 写死「导读」').not.toMatch(/content:\s*['"]导读['"]/)
    for (const rest of ['', '-label']) {
      const rule = overviewRule(rest)
      expect(rule, `概览规则 ${rest || '(块)'} 不得出现字面颜色`).not.toMatch(
        /#[0-9a-fA-F]{3,8}|rgba?\(/
      )
    }
  })
})

describe('newsprint90s 订阅页头版守卫（#30：160×4:3 图版 / 18px 黑体 / 去卡片 / 无胶囊 / 无上浮）', () => {
  // 只锁 #30 票面的 card/grid 两态：图版尺寸、标题字号与字体栈、去卡片化与细线分隔、
  // hover 无上浮、来源无框、未读点方形、窄窗回落。compact / magazine / 空态归 #31，不在本组。
  const newsSection = (): string => css.slice(css.indexOf('90 年代报刊式'), css.indexOf('蒸汽梦核式'))
  /** 首条形如 `.jynews <rest> { … }` 的规则块（行首锚定） */
  const newsRule = (rest: string): string =>
    css.match(new RegExp(`(?:^|\n)\.jynews ${rest} \{[^}]*\}`))?.[0] ?? ''

  it('card/grid 图版 160px × 4:3、直角、不参与 flex 伸缩', () => {
    const cover = newsRule('\.juya-feed-grid \.juya-feed-cover')
    expect(cover, '图版规则应存在').toBeTruthy()
    expect(decl(cover, 'width')).toBe('160px')
    expect(decl(cover, 'aspect-ratio'), '图版必须 4:3').toBe('4 / 3')
    expect(decl(cover, 'border-radius'), '图版必须直角').toBe('0')
    expect(decl(cover, 'flex'), '图版不得被正文挤压').toBe('none')
  })

  it('期号标题 18px + 标题字体 token，摘要 13px', () => {
    const title = newsRule('\.juya-feed-grid \.juya-feed-title')
    expect(title, '标题规则应存在').toBeTruthy()
    expect(decl(title, 'font-size'), '标题第一视觉 18px').toBe('18px')
    expect(decl(title, 'font-family')).toBe('var(--jy-font-heading)')
    const summary = newsRule('\.juya-feed-grid \.juya-feed-summary')
    expect(decl(summary, 'font-size')).toBe('13px')
  })

  it('去卡片化：无底色 / 无阴影 / 直角，条目之间以 1px 细线分隔', () => {
    const item = newsRule('\.juya-feed-grid \.juya-feed-item')
    expect(item, '条目规则应存在').toBeTruthy()
    expect(decl(item, 'border'), '卡片边框退役').toBe('0')
    expect(decl(item, 'border-bottom'), '细线分隔保留').toBe('1px solid var(--jy-border)')
    expect(decl(item, 'background'), '卡片底色退役').toBe('transparent')
    expect(decl(item, 'box-shadow')).toBe('none')
    expect(decl(item, 'border-radius')).toBe('0')
  })

  it('hover 不再上浮：transform: none，且 newsprint 段内无 translateY 位移', () => {
    const hover = newsRule('\.juya-feed-grid \.juya-feed-item:hover')
    expect(hover, 'hover 覆盖规则应存在').toBeTruthy()
    expect(decl(hover, 'transform'), 'hover 不得产生位移').toBe('none')
    // 只扫声明，注释里提到基础层的 translateY 不算（避免守卫因说明文字误报）
    expect(newsSection().replace(/\/\*[\s\S]*?\*\//g, ''), 'newsprint 段不得再出现上浮位移').not.toMatch(
      /translateY/
    )
  })

  it('三处订阅页 hover 都用中性 --jy-feed-hover（#32 不再借导语底做微亮）', () => {
    for (const rest of [
      '\\.juya-feed-grid \\.juya-feed-item:hover',
      '\\.juya-feed-compact \\.juya-feed-item:hover',
      '\\.juya-feed-featured:hover'
    ]) {
      expect(decl(newsRule(rest), 'background'), `${rest} 应使用 --jy-feed-hover`).toBe(
        'var(--jy-feed-hover)'
      )
    }
  })

  it('来源无框小字、未读点 4px 方形，且不使用 999px 胶囊', () => {
    const source = newsRule('\.juya-feed-grid \.juya-feed-source')
    expect(decl(source, 'border'), '来源无边框').toBe('0')
    expect(decl(source, 'border-radius'), '来源不得是胶囊').toBe('0')
    expect(decl(source, 'background'), '来源无底色').toBe('none')
    expect(decl(source, 'padding'), '来源无内衬').toBe('0')
    const dot = newsRule('\.juya-feed-grid \.juya-feed-read-dot')
    expect(decl(dot, 'width')).toBe('4px')
    expect(decl(dot, 'height')).toBe('4px')
    expect(decl(dot, 'border-radius'), '未读点必须方角').toBe('0')
    expect(newsSection(), '段内不得出现 999px 胶囊').not.toContain('999px')
  })

  it('窄窗（≤560）图版回落纵向堆叠，避免固定 160px 图版撑破网格单元格', () => {
    const at = css.indexOf('@media (max-width: 560px)')
    expect(at, '560px 媒体块应存在').toBeGreaterThan(0)
    const block = css.slice(at, css.indexOf('蒸汽梦核式', at))
    expect(block, '窄窗覆盖必须在 newsprint 段内').toContain('.jynews .juya-feed-grid .juya-feed-item')
    expect(block).toContain('flex-direction: column')
  })
})

describe('newsprint90s 订阅页 compact 态守卫（#31：72×40 直角缩略图 / 14px 标题 / 元信息同 #30）', () => {
  // #30 的订阅页规则只接 .juya-feed-grid；compact 是另一条 DOM 路径
  // （.juya-feed-compact 容器、无网格），故本态的形状与元信息必须自成一套声明。
  const newsRule = (rest: string): string =>
    css.match(new RegExp(`(?:^|\n)\.jynews ${rest} \{[^}]*\}`))?.[0] ?? ''

  it('compact 缩略图保留 72 × 40 且必须直角', () => {
    const cover = newsRule('\.juya-feed-compact \.juya-feed-cover')
    expect(cover, 'compact 缩略图规则应存在').toBeTruthy()
    expect(decl(cover, 'width'), '小缩略图尺寸不缩水').toBe('72px')
    expect(decl(cover, 'height')).toBe('40px')
    expect(decl(cover, 'border-radius'), '缩略图必须直角').toBe('0')
  })

  it('compact 标题 14px，条目与 #30 同样去卡片化', () => {
    const title = newsRule('\.juya-feed-compact \.juya-feed-title')
    expect(decl(title, 'font-size'), '行式标题 14px').toBe('14px')
    const item = newsRule('\.juya-feed-compact \.juya-feed-item')
    expect(decl(item, 'border'), '卡片边框退役').toBe('0')
    expect(decl(item, 'border-bottom'), '细线分隔保留').toBe('1px solid var(--jy-border)')
    expect(decl(item, 'background')).toBe('transparent')
    expect(decl(item, 'box-shadow')).toBe('none')
  })

  it('compact 来源无框（非 999px 胶囊）、未读点方形', () => {
    const source = newsRule('\.juya-feed-compact \.juya-feed-source')
    expect(decl(source, 'border')).toBe('0')
    expect(decl(source, 'border-radius'), '来源不得是胶囊').toBe('0')
    expect(decl(source, 'background')).toBe('none')
    expect(decl(source, 'padding')).toBe('0')
    const dot = newsRule('\.juya-feed-compact \.juya-feed-read-dot')
    expect(decl(dot, 'width')).toBe('4px')
    expect(decl(dot, 'height')).toBe('4px')
    expect(decl(dot, 'border-radius'), '未读点必须方角').toBe('0')
  })
})

describe('newsprint90s 订阅页 magazine 态守卫（#31：首条 3:2 / 26px）', () => {
  // magazine 首条（.juya-feed-featured）是 .juya-feed 的直接子元素、不经 .juya-feed-grid，
  // 故 #30 的网格规则接不到它；其余条目复用网格，继续由 #30 守卫。
  const newsRule = (rest: string): string =>
    css.match(new RegExp(`(?:^|\n)\.jynews ${rest} \{[^}]*\}`))?.[0] ?? ''

  it('首条封面 3:2 直角（基础层 21:9 必须被覆盖）', () => {
    const cover = newsRule('\.juya-feed-featured \.juya-feed-cover')
    expect(cover, 'magazine 首条图版规则应存在').toBeTruthy()
    expect(decl(cover, 'aspect-ratio'), '首条封面 3:2').toBe('3 / 2')
    expect(decl(cover, 'border-radius'), '首条封面直角').toBe('0')
  })

  it('首条标题 26px + 标题字体 token', () => {
    const title = newsRule('\.juya-feed-featured \.juya-feed-title')
    expect(title, 'magazine 首条标题规则应存在').toBeTruthy()
    expect(decl(title, 'font-size'), '首条标题 26px').toBe('26px')
    expect(decl(title, 'font-family')).toBe('var(--jy-font-heading)')
  })

  it('首条来源无框（非胶囊）、未读点方形，与 #30 一致', () => {
    const source = newsRule('\.juya-feed-featured \.juya-feed-source')
    expect(source, '首条来源覆盖规则应存在').toBeTruthy()
    expect(decl(source, 'border')).toBe('0')
    expect(decl(source, 'border-radius'), '来源不得是胶囊').toBe('0')
    expect(decl(source, 'background')).toBe('none')
    expect(decl(source, 'padding')).toBe('0')
    const dot = newsRule('\.juya-feed-featured \.juya-feed-read-dot')
    expect(dot, '首条未读点覆盖规则应存在').toBeTruthy()
    expect(decl(dot, 'width')).toBe('4px')
    expect(decl(dot, 'height')).toBe('4px')
    expect(decl(dot, 'border-radius'), '未读点必须方角').toBe('0')
  })
})

describe('newsprint90s 空态守卫（#32：上下 1px 细线的通栏公告框 + 两级公告文案）', () => {
  // 空态的 strong/span 由本风格模板自渲染（共享骨架未拆），本组只锁框线与两级排印的取值。
  const newsRule = (rest: string): string =>
    css.match(new RegExp(`(?:^|\n)\.jynews ${rest} \{[^}]*\}`))?.[0] ?? ''

  it('公告框上下各 1px 细线、居中', () => {
    const empty = newsRule('\.juya-feed-empty')
    expect(empty, '空态公告规则应存在').toBeTruthy()
    expect(decl(empty, 'border-top'), '上沿细线').toBe('1px solid var(--jy-border)')
    expect(decl(empty, 'border-bottom'), '下沿细线').toBe('1px solid var(--jy-border)')
    expect(decl(empty, 'text-align'), '居中公告').toBe('center')
  })

  it('公告文案两级：标题 15px 标题字体 token、提示 12px 次要文字色', () => {
    const strong = newsRule('\.juya-feed-empty strong')
    expect(strong, '公告标题规则应存在').toBeTruthy()
    expect(decl(strong, 'display'), '标题为块级').toBe('block')
    expect(decl(strong, 'font-family'), '标题走标题字体 token').toBe('var(--jy-font-heading)')
    expect(decl(strong, 'font-size')).toBe('15px')
    const span = newsRule('\.juya-feed-empty span')
    expect(span, '公告提示规则应存在').toBeTruthy()
    expect(decl(span, 'display'), '提示为块级').toBe('block')
    expect(decl(span, 'margin-top'), '两级公告间距 4px').toBe('4px')
    expect(decl(span, 'font-size')).toBe('12px')
    expect(decl(span, 'color'), '提示走次要文字色').toBe('var(--jy-muted)')
  })

  it('公告框在 grid 预设下通栏，不被挤进第一列', () => {
    const empty = newsRule('\.juya-feed-empty')
    expect(decl(empty, 'grid-column'), '公告框须横跨所有列').toBe('1 / -1')
  })
})

describe('synthwave 场景守卫（2026-10-22，#36）', () => {
  /** 变体 + 风格类的复合形态规则（约定：两者恒挂同一根元素）。
   *  用字符类代替反斜杠转义，避免模板字面量把转义吃掉。 */
  const synthRule = (rest: string): string =>
    extractBlock(css, new RegExp(`[[]data-juya-variant='synthwave-dark'].jysynth ${rest} {`))

  it('① 透视网格抬回视口：height 95vh / bottom 136px / rotateX 52deg / perspective 1600px', () => {
    const grid = (extractBlocks(css, new RegExp('[.]juya-scene-grid-persp [{]')).find((b) => b.includes('perspective(')) ?? '')
    expect(grid, '透视网格规则必须存在').not.toBe('')
    expect(decl(grid, 'height')).toBe('95vh')
    expect(decl(grid, 'bottom'), '底边需抬到窗口 chrome 之上').toBe('136px')
    expect(decl(grid, 'transform')).toContain('perspective(1600px)')
    expect(decl(grid, 'transform')).toContain('rotateX(52deg)')
  })

  it('② 网格平面自带地面底色，否则地平线以下是透空的', () => {
    const grid = (extractBlocks(css, new RegExp('[.]juya-scene-grid-persp [{]')).find((b) => b.includes('perspective(')) ?? '')
    expect(decl(grid, 'background-color')).toBe('#170a2a')
  })

  it('③ 落日：直径 min(52vh, 480px) 且 10 道条纹', () => {
    const sun = (extractBlocks(css, new RegExp('[.]juya-scene-sun [{]')).find((b) => b.includes('mask-image')) ?? '')
    expect(decl(sun, 'width')).toBe('min(52vh, 480px)')
    const mask = decl(sun, '-webkit-mask-image')
    const bands = (mask.match(/#000/g) ?? []).length
    expect(bands, '条纹数量决定落日的识别度').toBe(10)
  })

  it('④ 夜空渐变与扫描线挂在场景层（随内容固定），不在内容根上', () => {
    const scene = synthRule('.juya-scene')
    expect(scene, 'synthwave 场景层规则必须存在').not.toBe('')
    expect(decl(scene, 'background-image')).toContain('linear-gradient(180deg')
    expect(decl(scene, 'background-image')).toContain('#24103f')
    expect(decl(scene, 'background-image')).toContain('#ff8a4c')
    expect(decl(scene, 'background-image'), '扫描线 1px 线 / 3px 间隔').toContain('0 1px, transparent 1px 4px')
    expect(decl(scene, 'background-image'), '扫描线透明度 0.10').toContain('rgba(0, 0, 0, 0.1)')
  })

  it('⑤ 窗口不可见时暂停落日与网格（此前只有 nocturne 在暂停清单里）', () => {
    expect(css, '落日需进入暂停清单').toContain(
      "[data-app-hidden] [data-juya-variant='synthwave-dark'].jysynth .juya-scene-sun {"
    )
    // #44：网格动画载体已迁到纹理层伪元素，暂停必须指向 ::after（父层没有动画可暂停）
    expect(css, '网格需进入暂停清单').toContain(
      "[data-app-hidden] [data-juya-variant='synthwave-dark'].jysynth .juya-scene-grid-persp::after {"
    )
    const sunPause = extractBlock(css, new RegExp('[.]juya-scene-sun [{]'))
    expect(decl(sunPause, 'animation-play-state')).toBe('paused')
    const gridPause = ruleBySelector(
      css,
      "[data-app-hidden] [data-juya-variant='synthwave-dark'].jysynth .juya-scene-grid-persp::after"
    )
    expect(decl(gridPause, 'animation-play-state')).toBe('paused')
  })
})

describe('synthwave 字体守卫（2026-10-22，#37）', () => {
  /** 蒸汽梦核式段（段头 → 下一段「暗夜精修式」段头）：字体规则与两条回退必须落在此区间，
   *  否则「回退限定在 synthwave 作用域」只是选择器上的字面承诺。 */
  const synthSection = (): string => css.slice(css.indexOf('蒸汽梦核式'), css.indexOf('暗夜精修式'))

  /** 变体块内某 token 的完整右值 */
  const tok = (block: string, name: string): string =>
    block.match(new RegExp(`${name}:\\s*([^;}]+)`))?.[1]?.trim() ?? ''

  /** 段内 `.jysynth .juya-masthead h1` 规则块 */
  const masthead = (src: string): string =>
    extractBlock(src, /(?:^|\n)\.jysynth \.juya-masthead h1 \{/)

  it('① 暗侧变体补两条字体 token：标题落黑体栈，刊头落等宽栈', () => {
    const block = variantBlock('synthwave-dark')
    expect(tok(block, '--jy-font-heading'), '标题字族').toBe(
      "'Noto Sans SC', 'Microsoft YaHei', sans-serif"
    )
    expect(tok(block, '--jy-font-masthead'), '刊头字族').toBe(
      "'JetBrains Mono', 'Consolas', 'Noto Sans SC', sans-serif"
    )
  })

  it('② 刊头标题 28px、字距 0.02em、消费刊头字体 token', () => {
    const rule = masthead(synthSection())
    expect(rule, 'synthwave 刊头标题规则必须存在').not.toBe('')
    expect(decl(rule, 'font-size')).toBe('28px')
    expect(decl(rule, 'letter-spacing')).toBe('0.02em')
    expect(decl(rule, 'font-family'), '刊头走独立字族，不退到标题 token').toContain(
      'var(--jy-font-masthead'
    )
  })

  it('③ 保留 heading→accent 横向渐变（1px 描边改由分变体规则承担，见 ⑦）', () => {
    const rule = masthead(synthSection())
    const fill = decl(rule, 'background-image') || decl(rule, 'background')
    expect(fill, '渐变填充').toContain('linear-gradient(90deg')
    expect(fill, '渐变起点为标题色').toContain('var(--jy-heading)')
    expect(fill, '渐变终点为强调色').toContain('var(--jy-accent)')
    expect(decl(rule, 'background-clip'), '文字裁切').toBe('text')
    expect(decl(rule, '-webkit-text-stroke'), '基础规则不得再写单色描边').toBe('')
  })

  it('④ 不做任何倾斜或斜体（中文 skew 会让笔画失真）', () => {
    const rule = masthead(synthSection())
    expect(decl(rule, 'transform')).not.toContain('skew')
    expect(decl(rule, 'font-style')).not.toBe('italic')
    expect(synthSection(), '段内不得出现斜体声明').not.toMatch(/font-style:\s*italic/)
  })

  it('⑤ 不支持 background-clip:text 的引擎退回实色标题，且只在 synthwave 作用域', () => {
    const blocks = extractBlocks(synthSection(), /@supports not \(background-clip: text\) \{/)
    expect(blocks.length, '段内恰有一条 @supports 回退').toBe(1)
    const block = blocks[0]
    expect(block, '回退须限定在 .jysynth 作用域').toContain('.jysynth .juya-masthead h1')
    expect(decl(block, 'background'), '去掉渐变').toBe('none')
    expect(decl(block, 'color'), '退回实色标题').toBe('var(--jy-heading)')
  })

  it('⑥ 高对比模式退回系统色，不留透明字', () => {
    const blocks = extractBlocks(synthSection(), /@media \(forced-colors: active\) \{/)
    expect(blocks.length, '段内恰有一条 forced-colors 回退').toBe(1)
    const block = blocks[0]
    expect(block, '回退须限定在 .jysynth 作用域').toContain('.jysynth .juya-masthead h1')
    expect(decl(block, 'background'), '去掉渐变').toBe('none')
    expect(decl(block, 'color'), '退回系统前景色').toBe('CanvasText')
  })

  it('⑦ 1px 描边分亮/暗两套，且各自与 --jy-heading 同源（#34 review）', () => {
    /** `1px rgba(r, g, b, a)` → { rgb, alpha } */
    const stroke = (value: string): { rgb: number; alpha: number } => {
      const m = value.match(/^1px\s+rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
      if (!m) throw new Error(`不是 1px rgba() 描边：${value}`)
      return {
        rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
        alpha: m[4] === undefined ? 1 : Number(m[4])
      }
    }
    const strokeRule = (variant: string): string =>
      extractBlock(
        synthSection(),
        new RegExp(
          `(?:^|\\n)\\[data-juya-variant='${variant}'\\]\\.jysynth \\.juya-masthead h1 \\{`
        )
      )
    // 亮暗各一条，且都写在复合形态选择器上（带空格的后代形式永不匹配）
    const rules = [...synthSection().matchAll(/(?:^|\n)([^\n{}]*\.juya-masthead h1[^\n{}]*)\{([^}]*)\}/g)].map(
      (m) => ({ selector: m[1].trim(), block: m[2] })
    )
    const withStroke = rules.filter((r) => decl(r.block, '-webkit-text-stroke') !== '')
    expect(withStroke.map((r) => r.selector).sort()).toEqual(
      [
        "[data-juya-variant='synthwave-dark'].jysynth .juya-masthead h1",
        "[data-juya-variant='synthwave-light'].jysynth .juya-masthead h1"
      ].sort()
    )

    for (const [variant, alpha] of [
      ['synthwave-dark', 0.45],
      ['synthwave-light', 0.28]
    ] as const) {
      const rule = strokeRule(variant)
      expect(rule, `${variant} 描边规则必须存在`).not.toBe('')
      const s = stroke(decl(rule, '-webkit-text-stroke'))
      expect(s.rgb, `${variant} 描边 RGB 须与 --jy-heading 同源`).toBe(
        tokenHex(variantBlock(variant), '--jy-heading')
      )
      expect(s.alpha, `${variant} 描边 alpha`).toBe(alpha)
    }
    // 暗侧近白紫（#ffe6ff）压在白卡上等于没有描边：两色必须真的不同源
    expect(
      tokenHex(variantBlock('synthwave-dark'), '--jy-heading'),
      '亮暗标题色必须不同，描边才可能分变体'
    ).not.toBe(tokenHex(variantBlock('synthwave-light'), '--jy-heading'))
  })
})

describe('synthwave 链接箭头守卫（2026-10-22，#38）', () => {
  /** 全文件所有 `.juya-links a::after` 规则（选择器与块体成对）；选择器限单行（本仓库书写约定）。 */
  const arrowRules = [...css.matchAll(/(?:^|\n)([^\n{}]*\.juya-links a::after[^\n{}]*)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    block: m[2]
  }))

  it('① 基础层文本箭头保留（未传图标的七个风格观感不变）', () => {
    const base = arrowRules.find((r) => r.selector === '.juya-links a::after')
    expect(base, '基础 ::after 箭头规则必须存在').toBeTruthy()
    expect(decl(base!.block, 'content')).toContain('↗')
  })

  it('② synthwave 亮/暗双侧在作用域内关闭基础文本箭头，避免与 SVG 并存', () => {
    for (const variant of ['synthwave-light', 'synthwave-dark']) {
      const selector = `[data-juya-variant='${variant}'].jysynth .juya-links a::after`
      const rule = arrowRules.find((r) => r.selector === selector)
      expect(rule, `${variant} 必须关闭基础文本箭头`).toBeTruthy()
      expect(decl(rule!.block, 'content')).toBe('none')
    }
  })

  it('③ 关闭文本箭头的规则不外溢到其它变体', () => {
    const nulled = arrowRules.filter((r) => /^(none|normal)$/.test(decl(r.block, 'content')))
    for (const rule of nulled) {
      expect(rule.selector, '置空箭头必须限定在 synthwave 作用域').toContain(
        "[data-juya-variant='synthwave-"
      )
    }
    expect(nulled.length, '亮暗两侧各一条').toBe(2)
  })
})

describe('synthwave 暗侧卡面守卫（2026-10-22，#39）', () => {
  /** 蒸汽梦核式段（段头 → 下一段「暗夜精修式」段头）：卡面规则必须落在此区间，
   *  否则「只改 synthwave」只是选择器上的字面承诺，其它七个风格随时被顺手波及。 */
  const synthSection = (): string => css.slice(css.indexOf('蒸汽梦核式'), css.indexOf('暗夜精修式'))

  /** 段内首条匹配 opener 的规则块（opener 自带 `{`，与 #36 组同一写法） */
  const synthRule = (opener: RegExp): string => extractBlock(synthSection(), opener)

  /** 变体块内某 token 的完整右值 */
  const tok = (block: string, name: string): string =>
    block.match(new RegExp(`${name}:\\s*([^;}]+)`))?.[1]?.trim() ?? ''

  /** `rgba(r, g, b, a)` / `rgb(r, g, b)` → `{ rgb, alpha }`（tokenHex 读不了 rgba，故自行解析） */
  const rgba = (value: string): { rgb: number; alpha: number } => {
    const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
    if (!m) throw new Error(`不是 rgb()/rgba() 字面量：${value}`)
    return {
      rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
      alpha: m[4] === undefined ? 1 : Number(m[4])
    }
  }

  /** 落日最亮处 #ff9a3c（场景渐变 88% 停靠的 #ff8a4c 与其下沉到地平线前的峰）。
   *  0.62 卡面压在这里时合成底最亮，是次要文字的最不利场景。 */
  const SUN_PEAK = 0xff9a3c

  it('① 暗侧卡面 = rgba(20, 8, 38, 0.62)', () => {
    const card = rgba(tok(variantBlock('synthwave-dark'), '--jy-card'))
    expect(card.rgb, '卡面底色').toBe(0x140826)
    expect(card.alpha, '卡面 alpha 决定毛玻璃强度与文字对比').toBe(0.62)
  })

  it('② 刊头与条目：blur(18px) saturate(1.15)', () => {
    const rule = synthRule(/(?:^|\n)\.jysynth \.juya-entry,/)
    expect(rule, '刊头 + 条目共用一条卡面规则').not.toBe('')
    expect(rule, '刊头必须与条目同一套外观').toContain('.jysynth .juya-masthead')
    expect(decl(rule, 'backdrop-filter')).toBe('blur(18px) saturate(1.15)')
  })

  it('③ 订阅页条目同强度毛玻璃', () => {
    const rule = synthRule(/(?:^|\n)\.jysynth \.juya-feed-item \{/)
    expect(rule, '订阅页条目规则必须存在').not.toBe('')
    expect(decl(rule, 'backdrop-filter')).toBe('blur(18px) saturate(1.15)')
  })

  it('④ 概览底板与卡片同源：四项声明 + 同强度毛玻璃，且不动条目字号/行高', () => {
    const rule = synthRule(/(?:^|\n)\.jysynth \.juya-overview \{/)
    expect(rule, '概览底板规则必须存在').not.toBe('')
    expect(decl(rule, 'background')).toBe('var(--jy-card)')
    expect(decl(rule, 'border')).toBe('1px solid var(--jy-border)')
    expect(decl(rule, 'border-radius')).toBe('var(--jy-radius)')
    expect(decl(rule, 'padding')).toBe('12px 16px')
    expect(decl(rule, 'backdrop-filter'), '与卡片同强度').toBe('blur(18px) saturate(1.15)')
    expect(decl(rule, 'font-size'), '概览条目字号由基类决定').toBe('')
    expect(decl(rule, 'line-height'), '概览条目行高由基类决定').toBe('')
  })

  it('⑤ 配图：1px 品红描边走 token，并降饱和到 0.92', () => {
    const rule = synthRule(/(?:^|\n)\.jysynth \.juya-media img \{/)
    expect(rule, '配图规则必须存在').not.toBe('')
    const border = decl(rule, 'border')
    expect(border, '描边宽度').toContain('1px')
    expect(border, '描边走 token，不写死新色值').toContain('var(--jy-')
    expect(decl(rule, 'filter')).toBe('saturate(0.92)')
  })

  it('⑥ 悬停取消基础层的 −2px 上浮，只保留加深的外发光', () => {
    const rule = synthRule(/(?:^|\n)\.jysynth \.juya-feed-item:hover \{/)
    expect(rule, '悬停规则必须存在').not.toBe('')
    expect(decl(rule, 'transform')).toBe('none')
    expect(decl(rule, 'box-shadow'), '外发光需比常态更深').toContain('22px')
  })

  it('⑦ 实算：0.62 卡面压在落日最亮处的合成底上，次要文字 ≥ 4.5', () => {
    const block = variantBlock('synthwave-dark')
    const card = rgba(tok(block, '--jy-card'))
    const base = alphaOver(card.rgb, card.alpha, SUN_PEAK)
    expect(base, '合成底应落在 rgb(109, 63, 46) 附近').toEqual(0x6d3f2e)
    expect(contrast(tokenHex(block, '--jy-muted'), base), '次要文字 / 最不利合成底').toBeGreaterThanOrEqual(
      4.5
    )
  })
})

describe('synthwave 订阅页场景守卫（2026-10-22，#40）', () => {
  /** 蒸汽梦核式段（段头 → 下一段「暗夜精修式」段头）：订阅页场景补偿规则必须落在此区间。 */
  const synthSection = (): string => css.slice(css.indexOf('蒸汽梦核式'), css.indexOf('暗夜精修式'))

  /** 段内订阅页网格补偿规则 */
  const feedGrid = (): string =>
    extractBlock(synthSection(), /(?:^|\n)\.jysynth:has\(> \.juya-feed\) \.juya-scene-grid-persp \{/)

  /** 全文件所有 `.juya-scene-grid-persp` 规则（选择器与块体成对），用于确认覆盖不外溢。 */
  const gridRules = [...css.matchAll(/(?:^|\n)([^\n{}]*\.juya-scene-grid-persp[^\n{}]*)\{([^}]*)\}/g)].map(
    (m) => ({ selector: m[1].trim(), block: m[2] })
  )

  it('① 订阅页把网格底边补到可视区下缘：只有 .jysynth + :has(> .juya-feed) 作用域内的一条规则', () => {
    const rule = feedGrid()
    expect(rule, '订阅页网格补偿规则必须存在，且落在蒸汽梦核式段内').not.toBe('')
    expect(decl(rule, 'bottom'), '订阅页 chrome 80px + 8px 余量').toBe('88px')
  })

  it('② 网格底边覆盖只出现在 .jysynth 作用域内，共享网格规则仍为 136px', () => {
    const withBottom = gridRules.filter((r) => decl(r.block, 'bottom') !== '')
    expect(withBottom.map((r) => r.selector).sort()).toEqual(
      ['.juya-scene-grid.juya-scene-grid-persp', '.jysynth:has(> .juya-feed) .juya-scene-grid-persp'].sort()
    )
    const shared = withBottom.find((r) => r.selector === '.juya-scene-grid.juya-scene-grid-persp')!
    expect(decl(shared.block, 'bottom'), '共享规则的阅读页补偿值不得改动').toBe('136px')
    for (const rule of withBottom) {
      if (rule.selector === '.juya-scene-grid.juya-scene-grid-persp') continue
      expect(rule.selector, '订阅页补偿必须限定在 .jysynth 作用域').toContain('.jysynth')
    }
  })
})

describe('synthwave 亮侧守卫（2026-10-22，#41）', () => {
  /** 蒸汽梦核式段（段头 → 下一段「暗夜精修式」段头）：亮侧规则必须落在此区间，
   *  否则「只改 synthwave」只是选择器上的字面承诺。 */
  const synthSection = (): string => css.slice(css.indexOf('蒸汽梦核式'), css.indexOf('暗夜精修式'))

  /** 变体块内某 token 的完整右值 */
  const tok = (block: string, name: string): string =>
    block.match(new RegExp(`${name}:\\s*([^;}]+)`))?.[1]?.trim() ?? ''

  /** `rgba(r, g, b, a)` / `rgb(r, g, b)` → `{ rgb, alpha }`（tokenHex 读不了 rgba） */
  const rgba = (value: string): { rgb: number; alpha: number } => {
    const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
    if (!m) throw new Error(`不是 rgb()/rgba() 字面量：${value}`)
    return {
      rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
      alpha: m[4] === undefined ? 1 : Number(m[4])
    }
  }

  /** 亮侧场景最亮停靠 #ffd6e8（0%）与最深停靠 #ffb27a（82%）：0.62 白卡压在其上的两种合成底。 */
  const SKY_TOP = 0xffd6e8
  const SKY_DEEP = 0xffb27a
  /** 亮侧地面（#41）：共享网格面的 #170a2a 是暗侧地面，亮侧在段内覆盖为浅粉，
   *  否则卡片压在网格区时合成底变 #a7a2ae、次要文字掉到 2.78。 */
  const GROUND = 0xffcadb

  it('① 亮侧 token：洋红橙日间版取代旧淡紫（底/卡/边/字/强调/导语/场景）', () => {
    expect(synthSection(), '亮侧变体块必须落在蒸汽梦核式段内').toContain(
      "[data-juya-variant='synthwave-light'] {"
    )
    const block = variantBlock('synthwave-light')
    expect(block, '亮侧变体块必须存在').not.toBe('')
    // 场景会覆盖底色，--jy-bg 只是兜底（加载瞬间 / 无场景时）
    expect(tok(block, '--jy-bg'), '兜底底色').toBe('#ffe6cc')
    const card = rgba(tok(block, '--jy-card'))
    expect(card.rgb, '亮侧卡面为白').toBe(0xffffff)
    expect(card.alpha, '亮侧卡面与暗侧同 alpha（0.62 毛玻璃）').toBe(0.62)
    expect(tok(block, '--jy-border')).toBe('rgba(224, 0, 110, 0.30)')
    expect(tok(block, '--jy-heading')).toBe('#4a0736')
    expect(tok(block, '--jy-text')).toBe('#3d0a2c')
    expect(tok(block, '--jy-muted')).toBe('#8c3f6a')
    expect(tok(block, '--jy-accent')).toBe('#e0006e')
    expect(tok(block, '--jy-on-accent')).toBe('#ffffff')
    expect(tok(block, '--jy-link')).toBe('#b0005a')
    expect(tok(block, '--jy-lead-bg')).toBe('rgba(224, 0, 110, 0.12)')
    expect(tok(block, '--jy-focus'), '焦点环与暗侧同值').toBe('#7c4dff')
    expect(tok(block, '--jy-radius'), '圆角统一 16px').toBe('16px')
    // 字体 token 两侧同值：亮侧不再退到兜底栈
    expect(tok(block, '--jy-font-heading')).toBe("'Noto Sans SC', 'Microsoft YaHei', sans-serif")
    expect(tok(block, '--jy-font-masthead')).toBe(
      "'JetBrains Mono', 'Consolas', 'Noto Sans SC', sans-serif"
    )
    // 场景 token：日轮黄 → 品红，网格线比暗侧淡（0.55 → 0.35）
    expect(tok(block, '--jy-scene-sun-1')).toBe('#fff04d')
    expect(tok(block, '--jy-scene-sun-2')).toBe('#ff2d95')
    expect(tok(block, '--jy-scene-grid-line')).toBe('rgba(255, 45, 149, 0.35)')
    expect(tok(block, '--jy-scene-horizon')).toBe('rgba(255, 120, 60, 0.85)')
  })

  it('② 日间天空四段渐变 + 更淡的扫描线，规则限定在亮侧作用域', () => {
    const scene = extractBlock(
      synthSection(),
      /(?:^|\n)\[data-juya-variant='synthwave-light'\]\.jysynth \.juya-scene \{/
    )
    expect(scene, '亮侧场景层规则必须存在').not.toBe('')
    const bg = decl(scene, 'background-image')
    for (const stop of ['#ffd6e8', '#ffc4d8', '#ffb27a', '#ffe6cc']) {
      expect(bg, `渐变停靠 ${stop}`).toContain(stop)
    }
    expect(bg, '顶部 0% → 底部 100% 的垂直渐变').toContain('linear-gradient(180deg')
    expect(bg, '扫描线比暗侧更淡（0.06 vs 0.10）').toContain(
      'rgba(0, 0, 0, 0.06) 0 1px, transparent 1px 4px'
    )
    // 场景层规则只允许亮/暗两条：亮侧不得写成无变体限定的裸 .juya-scene（会在暗侧/其它风格上叠加）
    const sceneRules = [...css.matchAll(/(?:^|\n)([^\n{}]*\.jysynth \.juya-scene)\s*\{/g)].map((m) =>
      m[1].trim()
    )
    expect(sceneRules.sort()).toEqual(
      [
        "[data-juya-variant='synthwave-dark'].jysynth .juya-scene",
        "[data-juya-variant='synthwave-light'].jysynth .juya-scene"
      ].sort()
    )
  })

  it('③ 亮侧落日与网格也纳入「窗口不可见时暂停」，暂停规则不落到无变体限定的选择器上', () => {
    // #44：网格的动画载体是纹理层伪元素，暂停选择器必须带 ::after
    for (const [name, selector] of [
      [
        '落日',
        "[data-app-hidden] [data-juya-variant='synthwave-light'].jysynth .juya-scene-sun"
      ],
      [
        '网格',
        "[data-app-hidden] [data-juya-variant='synthwave-light'].jysynth .juya-scene-grid-persp::after"
      ]
    ] as const) {
      expect(css, `${name}需进入亮侧暂停清单`).toContain(`${selector} {`)
      const rule = ruleBySelector(css, selector)
      expect(decl(rule, 'animation-play-state'), `${name}在窗口不可见时暂停`).toBe('paused')
    }
    // 亮暗两侧各两条，共四条；每条都必须带变体限定（裸选择器会波及 y2k / nocturne 的动画载体）
    const pauseRules = [
      ...css.matchAll(/(?:^|\n)([^\n{}]*\[data-app-hidden\][^\n{}]*\.juya-scene-(?:sun|grid-persp)[^\n{}]*)\{([^}]*)\}/g)
    ].map((m) => m[1].trim())
    expect(pauseRules, '落日与网格各两条（亮/暗）').toHaveLength(4)
    for (const selector of pauseRules) {
      expect(selector, '暂停规则必须限定在具体变体').toMatch(
        /\[data-juya-variant='synthwave-(light|dark)'\]/
      )
    }
  })

  it('④ 实算：0.62 白卡叠天空顶与亮侧地面两种合成底，正文/次要/链接 ≥ 4.5，accent ≥ 3（非文本件）', () => {
    const block = variantBlock('synthwave-light')
    const card = rgba(tok(block, '--jy-card'))
    // 亮侧卡片实际压过的两种底：天空顶 #ffd6e8，以及地面（已改浅色 #ffcadb）——
    // 后者此前是共享的 #170a2a，合成底 #a7a2ae 上次要文字只有 2.78（#41 修掉的那条）。
    const bases = [
      { name: '天空顶 #ffd6e8', color: SKY_TOP, expect: 0xffeff6 },
      { name: '地面 #ffcadb', color: GROUND, expect: 0xffebf1 }
    ]
    for (const b of bases) {
      const base = alphaOver(card.rgb, card.alpha, b.color)
      expect(base, `${b.name} 的合成底`).toBe(b.expect)
      expect(contrast(tokenHex(block, '--jy-heading'), base), `标题 / ${b.name}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokenHex(block, '--jy-text'), base), `正文 / ${b.name}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokenHex(block, '--jy-muted'), base), `次要文字 / ${b.name}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokenHex(block, '--jy-link'), base), `链接 / ${b.name}`).toBeGreaterThanOrEqual(4.5)
      // accent #e0006e 在亮侧的用途全为非文本件（1px 边框、栏目条、徽章底、滚动条 thumb）与
      // 28px 粗体刊头渐变的末端 —— 分别按非文本 3:1 / 大字 3:1 的门槛。
      // 若将来把 accent 用作小字号正文，本断言须收紧到 4.5（届时需换更深的品红）。
      expect(contrast(tokenHex(block, '--jy-accent'), base), `accent / ${b.name}（非文本件）`).toBeGreaterThanOrEqual(3)
    }

    // 天空最深的一段（#ffb27a 82%）合成底更暗：正文与次要文字仍须过 AA
    const deep = alphaOver(card.rgb, card.alpha, SKY_DEEP)
    expect(deep, '合成底应落在 #ffe2cc').toBe(0xffe2cc)
    expect(contrast(tokenHex(block, '--jy-text'), deep), '正文 / 天空最深段').toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokenHex(block, '--jy-muted'), deep), '次要文字 / 天空最深段').toBeGreaterThanOrEqual(4.5)
  })

  it('⑤ 亮侧地面改浅色：只覆盖 background-color 且限定亮侧作用域，共享地面与暗侧仍为 #170a2a', () => {
    const lightGround = extractBlock(
      synthSection(),
      /(?:^|\n)\[data-juya-variant='synthwave-light'\]\.jysynth \.juya-scene-grid-persp \{/
    )
    expect(lightGround, '亮侧地面覆盖规则必须存在，且落在蒸汽梦核式段内').not.toBe('')
    expect(decl(lightGround, 'background-color'), '亮侧地面色').toBe('#ffcadb')
    // 只改颜色：几何（bottom / height / transform）仍归共享规则与 #40 的订阅页补偿
    for (const prop of ['bottom', 'height', 'transform', 'background-image']) {
      expect(decl(lightGround, prop), `地面色覆盖不得顺手改 ${prop}`).toBe('')
    }

    // 共享规则（暗侧地面）仍是 #170a2a —— 亮侧覆盖不得上移到裸选择器
    const shared = extractBlock(css, /(?:^|\n)\.juya-scene-grid\.juya-scene-grid-persp \{/)
    expect(decl(shared, 'background-color'), '暗侧地面维持现状').toBe('#170a2a')

    // 全文件只有两条规则给网格平面设地面色：共享一条，亮侧一条
    const groundRules = [
      ...css.matchAll(/(?:^|\n)([^\n{}]*\.juya-scene-grid-persp[^\n{}]*)\s*\{([^}]*)\}/g)
    ]
      .map((m) => ({ selector: m[1].trim(), block: m[2] }))
      .filter((r) => decl(r.block, 'background-color') !== '')
    expect(groundRules.map((r) => r.selector).sort()).toEqual(
      [
        '.juya-scene-grid.juya-scene-grid-persp',
        "[data-juya-variant='synthwave-light'].jysynth .juya-scene-grid-persp"
      ].sort()
    )
  })
})

describe('synthwave 网格合成层守卫（2026-10-22，#44）', () => {
  /** 蒸汽梦核式段（段头 → 下一段「暗夜精修式」段头）：网格规则必须落在此区间。 */
  const synthSection = (): string => css.slice(css.indexOf('蒸汽梦核式'), css.indexOf('暗夜精修式'))

  /** 剥注释后的段内代码：注释里叙述旧实现（background-position）不算实现 */
  const code = (): string => synthSection().replace(/\/\*[\s\S]*?\*\//g, '')

  /** 父层：几何 / mask / 地面底色 */
  const plane = (): string =>
    extractBlock(css, /(?:^|\n)\.juya-scene-grid\.juya-scene-grid-persp \{/)

  /** 纹理层：周期网格 + 位移动画 */
  const texture = (): string =>
    extractBlock(css, /(?:^|\n)\.juya-scene-grid\.juya-scene-grid-persp::after \{/)

  it('① 父层不再承担动画：无 animation / will-change / 背景纹理', () => {
    expect(plane(), '父层规则必须存在').not.toBe('')
    expect(decl(plane(), 'animation'), '父层动画须迁到纹理层').toBe('')
    expect(decl(plane(), 'will-change'), '父层不得再声明 will-change').toBe('')
    // 网格作用域的规则一律不得再碰 background-position（段内的 dust 是另一个预设，不在本条范围）
    const gridBg = [...code().matchAll(/([^{}]*\.juya-scene-grid[^{}]*)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /background-position/.test(body))
      .map(([, selector]) => selector.trim())
    expect(gridBg, '网格规则不得再用 background-position 做动画').toEqual([])
    // 基础 .juya-scene-grid（y2k 地平网格）自带 background-image；父层不显式清空会漏出
    // 那套 1px / 44px 纹理，与纹理层叠加成双网格（实施时实测到过，故立此守卫）
    expect(decl(plane(), 'background-image'), '基础网格纹理必须显式清掉').toBe('none')
    // 几何 / mask / 地面底色仍归父层
    expect(decl(plane(), 'height')).toBe('95vh')
    expect(decl(plane(), 'bottom')).toBe('136px')
    expect(decl(plane(), 'background-color')).toBe('#170a2a')
    expect(decl(plane(), 'mask-image')).toContain('linear-gradient(180deg')
  })

  it('② 纹理层：多留一个周期的高度、两条渐变，位移全程不露底', () => {
    const t = texture()
    expect(t, '纹理层规则必须存在').not.toBe('')
    expect(decl(t, 'position')).toBe('absolute')
    expect(decl(t, 'top'), '整体上移一个周期').toBe('-56px')
    expect(decl(t, 'height'), '高度多一个周期，translateY 到 56px 时底边仍有料').toBe(
      'calc(100% + 56px)'
    )
    expect(decl(t, 'left')).toBe('0')
    expect(decl(t, 'right')).toBe('0')
    const bg = decl(t, 'background-image')
    expect(bg, '竖线周期 72px').toContain('repeating-linear-gradient(90deg')
    expect(bg, '横线周期 56px').toContain('repeating-linear-gradient(0deg')
    expect(bg.match(/72px/g), '竖线周期只出现一次').toHaveLength(1)
    expect(bg.match(/56px/g), '横线周期只出现一次').toHaveLength(1)
    expect(bg, '线色走变体 token（亮侧 0.35 / 暗侧 0.55）').toContain('var(--jy-scene-grid-line)')
  })

  it('③ 关键帧只动 transform、周期 56px / 3.2s linear infinite，will-change 挂在纹理层', () => {
    const t = texture()
    expect(decl(t, 'animation')).toBe('jy-grid-scroll 3.2s linear infinite')
    expect(decl(t, 'will-change'), 'will-change 必须在纹理层').toBe('transform')
    const kf = extractBlock(css, /(?:^|\n)@keyframes jy-grid-scroll \{/)
    expect(kf, '网格关键帧必须存在').not.toBe('')
    expect(kf, '关键帧不得再动 background-position').not.toContain('background-position')
    const decls = [...kf.matchAll(/([a-z-]+)\s*:\s*([^;}]+)/g)].map(([, p, v]) => [p, v.trim()] as const)
    expect(decls.map(([p]) => p), '关键帧只允许 transform').toEqual(['transform', 'transform'])
    expect(decls[0]![1]).toBe('translateY(0)')
    expect(decls[1]![1], '位移量 = 横向网格周期').toBe('translateY(56px)')
  })

  it('④ 地平线 ::before 仍压在纹理层之上', () => {
    const before = extractBlock(css, /(?:^|\n)\.juya-scene-grid-persp::before \{/)
    expect(before, '地平线伪元素必须存在').not.toBe('')
    const z = (block: string): number => Number.parseInt(decl(block, 'z-index'), 10)
    expect(Number.isNaN(z(before)), '地平线必须显式声明 z-index').toBe(false)
    expect(Number.isNaN(z(texture())), '纹理层必须显式声明 z-index').toBe(false)
    expect(z(before), '纹理层伪元素在树序上靠后，只能靠 z-index 让地平线压住它').toBeGreaterThan(
      z(texture())
    )
  })

  it('⑤ 不可见暂停与 reduced-motion 也指向纹理层（父层已无动画可暂停）', () => {
    for (const variant of ['synthwave-dark', 'synthwave-light']) {
      const selector = `[data-app-hidden] [data-juya-variant='${variant}'].jysynth .juya-scene-grid-persp::after`
      const rule = ruleBySelector(css, selector)
      expect(rule, `${variant} 的网格暂停规则必须选中纹理层`).not.toBe('')
      expect(decl(rule, 'animation-play-state')).toBe('paused')
    }
    const rm = extractBlocks(css, /@media \(prefers-reduced-motion: reduce\) \{/).find((b) =>
      b.includes('.juya-scene-sun')
    )
    expect(rm, '场景 reduced-motion 块必须存在').toBeTruthy()
    expect(rm, '网格静止必须选中纹理层').toContain(
      '.juya-scene-grid.juya-scene-grid-persp::after'
    )
  })
})

describe('synthwave 暗侧调色板守卫（2026-10-22，#34 review）', () => {
  /** 蒸汽梦核式段（段头 → 下一段「暗夜精修式」段头）：调色板规则必须落在此区间，
   *  否则「只改 synthwave」只是选择器上的字面承诺。 */
  const synthSection = (): string => css.slice(css.indexOf('蒸汽梦核式'), css.indexOf('暗夜精修式'))

  /** 变体块内某 token 的完整右值 */
  const tok = (block: string, name: string): string =>
    block.match(new RegExp(`${name}:\\s*([^;}]+)`))?.[1]?.trim() ?? ''

  /** `rgba(r, g, b, a)` / `rgb(r, g, b)` → `{ rgb, alpha }` */
  const rgba = (value: string): { rgb: number; alpha: number } => {
    const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
    if (!m) throw new Error(`不是 rgb()/rgba() 字面量：${value}`)
    return {
      rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
      alpha: m[4] === undefined ? 1 : Number(m[4])
    }
  }

  /** 段内首条匹配 opener 的规则块 */
  const synthRule = (opener: RegExp): string => extractBlock(synthSection(), opener)

  it('① 暗侧 token 与 SPEC「卡片与文字」逐项对齐（梦核紫残留清零）', () => {
    const block = variantBlock('synthwave-dark')
    expect(block, '暗侧变体块必须存在').not.toBe('')
    expect(tok(block, '--jy-heading'), '标题').toBe('#ffe6ff')
    expect(tok(block, '--jy-text'), '正文').toBe('#f0dcff')
    expect(tok(block, '--jy-muted'), '次要文字（#39 上调值，4.72 仍成立）').toBe('#c9b7e0')
    expect(tok(block, '--jy-accent'), '强调色').toBe('#ff2d95')
    expect(tok(block, '--jy-on-accent'), 'accent 上文字').toBe('#1a0010')
    expect(tok(block, '--jy-link'), '链接').toBe('#ff8ad0')
    expect(tok(block, '--jy-lead-bg'), '导语底色 = accent 12%').toBe('rgba(255, 45, 149, 0.12)')
    expect(tok(block, '--jy-radius')).toBe('16px')
    expect(tok(block, '--jy-bg')).toBe('#0b0918')
    const card = rgba(tok(block, '--jy-card'))
    expect(card.rgb, '卡面底色（#39 定值，不动）').toBe(0x140826)
    expect(card.alpha).toBe(0.62)
    // 边框与导语底色必须与 accent 同色相：换个紫就会立刻和新调色板异色
    const accent = tokenHex(block, '--jy-accent')
    expect(rgba(tok(block, '--jy-border')).rgb, '边框与 accent 同色相').toBe(accent)
    expect(rgba(tok(block, '--jy-border')).alpha, '边框 1px 半透明').toBe(0.32)
    expect(rgba(tok(block, '--jy-lead-bg')).rgb, '导语底色与 accent 同色相').toBe(accent)
  })

  it('② 焦点色刻意未随迁移改动（SPEC 未规定，属待裁决的设计决策）', () => {
    // 锁死「不要顺手改」：改它需要单独裁决，不属于本轮 review 修复
    expect(tok(variantBlock('synthwave-dark'), '--jy-focus')).toBe('#b89aff')
    expect(tok(variantBlock('synthwave-light'), '--jy-focus')).toBe('#7c4dff')
  })

  it('③ 段内不再有梦核紫字面值（外发光 / 边框 / 链接一起迁移）', () => {
    const section = synthSection()
    for (const purple of [
      '#8f63ff',
      '#c3a9ff',
      '#e6dcff',
      'rgba(124, 92, 255',
      'rgba(158, 132, 255',
      'rgba(143, 99, 255'
    ]) {
      expect(section, `段内不得残留 ${purple}`).not.toContain(purple)
    }
  })

  it('④ 三处外发光字面色为品红，悬停只加深（0.12 → 0.28）', () => {
    // 取色来源：暗侧 --jy-accent #ff2d95（亮侧 #e0006e 同色相）；两条共享规则故字面值统一
    const cards = synthRule(/(?:^|\n)\.jysynth \.juya-entry,/)
    expect(decl(cards, 'box-shadow')).toBe('0 0 18px rgba(255, 45, 149, 0.12)')
    const feedItem = synthRule(/(?:^|\n)\.jysynth \.juya-feed-item \{/)
    expect(decl(feedItem, 'box-shadow')).toBe('0 0 14px rgba(255, 45, 149, 0.12)')
    const hover = synthRule(/(?:^|\n)\.jysynth \.juya-feed-item:hover \{/)
    const shadow = rgba(decl(hover, 'box-shadow').replace(/^0 0 22px\s+/, ''))
    expect(shadow.rgb, '悬停发光与常态同色相').toBe(0xff2d95)
    expect(shadow.alpha, '悬停加深').toBe(0.28)
  })

  it('⑤ 悬停补上「边框亮度」：border-color 走分变体 token，alpha 由 .32/.30 提到 .55', () => {
    const hover = synthRule(/(?:^|\n)\.jysynth \.juya-feed-item:hover \{/)
    expect(decl(hover, 'transform'), '仍不上浮').toBe('none')
    expect(decl(hover, 'border-color'), '边框提亮走 token，不写死字面色').toBe(
      'var(--jy-border-hover)'
    )
    for (const [variant, accent, base] of [
      ['synthwave-dark', 0xff2d95, 0.32],
      ['synthwave-light', 0xe0006e, 0.3]
    ] as const) {
      const block = variantBlock(variant)
      const normal = rgba(tok(block, '--jy-border'))
      const hoverB = rgba(tok(block, '--jy-border-hover'))
      expect(normal.rgb, `${variant} 常态边框与 accent 同色相`).toBe(accent)
      expect(normal.alpha, `${variant} 常态边框 alpha`).toBe(base)
      expect(hoverB.rgb, `${variant} 悬停边框同色相`).toBe(accent)
      expect(hoverB.alpha, `${variant} 悬停边框提亮`).toBe(0.55)
      expect(hoverB.alpha, `${variant} 悬停只提亮，不得反向变淡`).toBeGreaterThan(normal.alpha)
    }
  })

  it('⑥ 落日三色（#ffe14d → #ff9a3c → #ff2d95）：中段色站补在共享径向渐变里', () => {
    const sun = extractBlock(css, /(?:^|\n)\.juya-scene-sun \{/)
    expect(sun, '落日规则必须存在').not.toBe('')
    const bg = decl(sun, 'background').replace(/\s+/g, ' ')
    expect(bg, '三站按黄 → 橙 → 品红排列').toContain(
      'var(--jy-scene-sun-1) 0%, var(--jy-scene-sun-mid) 34%, var(--jy-scene-sun-2) 62%'
    )
    // 两侧 token 与 SPEC 色带一致；中段亮暗同值（日间版只把最高光调亮）
    expect(tok(variantBlock('synthwave-dark'), '--jy-scene-sun-1')).toBe('#ffe14d')
    expect(tok(variantBlock('synthwave-dark'), '--jy-scene-sun-mid')).toBe('#ff9a3c')
    expect(tok(variantBlock('synthwave-dark'), '--jy-scene-sun-2')).toBe('#ff2d95')
    expect(tok(variantBlock('synthwave-light'), '--jy-scene-sun-mid')).toBe('#ff9a3c')
    // 中段必须落在两侧停靠点之间，否则橙带会被前/后一站盖掉
    const at = (token: string): number => bg.indexOf(token)
    expect(at('var(--jy-scene-sun-1)'), '首站存在').toBeGreaterThanOrEqual(0)
    expect(at('var(--jy-scene-sun-mid)')).toBeGreaterThan(at('var(--jy-scene-sun-1)'))
    expect(at('var(--jy-scene-sun-2)')).toBeGreaterThan(at('var(--jy-scene-sun-mid)'))
  })

  it('⑦ 滚动条 thumb 与 accent 同步：暗侧 #ff2d95，对 #0b0918 ≥ 3', () => {
    const rule = extractBlock(
      css,
      /(?:^|\n)\.view-scroll:has\(\[data-juya-variant='synthwave-dark'\]\)::-webkit-scrollbar-thumb \{/
    )
    expect(rule, '暗侧 thumb 规则必须存在').not.toBe('')
    expect(decl(rule, 'background'), 'thumb 取 accent 字面色').toBe('#ff2d95')
    const ratio = contrast(0xff2d95, 0x0b0918)
    expect(ratio, 'thumb 对滚动槽底（暗紫夜）须 ≥ 3').toBeGreaterThanOrEqual(3)
    expect(ratio, '实算 5.68').toBeCloseTo(5.68, 2)
  })

  it('⑧ 实算：accent 上的文字 ≥ 4.5，标题/正文/次要文字在最不利合成底上 ≥ 4.5', () => {
    const block = variantBlock('synthwave-dark')
    expect(
      contrast(tokenHex(block, '--jy-on-accent'), tokenHex(block, '--jy-accent')),
      'accent 上的文字（on-accent）'
    ).toBeGreaterThanOrEqual(4.5)
    // 最不利合成底：0.62 卡面压落日峰 #ff9a3c → #6d3f2e（模块级 alphaOver 合成原语）
    const card = rgba(tok(block, '--jy-card'))
    const base = alphaOver(card.rgb, card.alpha, 0xff9a3c)
    for (const name of ['--jy-heading', '--jy-text', '--jy-muted']) {
      expect(contrast(tokenHex(block, name), base), `${name} / 最不利合成底`).toBeGreaterThanOrEqual(
        4.5
      )
    }
  })
})
