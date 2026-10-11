import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// juya.css 静态守卫（与 ipcContract 静态守卫同思路，不渲染、纯文本断言）：
// 1) 变体覆盖必须写成复合选择器（[data-juya-variant='x'].jyY…）。
//    空格后代形式要求风格类是 variant 元素的后代，而两者恒挂同一根元素，
//    规则永不匹配（曾致 folio-dark / y2k-dark / nocturne-light 覆盖整体失效的死代码）。
// 2) folio 亮/暗变体的 muted 文本对其出现的两种底色（bg / lead-bg）须达 WCAG AA（≥4.5）。

const css = readFileSync(join(process.cwd(), 'src/renderer/juya/juya.css'), 'utf-8')

describe('juya.css 静态守卫', () => {
  it('变体覆盖不得使用「变体前缀 + 空格 + 风格类」的死形态', () => {
    const dead = css.match(/\[data-juya-variant='[^']+'\]\s+\.jy[\w-]*/g) ?? []
    expect(dead).toEqual([])
  })

  it('folio 亮/暗 muted 文本对 bg 与 lead-bg 的对比度 ≥ 4.5（WCAG AA）', () => {
    const token = (variant: string, name: string): number => {
      const block = css.match(new RegExp(`\\[data-juya-variant='${variant}'\\]\\s*\\{[^}]*\\}`))?.[0] ?? ''
      const hex = block.match(new RegExp(`${name.replace(/-/g, '\\-')}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? ''
      return Number.parseInt(hex.slice(1), 16)
    }
    const lum = (rgb: number): number => {
      const channels = [rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff].map((c) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }
    const contrast = (a: number, b: number): number => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (l1 + 0.05) / (l2 + 0.05)
    }
    for (const variant of ['folio-light', 'folio-dark']) {
      const muted = token(variant, '--jy-muted')
      const bg = token(variant, '--jy-bg')
      const leadBg = token(variant, '--jy-lead-bg')
      expect(muted, `${variant} --jy-muted 应为 6 位 hex`).not.toBeNaN()
      expect(bg, `${variant} --jy-bg 应为 6 位 hex`).not.toBeNaN()
      expect(leadBg, `${variant} --jy-lead-bg 应为 6 位 hex`).not.toBeNaN()
      expect(contrast(muted, bg), `${variant} muted/bg`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(muted, leadBg), `${variant} muted/lead-bg`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
