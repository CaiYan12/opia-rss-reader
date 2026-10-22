#!/usr/bin/env node
// Fixed-protocol local performance probe. Deliberately separate from verify and CI.
//
// The probe launches the real Electron main process and renderer on an isolated
// profile, restores a deterministic cached article, scrolls it by a fixed gesture,
// and reports rAF cadence (light sampling) or compositor frame/drop counts (trace)
// in two separate runs. It never opens the user's real application profile.
//
// Playwright's `_electron` starts the real app and exposes a CDP session for
// `Tracing` / `Input.synthesizeScrollGesture`; no fixed remote-debugging port or
// hand-rolled websocket client is needed (and 4173 / 9222 stay untouched).
import { _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { assessGpuHealth } from './gpu-diagnostics.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const require = createRequire(import.meta.url)

export const FIXED = {
  viewportWidth: 1099,
  viewportHeight: 721,
  devicePixelRatio: 1.75,
  uiZoom: 1,
  scrollDistance: 3000,
  scrollSpeed: 600,
  sampleEntries: 32,
  sampleImages: 34
}

const SAMPLE = {
  guid: 'perf-probe://synthetic/2026-10-22',
  title: '性能探针合成样本 2026-10-22',
  entries: FIXED.sampleEntries,
  images: FIXED.sampleImages
}

const MODES = ['light', 'trace', 'both']
const TRACE_CATEGORIES = 'disabled-by-default-devtools.timeline.frame,cc,input,benchmark'

const HELP = `npm run perf:probe -- [--mode light|trace|both] [--output <directory>] [--timeout <ms>]
Fixed-protocol local performance probe for the real Electron app.
Prerequisite: npm run build:dir; then npm run diagnose:gpu and compare only on PASS.
Exit codes: 0 comparable sample, 1 completed but not comparable, 2 failed or invalid arguments.
Reports default to out/perf-probe/run-<unique>/; light sampling and full trace are separate runs.
--help       Show help without launching Electron.
--mode       light (rAF sampling only), trace (compositor trace only), or both (default).
--output     Parent directory for a new report subdirectory (existing files are preserved).
--timeout    Per-mode launch/measurement budget in milliseconds (30000..300000, default 120000).
`

/** Parse a finite number, returning null instead of NaN/Infinity. */
function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function round(value, digits = 1) {
  const number = finite(value)
  if (number === null) return null
  const factor = 10 ** digits
  return Math.round(number * factor) / factor
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return sorted[index]
}

/** rAF samples are DOMHighResTimeStamp values in milliseconds, in callback order. */
export function summarizeRafSamples(samples) {
  const values = Array.isArray(samples) ? samples.filter((value) => finite(value) !== null) : []
  if (values.length < 2) {
    return { measured: false, reason: 'rAF 回调少于 2 次，无法计算回调间隔。' }
  }
  const intervals = []
  for (let i = 1; i < values.length; i++) intervals.push(values[i] - values[i - 1])
  const sorted = [...intervals].sort((a, b) => a - b)
  const durationMs = values.at(-1) - values[0]
  return {
    measured: true,
    callbacks: values.length,
    durationMs: round(durationMs),
    hz: durationMs > 0 ? round((values.length - 1) / (durationMs / 1000), 1) : null,
    intervalMedianMs: round(percentile(sorted, 0.5), 2),
    intervalP95Ms: round(percentile(sorted, 0.95), 2),
    intervalWorstMs: round(sorted.at(-1), 2),
    intervalsOver33Ms: intervals.filter((value) => value > 33.34).length,
    intervalsOver50Ms: intervals.filter((value) => value > 50).length
  }
}

// Chromium trace timestamps are microseconds; reported intervals are milliseconds.
function intervalSummary(timestamps) {
  const sorted = [...timestamps].sort((a, b) => a - b)
  if (sorted.length < 2) return { medianMs: null, p95Ms: null, worstMs: null }
  const intervals = []
  for (let i = 1; i < sorted.length; i++) intervals.push((sorted[i] - sorted[i - 1]) / 1000)
  const ordered = [...intervals].sort((a, b) => a - b)
  return {
    medianMs: round(percentile(ordered, 0.5), 2),
    p95Ms: round(percentile(ordered, 0.95), 2),
    worstMs: round(ordered.at(-1), 2)
  }
}

/**
 * Summarize a Chromium trace for a single scroll window.
 *
 * Presented frames come from `PipelineReporter` begin events with
 * `state === 'STATE_PRESENTED_ALL'`; dropped frames come from `DroppedFrame`
 * events emitted by the same renderer. Both are compositor evidence, not a
 * display-scanout FPS measurement.
 */
export function summarizeTraceEvents(events, { refreshHz = null } = {}) {
  const list = Array.isArray(events) ? events : []
  if (list.length === 0) return { measured: false, reason: 'trace 没有事件。' }

  const countByPid = (name) => {
    const counts = new Map()
    for (const event of list) {
      if (event?.name !== name || !Number.isFinite(event.pid)) continue
      counts.set(event.pid, (counts.get(event.pid) ?? 0) + 1)
    }
    return counts
  }
  const pickPid = (counts) => [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const rendererPid = pickPid(countByPid('BeginFrame'))
    ?? pickPid(countByPid('PipelineReporter'))
    ?? pickPid(countByPid('DroppedFrame'))
  if (rendererPid === null) {
    return { measured: false, reason: 'trace 中没有可识别的渲染进程帧事件。' }
  }

  const gestureEvents = list.filter(
    (event) => event?.name === 'InputLatency::GestureScrollUpdate' && Number.isFinite(event.ts)
  )
  const markers = list.filter((event) => event?.name === 'clock_sync' && event.args?.sync_id)
  const markerStart = markers.find((event) => event.args.sync_id === 'perf-probe-start')
  const markerEnd = markers.findLast((event) => event.args.sync_id === 'perf-probe-end')

  let windowStart = null
  let windowEnd = null
  let windowSource = 'whole-trace'
  if (gestureEvents.length) {
    windowStart = Math.min(...gestureEvents.map((event) => event.ts))
    windowEnd = Math.max(...gestureEvents.map((event) => event.ts))
    windowSource = 'gesture'
  } else if (markerStart && markerEnd) {
    windowStart = markerStart.ts
    windowEnd = markerEnd.ts
    windowSource = 'clock-sync'
  }

  const inWindow = (event) => {
    if (!Number.isFinite(event?.ts)) return false
    if (windowStart !== null && event.ts < windowStart) return false
    if (windowEnd !== null && event.ts > windowEnd) return false
    return true
  }
  const frameEvents = list.filter(
    (event) => event?.pid === rendererPid && inWindow(event) &&
      ['BeginFrame', 'DrawFrame', 'DroppedFrame', 'PipelineReporter'].includes(event.name)
  )
  if (!frameEvents.length) {
    return { measured: false, reason: '手势窗口内没有渲染进程帧事件。', rendererPid, windowSource }
  }

  const beginFrames = frameEvents.filter((event) => event.name === 'BeginFrame')
  const drawFrames = frameEvents.filter((event) => event.name === 'DrawFrame')
  const dropped = frameEvents.filter((event) => event.name === 'DroppedFrame')
  const presented = new Map()
  for (const event of frameEvents) {
    if (event.name !== 'PipelineReporter' || event.ph !== 'b') continue
    const reporter = event.args?.frame_reporter
    if (reporter?.state !== 'STATE_PRESENTED_ALL') continue
    const sequence = reporter.frame_sequence
    if (!Number.isFinite(sequence) || sequence <= 0 || presented.has(sequence)) continue
    presented.set(sequence, event.ts)
  }
  const presentedTimes = [...presented.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([, timestamp]) => timestamp)
  const durationMs = windowStart !== null && windowEnd !== null
    ? (windowEnd - windowStart) / 1000
    : (() => {
        const timestamps = frameEvents.map((event) => event.ts)
        return (Math.max(...timestamps) - Math.min(...timestamps)) / 1000
      })()
  const presentedFrames = presentedTimes.length
  const expectedVsyncs = finite(refreshHz) && refreshHz > 0 && durationMs > 0
    ? Math.round((durationMs / 1000) * refreshHz)
    : null
  const intervals = intervalSummary(presentedTimes)

  return {
    measured: presentedFrames > 0 || beginFrames.length > 0,
    source: 'trace',
    windowSource,
    windowStartUs: windowStart,
    windowEndUs: windowEnd,
    durationMs: round(durationMs),
    rendererPid,
    beginFrames: beginFrames.length,
    drawFrames: drawFrames.length,
    droppedFrames: dropped.length,
    presentedFrames,
    presentedHz: durationMs > 0 ? round(presentedFrames / (durationMs / 1000), 1) : null,
    presentedIntervalMedianMs: intervals.medianMs,
    presentedIntervalP95Ms: intervals.p95Ms,
    presentedIntervalWorstMs: intervals.worstMs,
    expectedVsyncs,
    droppedRatioOfBeginFrames: beginFrames.length ? round(dropped.length / beginFrames.length, 3) : null,
    presentedRatioOfBeginFrames: beginFrames.length ? round(presentedFrames / beginFrames.length, 3) : null,
    droppedRatioOfExpectedVsyncs: expectedVsyncs ? round(dropped.length / expectedVsyncs, 3) : null,
    note: '呈现/掉帧来自 Chromium compositor trace（STATE_PRESENTED_ALL / DroppedFrame），按手势窗口内渲染进程 pid 统计；不是显示器端 FPS 验收。'
  }
}

/** Fixed conditions are required, not advisory. Any mismatch makes the sample incomparable. */
export function assessSampleConditions(sample = {}) {
  const issues = []
  if (sample.gpuStatus !== 'PASS') issues.push(`GPU 状态 ${sample.gpuStatus ?? '未知'}，样本不可比（先运行 npm run diagnose:gpu）`)
  if (!sample.isolationVerified) issues.push('无法证明使用了独立 profile，样本不可比')
  if (finite(sample.devicePixelRatio) === null || Math.abs(sample.devicePixelRatio - FIXED.devicePixelRatio) > 0.001) {
    issues.push(`devicePixelRatio=${sample.devicePixelRatio ?? '未知'}，要求 ${FIXED.devicePixelRatio}`)
  }
  if (sample.innerWidth !== FIXED.viewportWidth || sample.innerHeight !== FIXED.viewportHeight) {
    issues.push(`视口 ${sample.innerWidth ?? '?'}×${sample.innerHeight ?? '?'}，要求 ${FIXED.viewportWidth}×${FIXED.viewportHeight}`)
  }
  if (finite(sample.uiZoom) === null || Math.abs(sample.uiZoom - FIXED.uiZoom) > 0.001) {
    issues.push(`uiZoom=${sample.uiZoom ?? '未知'}，要求 ${FIXED.uiZoom}`)
  }
  if (sample.entryCount !== FIXED.sampleEntries) {
    issues.push(`文章条目数 ${sample.entryCount ?? '未知'}，要求 ${FIXED.sampleEntries}`)
  }
  if (sample.imageCount !== FIXED.sampleImages) {
    issues.push(`图像元素数 ${sample.imageCount ?? '未知'}，要求 ${FIXED.sampleImages}`)
  }
  if (sample.imagesComplete !== sample.imageCount) {
    issues.push(`图像未全部加载（${sample.imagesComplete ?? 0}/${sample.imageCount ?? 0}）`)
  }
  if (sample.scrollStart !== 0) issues.push(`滚动起点 ${sample.scrollStart ?? '未知'}，要求 0`)
  if (finite(sample.scrollEnd) === null || Math.abs(sample.scrollEnd - FIXED.scrollDistance) > 2) {
    issues.push(`滚动终点 ${sample.scrollEnd ?? '未知'}，要求 ${FIXED.scrollDistance}`)
  }
  if (sample.visibilityStart !== 'visible' || sample.visibilityEnd !== 'visible') {
    issues.push(`document.visibilityState=${sample.visibilityStart ?? '?'} → ${sample.visibilityEnd ?? '?'}，要求全程 visible`)
  }
  if (sample.appHiddenStart || sample.appHiddenEnd) {
    issues.push('[data-app-hidden] 在测量期间被设置')
  }
  return { met: issues.length === 0, issues }
}

export function parseOptions(args) {
  const options = {
    mode: 'both',
    output: join(ROOT, 'out', 'perf-probe'),
    timeout: 120000
  }
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (!['--mode', '--output', '--timeout'].includes(name)) throw new Error(`Unknown argument: ${name}`)
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`Missing value: ${name}`)
    if (name === '--mode') {
      if (!MODES.includes(value)) throw new Error(`Invalid --mode (${MODES.join('|')}): ${value}`)
      options.mode = value
    } else if (name === '--output') {
      options.output = resolve(value)
    } else {
      options.timeout = Number(value)
      if (!Number.isInteger(options.timeout) || options.timeout < 30000 || options.timeout > 300000) {
        throw new Error('Invalid --timeout (30000..300000)')
      }
    }
  }
  return options
}

function svgPlate(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">` +
    `<rect width="100%" height="100%" fill="#3b4a8f"/>` +
    `<text x="16" y="34" font-family="sans-serif" font-size="22" fill="#f2f2f5">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Deterministic article sample: 4 sections × 8 entries = 32 entries, 34 images. */
export function buildSample() {
  let entry = 0
  const sections = []
  for (let section = 1; section <= 4; section++) {
    const items = []
    for (let index = 0; index < 8; index++) {
      entry += 1
      const imageCount = entry <= 2 ? 2 : 1
      const images = Array.from({ length: imageCount }, (_, index) =>
        `<p><img src="${svgPlate(`plate-${entry}-${index + 1}`)}" alt=""></p>`
      ).join('')
      items.push(
        `<h3><a href="https://example.com/e/${entry}" rel="noopener noreferrer">探针条目 ${entry}</a> <code>#${entry}</code></h3>` +
        `<blockquote>探针导语 ${entry}：用于固定口径的合成样本。</blockquote>` +
        `<p>探针正文段落 ${entry} 甲，描述固定样本的正文内容。</p>` +
        `<p>探针正文段落 ${entry} 乙，用于制造稳定的排版高度。</p>` +
        images
      )
    }
    sections.push(`<h2>栏目 ${section}</h2>${items.join('\n')}`)
  }
  const contentHtml = `<div><h1>${SAMPLE.title}</h1><h2>概览</h2><ul><li>探针条目一 <code>#1</code></li></ul>${sections.join('\n')}</div>`
  return {
    article: {
      guid: SAMPLE.guid,
      sourceId: 'juya-daily',
      title: SAMPLE.title,
      link: 'https://example.com/perf-probe',
      pubDate: '2026-10-22T00:00:00.000Z',
      summary: '固定合成样本',
      contentHtml,
      coverUrl: null
    },
    meta: {
      guid: SAMPLE.guid,
      title: SAMPLE.title,
      entries: SAMPLE.entries,
      images: SAMPLE.images,
      synthetic: true,
      generator: 'scripts/perf-probe.mjs buildSample() v1'
    }
  }
}

function seedProfile(profile, sample) {
  const settings = {
    clickBehavior: 'reader',
    externalLinkBehavior: 'system',
    homeContent: 'defaultSource',
    startupOpen: 'lastSession',
    shortcuts: { closeTab: 'Ctrl+W', nextTab: 'Ctrl+Tab', prevTab: 'Ctrl+Shift+Tab', zoomWheel: 'Ctrl' },
    refreshIntervalMin: 0,
    historyRetentionDays: 30,
    themeMode: 'dark',
    lightThemeId: 'windows-light',
    darkThemeId: 'windows-dark',
    layout: { preset: 'grid', gridColumns: 2, fields: { cover: true, summary: true, pubDate: true, source: true } },
    miniSize: { w: 360, h: 480 },
    uiZoom: FIXED.uiZoom,
    juyaLightStyleId: 'folio',
    juyaDarkStyleId: 'synthwave'
  }
  writeFileSync(join(profile, 'opia-data.json'), JSON.stringify({
    settings,
    sources: [],
    history: {},
    articleCache: {
      [sample.article.guid]: { ...sample.article, cachedAt: '2026-10-22T00:00:00.000Z' }
    },
    session: { tabs: [{ kind: 'reader', guid: sample.article.guid }], activeTabIndex: 0 }
  }, null, 2), 'utf8')
}

function writeBootstrap(directory) {
  const path = join(directory, 'bootstrap.cjs')
  writeFileSync(path, String.raw`
// Generated per run. Loads the real application main process after redirecting
// userData/sessionData to the isolated profile, then records main-process facts.
const { app, BrowserWindow, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const profile = process.env.OPIA_PERF_PROFILE
const mainPath = process.env.OPIA_PERF_MAIN
const infoPath = process.env.OPIA_PERF_INFO

const defaultUserData = app.getPath('userData')
const defaultSessionData = app.getPath('sessionData')
app.setPath('userData', profile)
app.setPath('sessionData', profile)
app.setPath('crashDumps', path.join(profile, 'crashes'))
fs.mkdirSync(path.join(profile, 'crashes'), { recursive: true })

const info = {
  defaultUserData,
  defaultSessionData,
  resolvedUserData: app.getPath('userData'),
  resolvedSessionData: app.getPath('sessionData'),
  versions: process.versions,
  argv: process.argv,
  gpuInfoUpdated: false
}
let gpuUpdated = false
app.on('gpu-info-update', () => { gpuUpdated = true })

app.whenReady().then(async () => {
  info.display = screen.getPrimaryDisplay()
  info.windowCountAtReady = BrowserWindow.getAllWindows().length
  for (let i = 0; i < 160 && !gpuUpdated; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  info.gpuInfoUpdated = gpuUpdated
  try { info.hardwareAcceleration = app.isHardwareAccelerationEnabled() } catch (error) { info.hardwareAccelerationError = String(error) }
  try { info.features = app.getGPUFeatureStatus() } catch (error) { info.featuresError = String(error) }
  let timer
  try {
    info.gpuInfo = await Promise.race([
      app.getGPUInfo('complete'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('GPU info timeout')), 2500) })
    ])
  } catch (error) {
    info.gpuInfoError = error.message
  } finally {
    clearTimeout(timer)
  }
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf8')
})

require(mainPath)
`, 'utf8')
  return path
}

function statSafe(path) {
  try {
    const stat = statSync(path)
    return { exists: true, mtimeMs: stat.mtimeMs, size: stat.size, directory: stat.isDirectory() }
  } catch {
    return { exists: false }
  }
}

function snapshotProfile(path) {
  const root = statSafe(path)
  if (!root.exists) return { path, exists: false }
  const sentinels = ['opia-data.json', 'Preferences', 'Local State', 'Network', 'Cache', 'SingletonLock', 'LOCK']
  return {
    path,
    exists: true,
    root: { mtimeMs: root.mtimeMs, directory: root.directory },
    sentinels: Object.fromEntries(sentinels.map((name) => [name, statSafe(join(path, name))]))
  }
}

function appDataProfiles() {
  if (process.platform !== 'win32' || !process.env.APPDATA) return []
  return [
    join(process.env.APPDATA, 'opia-rss-reader'),
    join(process.env.APPDATA, 'Opia RSS Reader')
  ]
}

function defaultElectronProfile() {
  if (process.platform !== 'win32' || !process.env.APPDATA) return null
  return join(process.env.APPDATA, 'Electron')
}

function sameSnapshot(before, after) {
  return JSON.stringify(before) === JSON.stringify(after)
}

function compareProfiles(before, after) {
  const changed = []
  for (const previous of before) {
    const current = after.find((item) => resolve(item.path).toLowerCase() === resolve(previous.path).toLowerCase())
    if (!current || !sameSnapshot(previous, current)) changed.push(previous.path)
  }
  return changed
}

async function waitForJson(path, timeoutMs, accept) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'))
      if (!accept || accept(value)) return value
      lastError = new Error('JSON not ready')
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return { error: lastError?.message ?? 'timeout' }
}

function gitValue(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true })
  return result.status === 0 ? result.stdout.trim() : null
}

async function closeApp(app) {
  if (!app) return
  try {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ])
  } catch {
    // The app may already have exited.
  }
  try { app.process().kill() } catch {
    // Already gone.
  }
}

async function launchMode({ mode, directory, timeout, sample }) {
  const profile = join(directory, 'profile')
  const infoPath = join(directory, 'main-info.json')
  mkdirSync(profile, { recursive: true })
  seedProfile(profile, sample)
  const bootstrap = writeBootstrap(directory)

  const env = { ...process.env }
  for (const name of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'ELECTRON_CLI_ARGS', 'NODE_OPTIONS']) delete env[name]
  env.OPIA_PERF_PROFILE = profile
  env.OPIA_PERF_MAIN = join(ROOT, 'out', 'main', 'index.js')
  env.OPIA_PERF_INFO = infoPath

  let app = null
  let stdout = ''
  let stderr = ''
  const startedAt = Date.now()
  try {
    app = await electron.launch({
      args: [bootstrap],
      cwd: ROOT,
      env,
      timeout
    })
    app.process().stdout?.on('data', (chunk) => { if (stdout.length < 200000) stdout += chunk })
    app.process().stderr?.on('data', (chunk) => { if (stderr.length < 200000) stderr += chunk })

    const page = await app.firstWindow()
    // A visible, foreground window avoids Chromium's occlusion/background throttling
    // contaminating the sample; document.visibilityState alone cannot prove z-order.
    try {
      await app.evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.show()
          window.focus()
          window.moveTop()
        }
        return BrowserWindow.getAllWindows().length
      })
    } catch {
      // moveTop/focus is best-effort; the report still records visibility.
    }
    await page.bringToFront()
    await page.waitForFunction(
      () => {
        const root = document.querySelector('.juya-root')
        return root && root.querySelectorAll('.juya-entry').length > 0
      },
      undefined,
      { timeout: Math.min(timeout, 30000) }
    )
    const mainInfo = await waitForJson(
      infoPath,
      20000,
      (value) => Boolean(value.resolvedUserData) || Boolean(value.error)
    )
    if (mainInfo?.error) throw new Error(`主进程信息不可用: ${mainInfo.error}`)

    const resolvedUserData = resolve(mainInfo.resolvedUserData ?? '')
    const resolvedSessionData = resolve(mainInfo.resolvedSessionData ?? '')
    if (resolvedUserData.toLowerCase() !== resolve(profile).toLowerCase()) {
      const error = new Error(`隔离失败：主进程 userData 仍指向 ${mainInfo.resolvedUserData}`)
      error.fatal = true
      throw error
    }
    if (resolvedSessionData.toLowerCase() !== resolve(profile).toLowerCase()) {
      const error = new Error(`隔离失败：主进程 sessionData 仍指向 ${mainInfo.resolvedSessionData}`)
      error.fatal = true
      throw error
    }

    const pageInfo = await readPageInfo(page)
    const warmUp = await warmUpArticle(page)
    const cdp = await app.context().newCDPSession(page)
    const measurement = mode === 'light'
      ? await measureLight({ page, cdp, timeout })
      : await measureTrace({ page, cdp, timeout, refreshHz: mainInfo.display?.displayFrequency ?? null })

    const gpuStatus = assessGpu(mainInfo)
    const conditions = assessSampleConditions({
      gpuStatus: gpuStatus.status,
      isolationVerified: true,
      devicePixelRatio: warmUp.devicePixelRatio,
      innerWidth: warmUp.innerWidth,
      innerHeight: warmUp.innerHeight,
      uiZoom: warmUp.uiZoom,
      entryCount: warmUp.entryCount,
      imageCount: warmUp.imageCount,
      imagesComplete: warmUp.imagesComplete,
      scrollStart: measurement.scrollStart,
      scrollEnd: measurement.scrollEnd,
      visibilityStart: measurement.visibilityStart,
      visibilityEnd: measurement.visibilityEnd,
      appHiddenStart: measurement.appHiddenStart,
      appHiddenEnd: measurement.appHiddenEnd
    })

    return {
      mode,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      profile,
      directory,
      mainInfo,
      isolation: {
        profile,
        resolvedUserData: mainInfo.resolvedUserData ?? null,
        resolvedSessionData: mainInfo.resolvedSessionData ?? null,
        defaultUserData: mainInfo.defaultUserData ?? null
      },
      gpu: {
        status: gpuStatus.status,
        findings: gpuStatus.findings,
        activeDevices: activeDevices(mainInfo),
        features: mainInfo.features ?? null,
        hardwareAcceleration: mainInfo.hardwareAcceleration ?? null,
        gpuInfoUpdated: mainInfo.gpuInfoUpdated === true,
        glImplementation: mainInfo.gpuInfo?.auxAttributes?.glImplementationParts ?? null,
        sandboxed: mainInfo.gpuInfo?.auxAttributes?.sandboxed ?? null
      },
      page: pageInfo,
      sample: sample.meta,
      warmUp,
      conditions,
      ...measurement
    }
  } finally {
    writeFileSync(join(directory, 'stdout.log'), stdout, 'utf8')
    writeFileSync(join(directory, 'stderr.log'), stderr, 'utf8')
    await closeApp(app)
  }
}

function activeDevices(mainInfo) {
  const devices = mainInfo.gpuInfo?.gpuDevice
  if (!Array.isArray(devices)) return []
  return devices.filter((device) => device.active).map((device) => ({
    deviceString: device.deviceString ?? null,
    driverVersion: device.driverVersion ?? null,
    vendorId: device.vendorId ?? null,
    deviceId: device.deviceId ?? null
  }))
}

function assessGpu(mainInfo) {
  // Reuse the GPU diagnostic's PASS/FAIL/INCOMPLETE rules so the probe and the
  // standalone command cannot drift. Integrity labels are checked separately by
  // `npm run diagnose:gpu`; this call only evaluates the running app's GPU state.
  return assessGpuHealth({
    probe: {
      gpuInfoUpdated: mainInfo.gpuInfoUpdated === true,
      hardwareAcceleration: mainInfo.hardwareAcceleration,
      features: mainInfo.features,
      gpuInfo: mainInfo.gpuInfo,
      gpuInfoError: mainInfo.gpuInfoError ?? null
    },
    integrity: []
  })
}

async function readPageInfo(page) {
  return await page.evaluate(() => {
    const root = document.querySelector('.juya-root')
    const scroller = document.querySelector('.view-scroll')
    const zoomHost = scroller?.firstElementChild
    return {
      url: location.href,
      title: document.title,
      innerWidth,
      innerHeight,
      devicePixelRatio,
      uiZoom: zoomHost ? Number.parseFloat(getComputedStyle(zoomHost).zoom) || 1 : null,
      variant: root?.getAttribute('data-juya-variant') ?? null,
      heading: root?.querySelector('h1')?.textContent?.trim() ?? null,
      entryCount: root?.querySelectorAll('.juya-entry').length ?? 0,
      imageCount: root?.querySelectorAll('img').length ?? 0,
      scrollHeight: scroller?.scrollHeight ?? null,
      clientWidth: scroller?.clientWidth ?? null,
      clientHeight: scroller?.clientHeight ?? null
    }
  })
}

async function warmUpArticle(page) {
  return await page.evaluate(async () => {
    const scroller = document.querySelector('.view-scroll')
    if (!scroller) throw new Error('未找到 .view-scroll 滚动容器')
    scroller.scrollTop = 0
    const step = Math.max(200, Math.floor(scroller.clientHeight * 0.8))
    for (let y = 0; y <= scroller.scrollHeight; y += step) {
      scroller.scrollTop = y
      await new Promise((resolve) => setTimeout(resolve, 90))
    }
    scroller.scrollTop = scroller.scrollHeight
    await new Promise((resolve) => setTimeout(resolve, 400))
    const root = document.querySelector('.juya-root')
    const images = root ? [...root.querySelectorAll('img')] : [...document.images]
    await Promise.race([
      Promise.all(images.map((image) => image.complete ? null : new Promise((resolve) => {
        image.onload = image.onerror = resolve
      }))),
      new Promise((resolve) => setTimeout(resolve, 4000))
    ])
    scroller.scrollTop = 0
    await new Promise((resolve) => setTimeout(resolve, 500))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const zoomHost = scroller.firstElementChild
    const rect = scroller.getBoundingClientRect()
    return {
      devicePixelRatio,
      innerWidth,
      innerHeight,
      hasFocus: document.hasFocus(),
      uiZoom: zoomHost ? Number.parseFloat(getComputedStyle(zoomHost).zoom) || 1 : null,
      entryCount: root?.querySelectorAll('.juya-entry').length ?? 0,
      imageCount: images.length,
      imagesComplete: images.filter((image) => image.complete).length,
      scrollHeight: scroller.scrollHeight,
      clientWidth: scroller.clientWidth,
      clientHeight: scroller.clientHeight,
      scrollRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
  })
}

function gesturePoint(warmUp) {
  const rect = warmUp.scrollRect
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2)
  }
}

async function measureLight({ page, cdp, timeout }) {
  const idle = await page.evaluate(async () => {
    const samples = []
    const end = performance.now() + 1000
    await new Promise((resolve) => {
      const tick = (timestamp) => {
        samples.push(timestamp)
        if (timestamp < end) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return samples
  })

  await page.evaluate(() => {
    const scroller = document.querySelector('.view-scroll')
    if (scroller) scroller.scrollTop = 0
    window.__opiaPerf = { samples: [], running: true }
    const tick = (timestamp) => {
      window.__opiaPerf.samples.push(timestamp)
      if (window.__opiaPerf.running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const warmUp = await page.evaluate(() => {
    const scroller = document.querySelector('.view-scroll')
    const rect = scroller.getBoundingClientRect()
    return {
      scrollTop: scroller.scrollTop,
      visibilityState: document.visibilityState,
      appHidden: document.documentElement.hasAttribute('data-app-hidden'),
      hasFocus: document.hasFocus(),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
  })
  const point = {
    x: Math.round(warmUp.rect.left + warmUp.rect.width / 2),
    y: Math.round(warmUp.rect.top + warmUp.rect.height / 2)
  }
  const started = Date.now()
  await cdp.send('Input.synthesizeScrollGesture', {
    x: point.x,
    y: point.y,
    xDistance: 0,
    yDistance: -FIXED.scrollDistance,
    speed: FIXED.scrollSpeed,
    gestureSourceType: 'mouse'
  })
  const gestureMs = Date.now() - started
  const after = await page.evaluate(() => {
    window.__opiaPerf.running = false
    const scroller = document.querySelector('.view-scroll')
    return {
      samples: window.__opiaPerf.samples.slice(),
      scrollTop: scroller?.scrollTop ?? null,
      visibilityState: document.visibilityState,
      appHidden: document.documentElement.hasAttribute('data-app-hidden'),
      hasFocus: document.hasFocus()
    }
  })

  const raf = summarizeRafSamples(after.samples)
  const metrics = {
    raf,
    baselineRaf: summarizeRafSamples(idle),
    presented: {
      measured: false,
      reason: '轻量采样不录制 trace，无法可靠取得合成器呈现帧；请运行 trace 模式。'
    },
    dropped: {
      measured: false,
      reason: '轻量采样不录制 trace，无法可靠取得合成器掉帧；请运行 trace 模式。'
    }
  }
  return {
    scrollStart: warmUp.scrollTop,
    scrollEnd: after.scrollTop,
    gestureMs,
    actualSpeed: gestureMs > 0 ? round((after.scrollTop - warmUp.scrollTop) / (gestureMs / 1000), 1) : null,
    visibilityStart: warmUp.visibilityState,
    visibilityEnd: after.visibilityState,
    hasFocusStart: warmUp.hasFocus,
    hasFocusEnd: after.hasFocus,
    appHiddenStart: warmUp.appHidden,
    appHiddenEnd: after.appHidden,
    metrics,
    notMeasured: [metrics.presented.reason, metrics.dropped.reason]
  }
}

async function measureTrace({ page, cdp, timeout, refreshHz }) {
  await page.evaluate(() => {
    const scroller = document.querySelector('.view-scroll')
    if (scroller) scroller.scrollTop = 0
  })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  const before = await page.evaluate(() => {
    const scroller = document.querySelector('.view-scroll')
    const rect = scroller.getBoundingClientRect()
    return {
      scrollTop: scroller.scrollTop,
      visibilityState: document.visibilityState,
      appHidden: document.documentElement.hasAttribute('data-app-hidden'),
      hasFocus: document.hasFocus(),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
  })

  const events = []
  const onData = ({ value }) => { if (Array.isArray(value)) events.push(...value) }
  let traceComplete = false
  let completeResolve = () => {}
  const completePromise = new Promise((resolve) => { completeResolve = resolve })
  const onComplete = () => {
    traceComplete = true
    completeResolve()
  }
  cdp.on('Tracing.dataCollected', onData)
  cdp.on('Tracing.tracingComplete', onComplete)
  try {
    await cdp.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' })
    try { await cdp.send('Tracing.recordClockSyncMarker', { syncId: 'perf-probe-start' }) } catch {
      // Marker is optional evidence; gesture events define the real window.
    }
    const point = {
      x: Math.round(before.rect.left + before.rect.width / 2),
      y: Math.round(before.rect.top + before.rect.height / 2)
    }
    const started = Date.now()
    await cdp.send('Input.synthesizeScrollGesture', {
      x: point.x,
      y: point.y,
      xDistance: 0,
      yDistance: -FIXED.scrollDistance,
      speed: FIXED.scrollSpeed,
      gestureSourceType: 'mouse'
    })
    const gestureMs = Date.now() - started
    const after = await page.evaluate(() => {
      const scroller = document.querySelector('.view-scroll')
      return {
        scrollTop: scroller?.scrollTop ?? null,
        visibilityState: document.visibilityState,
        appHidden: document.documentElement.hasAttribute('data-app-hidden'),
        hasFocus: document.hasFocus()
      }
    })
    try { await cdp.send('Tracing.recordClockSyncMarker', { syncId: 'perf-probe-end' }) } catch {
      // Optional.
    }
    await cdp.send('Tracing.end')
    await Promise.race([
      completePromise,
      new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 20000)))
    ])

    const trace = summarizeTraceEvents(events, { refreshHz })
    const metrics = {
      raf: {
        measured: false,
        reason: 'trace 模式不安装 JS rAF 采样器，避免采样开销污染 trace；本机 trace 也未出现 FireAnimationFrame 事件。请运行 light 模式取得 rAF 指标。'
      },
      presented: trace.measured
        ? {
            measured: true,
            frames: trace.presentedFrames,
            hz: trace.presentedHz,
            intervalMedianMs: trace.presentedIntervalMedianMs,
            intervalP95Ms: trace.presentedIntervalP95Ms,
            intervalWorstMs: trace.presentedIntervalWorstMs,
            expectedVsyncs: trace.expectedVsyncs,
            windowSource: trace.windowSource,
            durationMs: trace.durationMs,
            rendererPid: trace.rendererPid
          }
        : { measured: false, reason: trace.reason ?? 'trace 未能取得呈现帧。' },
      dropped: trace.measured
        ? {
            measured: true,
            frames: trace.droppedFrames,
            beginFrames: trace.beginFrames,
            drawFrames: trace.drawFrames,
            ratioOfBeginFrames: trace.droppedRatioOfBeginFrames,
            ratioOfExpectedVsyncs: trace.droppedRatioOfExpectedVsyncs,
            note: trace.note
          }
        : { measured: false, reason: trace.reason ?? 'trace 未能取得掉帧。' }
    }
    return {
      scrollStart: before.scrollTop,
      scrollEnd: after.scrollTop,
      gestureMs,
      actualSpeed: gestureMs > 0 ? round((after.scrollTop - before.scrollTop) / (gestureMs / 1000), 1) : null,
      visibilityStart: before.visibilityState,
      visibilityEnd: after.visibilityState,
      hasFocusStart: before.hasFocus,
      hasFocusEnd: after.hasFocus,
      appHiddenStart: before.appHidden,
      appHiddenEnd: after.appHidden,
      trace: {
        complete: traceComplete,
        eventCount: events.length,
        categories: TRACE_CATEGORIES,
        raw: trace
      },
      metrics,
      notMeasured: metrics.presented.measured ? [metrics.raf.reason] : [metrics.raf.reason, metrics.presented.reason, metrics.dropped.reason]
    }
  } finally {
    cdp.removeListener('Tracing.dataCollected', onData)
    cdp.removeListener('Tracing.tracingComplete', onComplete)
  }
}

function formatNumber(value, suffix = '') {
  return value === null || value === undefined ? '未测' : `${value}${suffix}`
}

function formatRunMarkdown(run) {
  const lines = [`## ${run.mode}`, '']
  if (run.error) {
    lines.push(`- 状态：失败 — ${run.error}`, '')
    return lines.join('\n')
  }
  lines.push(
    `- 状态：${run.conditions?.met ? '固定条件满足' : '固定条件不满足'}`,
    `- 视口 / DPR / uiZoom：${run.warmUp?.innerWidth}×${run.warmUp?.innerHeight} / ${run.warmUp?.devicePixelRatio} / ${run.warmUp?.uiZoom}`,
    `- 滚动：${run.scrollStart} → ${run.scrollEnd} CSS px，手势 ${run.gestureMs} ms，实测 ${formatNumber(run.actualSpeed, ' px/s')}`,
    `- 可见性：${run.visibilityStart} → ${run.visibilityEnd}；data-app-hidden ${run.appHiddenStart} → ${run.appHiddenEnd}；焦点 ${run.hasFocusStart} → ${run.hasFocusEnd}`,
    `- 预热：${run.warmUp?.entryCount} 条目 / ${run.warmUp?.imageCount} 图像（完成 ${run.warmUp?.imagesComplete}）/ scrollHeight ${run.warmUp?.scrollHeight}`,
    ''
  )
  if (run.mode === 'light') {
    const raf = run.metrics.raf
    const idle = run.metrics.baselineRaf
    lines.push(
      '### rAF 回调（轻量采样）',
      '',
      `- 回调次数：${formatNumber(raf.callbacks)}`,
      `- 回调频率：${formatNumber(raf.hz, ' Hz')}`,
      `- 回调间隔：中位 ${formatNumber(raf.intervalMedianMs, ' ms')}，P95 ${formatNumber(raf.intervalP95Ms, ' ms')}，最差 ${formatNumber(raf.intervalWorstMs, ' ms')}`,
      `- >33.34ms / >50ms：${raf.intervalsOver33Ms ?? '未测'} / ${raf.intervalsOver50Ms ?? '未测'}`,
      `- 空闲基线：${formatNumber(idle.hz, ' Hz')}（中位 ${formatNumber(idle.intervalMedianMs, ' ms')}）`,
      '',
      `- 真实呈现帧：${run.metrics.presented.measured ? '已测' : '未测 — ' + run.metrics.presented.reason}`,
      `- 真实呈现掉帧：${run.metrics.dropped.measured ? '已测' : '未测 — ' + run.metrics.dropped.reason}`,
      ''
    )
  } else {
    const presented = run.metrics.presented
    const dropped = run.metrics.dropped
    lines.push(
      '### compositor 呈现帧（完整 trace）',
      '',
      `- trace 事件数：${run.trace?.eventCount ?? '未测'}；窗口：${run.trace?.raw?.windowSource ?? '未测'} ${run.trace?.raw?.durationMs ?? '?'} ms；renderer pid：${run.trace?.raw?.rendererPid ?? '未测'}`,
      `- compositor 呈现帧：${presented.measured ? `${presented.frames} 帧 / ${presented.hz} Hz` : '未测 — ' + presented.reason}`,
      `- 呈现间隔：中位 ${formatNumber(presented.intervalMedianMs, ' ms')}，P95 ${formatNumber(presented.intervalP95Ms, ' ms')}，最差 ${formatNumber(presented.intervalWorstMs, ' ms')}`,
      `- compositor 掉帧：${dropped.measured ? `${dropped.frames} / ${dropped.beginFrames} BeginFrame（${dropped.ratioOfBeginFrames == null ? '?' : (dropped.ratioOfBeginFrames * 100).toFixed(1) + '%'}）；期望 vsync ${presented.expectedVsyncs ?? '未测'}` : '未测 — ' + dropped.reason}`,
      '',
      `- rAF 回调：${run.metrics.raf.measured ? '已测' : '未测 — ' + run.metrics.raf.reason}`,
      ''
    )
  }
  if (run.conditions?.issues?.length) {
    lines.push('### 不可比原因', '', ...run.conditions.issues.map((issue) => `- ${issue}`), '')
  }
  lines.push('> 数字不可与另一模式或另一样本混档比较。', '')
  return lines.join('\n')
}

function renderMarkdown(report) {
  const lines = [
    '# 性能探针报告（#46）',
    '',
    `- 生成时间：${report.createdAt}`,
    `- 分支 / HEAD：${report.branch ?? '未知'} / ${report.head ?? '未知'}`,
    `- 结论：${report.comparability.comparable ? '样本可比' : '样本不可比'}`,
    `- GPU（应用内状态）：${report.prereq.status}${report.prereq.findings.length ? ' — ' + report.prereq.findings.join('；') : ''}`,
    `- 活动显卡：${report.gpu.activeDevices.map((device) => device.deviceString).filter(Boolean).join(', ') || '未知'}`,
    `- 显示器刷新率：${report.display?.frequencyHz ?? '未知'} Hz；缩放 ${report.display?.scaleFactor ?? '未知'}`,
    `- 固定条件：${FIXED.viewportWidth}×${FIXED.viewportHeight} CSS px，DPR ${FIXED.devicePixelRatio}，uiZoom ${FIXED.uiZoom}，滚动 ${FIXED.scrollDistance} px @ ${FIXED.scrollSpeed} px/s`,
    `- 样本：${report.sample.title}（${report.sample.entries} 条目 / ${report.sample.images} 图像，合成固定样本）`,
    '- 先决条件：先运行 `npm run diagnose:gpu`；GPU 未 PASS 时本报告标注样本不可比。',
    ''
  ]
  if (report.comparability.issues.length) {
    lines.push('## 不可比原因', '', ...report.comparability.issues.map((issue) => `- ${issue}`), '')
  }
  lines.push('## 固定条件核对', '')
  lines.push('| 模式 | 视口 | DPR | uiZoom | 滚动 | visibility | data-app-hidden | 结果 |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const run of report.runs) {
    if (run.error) {
      lines.push(`| ${run.mode} | - | - | - | - | - | - | 失败：${run.error} |`)
      continue
    }
    lines.push(
      `| ${run.mode} | ${run.warmUp?.innerWidth}×${run.warmUp?.innerHeight} | ${run.warmUp?.devicePixelRatio} | ${run.warmUp?.uiZoom} | ` +
      `${run.scrollStart}→${run.scrollEnd} | ${run.visibilityStart}→${run.visibilityEnd} | ` +
      `${run.appHiddenStart}→${run.appHiddenEnd} | ${run.conditions?.met ? '满足' : '不满足'} |`
    )
  }
  lines.push('')
  lines.push('## 隔离', '')
  lines.push(
    ...report.isolation.profiles.map((profile) => (
      `- 临时 profile${profile.profile ? `（${basename(dirname(profile.profile))}）` : ''}：\`${profile.profile}\`；主进程 userData \`${profile.resolvedUserData ?? '未知'}\`，sessionData \`${profile.resolvedSessionData ?? '未知'}\``
    )),
    `- 真实 profile 快照：${report.isolation.realProfilesBefore.map((profile) => `${profile.path}${profile.exists ? '' : '（不存在）'}`).join('；')}`,
    `- 运行前后变化：${report.isolation.changedPaths.length ? report.isolation.changedPaths.join('；') : '无'}`,
    `- 默认 Electron profile 变化：${report.isolation.defaultProfileChanged ?? '无'}`,
    `- 验证方法：${report.isolation.method}`,
    ''
  )
  for (const run of report.runs) lines.push(formatRunMarkdown(run))
  lines.push(
    '## 边界',
    '',
    '- 这不是显示 FPS 验收：rAF 回调频率不是显示 FPS，trace 呈现/掉帧是 Chromium compositor 口径。',
    '- 轻量采样与完整 trace 分开跑、分开报告；两种模式的数字不可混档比较。',
    '- 每次运行是一个单段样本；机器负载或温度会带来明显波动，比较时应看同一批次的多次复跑，不要用单次数字下结论。',
    '- 样本是合成固定文章，不是 `docs/GPU-AUDIT-2026-10-22.md` 的缓存文章；绝对值不可跨样本比较。',
    '- 本命令不接入 `verify` / CI，不修改权限、GPU 设置或用户真实 profile。',
    ''
  )
  return lines.join('\n')
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log(HELP)
    return 0
  }
  let options
  try {
    options = parseOptions(args)
  } catch (error) {
    console.error(error.message)
    return 2
  }

  const mainEntry = join(ROOT, 'out', 'main', 'index.js')
  const rendererEntry = join(ROOT, 'out', 'renderer', 'index.html')
  for (const path of [mainEntry, rendererEntry]) {
    if (!statSafe(path).exists) {
      console.error(`[perf-probe] 缺少构建产物：${path}；先运行 npm run build:dir。`)
      return 2
    }
  }
  if (!statSafe(require('electron')).exists) {
    console.error('[perf-probe] 找不到 Electron 运行时；先安装依赖。')
    return 2
  }

  console.log('[perf-probe] 先决条件：先运行 npm run diagnose:gpu；GPU 未 PASS 时样本标注为不可比。')
  mkdirSync(options.output, { recursive: true })
  const runDirectory = mkdtempSync(join(options.output, 'run-'))
  const sample = buildSample()
  const modes = options.mode === 'both' ? ['light', 'trace'] : [options.mode]
  const realProfilePaths = appDataProfiles()
  const defaultProfile = defaultElectronProfile()
  const beforeProfiles = realProfilePaths.map(snapshotProfile)
  const beforeDefault = defaultProfile ? snapshotProfile(defaultProfile) : null

  const report = {
    schemaVersion: 1,
    ticket: 46,
    createdAt: new Date().toISOString(),
    directory: runDirectory,
    branch: gitValue(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: gitValue(['rev-parse', 'HEAD']),
    probe: {
      script: fileURLToPath(import.meta.url),
      node: process.version,
      electron: null,
      chrome: null
    },
    prereq: { command: 'npm run diagnose:gpu', status: 'INCOMPLETE', findings: [], note: 'status 为本次应用内 GPU 状态；完整性标签诊断请以 npm run diagnose:gpu 为准。' },
    display: null,
    gpu: { activeDevices: [] },
    sample: sample.meta,
    conditions: FIXED,
    isolation: {
      profiles: [],
      realProfilesBefore: beforeProfiles,
      realProfilesAfter: null,
      defaultProfileBefore: beforeDefault,
      defaultProfileChanged: null,
      changedPaths: [],
      verified: false,
      method: '临时 profile + 在 require 主进程前 app.setPath(\'userData\'/\'sessionData\')；真实 profile 候选路径在运行前后做只读 stat 快照（根目录、opia-data.json、Preferences、Local State、Network、Cache、SingletonLock）并比较 mtime/size/existence；同时核对主进程实际 userData/sessionData 指向临时目录。'
    },
    runs: [],
    comparability: { comparable: false, issues: [] }
  }

  let fatal = false
  for (const mode of modes) {
    const directory = join(runDirectory, mode)
    mkdirSync(directory, { recursive: true })
    let run
    try {
      run = await launchMode({
        mode,
        directory,
        timeout: options.timeout,
        sample
      })
    } catch (error) {
      run = { mode, directory, error: error.message, fatal: error.fatal === true }
      if (error.fatal) fatal = true
    }
    report.runs.push(run)
    if (run.mainInfo) {
      report.display ??= {
        frequencyHz: run.mainInfo.display?.displayFrequency ?? null,
        scaleFactor: run.mainInfo.display?.scaleFactor ?? null,
        bounds: run.mainInfo.display?.bounds ?? null
      }
      report.probe.electron ??= run.mainInfo.versions?.electron ?? null
      report.probe.chrome ??= run.mainInfo.versions?.chrome ?? null
      report.gpu.activeDevices = run.gpu?.activeDevices?.length ? run.gpu.activeDevices : report.gpu.activeDevices
      if (run.gpu?.status && run.gpu.status !== 'PASS') {
        report.prereq.status = run.gpu.status
        report.prereq.findings = run.gpu.findings ?? []
      } else if (report.prereq.status === 'INCOMPLETE' && run.gpu?.status === 'PASS') {
        report.prereq.status = 'PASS'
        report.prereq.findings = run.gpu.findings ?? []
      }
      report.isolation.profiles.push(run.isolation)
    }
    const markdown = formatRunMarkdown(run)
    writeFileSync(join(directory, 'report.json'), JSON.stringify(run, null, 2), 'utf8')
    writeFileSync(join(directory, 'report.md'), `# 性能探针 — ${mode}\n\n${markdown}`, 'utf8')
    if (fatal) break
  }

  const afterProfiles = realProfilePaths.map(snapshotProfile)
  const changedPaths = compareProfiles(beforeProfiles, afterProfiles)
  const afterDefault = defaultProfile ? snapshotProfile(defaultProfile) : null
  report.isolation.realProfilesAfter = afterProfiles
  report.isolation.defaultProfileChanged = beforeDefault && afterDefault && !sameSnapshot(beforeDefault, afterDefault)
    ? defaultProfile
    : null
  report.isolation.changedPaths = changedPaths
  report.isolation.verified = Boolean(
    report.isolation.profiles.length === report.runs.filter((run) => !run.error).length &&
    report.isolation.profiles.length > 0 &&
    report.isolation.profiles.every((entry) =>
      entry.profile &&
      entry.resolvedUserData &&
      resolve(entry.resolvedUserData).toLowerCase() === resolve(entry.profile).toLowerCase() &&
      entry.resolvedSessionData &&
      resolve(entry.resolvedSessionData).toLowerCase() === resolve(entry.profile).toLowerCase()
    ) &&
    changedPaths.length === 0
  )

  const issues = []
  if (!report.isolation.verified) issues.push('真实 profile 前后快照变化或主进程 userData 未隔离，样本不可比')
  for (const run of report.runs) {
    if (run.error) continue
    if (run.gpu?.status !== 'PASS') issues.push(`${run.mode}: GPU ${run.gpu?.status}，样本不可比`)
    if (run.conditions && !run.conditions.met) issues.push(...run.conditions.issues.map((issue) => `${run.mode}: ${issue}`))
    if (run.mode === 'light' && !run.metrics?.raf?.measured) issues.push('light: rAF 指标未测')
    if (run.mode === 'trace' && run.trace?.complete !== true) issues.push('trace: 未收到 tracingComplete，报告可能不完整')
    if (run.mode === 'trace' && !run.metrics?.presented?.measured) issues.push('trace: 呈现帧指标未测')
    if (run.mode === 'trace' && !run.metrics?.dropped?.measured) issues.push('trace: 掉帧指标未测')
  }
  report.comparability.issues = [...new Set(issues)]
  report.comparability.comparable = report.comparability.issues.length === 0 && report.runs.every((run) => !run.error)

  writeFileSync(join(runDirectory, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  writeFileSync(join(runDirectory, 'report.md'), renderMarkdown(report), 'utf8')

  const summary = [
    `# 性能探针：${report.comparability.comparable ? '样本可比' : '样本不可比'}`,
    '',
    `- 分支 / HEAD: ${report.branch ?? '未知'} / ${report.head ?? '未知'}`,
    `- GPU（应用内状态）: ${report.prereq.status}${report.prereq.findings.length ? ' — ' + report.prereq.findings.join('; ') : ''}`,
    `- 活动显卡: ${report.gpu.activeDevices.map((device) => device.deviceString).filter(Boolean).join(', ') || '未知'}`,
    `- 刷新率: ${report.display?.frequencyHz ?? '未知'} Hz`,
    `- 隔离: ${report.isolation.verified ? '已证明（真实 profile 快照无变化）' : '未证明'}`,
    ...(report.comparability.issues.length ? ['', ...report.comparability.issues.map((issue) => `- ${issue}`)] : []),
    '',
    `Report: ${join(runDirectory, 'report.md')}`,
    ''
  ].join('\n')
  console.log(summary)

  if (fatal) return 2
  if (report.runs.some((run) => run.error)) return 2
  return report.comparability.comparable ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(`[perf-probe] ${error.message}`)
    process.exitCode = 2
  }
}
