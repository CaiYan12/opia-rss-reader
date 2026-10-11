import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

  it('③ 条目标题层级兜底：EntrySplit 嵌套 h3 回到 17px', () => {
    expect(y2kRule('\\.juya-entry h3')).toContain('font-size: 17px')
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
