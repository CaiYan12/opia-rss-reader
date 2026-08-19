import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

function rendererTarget(): { url?: string; file?: string } {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return { url: devUrl }
  return { file: join(__dirname, '../renderer/index.html') }
}

let mainWindow: BrowserWindow | null = null
let miniMode = false
let normalBounds: Electron.Rectangle | null = null

const MINI_SIZE = { w: 360, h: 480 }

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function isMiniMode(): boolean {
  return miniMode
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f4ed',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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
    normalBounds = mainWindow.getBounds()
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
  }

  mainWindow.webContents.send('window:mini-changed', miniMode)
  return miniMode
}
