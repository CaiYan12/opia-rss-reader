import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FeedService } from '../../src/main/feed/FeedService'
import type { StoreService } from '../../src/main/store/StoreService'
import {
  DEFAULT_SETTINGS,
  DEFAULT_SOURCE,
  JUYA_SOURCE_ID,
  type Article,
  type FeedSource,
  type Settings
} from '../../src/shared/types'
import type { FeedFetchResult, FeedProvider } from '../../src/shared/plugin-api'

/** StoreService 的结构化替身：FeedService 只用这 6 个方法，无需 electron-store。 */
function createFakeStore(initialSources: FeedSource[] = [{ ...DEFAULT_SOURCE }]) {
  const state = {
    sources: initialSources.map((s) => ({ ...s })),
    cache: {} as Record<string, Article>,
    settings: { ...DEFAULT_SETTINGS } as Settings,
    pruneCalls: [] as number[],
    setSourcesCalls: 0
  }
  const store = {
    getSources: () => state.sources.map((s) => ({ ...s })),
    setSources: (sources: FeedSource[]) => {
      state.setSourcesCalls += 1
      state.sources = sources.map((s) => ({ ...s }))
    },
    getCachedArticles: (sourceId?: string) =>
      Object.values(state.cache).filter((a) => !sourceId || a.sourceId === sourceId),
    cacheArticles: (sourceId: string, articles: Article[]) => {
      for (const a of articles) state.cache[a.guid] = { ...a, sourceId }
    },
    getSettings: () => state.settings,
    prune: (days: number) => {
      state.pruneCalls.push(days)
    }
  }
  return { store: store as unknown as StoreService, state }
}

function createFakeProvider(
  id: string,
  opts: {
    canHandle?: (url: string) => boolean
    articles?: Array<Omit<Article, 'sourceId'>>
    error?: Error
  } = {}
) {
  const fetch = vi.fn(async (): Promise<FeedFetchResult> => {
    if (opts.error) throw opts.error
    return { articles: opts.articles ?? [] }
  })
  const provider: FeedProvider = {
    id,
    name: `Fake ${id}`,
    canHandle: opts.canHandle ?? (() => true),
    fetch
  }
  return { provider, fetch }
}

describe('FeedService provider 注册', () => {
  it('构造时内置 builtin-rss provider', () => {
    const { store } = createFakeStore([])
    const feed = new FeedService(store)
    expect(feed.listProviders()).toEqual([
      { id: 'builtin-rss', name: 'RSS 2.0 / Atom' }
    ])
  })

  it('同 id 注册会覆盖（插件可顶替内置 provider）', () => {
    const { store } = createFakeStore([])
    const feed = new FeedService(store)
    const { provider } = createFakeProvider('builtin-rss')
    feed.registerProvider(provider)
    expect(feed.listProviders()).toEqual([{ id: 'builtin-rss', name: 'Fake builtin-rss' }])
  })
})

describe('FeedService 订阅源增删', () => {
  it('addSource 生成 src-* id 并追加，返回新源', () => {
    const { store, state } = createFakeStore([])
    const feed = new FeedService(store)
    const added = feed.addSource({
      name: '新源',
      url: 'https://example.com/rss',
      enabled: true,
      providerId: 'builtin-rss'
    })
    expect(added.id).toMatch(/^src-/)
    expect(state.sources).toHaveLength(1)
    expect(state.sources[0]).toMatchObject({ id: added.id, name: '新源' })
  })

  it('removeSource 移除指定源', () => {
    const { store, state } = createFakeStore([
      makeSrc({ id: 'a' }),
      makeSrc({ id: 'b' })
    ])
    const feed = new FeedService(store)
    feed.removeSource('a')
    expect(state.sources.map((s) => s.id)).toEqual(['b'])
  })

  it('removeSource 对内置橘鸦源静默无效（源锁定）', () => {
    const { store, state } = createFakeStore([
      makeSrc({ id: JUYA_SOURCE_ID }),
      makeSrc({ id: 'b' })
    ])
    const feed = new FeedService(store)
    feed.removeSource(JUYA_SOURCE_ID)
    expect(state.sources.map((s) => s.id)).toEqual([JUYA_SOURCE_ID, 'b'])
    expect(state.setSourcesCalls).toBe(0)
  })

  it('toggleSource 切换 enabled', () => {
    const { store, state } = createFakeStore([makeSrc({ id: 'a' })])
    const feed = new FeedService(store)
    feed.toggleSource('a', false)
    expect(state.sources[0].enabled).toBe(false)
  })

  it('toggleSource 对内置橘鸦源静默无效（源锁定）', () => {
    const { store, state } = createFakeStore([makeSrc({ id: JUYA_SOURCE_ID })])
    const feed = new FeedService(store)
    feed.toggleSource(JUYA_SOURCE_ID, false)
    expect(state.sources[0].enabled).toBe(true)
    expect(state.setSourcesCalls).toBe(0)
  })
})

describe('FeedService.setDefaultSource（默认订阅 ≤ 1 不变量）', () => {
  it('设为指定源：目标 true 其余 false', () => {
    const { store } = createFakeStore([
      makeSrc({ id: 'a', isDefault: true }),
      makeSrc({ id: 'b' }),
      makeSrc({ id: 'c' })
    ])
    const feed = new FeedService(store)
    const next = feed.setDefaultSource('c')
    expect(next.map((s) => s.isDefault)).toEqual([false, false, true])
    expect(next.filter((s) => s.isDefault)).toHaveLength(1)
  })

  it('传 null：全部取消默认（允许 0 个默认订阅）', () => {
    const { store } = createFakeStore([
      makeSrc({ id: 'a', isDefault: true }),
      makeSrc({ id: 'b', isDefault: true })
    ])
    const feed = new FeedService(store)
    const next = feed.setDefaultSource(null)
    expect(next.every((s) => s.isDefault === false)).toBe(true)
  })

  it('未知 id：原样返回且不写盘', () => {
    const { store, state } = createFakeStore([makeSrc({ id: 'a', isDefault: true })])
    const feed = new FeedService(store)
    const next = feed.setDefaultSource('nope')
    expect(next.map((s) => s.id)).toEqual(['a'])
    expect(state.setSourcesCalls).toBe(0)
  })

  it('幂等：重复设置同一源仍保持唯一默认', () => {
    const { store } = createFakeStore([makeSrc({ id: 'a' }), makeSrc({ id: 'b' })])
    const feed = new FeedService(store)
    feed.setDefaultSource('b')
    const next = feed.setDefaultSource('b')
    expect(next.filter((s) => s.isDefault)).toHaveLength(1)
  })
})

describe('FeedService.refresh', () => {
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
    error.mockRestore()
  })

  it('抓取启用源并返回新增条数，文章打上 sourceId', async () => {
    const { store, state } = createFakeStore([makeSrc({ id: 's1' })])
    const feed = new FeedService(store)
    const { provider, fetch } = createFakeProvider('p1', {
      articles: [omitSource(makeArticle('g1')), omitSource(makeArticle('g2'))]
    })
    feed.registerProvider(provider)
    state.sources[0].providerId = 'p1'

    const result = await feed.refresh()
    expect(result).toEqual({ added: 2 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(state.cache.g1.sourceId).toBe('s1')
  })

  it('重复抓取同一批文章：added 为 0（按 guid 去重）', async () => {
    const { store } = createFakeStore([makeSrc({ id: 's1', providerId: 'p1' })])
    const feed = new FeedService(store)
    const { provider } = createFakeProvider('p1', { articles: [omitSource(makeArticle('g1'))] })
    feed.registerProvider(provider)

    expect(await feed.refresh()).toEqual({ added: 1 })
    expect(await feed.refresh()).toEqual({ added: 0 })
  })

  it('跳过停用源；sourceId 参数只刷该源', async () => {
    const { store } = createFakeStore([
      makeSrc({ id: 's1', providerId: 'p1' }),
      makeSrc({ id: 's2', providerId: 'p1', enabled: false }),
      makeSrc({ id: 's3', providerId: 'p1' })
    ])
    const feed = new FeedService(store)
    const { provider, fetch } = createFakeProvider('p1')
    feed.registerProvider(provider)

    await feed.refresh()
    expect(fetch).toHaveBeenCalledTimes(2)

    fetch.mockClear()
    await feed.refresh('s3')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('providerId 未知时回退 builtin-rss', async () => {
    const { store } = createFakeStore([makeSrc({ id: 's1', providerId: 'missing-plugin' })])
    const feed = new FeedService(store)
    const { provider, fetch } = createFakeProvider('builtin-rss')
    feed.registerProvider(provider)

    await feed.refresh()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('canHandle 为 false 时跳过该源并告警，不发起 fetch', async () => {
    const { store } = createFakeStore([makeSrc({ id: 's1', providerId: 'p1' })])
    const feed = new FeedService(store)
    const { provider, fetch } = createFakeProvider('p1', { canHandle: () => false })
    feed.registerProvider(provider)

    const result = await feed.refresh()
    expect(result).toEqual({ added: 0 })
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no provider for'))
  })

  it('单个源抓取抛错不中断其余源', async () => {
    const { store } = createFakeStore([
      makeSrc({ id: 'bad', providerId: 'p-bad' }),
      makeSrc({ id: 'good', providerId: 'p-good' })
    ])
    const feed = new FeedService(store)
    const bad = createFakeProvider('p-bad', { error: new Error('network down') })
    const good = createFakeProvider('p-good', { articles: [omitSource(makeArticle('g1'))] })
    feed.registerProvider(bad.provider)
    feed.registerProvider(good.provider)

    await expect(feed.refresh()).resolves.toEqual({ added: 1 })
    expect(bad.fetch).toHaveBeenCalledTimes(1)
    expect(good.fetch).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('refresh failed for'),
      expect.any(Error)
    )
  })

  it('每个抓取成功的源触发一次 onUpdated；跳过的源不触发', async () => {
    const { store } = createFakeStore([
      makeSrc({ id: 's1', providerId: 'p1' }),
      makeSrc({ id: 's2', providerId: 'p2' })
    ])
    const feed = new FeedService(store)
    feed.registerProvider(createFakeProvider('p1').provider)
    feed.registerProvider(createFakeProvider('p2', { canHandle: () => false }).provider)
    const onUpdated = vi.fn()
    feed.onUpdated = onUpdated

    await feed.refresh()
    expect(onUpdated).toHaveBeenCalledTimes(1)
    expect(onUpdated).toHaveBeenCalledWith('s1')
  })

  it('无论抓取结果如何都按 historyRetentionDays 清理', async () => {
    const { store, state } = createFakeStore([makeSrc({ id: 's1', providerId: 'p1' })])
    state.settings.historyRetentionDays = 7
    const feed = new FeedService(store)
    feed.registerProvider(createFakeProvider('p1', { canHandle: () => false }).provider)

    await feed.refresh()
    expect(state.pruneCalls).toEqual([7])
  })
})

describe('FeedService 定时刷新', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('intervalMin <= 0 关闭定时（不装 timer）', () => {
    const { store } = createFakeStore([])
    const feed = new FeedService(store)
    const refresh = vi.spyOn(feed, 'refresh').mockResolvedValue({ added: 0 })

    feed.startAutoRefresh(0)
    feed.startAutoRefresh(-5)
    vi.advanceTimersByTime(120_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('按间隔触发 refresh', () => {
    const { store } = createFakeStore([])
    const feed = new FeedService(store)
    const refresh = vi.spyOn(feed, 'refresh').mockResolvedValue({ added: 0 })

    feed.startAutoRefresh(1)
    vi.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('重复 start 不叠加 timer（内部先 stop）', () => {
    const { store } = createFakeStore([])
    const feed = new FeedService(store)
    const refresh = vi.spyOn(feed, 'refresh').mockResolvedValue({ added: 0 })

    feed.startAutoRefresh(1)
    feed.startAutoRefresh(1)
    vi.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stopAutoRefresh 后不再触发', () => {
    const { store } = createFakeStore([])
    const feed = new FeedService(store)
    const refresh = vi.spyOn(feed, 'refresh').mockResolvedValue({ added: 0 })

    feed.startAutoRefresh(1)
    feed.stopAutoRefresh()
    vi.advanceTimersByTime(180_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('定时器与窗口无关：stop 幂等可重复调用', () => {
    const { store } = createFakeStore([])
    const feed = new FeedService(store)
    expect(() => {
      feed.stopAutoRefresh()
      feed.stopAutoRefresh()
    }).not.toThrow()
  })
})

function makeSrc(over: Partial<FeedSource> = {}): FeedSource {
  return {
    id: over.id ?? 's1',
    name: over.name ?? '源',
    url: over.url ?? 'https://example.com/rss',
    enabled: over.enabled ?? true,
    providerId: over.providerId ?? 'builtin-rss',
    isDefault: over.isDefault ?? false
  }
}

function makeArticle(guid: string): Article {
  return {
    guid,
    sourceId: 'placeholder',
    title: `标题 ${guid}`,
    link: `https://example.com/${guid}`,
    pubDate: '2026-08-01T00:00:00.000Z',
    summary: '摘要',
    contentHtml: '<p>正文</p>',
    coverUrl: null
  }
}

function omitSource(article: Article): Omit<Article, 'sourceId'> {
  const { sourceId: _sourceId, ...rest } = article
  return rest
}
