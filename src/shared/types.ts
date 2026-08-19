export interface FeedSource {
  id: string
  name: string
  url: string
  enabled: boolean
  providerId: string
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

export interface Settings {
  clickBehavior: 'reader' | 'browser'
  refreshIntervalMin: number
  historyRetentionDays: number
  activeThemeId: string
  layout: LayoutConfig
  miniSize: { w: number; h: number }
}

export interface ThemeTokens {
  id: string
  name: string
  builtin?: boolean
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
    sizeBase: number
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
  refreshIntervalMin: 30,
  historyRetentionDays: 30,
  activeThemeId: 'windows-light',
  layout: {
    preset: 'grid',
    gridColumns: 2,
    fields: { cover: true, summary: true, pubDate: true, source: true }
  },
  miniSize: { w: 360, h: 480 }
}

export const DEFAULT_SOURCE: FeedSource = {
  id: 'juya-daily',
  name: '橘鸦AI早报',
  url: 'https://daily.juya.uk/rss.xml',
  enabled: true,
  providerId: 'builtin-rss'
}
