import { app, BrowserWindow } from 'electron'
import { createMainWindow, getMainWindow } from './window'
import { StoreService } from './store/StoreService'
import { FeedService } from './feed/FeedService'
import { ThemeService } from './theme/ThemeService'
import { PluginManager } from './plugin/PluginManager'
import { registerIpc } from './ipc'
import { IPC } from '../shared/ipc-contract'

// 单实例锁：防止双开导致 Chromium 磁盘缓存目录冲突
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

app.whenReady().then(() => {
  const store = new StoreService()
  const feed = new FeedService(store)
  const theme = new ThemeService()

  // 插件管线：加载第三方 provider/theme/card-renderer
  const plugins = new PluginManager(feed)
  plugins.loadAll()
  for (const t of plugins.collectThemes()) theme.registerPluginTheme(t)
  console.log('[main] plugin registry:', JSON.stringify(plugins.snapshot()))

  feed.onUpdated = (sourceId) => {
    getMainWindow()?.webContents.send(IPC.FeedUpdated, { sourceId })
  }

  registerIpc({ store, feed, theme })
  createMainWindow()

  // 启动拉取 + 定时刷新
  void feed.refresh().then((r) => console.log(`[main] initial refresh, added=${r.added}`))
  feed.startAutoRefresh(store.getSettings().refreshIntervalMin)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
