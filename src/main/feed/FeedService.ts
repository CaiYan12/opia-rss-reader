import type { Article, FeedSource } from '../../shared/types'
import type { FeedProvider } from '../../shared/plugin-api'
import { RssProvider } from './RssProvider'
import type { StoreService } from '../store/StoreService'

export class FeedService {
  private providers = new Map<string, FeedProvider>()
  private refreshTimer: NodeJS.Timeout | null = null
  onUpdated: ((sourceId: string) => void) | null = null

  constructor(private store: StoreService) {
    this.registerProvider(new RssProvider())
  }

  registerProvider(provider: FeedProvider): void {
    this.providers.set(provider.id, provider)
  }

  listProviders(): Array<{ id: string; name: string }> {
    return [...this.providers.values()].map((p) => ({ id: p.id, name: p.name }))
  }

  getSources(): FeedSource[] {
    return this.store.getSources()
  }

  addSource(input: Omit<FeedSource, 'id'>): FeedSource {
    const source: FeedSource = { ...input, id: `src-${Date.now().toString(36)}` }
    this.store.setSources([...this.getSources(), source])
    return source
  }

  removeSource(id: string): void {
    this.store.setSources(this.getSources().filter((s) => s.id !== id))
  }

  /** 设置/取消默认订阅（默认订阅数 ≤ 1）：id 非 null 且存在 → 目标置 true 其余清 false；null → 全部清除 */
  setDefaultSource(id: string | null): FeedSource[] {
    const sources = this.getSources()
    if (id !== null && !sources.some((s) => s.id === id)) return sources
    const next = sources.map((s) => ({ ...s, isDefault: id === null ? false : s.id === id }))
    this.store.setSources(next)
    return next
  }

  toggleSource(id: string, enabled: boolean): void {
    this.store.setSources(this.getSources().map((s) => (s.id === id ? { ...s, enabled } : s)))
  }

  /** 返回缓存文章（按 pubDate 倒序） */
  list(sourceId?: string): Article[] {
    return this.store.getCachedArticles(sourceId)
  }

  /** 抓取并合并进缓存；返回新增条数 */
  async refresh(sourceId?: string): Promise<{ added: number }> {
    const targets = this.getSources().filter(
      (s) => s.enabled && (!sourceId || s.id === sourceId)
    )
    let added = 0

    for (const source of targets) {
      const provider = this.providers.get(source.providerId) ?? this.providers.get('builtin-rss')
      if (!provider || !provider.canHandle(source.url)) {
        console.warn(`[FeedService] no provider for ${source.url}`)
        continue
      }
      try {
        const result = await provider.fetch(source)
        const existing = new Set(this.list(source.id).map((a) => a.guid))
        const fresh = result.articles.map((a) => ({ ...a, sourceId: source.id }))
        this.store.cacheArticles(source.id, fresh)
        added += fresh.filter((a) => !existing.has(a.guid)).length
        this.onUpdated?.(source.id)
      } catch (err) {
        console.error(`[FeedService] refresh failed for ${source.url}:`, err)
      }
    }

    this.store.prune(this.store.getSettings().historyRetentionDays)
    return { added }
  }

  /** 启动定时刷新（分钟）；0 或负数表示关闭 */
  startAutoRefresh(intervalMin: number): void {
    this.stopAutoRefresh()
    if (intervalMin <= 0) return
    this.refreshTimer = setInterval(() => {
      void this.refresh()
    }, intervalMin * 60 * 1000)
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }
}
