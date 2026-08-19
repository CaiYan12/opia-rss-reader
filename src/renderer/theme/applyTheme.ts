import type { ThemeTokens } from '../../shared/types'

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
    '--t-font-size-base': `${t.fonts.sizeBase}px`,
    '--t-radius': `${t.radius}px`,
    '--t-spacing': `${t.spacing}px`
  }
  for (const [k, v] of Object.entries(map)) {
    root.style.setProperty(k, v)
  }
}
