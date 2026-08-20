export interface FeedSource {
  id: string
  name: string
  url: string
  enabled: boolean
  providerId: string
  /** 默认订阅标记：全列表有且仅有一个 true（不变量由 StoreService/FeedService 维护） */
  isDefault?: boolean
}

export interface Article {
  guid: string
  sourceId: string
  title: string
  link: string
  pubDate: string
  summary: string
  contentHtml: string
  coverUrl: string | null
}

export interface HistoryEntry {
  guid: string
  read: boolean
  favorite: boolean
  readAt: string | null
}

export interface LayoutConfig {
  preset: 'compact' | 'grid' | 'magazine'
  gridColumns: 1 | 2 | 3 | 4
  fields: {
    cover: boolean
    summary: boolean
    pubDate: boolean
    source: boolean
  }
}

export interface ShortcutConfig {
  closeTab: string
  nextTab: string
  prevTab: string
  /** 内容区缩放：与滚轮配合的修饰键组合（如 "Ctrl"、"Ctrl+Shift"） */
  zoomWheel: string
}

export interface Settings {
  clickBehavior: 'reader' | 'browser'
  /** 外链打开方式：system=系统默认浏览器；builtin=应用内浏览器标签页 */
  externalLinkBehavior: 'system' | 'builtin'
  /** 主页内容：defaultSource=多源首页（初始选中默认订阅）；blank=空页面引导页 */
  homeContent: 'defaultSource' | 'blank'
  /** 启动时打开：home=仅主页；blank=空页面；lastSession=上一次标签会话 */
  startupOpen: 'home' | 'blank' | 'lastSession'
  /** 标签快捷键（组合串，如 "Ctrl+W"） */
  shortcuts: ShortcutConfig
  refreshIntervalMin: number
  historyRetentionDays: number
  /** 外观模式：跟随系统、固定亮色或固定暗色。 */
  themeMode: 'system' | 'light' | 'dark'
  /** 两个分类各自记忆主题，选择器不得跨分类使用。 */
  lightThemeId: string
  darkThemeId: string
  /** 旧版本迁移字段；新逻辑不再读取或写入。 */
  activeThemeId?: string
  layout: LayoutConfig
  miniSize: { w: number; h: number }
  /** 内容区缩放系数（1 = 100%），持久化 */
  uiZoom: number
}

/** 持久化的标签会话（reader 存 guid，重启后从文章缓存解析） */
export interface SavedSession {
  tabs: Array<
    | { kind: 'home'; homePage: 'feed' | 'blank' }
    | { kind: 'reader'; guid: string }
    | { kind: 'browser'; url: string; title?: string }
    | { kind: 'settings' }
  >
  activeTabIndex: number
}

export interface ThemeTokens {
  id: string
  name: string
  builtin?: boolean
  /** 亮/暗分类（用于 CSS color-scheme 与未来的亮暗主题区分）。
   *  可选：旧自定义主题 JSON 无此字段时，applyTheme 按背景色亮度推导。 */
  colorScheme?: 'light' | 'dark'
  colors: {
    bg: string
    surface: string
    card: string
    border: string
    text: string
    textSecondary: string
    accent: string
    accentHover: string
    onAccent: string
    chip: string
    chipText: string
    read: string
  }
  fonts: {
    heading: string
    body: string
  }
  radius: number
  spacing: number
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  main: string
  provides: Array<'feed-provider' | 'theme' | 'card-renderer'>
}

export const DEFAULT_SETTINGS: Settings = {
  clickBehavior: 'reader',
  externalLinkBehavior: 'system',
  homeContent: 'defaultSource',
  startupOpen: 'home',
  shortcuts: { closeTab: 'Ctrl+W', nextTab: 'Ctrl+Tab', prevTab: 'Ctrl+Shift+Tab', zoomWheel: 'Ctrl' },
  refreshIntervalMin: 30,
  historyRetentionDays: 30,
  themeMode: 'light',
  lightThemeId: 'windows-light',
  darkThemeId: 'windows-dark',
  layout: {
    preset: 'grid',
    gridColumns: 2,
    fields: { cover: true, summary: true, pubDate: true, source: true }
  },
  miniSize: { w: 360, h: 480 },
  uiZoom: 1
}

export const DEFAULT_SOURCE: FeedSource = {
  id: 'juya-daily',
  name: '橘鸦AI早报',
  url: 'https://daily.juya.uk/rss.xml',
  enabled: true,
  providerId: 'builtin-rss',
  isDefault: true
}
