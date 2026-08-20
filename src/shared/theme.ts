import type { ThemeTokens } from './types'

export type ThemeScheme = 'light' | 'dark'

/** 计算主题背景的相对亮度；无法解析的旧颜色值按亮色处理。 */
export function themeBackgroundLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return 1
  const value = Number.parseInt(match[1], 16)
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 显式分类优先；旧自定义主题缺少字段时按现有背景亮度规则归入唯一分类。 */
export function resolveThemeScheme(theme: ThemeTokens): ThemeScheme {
  return theme.colorScheme ?? (themeBackgroundLuminance(theme.colors.bg) < 0.5 ? 'dark' : 'light')
}
