import Store from 'electron-store'
import {
  DEFAULT_JUYA_DARK,
  DEFAULT_JUYA_LIGHT,
  DEFAULT_SETTINGS,
  DEFAULT_SOURCE,
  JUYA_STYLE_IDS,
  type Article,
  type FeedSource,
  type HistoryEntry,
  type JuyaStyleId,
  type SavedSession,
  type Settings
} from '../../shared/types'
import { resolveThemeScheme } from '../../shared/theme'
import type { ThemeTokens } from '../../shared/types'

/** 清洗单个橘鸦风格 id：持久化数据可能残留已移除的 'card' 等旧值（旧数据未经类型校验）。 */
function cleanJuyaStyleId(value: unknown, fallback: JuyaStyleId): JuyaStyleId {
  return typeof value === 'string' && (JUYA_STYLE_IDS as readonly string[]).includes(value)
    ? (value as JuyaStyleId)
    : fallback
}

interface StoreShape {
  settings: Settings
  sources: FeedSource[]
  history: Record<string, HistoryEntry>
  /** 文章元数据快照缓存，key 为 guid */
  articleCache: Record<string, Article & { cachedAt: string }>
  /** 上次标签会话（启动时打开=lastSession 时恢复） */
  session: SavedSession | null
}

export class StoreService {
  private store: Store<StoreShape>

  constructor() {
    this.store = new Store<StoreShape>({
      name: 'opia-data',
      defaults: {
        settings: DEFAULT_SETTINGS,
        sources: [DEFAULT_SOURCE],
        history: {},
        articleCache: {},
        session: null
      }
    })
  }

  getSettings(): Settings {
    // 与默认值合并：保证旧数据缺少新增字段（如 externalLinkBehavior）时回退到默认值
    const saved = this.store.get('settings')
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      layout: {
        ...DEFAULT_SETTINGS.layout,
        ...saved?.layout,
        fields: { ...DEFAULT_SETTINGS.layout.fields, ...saved?.layout?.fields }
      },
      shortcuts: {
        ...DEFAULT_SETTINGS.shortcuts,
        ...saved?.shortcuts
      },
      // 清洗橘鸦风格：'card' 已于 2026-09-24 重设计中移除，旧值回退该侧默认（即时生效，不依赖写盘）
      juyaLightStyleId: cleanJuyaStyleId(saved?.juyaLightStyleId, DEFAULT_JUYA_LIGHT),
      juyaDarkStyleId: cleanJuyaStyleId(saved?.juyaDarkStyleId, DEFAULT_JUYA_DARK)
    }
  }

  /** v0.1.x 单主题设置迁移：保持当前外观，并为另一分类填入同分类内置回退。 */
  migrateThemeSettings(themes: ThemeTokens[]): void {
    const saved = this.store.get('settings') as Settings & {
      activeThemeId?: string
      themeMode?: Settings['themeMode']
      lightThemeId?: string
      darkThemeId?: string
    }
    if (saved.themeMode && saved.lightThemeId && saved.darkThemeId) return

    const legacy = themes.find((theme) => theme.id === saved.activeThemeId)
    const scheme = legacy ? resolveThemeScheme(legacy) : 'light'
    const next: Settings = {
      ...this.getSettings(),
      themeMode: scheme,
      lightThemeId: scheme === 'light' && legacy ? legacy.id : 'windows-light',
      darkThemeId: scheme === 'dark' && legacy ? legacy.id : 'windows-dark'
    }
    delete next.activeThemeId
    this.store.set('settings', next)
  }

  /** 橘鸦风格移除迁移（仿 migrateThemeSettings）：持久层残留非法值时写回清洗结果。 */
  migrateJuyaStyleSettings(): void {
    const saved = this.store.get('settings')
    const cleanLight = cleanJuyaStyleId(saved?.juyaLightStyleId, DEFAULT_JUYA_LIGHT)
    const cleanDark = cleanJuyaStyleId(saved?.juyaDarkStyleId, DEFAULT_JUYA_DARK)
    if (cleanLight === saved?.juyaLightStyleId && cleanDark === saved?.juyaDarkStyleId) return
    const next = { ...this.getSettings(), juyaLightStyleId: cleanLight, juyaDarkStyleId: cleanDark }
    this.store.set('settings', next)
  }

  setSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.getSettings(), ...patch }
    delete next.activeThemeId
    this.store.set('settings', next)
    return next
  }

  getSources(): FeedSource[] {
    return this.store.get('sources')
  }

  setSources(sources: FeedSource[]): void {
    this.store.set('sources', sources)
  }

  getSession(): SavedSession | null {
    return this.store.get('session') ?? null
  }

  setSession(session: SavedSession | null): void {
    this.store.set('session', session)
  }

  getHistory(): Record<string, HistoryEntry> {
    return this.store.get('history')
  }

  markRead(guid: string): void {
    const history = this.store.get('history')
    history[guid] = { ...history[guid], guid, read: true, favorite: history[guid]?.favorite ?? false, readAt: new Date().toISOString() }
    this.store.set('history', history)
  }

  toggleFavorite(guid: string): boolean {
    const history = this.store.get('history')
    const prev = history[guid]
    const next = {
      guid,
      read: prev?.read ?? false,
      readAt: prev?.readAt ?? null,
      favorite: !(prev?.favorite ?? false)
    }
    history[guid] = next
    this.store.set('history', history)
    return next.favorite
  }

  cacheArticles(sourceId: string, articles: Article[]): void {
    const cache = this.store.get('articleCache')
    const now = new Date().toISOString()
    for (const a of articles) {
      cache[a.guid] = { ...a, sourceId, cachedAt: now }
    }
    this.store.set('articleCache', cache)
  }

  getCachedArticles(sourceId?: string): Article[] {
    const cache = this.store.get('articleCache')
    return Object.values(cache)
      .filter((a) => !sourceId || a.sourceId === sourceId)
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .map(({ cachedAt: _cachedAt, ...rest }) => rest)
  }

  /** 清理超出保留期的历史与缓存 */
  prune(retentionDays: number): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000

    const history = this.store.get('history')
    for (const [guid, entry] of Object.entries(history)) {
      const t = entry.readAt ? new Date(entry.readAt).getTime() : 0
      if (!entry.favorite && t < cutoff) delete history[guid]
    }
    this.store.set('history', history)

    const cache = this.store.get('articleCache')
    for (const [guid, article] of Object.entries(cache)) {
      if (new Date(article.pubDate).getTime() < cutoff && !history[guid]?.favorite) {
        delete cache[guid]
      }
    }
    this.store.set('articleCache', cache)
  }
}
