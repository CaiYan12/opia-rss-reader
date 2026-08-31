/**
 * 示例插件：主题（Theme 注册点）
 *
 * 插件主题会被合并进 ThemeService 的列表，在「设置 → 主题」中与内置主题一起出现，
 * 并可被亮/暗两个分类各自选用；渲染层经 applyTheme 落到 --t-* CSS 变量。
 *
 * 必须掌握的四个事实（详见 docs/PLUGIN_API.md）：
 * 1. manifest.provides 必须含 "theme"，否则本文件的 themes 不生效（能力由声明门控）。
 * 2. 字段必须完整：colors 的 12 个键一个不能少，fonts.heading / fonts.body 必填；
 *    校验不过的插件主题会被调用方跳过，不进入列表。
 * 3. colorScheme 决定它出现在亮色区还是暗色区，选错区就选不到；缺省时按背景亮度推导。
 * 4. id 撞车时优先级为 内置 > 插件 > 用户，与内置同 id 等于白写；请带自己的前缀。
 *
 * 注意：颜色值会被直接写进 CSS 自定义属性，核心不做净化 —— 只填合法颜色字面量。
 */

const COLORS_12 = [
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
]

function theme(id, name, colorScheme, colors) {
  const missing = COLORS_12.filter((key) => !colors[key])
  if (missing.length) throw new Error(`example-theme: ${id} 缺少颜色键 ${missing.join(', ')}`)
  return {
    id,
    name,
    colorScheme,
    colors,
    fonts: {
      heading: '"LXGW WenKai", "Microsoft YaHei", serif',
      body: '"LXGW WenKai", "Microsoft YaHei", sans-serif'
    },
    radius: 10,
    spacing: 16
  }
}

module.exports = {
  manifest: { id: 'example-theme', name: '示例主题插件', version: '0.1.0' },
  themes: [
    theme('example-forest-light', '示例·晨林（亮）', 'light', {
      bg: '#f2f5ef',
      surface: '#ffffff',
      card: '#ffffff',
      border: '#d8e0d2',
      text: '#1f2a22',
      textSecondary: '#5c6b5f',
      accent: '#2f7d4f',
      accentHover: '#256640',
      onAccent: '#ffffff',
      chip: '#e2ecdf',
      chipText: '#2f4a37',
      read: '#8a9a8d'
    }),
    theme('example-forest-dark', '示例·夜林（暗）', 'dark', {
      bg: '#141a16',
      surface: '#1b231d',
      card: '#202a24',
      border: '#2f3b33',
      text: '#e6ece7',
      textSecondary: '#9fb0a4',
      accent: '#5fc083',
      accentHover: '#7ad09a',
      onAccent: '#0d130f',
      chip: '#26302a',
      chipText: '#c7d6ca',
      read: '#6b7c70'
    })
  ],
  // cardRenderers 在 v1 只登记元数据、没有渲染路径，本示例刻意不演示（见 docs/PLUGIN_API.md）
  cardRenderers: []
}
