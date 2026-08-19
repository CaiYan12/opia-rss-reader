import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type OpiaApi } from '../shared/ipc-contract'
import type { FeedSource, Settings, ThemeTokens } from '../shared/types'

const api: OpiaApi = {
  feedList: (sourceId) => ipcRenderer.invoke(IPC.FeedList, sourceId),
  feedRefresh: (sourceId) => ipcRenderer.invoke(IPC.FeedRefresh, sourceId),
  feedSources: () => ipcRenderer.invoke(IPC.FeedSources),
  feedSourceAdd: (source: Omit<FeedSource, 'id'>) => ipcRenderer.invoke(IPC.FeedSourceAdd, source),
  feedSourceRemove: (id: string) => ipcRenderer.invoke(IPC.FeedSourceRemove, id),
  feedSourceToggle: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC.FeedSourceToggle, id, enabled),
  historyGet: () => ipcRenderer.invoke(IPC.HistoryGet),
  historyMarkRead: (guid: string) => ipcRenderer.invoke(IPC.HistoryMarkRead, guid),
  historyToggleFavorite: (guid: string) => ipcRenderer.invoke(IPC.HistoryToggleFavorite, guid),
  settingsGet: () => ipcRenderer.invoke(IPC.SettingsGet),
  settingsSet: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.SettingsSet, patch),
  themeList: () => ipcRenderer.invoke(IPC.ThemeList),
  themeGet: (id: string) => ipcRenderer.invoke(IPC.ThemeGet, id),
  themeSave: (theme: ThemeTokens) => ipcRenderer.invoke(IPC.ThemeSave, theme),
  themeDelete: (id: string) => ipcRenderer.invoke(IPC.ThemeDelete, id),
  toggleMini: () => ipcRenderer.invoke(IPC.WindowToggleMini),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.AppOpenExternal, url),
  onFeedUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { sourceId: string }): void =>
      cb(payload)
    ipcRenderer.on(IPC.FeedUpdated, listener)
    return () => ipcRenderer.removeListener(IPC.FeedUpdated, listener)
  }
}

contextBridge.exposeInMainWorld('opia', api)
