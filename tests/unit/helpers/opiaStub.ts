import { vi } from 'vitest'
import type { OpiaApi } from '../../../src/shared/ipc-contract'
import {
  DEFAULT_SETTINGS,
  DEFAULT_SOURCE,
  type Article,
  type FeedSource,
  type HistoryEntry,
  type SavedSession,
  type Settings,
  type ThemeTokens
} from '../../../src/shared/types'

/** 完整 window.opia 内存桩：契约新增方法时 createOpiaStub 的返回类型标注会报错，防止桩与契约漂移。 */
export type OpiaStub = { [K in keyof OpiaApi]: ReturnType<typeof vi.fn> }

export function makeArticle(over: Partial<Article> = {}): Article {
  return {
    guid: over.guid ?? 'guid-1',
    sourceId: over.sourceId ?? DEFAULT_SOURCE.id,
    title: over.title ?? '文章标题',
    link: over.link ?? 'https://example.com/article',
    pubDate: over.pubDate ?? '2026-08-01T00:00:00.000Z',
    summary: over.summary ?? '摘要',
    contentHtml: over.contentHtml ?? '<p>正文</p>',
    coverUrl: over.coverUrl ?? null
  }
}

export function makeSource(over: Partial<FeedSource> = {}): FeedSource {
  return {
    id: over.id ?? DEFAULT_SOURCE.id,
    name: over.name ?? DEFAULT_SOURCE.name,
    url: over.url ?? DEFAULT_SOURCE.url,
    enabled: over.enabled ?? true,
    providerId: over.providerId ?? 'builtin-rss',
    isDefault: over.isDefault ?? true
  }
}

export function makeSettings(over: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...over }
}

export function makeTheme(over: Partial<ThemeTokens> = {}): ThemeTokens {
  return {
    id: over.id ?? 'test-theme',
    name: over.name ?? 'Test Theme',
    colorScheme: over.colorScheme ?? 'light',
    colors: {
      bg: '#ffffff',
      surface: '#fafafa',
      card: '#ffffff',
      border: '#e0e0e0',
      text: '#111111',
      textSecondary: '#666666',
      accent: '#0067c0',
      accentHover: '#005099',
      onAccent: '#ffffff',
      chip: '#eeeeee',
      chipText: '#333333',
      read: '#999999',
      ...over.colors
    },
    fonts: { heading: 'sans-serif', body: 'sans-serif', ...over.fonts },
    radius: over.radius ?? 8,
    spacing: over.spacing ?? 16
  }
}

export function makeHistoryEntry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    guid: over.guid ?? 'guid-1',
    read: over.read ?? false,
    favorite: over.favorite ?? false,
    readAt: over.readAt ?? null
  }
}

export function createOpiaStub(over: Partial<OpiaApi> = {}): OpiaStub {
  const stub: Record<string, unknown> = {
    feedList: vi.fn(async (_sourceId?: string): Promise<Article[]> => []),
    feedRefresh: vi.fn(async (_sourceId?: string) => ({ added: 0 })),
    feedSources: vi.fn(async (): Promise<FeedSource[]> => [makeSource()]),
    feedSourceValidate: vi.fn(async (_source: Omit<FeedSource, 'id'>) => undefined),
    feedSourceAdd: vi.fn(async (source: Omit<FeedSource, 'id'>) => ({ ...source, id: 'src-new' })),
    feedSourceRemove: vi.fn(async (_id: string) => undefined),
    feedSourceToggle: vi.fn(async (_id: string, _enabled: boolean) => undefined),
    feedSourceSetDefault: vi.fn(async (_id: string | null): Promise<FeedSource[]> => []),
    historyGet: vi.fn(async (): Promise<Record<string, HistoryEntry>> => ({})),
    historyMarkRead: vi.fn(async (_guid: string) => undefined),
    historyToggleFavorite: vi.fn(async (_guid: string) => true),
    settingsGet: vi.fn(async (): Promise<Settings> => makeSettings()),
    settingsSet: vi.fn(async (patch: Partial<Settings>) => makeSettings(patch)),
    sessionGet: vi.fn(async (): Promise<SavedSession | null> => null),
    sessionSave: vi.fn(async (_session: SavedSession) => undefined),
    themeList: vi.fn(async (): Promise<ThemeTokens[]> => []),
    themeGet: vi.fn(async (_id: string): Promise<ThemeTokens | null> => null),
    themeSave: vi.fn(async (_theme: ThemeTokens) => undefined),
    themeDelete: vi.fn(async (_id: string) => undefined),
    themeSystemGet: vi.fn(async () => false),
    toggleMini: vi.fn(async () => false),
    windowMinimize: vi.fn(async () => undefined),
    windowToggleMaximize: vi.fn(async () => undefined),
    windowClose: vi.fn(async () => undefined),
    windowSetTitle: vi.fn(async (_pageTitle: string) => undefined),
    openExternal: vi.fn(async (_url: string) => undefined),
    onFeedUpdated: vi.fn((_cb: unknown) => () => {}),
    onWindowMaximizeChanged: vi.fn((_cb: unknown) => () => {}),
    onThemeSystemChanged: vi.fn((_cb: unknown) => () => {})
  }
  for (const [key, value] of Object.entries(over)) {
    if (value !== undefined) stub[key] = value
  }
  return stub as OpiaStub
}

/** 把桩装到 window 上（Window.opia 为非可选声明，只能经 Object.assign 写入）。 */
export function installOpiaStub(over: Partial<OpiaApi> = {}): OpiaStub {
  const stub = createOpiaStub(over)
  Object.assign(window, { opia: stub })
  return stub
}
