import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc-contract'

function rendererTarget(): { url?: string; file?: string } {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return { url: devUrl }
  return { file: join(__dirname, '../renderer/index.html') }
}

let mainWindow: BrowserWindow | null = null
let miniMode = false
let normalBounds: Electron.Rectangle | null = null
/** 进入 Mini 前窗口是否最大化（退出 Mini 时还原） */
let wasMaximized = false

const MINI_SIZE = { w: 360, h: 480 }

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function isMiniMode(): boolean {
  return miniMode
}

/** 自绘标题栏窗口控制：最小化 */
export function minimizeWindow(): void {
  mainWindow?.minimize()
}

/** 自绘标题栏窗口控制：最大化/还原切换 */
export function toggleMaximize(): void {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
}

/** 自绘标题栏窗口控制：关闭（关闭最后一个标签时也走此入口退出程序） */
export function closeMainWindow(): void {
  mainWindow?.close()
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false,
    backgroundColor: '#f5f4ed',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 最大化状态同步给自绘标题栏（切换最大化图标）
  mainWindow.on('maximize', () => mainWindow?.webContents.send(IPC.WindowMaximizeChanged, true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send(IPC.WindowMaximizeChanged, false))

  // 拦截主窗口原地导航：外链一律交给系统浏览器（渲染层会按设置分流，此为兜底）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if ((devUrl && url.startsWith(devUrl)) || url.startsWith('file://')) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const target = rendererTarget()
  if (target.url) {
    mainWindow.loadURL(target.url)
  } else if (target.file) {
    mainWindow.loadFile(target.file)
  }

  return mainWindow
}

export function toggleMiniMode(): boolean {
  if (!mainWindow) return miniMode
  miniMode = !miniMode

  if (miniMode) {
    // Windows 下对已最大化窗口 setSize() 不会解除最大化，须先显式还原；
    // getNormalBounds() 无论当前状态始终返回常规态边界
    wasMaximized = mainWindow.isMaximized()
    normalBounds = mainWindow.getNormalBounds()
    if (wasMaximized) mainWindow.unmaximize()
    mainWindow.setMinimumSize(280, 320)
    mainWindow.setSize(MINI_SIZE.w, MINI_SIZE.h)
    mainWindow.setAlwaysOnTop(true)
    mainWindow.setResizable(true)
  } else {
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setMinimumSize(720, 480)
    if (normalBounds) {
      mainWindow.setBounds(normalBounds)
    } else {
      mainWindow.setSize(1100, 720)
    }
    // 还原进入 Mini 前的最大化状态（maximize 事件驱动标题栏图标同步）
    if (wasMaximized) mainWindow.maximize()
  }

  mainWindow.webContents.send('window:mini-changed', miniMode)
  return miniMode
}
