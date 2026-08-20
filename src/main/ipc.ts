import { ipcMain, nativeTheme, shell } from 'electron'
import { IPC } from '../shared/ipc-contract'
import type { FeedSource, SavedSession, Settings, ThemeTokens } from '../shared/types'
import type { StoreService } from './store/StoreService'
import type { FeedService } from './feed/FeedService'
import type { ThemeService } from './theme/ThemeService'
import { closeMainWindow, minimizeWindow, toggleMaximize, toggleMiniMode } from './window'

export interface IpcDeps {
  store: StoreService
  feed: FeedService
  theme: ThemeService
}

export function registerIpc({ store, feed, theme }: IpcDeps): void {
  ipcMain.handle(IPC.FeedList, (_e, sourceId?: string) => feed.list(sourceId))
  ipcMain.handle(IPC.FeedRefresh, (_e, sourceId?: string) => feed.refresh(sourceId))
  ipcMain.handle(IPC.FeedSources, () => feed.getSources())
  ipcMain.handle(IPC.FeedSourceAdd, (_e, source: Omit<FeedSource, 'id'>) => feed.addSource(source))
  ipcMain.handle(IPC.FeedSourceRemove, (_e, id: string) => feed.removeSource(id))
  ipcMain.handle(IPC.FeedSourceToggle, (_e, id: string, enabled: boolean) =>
    feed.toggleSource(id, enabled)
  )
  ipcMain.handle(IPC.FeedSourceSetDefault, (_e, id: string | null) => feed.setDefaultSource(id))

  ipcMain.handle(IPC.HistoryGet, () => store.getHistory())
  ipcMain.handle(IPC.HistoryMarkRead, (_e, guid: string) => store.markRead(guid))
  ipcMain.handle(IPC.HistoryToggleFavorite, (_e, guid: string) => store.toggleFavorite(guid))

  ipcMain.handle(IPC.SettingsGet, () => store.getSettings())
  ipcMain.handle(IPC.SettingsSet, (_e, patch: Partial<Settings>) => {
    const next = store.setSettings(patch)
    if (patch.refreshIntervalMin !== undefined) {
      feed.startAutoRefresh(next.refreshIntervalMin)
    }
    return next
  })

  ipcMain.handle(IPC.ThemeList, () => theme.list())
  ipcMain.handle(IPC.ThemeGet, (_e, id: string) => theme.get(id))
  ipcMain.handle(IPC.ThemeSave, (_e, t: ThemeTokens) => theme.save(t))
  ipcMain.handle(IPC.ThemeDelete, (_e, id: string) => theme.delete(id))
  ipcMain.handle(IPC.ThemeSystemGet, () => nativeTheme.shouldUseDarkColors)

  ipcMain.handle(IPC.SessionGet, () => store.getSession())
  ipcMain.handle(IPC.SessionSave, (_e, session: SavedSession) => {
    store.setSession(session)
  })

  ipcMain.handle(IPC.WindowToggleMini, () => toggleMiniMode())
  ipcMain.handle(IPC.WindowMinimize, () => minimizeWindow())
  ipcMain.handle(IPC.WindowToggleMaximize, () => toggleMaximize())
  ipcMain.handle(IPC.WindowClose, () => closeMainWindow())

  ipcMain.handle(IPC.AppOpenExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    throw new Error(`blocked non-http url: ${url}`)
  })
}
