// Runs in Electron, not Node. This is a standalone probe, never the application entry.
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

// Electron retains its own switches in argv; the runner owns the final two arguments.
const directory = process.argv.at(-2)
const budget = Number(process.argv.at(-1))
const profile = join(directory, 'profile')
mkdirSync(profile, { recursive: true })
app.setPath('userData', profile)
app.setPath('sessionData', profile)
mkdirSync(join(profile, 'crashes'), { recursive: true })
app.setPath('crashDumps', join(profile, 'crashes'))

let gpuInfoUpdated = false
let finished = false
let window
const events = []
const started = Date.now()
app.on('gpu-info-update', () => { gpuInfoUpdated = true })
app.on('child-process-gone', (_event, details) => events.push({ event: 'child-process-gone', ...details }))

async function finish(reason) {
  if (finished) return
  finished = true
  let gpuInfo = null
  let gpuInfoError = null
  if (gpuInfoUpdated) {
    let infoTimer
    try {
      gpuInfo = await Promise.race([
        app.getGPUInfo('complete'),
        new Promise((_, reject) => {
          infoTimer = setTimeout(() => reject(new Error('GPU info timeout')), 2500)
        })
      ])
    } catch (error) { gpuInfoError = error.message }
    finally { clearTimeout(infoTimer) }
  }
  const result = {
    reason, gpuInfoUpdated, elapsedMs: Date.now() - started,
    hardwareAcceleration: gpuInfoUpdated ? app.isHardwareAccelerationEnabled() : null,
    features: gpuInfoUpdated ? app.getGPUFeatureStatus() : null,
    gpuInfo, gpuInfoError, events, versions: process.versions,
    userData: app.getPath('userData')
  }
  writeFileSync(join(directory, 'probe.json'), JSON.stringify(result, null, 2), 'utf8')
  app.quit()
}

// Capture evidence even if page loading or renderer initialization fails.
const deadline = setTimeout(() => { void finish('probe-timeout') }, Math.max(500, budget - 3500))
app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 800, height: 600, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    events.push({ event: 'render-process-gone', ...details })
  })
  window.loadURL('data:text/html,<title>Opia GPU diagnostic</title>').catch(error => {
    events.push({ event: 'load-error', message: error.message })
  })
  setTimeout(() => {
    clearTimeout(deadline)
    void finish('sample')
  }, 3000)
}).catch(error => {
  events.push({ event: 'ready-error', message: error.message })
  void finish('ready-error')
})
