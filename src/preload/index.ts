import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type OpiaApi } from '../shared/ipc-contract'
import type { FeedSource, SavedSession, Settings, ThemeTokens } from '../shared/types'

const api: OpiaApi = {
  feedList: (sourceId) => ipcRenderer.invoke(IPC.FeedList, sourceId),
  feedRefresh: (sourceId) => ipcRenderer.invoke(IPC.FeedRefresh, sourceId),
  feedSources: () => ipcRenderer.invoke(IPC.FeedSources),
  feedSourceAdd: (source: Omit<FeedSource, 'id'>) => ipcRenderer.invoke(IPC.FeedSourceAdd, source),
  feedSourceRemove: (id) => ipcRenderer.invoke(IPC.FeedSourceRemove, id),
  feedSourceToggle: (id, enabled) => ipcRenderer.invoke(IPC.FeedSourceToggle, id, enabled),
  feedSourceSetDefault: (id) => ipcRenderer.invoke(IPC.FeedSourceSetDefault, id),
  historyGet: () => ipcRenderer.invoke(IPC.HistoryGet),
  historyMarkRead: (guid) => ipcRenderer.invoke(IPC.HistoryMarkRead, guid),
  historyToggleFavorite: (guid) => ipcRenderer.invoke(IPC.HistoryToggleFavorite, guid),
  settingsGet: () => ipcRenderer.invoke(IPC.SettingsGet),
  settingsSet: (patch) => ipcRenderer.invoke(IPC.SettingsSet, patch),
  sessionGet: () => ipcRenderer.invoke(IPC.SessionGet),
  sessionSave: (session) => ipcRenderer.invoke(IPC.SessionSave, session),
  themeList: () => ipcRenderer.invoke(IPC.ThemeList),
  themeGet: (id) => ipcRenderer.invoke(IPC.ThemeGet, id),
  themeSave: (theme) => ipcRenderer.invoke(IPC.ThemeSave, theme),
  themeDelete: (id) => ipcRenderer.invoke(IPC.ThemeDelete, id),
  toggleMini: () => ipcRenderer.invoke(IPC.WindowToggleMini),
  windowMinimize: () => ipcRenderer.invoke(IPC.WindowMinimize),
  windowToggleMaximize: () => ipcRenderer.invoke(IPC.WindowToggleMaximize),
  windowClose: () => ipcRenderer.invoke(IPC.WindowClose),
  openExternal: (url) => ipcRenderer.invoke(IPC.AppOpenExternal, url),
  onFeedUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { sourceId: string }): void =>
      cb(payload)
    ipcRenderer.on(IPC.FeedUpdated, listener)
    return () => ipcRenderer.removeListener(IPC.FeedUpdated, listener)
  },
  onWindowMaximizeChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, maximized: boolean): void => cb(maximized)
    ipcRenderer.on(IPC.WindowMaximizeChanged, listener)
    return () => ipcRenderer.removeListener(IPC.WindowMaximizeChanged, listener)
  }
}

contextBridge.exposeInMainWorld('opia', api)
