import type { ThemeTokens } from '../../shared/types'

/** 背景色相对亮度（WCAG 简化式，#rgb hex），用于旧主题无 colorScheme 字段时推导亮暗 */
function bgLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 1
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 将主题 token 注入 :root CSS 变量 */
export function applyTheme(t: ThemeTokens): void {
  const root = document.documentElement
  const map: Record<string, string> = {
    '--t-bg': t.colors.bg,
    '--t-surface': t.colors.surface,
    '--t-card': t.colors.card,
    '--t-border': t.colors.border,
    '--t-text': t.colors.text,
    '--t-text-secondary': t.colors.textSecondary,
    '--t-accent': t.colors.accent,
    '--t-accent-hover': t.colors.accentHover,
    '--t-on-accent': t.colors.onAccent,
    '--t-chip': t.colors.chip,
    '--t-chip-text': t.colors.chipText,
    '--t-read': t.colors.read,
    '--t-font-heading': t.fonts.heading,
    '--t-font-body': t.fonts.body,
    '--t-radius': `${t.radius}px`,
    '--t-spacing': `${t.spacing}px`
  }
  for (const [k, v] of Object.entries(map)) {
    root.style.setProperty(k, v)
  }
  // 亮/暗分类：显式字段优先；旧自定义主题 JSON 无此字段时按背景亮度推导（<0.5 视为暗）
  root.style.colorScheme = t.colorScheme ?? (bgLuminance(t.colors.bg) < 0.5 ? 'dark' : 'light')
}
