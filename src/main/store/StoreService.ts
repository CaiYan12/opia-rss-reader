import Store from 'electron-store'
import {
  DEFAULT_SETTINGS,
  DEFAULT_SOURCE,
  type Article,
  type FeedSource,
  type HistoryEntry,
  type Settings
} from '../../shared/types'

interface StoreShape {
  settings: Settings
  sources: FeedSource[]
  history: Record<string, HistoryEntry>
  /** 文章元数据快照缓存，key 为 guid */
  articleCache: Record<string, Article & { cachedAt: string }>
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
        articleCache: {}
      }
    })
  }

  getSettings(): Settings {
    return this.store.get('settings')
  }

  setSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.getSettings(), ...patch }
    this.store.set('settings', next)
    return next
  }

  getSources(): FeedSource[] {
    return this.store.get('sources')
  }

  setSources(sources: FeedSource[]): void {
    this.store.set('sources', sources)
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
