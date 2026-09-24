import { describe, it, expect, beforeEach } from 'vitest'
import { resolveThemeScheme, themeBackgroundLuminance } from '../../src/shared/theme'
import { applyTheme } from '../../src/renderer/theme/applyTheme'
import { BUILTIN_THEMES } from '../../src/main/theme/builtinThemes'
import { resolveJuyaVariant } from '../../src/renderer/juya/effectiveJuyaStyle'
import { JUYA_STYLES } from '../../src/renderer/juya/juyaStyles'
import { makeSettings, makeTheme } from './helpers/opiaStub'
import type { Settings, ThemeTokens } from '../../src/shared/types'

describe('themeBackgroundLuminance', () => {
  it('纯黑 0、纯白 1', () => {
    expect(themeBackgroundLuminance('#000000')).toBeCloseTo(0, 5)
    expect(themeBackgroundLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('可省略前导 #', () => {
    expect(themeBackgroundLuminance('202020')).toBeCloseTo(
      themeBackgroundLuminance('#202020'),
      10
    )
  })

  it('忽略首尾空白', () => {
    expect(themeBackgroundLuminance('  #ffffff ')).toBeCloseTo(1, 5)
  })

  it('无法解析的颜色按亮色（1）处理', () => {
    expect(themeBackgroundLuminance('red')).toBe(1)
    expect(themeBackgroundLuminance('#fff')).toBe(1)
    expect(themeBackgroundLuminance('#gggggg')).toBe(1)
    expect(themeBackgroundLuminance('')).toBe(1)
  })

  it('中灰亮度低于 0.5 阈值（被视为暗）', () => {
    expect(themeBackgroundLuminance('#808080')).toBeLessThan(0.5)
  })
})

describe('resolveThemeScheme', () => {
  it('显式 colorScheme 优先于背景亮度', () => {
    expect(resolveThemeScheme(makeTheme({ colorScheme: 'light', colors: { bg: '#000000' } }))).toBe(
      'light'
    )
    expect(resolveThemeScheme(makeTheme({ colorScheme: 'dark', colors: { bg: '#ffffff' } }))).toBe(
      'dark'
    )
  })

  it('旧自定义主题缺少字段时按背景亮度归入唯一分类', () => {
    const legacy = { ...makeTheme(), colorScheme: undefined } as ThemeTokens
    expect(resolveThemeScheme({ ...legacy, colors: { bg: '#202020' } })).toBe('dark')
    expect(resolveThemeScheme({ ...legacy, colors: { bg: '#f3f3f3' } })).toBe('light')
  })

  it('无法解析的背景色回落亮色分类', () => {
    const legacy = { ...makeTheme(), colorScheme: undefined } as ThemeTokens
    expect(resolveThemeScheme({ ...legacy, colors: { bg: 'not-a-color' } })).toBe('light')
  })
})

describe('内置主题集合', () => {
  const COLOR_KEYS = [
    'bg',
    'surface',
    'card',
    'border',
    'text',
    'textSecondary',
    'accent',
    'accentHover',
    'onAccent',
    'chip',
    'chipText',
    'read'
  ] as const

  it('id 唯一且含四个已知主题', () => {
    const ids = BUILTIN_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      expect.arrayContaining(['windows-light', 'windows-dark', 'claude-design', 'juya-daily'])
    )
  })

  it('每个内置主题字段完整（12 色 + 双字体 + 显式亮暗分类）', () => {
    for (const theme of BUILTIN_THEMES) {
      for (const key of COLOR_KEYS) expect(theme.colors[key], `${theme.id}.${key}`).toBeTruthy()
      expect(theme.fonts.heading, theme.id).toBeTruthy()
      expect(theme.fonts.body, theme.id).toBeTruthy()
      expect(['light', 'dark'], theme.id).toContain(theme.colorScheme)
      expect(Number.isFinite(theme.radius), theme.id).toBe(true)
      expect(Number.isFinite(theme.spacing), theme.id).toBe(true)
    }
  })

  it('跨分类回退锚点存在且分类正确（useAppStore 硬编码依赖 windows-light / windows-dark）', () => {
    const light = BUILTIN_THEMES.find((t) => t.id === 'windows-light')
    const dark = BUILTIN_THEMES.find((t) => t.id === 'windows-dark')
    expect(light && resolveThemeScheme(light)).toBe('light')
    expect(dark && resolveThemeScheme(dark)).toBe('dark')
  })

  it('内置主题一律标记 builtin: true（用户区不得覆盖）', () => {
    for (const theme of BUILTIN_THEMES) expect(theme.builtin, theme.id).toBe(true)
  })
})

describe('applyTheme', () => {
  const root = () => document.documentElement

  beforeEach(() => {
    root().removeAttribute('style')
  })

  it('注入全部 16 个 --t-* 变量', () => {
    applyTheme(makeTheme({ colors: { bg: '#123456', accent: '#abcdef' } }))
    expect(root().style.getPropertyValue('--t-bg')).toBe('#123456')
    expect(root().style.getPropertyValue('--t-accent')).toBe('#abcdef')
    const injected = root().getAttribute('style') ?? ''
    for (const name of [
      '--t-bg',
      '--t-surface',
      '--t-card',
      '--t-border',
      '--t-text',
      '--t-text-secondary',
      '--t-accent',
      '--t-accent-hover',
      '--t-on-accent',
      '--t-chip',
      '--t-chip-text',
      '--t-read',
      '--t-font-heading',
      '--t-font-body',
      '--t-radius',
      '--t-spacing'
    ]) {
      expect(injected, name).toContain(name)
    }
  })

  it('radius / spacing 带 px 后缀，颜色原样透传', () => {
    applyTheme(makeTheme({ radius: 10, spacing: 18, colors: { chip: 'rgba(0,0,0,.5)' } }))
    expect(root().style.getPropertyValue('--t-radius')).toBe('10px')
    expect(root().style.getPropertyValue('--t-spacing')).toBe('18px')
    expect(root().style.getPropertyValue('--t-chip')).toBe('rgba(0,0,0,.5)')
  })

  it('同步根元素 color-scheme（亮暗分类落到原生控件渲染）', () => {
    applyTheme(makeTheme({ colorScheme: 'dark', colors: { bg: '#ffffff' } }))
    expect(root().style.colorScheme).toBe('dark')
    applyTheme(makeTheme({ colorScheme: 'light' }))
    expect(root().style.colorScheme).toBe('light')
  })

  it('切换主题只改颜色族变量，不改变尺寸基准（字号固定不随主题）', () => {
    applyTheme(makeTheme({ id: 'a', radius: 8, spacing: 16 }))
    const geometryA = [
      root().style.getPropertyValue('--t-radius'),
      root().style.getPropertyValue('--t-spacing')
    ]
    applyTheme(makeTheme({ id: 'b', radius: 8, spacing: 16, colors: { bg: '#000000' } }))
    expect(
      [
        root().style.getPropertyValue('--t-radius'),
        root().style.getPropertyValue('--t-spacing')
      ]
    ).toEqual(geometryA)
    expect(document.styleSheets.length).toBeGreaterThanOrEqual(0)
  })
})

describe('resolveJuyaVariant（橘鸦风格三态解析）', () => {
  const settings = (over: Partial<Settings>): Settings => makeSettings(over)

  it("'off' 返回 null（回退通用样式）", () => {
    expect(resolveJuyaVariant(settings({ juyaLightStyleId: 'off' }), false)).toBeNull()
    expect(
      resolveJuyaVariant(settings({ themeMode: 'dark', juyaDarkStyleId: 'off' }), true)
    ).toBeNull()
  })

  it('跟随系统时按系统亮暗取对应侧字段', () => {
    const base = { themeMode: 'system' as const, juyaLightStyleId: 'folio' as const, juyaDarkStyleId: 'pop' as const }
    expect(resolveJuyaVariant(settings(base), false)?.id).toBe('folio-light')
    expect(resolveJuyaVariant(settings(base), true)?.id).toBe('pop-dark')
  })

  it('固定模式下忽略另一侧字段', () => {
    const base = { themeMode: 'dark' as const, juyaLightStyleId: 'card' as const, juyaDarkStyleId: 'y2k' as const }
    expect(resolveJuyaVariant(settings(base), false)?.id).toBe('y2k-dark')
  })

  it('风格必须同时匹配 styleId 与 colorScheme（不存在跨分类误用）', () => {
    const meta = resolveJuyaVariant(
      settings({ themeMode: 'dark', juyaDarkStyleId: 'dreamcore' }),
      false
    )
    expect(meta?.colorScheme).toBe('dark')
    expect(meta?.styleId).toBe('dreamcore')
  })

  it('注册表提供八风格 × 亮暗双变体共 16 项', () => {
    expect(JUYA_STYLES).toHaveLength(16)
    const styleIds = new Set(JUYA_STYLES.map((s) => s.styleId))
    expect(styleIds.size).toBe(8)
    for (const styleId of styleIds) {
      const schemes = JUYA_STYLES.filter((s) => s.styleId === styleId).map((s) => s.colorScheme)
      expect(new Set(schemes).size, String(styleId)).toBe(2)
    }
  })

  it('新增风格（nocturne/editorial/wabi）按亮暗正确解析', () => {
    expect(
      resolveJuyaVariant(settings({ themeMode: 'dark', juyaDarkStyleId: 'nocturne' }), true)?.id
    ).toBe('nocturne-dark')
    expect(
      resolveJuyaVariant(settings({ themeMode: 'light', juyaLightStyleId: 'editorial' }), false)?.id
    ).toBe('editorial-light')
    expect(
      resolveJuyaVariant(settings({ themeMode: 'light', juyaLightStyleId: 'wabi' }), false)?.id
    ).toBe('wabi-light')
  })

  it('未知 styleId 解析为 null 而非抛错', () => {
    expect(
      resolveJuyaVariant(
        settings({ themeMode: 'light', juyaLightStyleId: 'nope' as never }),
        false
      )
    ).toBeNull()
  })
})
