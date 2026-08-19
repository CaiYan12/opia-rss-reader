import type { Article, FeedSource, HistoryEntry, Settings, ThemeTokens } from './types'

export const IPC = {
  FeedList: 'feed:list',
  FeedRefresh: 'feed:refresh',
  FeedSources: 'feed:sources',
  FeedSourceAdd: 'feed:source:add',
  FeedSourceRemove: 'feed:source:remove',
  FeedSourceToggle: 'feed:source:toggle',
  HistoryGet: 'history:get',
  HistoryMarkRead: 'history:mark-read',
  HistoryToggleFavorite: 'history:toggle-favorite',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  ThemeList: 'theme:list',
  ThemeGet: 'theme:get',
  ThemeSave: 'theme:save',
  ThemeDelete: 'theme:delete',
  ThemeApplied: 'theme:applied',
  WindowToggleMini: 'window:toggle-mini',
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
  historyGet(): Promise<Record<string, HistoryEntry>>
  historyMarkRead(guid: string): Promise<void>
  historyToggleFavorite(guid: string): Promise<boolean>
  settingsGet(): Promise<Settings>
  settingsSet(patch: Partial<Settings>): Promise<Settings>
  themeList(): Promise<ThemeTokens[]>
  themeGet(id: string): Promise<ThemeTokens | null>
  themeSave(theme: ThemeTokens): Promise<void>
  themeDelete(id: string): Promise<void>
  toggleMini(): Promise<boolean>
  openExternal(url: string): Promise<void>
  onFeedUpdated(cb: (payload: { sourceId: string }) => void): () => void
}
