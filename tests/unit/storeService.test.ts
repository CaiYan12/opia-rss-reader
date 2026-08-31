import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, DEFAULT_SOURCE, JUYA_SOURCE_ID } from '../../src/shared/types'

const registry = vi.hoisted(() => ({ instances: [] as Array<{ data: Record<string, unknown> }> }))

vi.mock('electron-store', () => ({
  default: class FakeStore {
    data: Record<string, unknown>
    constructor(options: { defaults?: Record<string, unknown> }) {
      this.data = structuredClone(options.defaults ?? {})
      registry.instances.push(this)
    }
    get(key: string): unknown {
      return this.data[key]
    }
    set(key: string, value: unknown): void {
      this.data[key] = value
    }
  }
}))

// electron-store 依赖 app.getPath，给一个临时目录即可
const paths = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => paths.userData }
}))

import { StoreService } from '../../src/main/store/StoreService'
import { BUILTIN_THEMES } from '../../src/main/theme/builtinThemes'

let userData: string
let store: StoreService
let raw: { data: Record<string, unknown> }

/** 直写持久层，模拟旧版本遗留数据 */
function seedSettings(saved: Record<string, unknown>): void {
  raw.data.settings = saved
}

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'opia-store-'))
  paths.userData = userData
  registry.instances.length = 0
  store = new StoreService()
  raw = registry.instances[0]
  expect(raw).toBeTruthy()
})

describe('StoreService 默认值', () => {
  it('全新安装：默认设置 + 唯一默认订阅橘鸦源 + 空历史/缓存/会话', () => {
    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(store.getSources()).toEqual([DEFAULT_SOURCE])
    expect(store.getHistory()).toEqual({})
    expect(store.getCachedArticles()).toEqual([])
    expect(store.getSession()).toBeNull()
  })

  it('默认订阅数量 ≤ 1', () => {
    expect(store.getSources().filter((s) => s.isDefault)).toHaveLength(1)
  })
})

describe('StoreService.getSettings 旧数据深合并', () => {
  it('缺失的新增顶层字段回退默认值，已有字段保留', () => {
    seedSettings({ clickBehavior: 'browser' })
    const settings = store.getSettings()
    expect(settings.clickBehavior).toBe('browser')
    expect(settings.externalLinkBehavior).toBe(DEFAULT_SETTINGS.externalLinkBehavior)
    expect(settings.uiZoom).toBe(1)
    expect(settings.juyaLightStyleId).toBe('card')
  })

  it('layout 与 layout.fields 逐层合并（旧数据只有 preset 时字段取默认）', () => {
    seedSettings({ layout: { preset: 'compact' } })
    const { layout } = store.getSettings()
    expect(layout.preset).toBe('compact')
    expect(layout.gridColumns).toBe(DEFAULT_SETTINGS.layout.gridColumns)
    expect(layout.fields).toEqual(DEFAULT_SETTINGS.layout.fields)
  })

  it('layout.fields 单个字段可覆盖', () => {
    seedSettings({ layout: { fields: { cover: false } } })
    const { layout } = store.getSettings()
    expect(layout.fields.cover).toBe(false)
    expect(layout.fields.summary).toBe(true)
  })

  it('shortcuts 缺失项回退默认（zoomWheel 后加字段场景）', () => {
    seedSettings({ shortcuts: { closeTab: 'Ctrl+Q' } })
    const { shortcuts } = store.getSettings()
    expect(shortcuts.closeTab).toBe('Ctrl+Q')
    expect(shortcuts.zoomWheel).toBe(DEFAULT_SETTINGS.shortcuts.zoomWheel)
    expect(shortcuts.nextTab).toBe('Ctrl+Tab')
  })

  it('完全空的 settings 也返回合法全量设置', () => {
    seedSettings(undefined)
    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('StoreService.setSettings', () => {
  it('浅合并补丁并落盘、返回合并结果', () => {
    const next = store.setSettings({ uiZoom: 1.25 })
    expect(next.uiZoom).toBe(1.25)
    expect(next.themeMode).toBe(DEFAULT_SETTINGS.themeMode)
    expect(raw.data.settings).toEqual(next)
  })

  it('写入时剥除旧版本 activeThemeId（新逻辑不再持有该键）', () => {
    seedSettings({ activeThemeId: 'claude-design' })
    const next = store.setSettings({ uiZoom: 1 })
    expect('activeThemeId' in next).toBe(false)
    expect('activeThemeId' in (raw.data.settings as object)).toBe(false)
  })

  it('嵌套对象整体替换（layout 补丁需传完整对象）', () => {
    const next = store.setSettings({ layout: { ...DEFAULT_SETTINGS.layout, preset: 'magazine' } })
    expect(next.layout.preset).toBe('magazine')
    expect(store.setSettings({}) ).toEqual(next)
  })
})

describe('StoreService.migrateThemeSettings（v0.1.x 单主题 → 三态）', () => {
  it('已迁移过则完全不动', () => {
    const before = structuredClone(raw.data.settings)
    store.migrateThemeSettings(BUILTIN_THEMES)
    expect(raw.data.settings).toEqual(before)
  })

  it('旧亮色主题：亮侧沿用、暗侧填 windows-dark、模式固定 light', () => {
    seedSettings({ activeThemeId: 'claude-design' })
    store.migrateThemeSettings(BUILTIN_THEMES)
    const saved = raw.data.settings as Record<string, unknown>
    expect(saved.themeMode).toBe('light')
    expect(saved.lightThemeId).toBe('claude-design')
    expect(saved.darkThemeId).toBe('windows-dark')
  })

  it('旧暗色主题：暗侧沿用、亮侧填 windows-light、模式固定 dark', () => {
    seedSettings({ activeThemeId: 'windows-dark' })
    store.migrateThemeSettings(BUILTIN_THEMES)
    const saved = raw.data.settings as Record<string, unknown>
    expect(saved.themeMode).toBe('dark')
    expect(saved.lightThemeId).toBe('windows-light')
    expect(saved.darkThemeId).toBe('windows-dark')
  })

  it('旧 activeThemeId 指向无 colorScheme 的主题时按背景亮度分类', () => {
    seedSettings({ activeThemeId: 'legacy-dark' })
    store.migrateThemeSettings([
      { ...BUILTIN_THEMES[0], id: 'legacy-dark', colorScheme: undefined, colors: { ...BUILTIN_THEMES[0].colors, bg: '#101010' } }
    ])
    const saved = raw.data.settings as Record<string, unknown>
    expect(saved.themeMode).toBe('dark')
    expect(saved.darkThemeId).toBe('legacy-dark')
    expect(saved.lightThemeId).toBe('windows-light')
  })

  it('旧 activeThemeId 未知时回退到亮色 + 双内置锚点', () => {
    seedSettings({ activeThemeId: 'deleted-theme' })
    store.migrateThemeSettings(BUILTIN_THEMES)
    const saved = raw.data.settings as Record<string, unknown>
    expect(saved.themeMode).toBe('light')
    expect(saved.lightThemeId).toBe('windows-light')
    expect(saved.darkThemeId).toBe('windows-dark')
  })

  it('迁移后删除 activeThemeId 键', () => {
    seedSettings({ activeThemeId: 'juya-daily' })
    store.migrateThemeSettings(BUILTIN_THEMES)
    expect('activeThemeId' in (raw.data.settings as object)).toBe(false)
  })

  it('三个字段只补齐一部分时也重新迁移（不完整状态视为未迁移）', () => {
    seedSettings({ themeMode: 'dark', activeThemeId: 'windows-dark' })
    store.migrateThemeSettings(BUILTIN_THEMES)
    const saved = raw.data.settings as Record<string, unknown>
    expect(saved.darkThemeId).toBeTruthy()
    expect(saved.lightThemeId).toBeTruthy()
  })
})

describe('StoreService 会话读写', () => {
  it('setSession 后可原样读回；置 null 读回 null', () => {
    const session = { tabs: [{ kind: 'home', homePage: 'feed' as const }], activeTabIndex: 0 }
    store.setSession(session)
    expect(store.getSession()).toEqual(session)
    store.setSession(null)
    expect(store.getSession()).toBeNull()
  })
})

describe('StoreService 历史', () => {
  it('markRead 建立条目并保留既有收藏态', () => {
    store.toggleFavorite('g1')
    const favorited = store.getHistory().g1.favorite
    store.markRead('g1')
    const entry = store.getHistory().g1
    expect(entry).toMatchObject({ guid: 'g1', read: true, favorite: favorited })
    expect(entry.readAt).toBeTruthy()
  })

  it('toggleFavorite 双向翻转并返回新值，不改动已读态', () => {
    store.markRead('g2')
    expect(store.toggleFavorite('g2')).toBe(true)
    expect(store.getHistory().g2).toMatchObject({ read: true, favorite: true })
    expect(store.toggleFavorite('g2')).toBe(false)
    expect(store.getHistory().g2.favorite).toBe(false)
  })
})

describe('StoreService 文章缓存', () => {
  const article = (guid: string, sourceId: string, pubDate: string) => ({
    guid,
    sourceId,
    title: guid,
    link: `https://example.com/${guid}`,
    pubDate,
    summary: '',
    contentHtml: '',
    coverUrl: null
  })

  it('cacheArticles 打上 sourceId 与 cachedAt', () => {
    store.cacheArticles('s1', [article('g1', 'ignored', '2026-08-01T00:00:00.000Z')])
    const cached = raw.data.articleCache as Record<string, Record<string, unknown>>
    expect(cached.g1.sourceId).toBe('s1')
    expect(typeof cached.g1.cachedAt).toBe('string')
  })

  it('getCachedArticles 按 pubDate 倒序且不泄漏 cachedAt 字段', () => {
    store.cacheArticles('s1', [
      article('old', 's1', '2026-01-01T00:00:00.000Z'),
      article('new', 's1', '2026-08-01T00:00:00.000Z')
    ])
    const list = store.getCachedArticles()
    expect(list.map((a) => a.guid)).toEqual(['new', 'old'])
    expect('cachedAt' in (list[0] as unknown as Record<string, unknown>)).toBe(false)
  })

  it('按 sourceId 过滤', () => {
    store.cacheArticles('s1', [article('a', 's1', '2026-08-01T00:00:00.000Z')])
    store.cacheArticles('s2', [article('b', 's2', '2026-08-02T00:00:00.000Z')])
    expect(store.getCachedArticles('s2').map((a) => a.guid)).toEqual(['b'])
  })

  it('同 guid 再写入为覆盖而非重复', () => {
    store.cacheArticles('s1', [article('a', 's1', '2026-08-01T00:00:00.000Z')])
    store.cacheArticles('s1', [article('a', 's1', '2026-08-05T00:00:00.000Z')])
    expect(Object.keys(raw.data.articleCache as object)).toEqual(['a'])
    expect(store.getCachedArticles('s1')[0].pubDate).toBe('2026-08-05T00:00:00.000Z')
  })
})

describe('StoreService.prune', () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

  it('删除超期的非收藏已读记录，保留收藏', () => {
    seedHistory({
      stale: { readAt: daysAgo(40), favorite: false },
      fresh: { readAt: daysAgo(5), favorite: false },
      kept: { readAt: daysAgo(400), favorite: true }
    })
    seedCache({ stale: daysAgo(40), fresh: daysAgo(5), kept: daysAgo(400) })
    store.prune(30)
    expect(Object.keys(getHistory())).toEqual(['fresh', 'kept'])
    expect(Object.keys(getCache()).sort()).toEqual(['fresh', 'kept'])
  })

  it('readAt 为空的非收藏记录视为最旧并被清理', () => {
    seedHistory({ noread: { readAt: null, favorite: false } })
    store.prune(30)
    expect(getHistory().noread).toBeUndefined()
  })

  it('收藏文章无论多久都保留（历史与缓存双向保留）', () => {
    seedHistory({ fav: { readAt: daysAgo(999), favorite: true } })
    seedCache({ fav: daysAgo(999) })
    store.prune(30)
    expect(getHistory().fav?.favorite).toBe(true)
    expect(getCache().fav).toBeTruthy()
  })

  it('未超期文章保留', () => {
    seedCache({ recent: daysAgo(2) })
    store.prune(30)
    expect(getCache().recent).toBeTruthy()
  })

  it('retentionDays 为 0 时清空全部非收藏', () => {
    seedHistory({ h: { readAt: hoursAgo(1), favorite: false } })
    seedCache({ c: hoursAgo(1) })
    store.prune(0)
    expect(Object.keys(getHistory())).toEqual([])
    expect(Object.keys(getCache())).toEqual([])
  })

  it('cutoff 为严格小于比较：不旧于 cutoff 的记录保留', () => {
    const now = new Date().toISOString()
    seedHistory({ h: { readAt: now, favorite: false } })
    seedCache({ c: now })
    store.prune(0)
    expect(getHistory().h).toBeTruthy()
  })
})

function seedHistory(entries: Record<string, { readAt: string | null; favorite: boolean }>): void {
  raw.data.history = Object.fromEntries(
    Object.entries(entries).map(([guid, e]) => [
      guid,
      { guid, read: true, favorite: e.favorite, readAt: e.readAt }
    ])
  )
}

function seedCache(byGuid: Record<string, string>): void {
  raw.data.articleCache = Object.fromEntries(
    Object.entries(byGuid).map(([guid, pubDate]) => [
      guid,
      {
        guid,
        sourceId: 's1',
        title: guid,
        link: `https://example.com/${guid}`,
        pubDate,
        summary: '',
        contentHtml: '',
        coverUrl: null,
        cachedAt: pubDate
      }
    ])
  )
}

function getHistory(): Record<string, { favorite: boolean }> {
  return raw.data.history as Record<string, { favorite: boolean }>
}

function getCache(): Record<string, unknown> {
  return raw.data.articleCache as Record<string, unknown>
}

it('内置橘鸦源常量与默认源一致（源锁定判据的前提）', () => {
  expect(DEFAULT_SOURCE.id).toBe(JUYA_SOURCE_ID)
})
