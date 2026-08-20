import type { Article, FeedSource, HistoryEntry, SavedSession, Settings, ThemeTokens } from './types'

export const IPC = {
  FeedList: 'feed:list',
  FeedRefresh: 'feed:refresh',
  FeedSources: 'feed:sources',
  FeedSourceAdd: 'feed:source:add',
  FeedSourceRemove: 'feed:source:remove',
  FeedSourceToggle: 'feed:source:toggle',
  FeedSourceSetDefault: 'feed:source:set-default',
  HistoryGet: 'history:get',
  HistoryMarkRead: 'history:mark-read',
  HistoryToggleFavorite: 'history:toggle-favorite',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SessionGet: 'session:get',
  SessionSave: 'session:save',
  ThemeList: 'theme:list',
  ThemeGet: 'theme:get',
  ThemeSave: 'theme:save',
  ThemeDelete: 'theme:delete',
  ThemeSystemGet: 'theme:system:get',
  ThemeSystemChanged: 'theme:system-changed',
  WindowToggleMini: 'window:toggle-mini',
  WindowMinimize: 'window:minimize',
  WindowToggleMaximize: 'window:toggle-maximize',
  WindowClose: 'window:close',
  WindowMaximizeChanged: 'window:maximize-changed',
  AppOpenExternal: 'app:open-external',
  FeedUpdated: 'feed:updated'
} as const

export interface OpiaApi {
  feedList(sourceId?: string): Promise<Article[]>
  feedRefresh(sourceId?: string): Promise<{ added: number }>
  feedSources(): Promise<FeedSource[]>
  feedSourceAdd(source: Omit<FeedSource, 'id'>): Promise<FeedSource>
  feedSourceRemove(id: string): Promise<void>
  feedSourceToggle(id: string, enabled: boolean): Promise<void>
  feedSourceSetDefault(id: string | null): Promise<FeedSource[]>
  historyGet(): Promise<Record<string, HistoryEntry>>
  historyMarkRead(guid: string): Promise<void>
  historyToggleFavorite(guid: string): Promise<boolean>
  settingsGet(): Promise<Settings>
  settingsSet(patch: Partial<Settings>): Promise<Settings>
  sessionGet(): Promise<SavedSession | null>
  sessionSave(session: SavedSession): Promise<void>
  themeList(): Promise<ThemeTokens[]>
  themeGet(id: string): Promise<ThemeTokens | null>
  themeSave(theme: ThemeTokens): Promise<void>
  themeDelete(id: string): Promise<void>
  themeSystemGet(): Promise<boolean>
  toggleMini(): Promise<boolean>
  windowMinimize(): Promise<void>
  windowToggleMaximize(): Promise<void>
  windowClose(): Promise<void>
  openExternal(url: string): Promise<void>
  onFeedUpdated(cb: (payload: { sourceId: string }) => void): () => void
  onWindowMaximizeChanged(cb: (maximized: boolean) => void): () => void
  onThemeSystemChanged(cb: (dark: boolean) => void): () => void
}
