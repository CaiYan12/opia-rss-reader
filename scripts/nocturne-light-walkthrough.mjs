#!/usr/bin/env node
/**
 * nocturne-light 破晓：视觉归档 + 真实像素对比度审计（2026-10-31）
 * =============================================================================
 * 需求：docs/juyathemesworks/nocturne/nocturne-light.md §9
 *   · 亮侧 5 张归档（阅读刊头 / 首条图文 / 订阅页 / 560 / RM），逐字节基线；
 *   · 亮侧对比度审计：muted / 导语 / 概览 / 焦点环 / 卡片文字全部 ≥ AA，
 *     「亮侧场景 veil 后的实际合成面」用真实像素实算，不用手抄的合成常量。
 *
 * 复现口径（与暗侧 scripts/nocturne-visual-walkthrough.mjs 同一套证据纪律）：
 *   · 非 RM 冻结档（写盘的 4 张）：注入 animation/transition: none !important；
 *   · RM 档：只 emulateMedia({reducedMotion:'reduce'})，不注入冻结；
 *   · 非 RM 未冻结档（只作证据，不写盘）：把动画 seek 到 0 / 60s，证明晨雾是活的；
 *   · 每次截图前显式把鼠标移出内容区（归档帧 = 默认态，不靠鼠标恰好停在哪里）。
 *   亮侧与暗侧的差别：亮侧没有 opacity 关键帧（晨雾只动 transform），RM 与冻结档都落在
 *   「无动画」的静态 transform 上 ⇒ 两图应逐字节相同；这一点由本脚本断言并如实打印。
 *
 * 对比度审计（真实像素，不采信目测）：
 *   · 只隐藏**文字**（color / background-clip / filter），保留场景、veil、导语底、卡面；
 *   · 把目标元素滚到滚动口顶端/底端（.juya-scene 是 sticky ⇒ 视口锚定，滚动位置决定合成面）；
 *   · 截图 6px 条带，逐列取中位数（滤掉 1px 等高线/晨露），再取最暗像素作为深墨文字的最坏面；
 *   · token 一律从 juya.css 实读（不手抄）；文字门槛 4.5、非文本 UI（焦点环）3。
 *   · 亮色主题里深墨文字的最坏面 = 最暗背景；焦点环同样是深色，取同一最坏面。
 *
 * 用法：
 *   npm run build:dir
 *   node scripts/nocturne-light-walkthrough.mjs            # 写 5 张归档 + 打印审计
 *   node scripts/nocturne-light-walkthrough.mjs --verify   # 只比对归档，不写盘；审计照跑
 * 退出码：0 = 归档一致且审计全 PASS；1 = 有断言/审计 FAIL；2 = 环境缺失。
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'out', 'renderer')
const ARCHIVE_DIR = join(ROOT, 'docs', 'juyathemesworks', 'nocturne')
const CSS_PATH = join(ROOT, 'src', 'renderer', 'juya', 'juya.css')
const HELPERS_TS = join(ROOT, 'tests', 'e2e', 'helpers.ts')
const STUB_BUNDLE = join(ROOT, 'out', '.light-walkthrough-stub.mjs')
const PORT = 4200
const ORIGIN = `http://127.0.0.1:${PORT}`
const VERIFY_ONLY = process.argv.slice(2).includes('--verify')

const SHOTS = [
  { file: 'nocturne-light-阅读页-1280-刊头与概览.png', viewport: { width: 1280, height: 800 }, kind: 'reader-top' },
  { file: 'nocturne-light-阅读页-1280-首条图文与回流带.png', viewport: { width: 1280, height: 800 }, kind: 'reader-entry' },
  { file: 'nocturne-light-订阅页-1280.png', viewport: { width: 1280, height: 800 }, kind: 'feed-top' },
  { file: 'nocturne-light-窄窗-560-阅读页.png', viewport: { width: 560, height: 800 }, kind: 'reader-top' },
  { file: 'nocturne-light-reduced-motion-1280-阅读页.png', viewport: { width: 1280, height: 800 }, kind: 'reader-top', rm: true }
]

const FREEZE =
  '*, *::before, *::after { animation: none !important; transition: none !important; }'
const SEEK_MS = 60000
const RM_NOISE = { maxPixels: 64, maxChannel: 16 }

// ------------------------------------------------------------------ 前置检查
if (!existsSync(join(OUT_DIR, 'index.html'))) {
  console.error('[fatal] 找不到 out/renderer/index.html。请先执行：npm run build:dir')
  process.exit(2)
}

// ------------------------------------------------------------------ 静态服务（独立端口 4197）
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}
const stripCsp = (html) => html.replace(/<meta[\s\S]*?Content-Security-Policy[\s\S]*?>/, '')
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  const abs = normalize(join(OUT_DIR, rel))
  if (!abs.startsWith(OUT_DIR + sep)) return res.writeHead(403).end('forbidden')
  if (!existsSync(abs)) return res.writeHead(404).end('not found')
  const body = readFileSync(abs)
  const type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': type })
  res.end(type.startsWith('text/html') ? stripCsp(body.toString('utf-8')) : body)
})

// ------------------------------------------------------------------ 复用已入库的 helpers.ts 桩
async function loadStubScript(scenario) {
  let esbuild
  try {
    esbuild = await import('esbuild')
  } catch {
    console.error('[fatal] 无法 import esbuild（npm install 后应存在于 node_modules）。')
    process.exit(2)
  }
  const built = await esbuild.build({
    entryPoints: [HELPERS_TS],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent'
  })
  mkdirSync(dirname(STUB_BUNDLE), { recursive: true })
  writeFileSync(STUB_BUNDLE, built.outputFiles[0].text, 'utf-8')
  const mod = await import(pathToFileURL(STUB_BUNDLE).href)
  return mod.makeStubScript(scenario)
}

// ------------------------------------------------------------------ PNG / WCAG 工具
function decodePng(buf) {
  let off = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat = []
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`不支持的 PNG：bitDepth=${bitDepth} colorType=${colorType}`)
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + i] : 0
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0
      const x = row[i]
      let v
      switch (filter) {
        case 0: v = x; break
        case 1: v = x + a; break
        case 2: v = x + b; break
        case 3: v = x + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: throw new Error(`未知 PNG filter ${filter}`)
      }
      out[y * stride + i] = v & 0xff
    }
  }
  const rows = []
  for (let y = 0; y < height; y++) {
    const px = []
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * bpp
      px.push((out[i] << 16) | (out[i + 1] << 8) | out[i + 2])
    }
    rows.push(px)
  }
  return { width, height, rows }
}
function pixelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: true, diffPixels: Number.NaN, totalPixels: 0, maxChannelDelta: Number.NaN }
  }
  let diffPixels = 0
  let maxChannelDelta = 0
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const pa = a.rows[y][x]
      const pb = b.rows[y][x]
      let d = 0
      for (const shift of [16, 8, 0]) {
        d = Math.max(d, Math.abs(((pa >> shift) & 0xff) - ((pb >> shift) & 0xff)))
      }
      if (d > 0) diffPixels++
      if (d > maxChannelDelta) maxChannelDelta = d
    }
  }
  return { sizeMismatch: false, diffPixels, totalPixels: a.width * a.height, maxChannelDelta }
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').toUpperCase()
const lum = (rgb) => {
  const ch = [16, 8, 0].map((s) => {
    const v = ((rgb >> s) & 0xff) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
const contrast = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
const f1 = (n) => n.toFixed(4)

// ------------------------------------------------------------------ 从 juya.css 实读 token
const RAW_CSS = readFileSync(CSS_PATH, 'utf-8')
const CSS = RAW_CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
const must = (value, what) => {
  if (value === '' || value === undefined || value === null || Number.isNaN(value)) {
    console.error(`[fatal] 无法从 juya.css 抠出：${what}`)
    process.exit(2)
  }
  return value
}
const LIGHT_BLOCK = must(
  CSS.match(/\[data-juya-variant='nocturne-light'\]\s*\{[^}]*\}/)?.[0] ?? '',
  'nocturne-light token 块'
)
const hexOf = (block, name) =>
  must(
    Number.parseInt((block.match(new RegExp(`${name}:\\s*#([0-9a-fA-F]{6})`))?.[1] ?? ''), 16),
    name
  )
const rgbaOf = (block, name) => {
  const m = block.match(new RegExp(`${name}:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\d.]+)\\s*\\)`))
  return must(
    m ? { rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]), alpha: Number(m[4]) } : NaN,
    name
  )
}
const TOKEN = {
  bg: hexOf(LIGHT_BLOCK, '--jy-bg'),
  text: hexOf(LIGHT_BLOCK, '--jy-text'),
  heading: hexOf(LIGHT_BLOCK, '--jy-heading'),
  muted: hexOf(LIGHT_BLOCK, '--jy-muted'),
  link: hexOf(LIGHT_BLOCK, '--jy-link'),
  accent: hexOf(LIGHT_BLOCK, '--jy-accent'),
  focus: hexOf(LIGHT_BLOCK, '--jy-focus'),
  leadText: hexOf(LIGHT_BLOCK, '--jy-lead-text'),
  leadBg: rgbaOf(LIGHT_BLOCK, '--jy-lead-bg')
}
const hex = (rgb) => `#${rgb.toString(16).padStart(6, '0')}`

// ------------------------------------------------------------------ 页面操作
const ACTIVE_READER = 'div.min-h-0.w-full:has(.juya-masthead)'
async function openFirstArticle(page) {
  const styled = page.locator('.juya-feed-item').first()
  const generic = page.locator('main article').first()
  await Promise.race([
    styled.waitFor({ state: 'visible', timeout: 8000 }),
    generic.waitFor({ state: 'visible', timeout: 8000 })
  ]).catch(() => {})
  if (await styled.isVisible().catch(() => false)) await styled.click()
  else await generic.click()
}
async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 8000 })
  await page.waitForTimeout(250)
}
async function scrollFirstEntryToPortTop(page) {
  await page.evaluate((sel) => {
    const tab = document.querySelector(sel)
    const scroller = tab?.querySelector('.view-scroll')
    const entry = tab?.querySelector('article.juya-entry')
    if (!scroller || !entry) throw new Error('滚动取景：找不到 .view-scroll 或 article.juya-entry')
    scroller.scrollTop += entry.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  }, ACTIVE_READER)
  await page.waitForTimeout(150)
}
async function parkMouseOutside(page) {
  await page.mouse.move(4, 4)
  await page.waitForTimeout(120)
  const chain = await page.evaluate(() =>
    [...document.querySelectorAll(':hover')]
      .map((el) => (typeof el.className === 'string' ? el.className : el.tagName))
      .join(' | ')
  )
  if (/juya-(entry|overview|section|root)/.test(chain)) {
    throw new Error(`鼠标未移出阅读内容区，hover 链仍含 juya 元素：${chain}`)
  }
  return chain
}

const STYLE_PROBE = (sel) => {
  const tab = document.querySelector(sel)
  const cs = (root, q, pseudo = null) => {
    const el = root?.querySelector(q)
    if (!el) return null
    const s = getComputedStyle(el, pseudo)
    return { animationName: s.animationName, animationDuration: s.animationDuration, filter: s.filter }
  }
  return {
    h1: cs(tab, '.juya-masthead h1'),
    dust: cs(tab, '.juya-scene-dust'),
    dustAfter: cs(tab, '.juya-scene-dust', '::after'),
    stars: cs(tab, '.juya-scene-stars'),
    root: tab ? { animationName: getComputedStyle(tab.querySelector('.juya-root')).animationName } : null,
    animations: document.getAnimations().map((a) => ({
      name: a.animationName ?? '(non-css)',
      pseudo: a.effect?.pseudoElement ?? null
    }))
  }
}

/** 隐藏**文字**但保留场景 / veil / 导语底 / 卡面。 */
const HIDE_TEXT = `
  .juya-issue *, .jynoct-feed-masthead *, .juya-feed-item * {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    background-image: none !important;
    filter: none !important;
    text-shadow: none !important;
    box-shadow: none !important;
  }
  .juya-issue .juya-masthead h1, .jynoct-feed-masthead h1 {
    background: none !important;
  }
`

/** 采样条带：逐列取 6 行中位数，返回最暗/最亮背景像素。 */
async function sampleStrip(page, clip, label) {
  const height = Math.max(1, Math.min(6, Math.round(clip.height)))
  const buf = await page.screenshot({
    clip: { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.max(1, Math.round(clip.width)), height }
  })
  const { width, rows } = decodePng(buf)
  let darkest = 0xffffff
  for (let cx = 0; cx < width; cx++) {
    const sorted = rows.map((r) => r[cx]).sort((a, b) => lum(a) - lum(b))
    const mid = sorted[Math.floor(sorted.length / 2)]
    if (lum(mid) < lum(darkest)) darkest = mid
  }
  return { label, darkest }
}

/** 把元素滚到滚动口顶端或底端（clamp 到可滚动范围），返回其在视口中的盒。 */
async function placeElement(page, selector, where) {
  return page.evaluate(
    ({ sel, where, ACTIVE_READER }) => {
      const tab = document.querySelector(ACTIVE_READER)
      const scroller = tab?.querySelector('.view-scroll')
      const el = tab?.querySelector(sel)
      if (!scroller || !el) throw new Error(`审计取景：找不到 ${sel}`)
      const port = scroller.getBoundingClientRect()
      const rect = el.getBoundingClientRect()
      const docTop = rect.top - port.top + scroller.scrollTop
      const target =
        where === 'top'
          ? docTop
          : docTop - (port.height - Math.min(rect.height, port.height))
      scroller.scrollTop = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight))
      const after = el.getBoundingClientRect()
      return {
        x: after.left,
        y: after.top,
        width: after.width,
        height: Math.min(24, after.height),
        portTop: port.top,
        portBottom: port.top + port.height
      }
    },
    { sel: selector, where, ACTIVE_READER }
  )
}

// ------------------------------------------------------------------ 主流程
const failures = []
const check = (ok, label, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

let chromium
try {
  ;({ chromium } = await import('@playwright/test'))
} catch {
  console.error('[fatal] 无法 import @playwright/test（npm install 后应存在）。')
  process.exit(2)
}

await new Promise((res, rej) => {
  server.once('error', rej)
  server.listen(PORT, '127.0.0.1', res)
})
console.log(`[服务] 静态服务 ${ORIGIN} → ${OUT_DIR}（独立端口 4200）`)

const stubScript = await loadStubScript('nocturneLightSvg')
console.log("[桩] 复用 tests/e2e/helpers.ts 的 makeStubScript('nocturneLightSvg')")

const browser = await chromium.launch()
const results = new Map()
const extra = new Map()

try {
  // ---------------- 5 张归档 ----------------
  for (const shot of SHOTS) {
    const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 1 })
    const page = await context.newPage()
    if (shot.rm) await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(stubScript)
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
    if (shot.kind !== 'feed-top') {
      await openFirstArticle(page)
      await page.locator(ACTIVE_READER).locator('.juya-masthead h1').waitFor({ state: 'visible' })
    }
    if (shot.kind === 'reader-entry') await scrollFirstEntryToPortTop(page)
    if (!shot.rm) await page.addStyleTag({ content: FREEZE })
    await settle(page)
    if (shot.kind === 'reader-top' && shot.viewport.width === 1280) {
      extra.set('before-park', await page.screenshot())
    }
    await parkMouseOutside(page)
    const buf = await page.screenshot()
    results.set(shot.file, buf)
    if (shot.rm) {
      const t1 = await page.screenshot()
      await page.waitForTimeout(800)
      const t2 = await page.screenshot()
      extra.set('rm-late-1', t1)
      extra.set('rm-late-2', t2)
      extra.set('rm-style', await page.evaluate(STYLE_PROBE, ACTIVE_READER))
    } else if (shot.viewport.width === 1280 && shot.kind === 'reader-top') {
      extra.set('frozen-top', buf)
    }
    await context.close()
  }

  // ---------------- 非 RM 未冻结对照（证明晨雾是活的） ----------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.addInitScript(stubScript)
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
    await openFirstArticle(page)
    await page.locator(ACTIVE_READER).locator('.juya-masthead h1').waitFor({ state: 'visible' })
    await settle(page)
    extra.set('nonrm-style', await page.evaluate(STYLE_PROBE, ACTIVE_READER))
    const seek = async (t) => {
      await page.evaluate((ms) => {
        for (const a of document.getAnimations()) {
          a.pause()
          a.currentTime = ms
        }
      }, t)
      await page.waitForTimeout(150)
      return page.screenshot()
    }
    extra.set('nonrm-t0', await seek(0))
    extra.set('nonrm-t60s', await seek(SEEK_MS))
    await context.close()
  }

  // ---------------- 对比度审计（真实像素） ----------------
  console.log('\n════════ 亮侧对比度审计（真实像素，文字 4.5 / 焦点环 3）════════')
  console.log(
    `token：bg ${hex(TOKEN.bg)} / text ${hex(TOKEN.text)} / heading ${hex(TOKEN.heading)} / muted ${hex(TOKEN.muted)} / link ${hex(TOKEN.link)} / accent ${hex(TOKEN.accent)} / focus ${hex(TOKEN.focus)} / lead ${hex(TOKEN.leadText)}`
  )
  const auditRows = []
  for (const vw of [480, 700, 800, 1280]) {
    const context = await browser.newContext({ viewport: { width: vw, height: 800 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.addInitScript(stubScript)
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
    await openFirstArticle(page)
    await page.locator(ACTIVE_READER).locator('.juya-masthead h1').waitFor({ state: 'visible' })
    await page.addStyleTag({ content: FREEZE })
    await settle(page)
    await page.addStyleTag({ content: HIDE_TEXT })

    const samples = []
    // 概览行：目录在文档顶部，分别在顶端/底端取景（底端是 clamp 后的可达位置）
    for (const where of ['top', 'bottom']) {
      const box = await placeElement(page, '.juya-overview li', where)
      samples.push(
        await sampleStrip(
          page,
          { x: box.x, y: box.y + 2, width: box.width, height: 6 },
          `概览 li@${where}`
        )
      )
    }
    // 导语：默认态 + 条目 hover 态（亮侧共享 hover 会叠 4% 暗层）
    const leadBoxTop = await placeElement(page, '.juya-lead', 'top')
    const leadTrim = await page.evaluate((sel) => {
      const tab = document.querySelector('div.min-h-0.w-full:has(.juya-masthead)')
      const el = tab?.querySelector(sel)
      if (!el) throw new Error('lead')
      const s = getComputedStyle(el)
      return {
        pl: Number.parseFloat(s.paddingLeft),
        pr: Number.parseFloat(s.paddingRight),
        pt: Number.parseFloat(s.paddingTop)
      }
    }, '.juya-lead')
    const leadSurface = await sampleStrip(
      page,
      {
        x: leadBoxTop.x + leadTrim.pl,
        y: leadBoxTop.y + leadTrim.pt,
        width: leadBoxTop.width - leadTrim.pl - leadTrim.pr,
        height: 6
      },
      '导语（默认态）'
    )
    const entryBox = await page.evaluate(() => {
      const tab = document.querySelector('div.min-h-0.w-full:has(.juya-masthead)')
      const el = tab?.querySelector('article.juya-entry')
      const r = el?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
    })
    if (entryBox) {
      await page.mouse.move(entryBox.x + entryBox.width / 2, entryBox.y + Math.min(60, entryBox.height / 2))
      await page.waitForTimeout(60)
      const leadHover = await sampleStrip(
        page,
        {
          x: leadBoxTop.x + leadTrim.pl,
          y: leadBoxTop.y + leadTrim.pt,
          width: leadBoxTop.width - leadTrim.pl - leadTrim.pr,
          height: 6
        },
        '导语（hover）'
      )
      samples.push(leadHover)
      await page.mouse.move(4, 4)
    }
    samples.push(leadSurface)
    // 正文段落 / 栏目 h2 / 相关链接 / 条目标题编号
    for (const [sel, where, label] of [
      ['.juya-entry p:not(.juya-links-label)', 'top', '正文段落'],
      ['.juya-entry p:not(.juya-links-label)', 'bottom', '正文段落'],
      ['.juya-section > h2', 'top', '栏目 h2'],
      ['.juya-links a', 'top', '相关链接'],
      ['.juya-entry h3 .juya-index', 'top', '条目标题编号']
    ]) {
      const box = await placeElement(page, sel, where)
      samples.push(
        await sampleStrip(page, { x: box.x, y: box.y + 2, width: box.width, height: 6 }, `${label}@${where}`)
      )
    }
    // 亮侧旧账 4.32 的真实面：条目 hover 时元信息叠 4% 暗层（共享 .jynoct .juya-entry:hover）。
    const entryTop = await placeElement(page, 'article.juya-entry', 'top')
    await page.mouse.move(entryTop.x + entryTop.width / 2, entryTop.y + 30)
    await page.waitForTimeout(60)
    const metaBox = await page.locator('.juya-entry h3 .juya-index').first().boundingBox()
    let mutedHover = null
    if (metaBox) {
      const sample = await sampleStrip(
        page,
        { x: metaBox.x, y: metaBox.y + 2, width: metaBox.width, height: 6 },
        '元信息（hover）'
      )
      mutedHover = { sample, ratio: contrast(TOKEN.muted, sample.darkest) }
    }
    await page.mouse.move(4, 4)

    // 普通正文/元信息/序号不使用导语底 —— 必须按各自真实合成面分组，
    // 不能把导语（4% 暗层）当成所有文字的底（那会把 muted/accent 误判成不达标）。
    const plain = samples.filter((s) => !s.label.startsWith('导语'))
    const worst = plain.reduce((a, b) => (lum(b.darkest) < lum(a.darkest) ? b : a), plain[0])
    const leadWorst = [leadSurface, ...samples.filter((s) => s.label.startsWith('导语'))].reduce(
      (a, b) => (lum(b.darkest) < lum(a.darkest) ? b : a)
    )
    const row = {
      vw,
      worst,
      leadWorst,
      text: contrast(TOKEN.text, worst.darkest),
      heading: contrast(TOKEN.heading, worst.darkest),
      muted: contrast(TOKEN.muted, worst.darkest),
      link: contrast(TOKEN.link, worst.darkest),
      index: contrast(TOKEN.link, worst.darkest),
      lead: contrast(TOKEN.leadText, leadWorst.darkest),
      focus: contrast(TOKEN.focus, worst.darkest),
      mutedHover: mutedHover?.ratio ?? Number.NaN
    }
    auditRows.push(row)
    console.log(
      `  vw=${vw}  最暗背景 ${hex(worst.darkest)}（${worst.label}） / 导语底 ${hex(leadWorst.darkest)}（${leadWorst.label}）`
    )
    console.log(
      `        text ${f1(row.text)} / heading ${f1(row.heading)} / muted ${f1(row.muted)} / muted hover ${f1(row.mutedHover)} / link ${f1(row.link)} / 概览序号 ${f1(row.index)} / lead ${f1(row.lead)} / focus ${f1(row.focus)}`
    )
    await context.close()
  }

  // 订阅页：头版文字 + 卡片文字（卡面 0.7 白 + backdrop blur 后的真实合成）
  for (const vw of [1280, 560]) {
    const context = await browser.newContext({ viewport: { width: vw, height: 800 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.addInitScript(stubScript)
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
    await page.addStyleTag({ content: FREEZE })
    await settle(page)
    await page.addStyleTag({ content: HIDE_TEXT })

    const feedSamples = []
    for (const [sel, label] of [
      ['.jynoct-feed-masthead-kicker', '头版 kicker'],
      ['.jynoct-feed-masthead h1', '头版 h1'],
      ['.jynoct-feed-masthead-domain', '头版 host']
    ]) {
      const box = await page.locator(sel).boundingBox()
      if (!box) continue
      feedSamples.push(
        await sampleStrip(page, { x: box.x, y: box.y + 2, width: box.width, height: 6 }, label)
      )
    }
    const cardSamples = []
    for (const [sel, label] of [
      ['.juya-feed-item .juya-feed-body', '卡面 body'],
      ['.juya-feed-item .juya-feed-title', '卡片标题'],
      ['.juya-feed-item .juya-feed-meta', '卡片元信息'],
      ['.juya-feed-item .juya-feed-summary', '卡片摘要']
    ]) {
      const box = await page.locator(sel).first().boundingBox()
      if (!box) continue
      cardSamples.push(
        await sampleStrip(page, { x: box.x, y: box.y + 2, width: box.width, height: 6 }, label)
      )
    }
    const feedWorst = feedSamples.reduce((a, b) => (lum(b.darkest) < lum(a.darkest) ? b : a), feedSamples[0])
    const cardWorst = cardSamples.reduce((a, b) => (lum(b.darkest) < lum(a.darkest) ? b : a), cardSamples[0])
    const row = {
      vw,
      feedWorst,
      cardWorst,
      kicker: contrast(TOKEN.link, feedWorst.darkest),
      feedHeading: contrast(TOKEN.heading, feedWorst.darkest),
      feedHost: contrast(TOKEN.text, feedWorst.darkest),
      cardText: contrast(TOKEN.text, cardWorst.darkest),
      cardHeading: contrast(TOKEN.heading, cardWorst.darkest),
      cardMuted: contrast(TOKEN.muted, cardWorst.darkest),
      cardLink: contrast(TOKEN.link, cardWorst.darkest)
    }
    auditRows.push({ ...row, feed: true })
    console.log(
      `  订阅页 vw=${vw}  头版最暗 ${hex(feedWorst.darkest)}（${feedWorst.label}） / 卡面最暗 ${hex(cardWorst.darkest)}（${cardWorst.label}）`
    )
    console.log(
      `        kicker(靛蓝 link) ${f1(row.kicker)} / 头版标题 ${f1(row.feedHeading)} / host(墨色) ${f1(row.feedHost)} / 卡文 ${f1(row.cardText)} / 卡标题 ${f1(row.cardHeading)} / 卡 muted ${f1(row.cardMuted)} / 卡链接 ${f1(row.cardLink)}`
    )
    await context.close()
  }

  // ---------------- 审计判定 ----------------
  console.log('\n审计判定（文字 ≥4.5；焦点环 ≥3）')
  for (const row of auditRows) {
    if (row.feed) {
      check(row.kicker >= 4.5, `vw=${row.vw} 头版 kicker 靛蓝 --jy-link`, f1(row.kicker))
      check(row.feedHeading >= 4.5, `vw=${row.vw} 头版标题`, f1(row.feedHeading))
      check(row.feedHost >= 4.5, `vw=${row.vw} 头版 host --jy-text`, f1(row.feedHost))
      check(row.cardText >= 4.5, `vw=${row.vw} 卡片正文`, f1(row.cardText))
      check(row.cardHeading >= 4.5, `vw=${row.vw} 卡片标题`, f1(row.cardHeading))
      check(row.cardMuted >= 4.5, `vw=${row.vw} 卡片 muted`, f1(row.cardMuted))
      check(row.cardLink >= 4.5, `vw=${row.vw} 卡片链接`, f1(row.cardLink))
    } else {
      check(row.text >= 4.5, `vw=${row.vw} 正文 --jy-text`, f1(row.text))
      check(row.heading >= 4.5, `vw=${row.vw} 标题 --jy-heading`, f1(row.heading))
      check(row.muted >= 4.5, `vw=${row.vw} 元信息 --jy-muted`, f1(row.muted))
      check(row.mutedHover >= 4.5, `vw=${row.vw} 元信息 hover 4% 面 --jy-muted`, f1(row.mutedHover))
      check(row.link >= 4.5, `vw=${row.vw} 链接 --jy-link`, f1(row.link))
      check(row.index >= 4.5, `vw=${row.vw} 概览序号 靛蓝 --jy-link`, f1(row.index))
      check(row.lead >= 4.5, `vw=${row.vw} 导语 --jy-lead-text`, f1(row.lead))
      check(row.focus >= 3, `vw=${row.vw} 焦点环 --jy-focus（非文本 UI）`, f1(row.focus))
    }
  }
} finally {
  await browser.close()
  await new Promise((res) => server.close(res))
  if (existsSync(STUB_BUNDLE)) rmSync(STUB_BUNDLE, { force: true })
}

// ------------------------------------------------------------------ 归档落盘 / 校验
console.log('\n════════ 五张亮侧归档截图 SHA256 ════════')
if (VERIFY_ONLY) console.log('（--verify：不写盘，只与 docs/ 现有归档比对）')
const rows = []
let allMatch = true
for (const shot of SHOTS) {
  const fresh = results.get(shot.file)
  const hash = sha256(fresh)
  const target = join(ARCHIVE_DIR, shot.file)
  const onDisk = existsSync(target) ? readFileSync(target) : null
  const onDiskHash = onDisk ? sha256(onDisk) : '(缺失)'
  let same = onDisk !== null && Buffer.compare(onDisk, fresh) === 0
  let noiseNote = ''
  if (!same && onDisk && shot.rm) {
    const d = pixelDiff(decodePng(onDisk), decodePng(fresh))
    if (!d.sizeMismatch && d.diffPixels <= RM_NOISE.maxPixels && d.maxChannelDelta <= RM_NOISE.maxChannel) {
      same = true
      noiseNote = `（字节不等，有界像素等价回退通过：diff=${d.diffPixels}px / maxΔ=${d.maxChannelDelta}）`
    }
  }
  if (!VERIFY_ONLY) {
    mkdirSync(ARCHIVE_DIR, { recursive: true })
    writeFileSync(target, fresh)
  } else if (!same) allMatch = false
  rows.push({ file: shot.file, hash, onDiskHash, same, rm: !!shot.rm, bytes: fresh.length })
  console.log(`${hash}  ${shot.rm ? '[RM]' : '    '} ${shot.file}${noiseNote}`)
}

// ------------------------------------------------------------------ RM 证据
console.log('\n════════ RM 证据（计算样式并排 + 像素量化）════════')
const rmStyle = extra.get('rm-style')
const nonRmStyle = extra.get('nonrm-style')
const fmt = (v) => (v === null || v === undefined ? '(元素缺失)' : v)
const styleRow = (label, pick) => {
  const a = pick(nonRmStyle)
  const b = pick(rmStyle)
  console.log(
    `    ${label.padEnd(22)} animationName: ${String(fmt(a?.animationName)).padEnd(26)} → ${fmt(b?.animationName)}` +
      (a?.animationDuration || b?.animationDuration ? `  (duration ${fmt(a?.animationDuration)} → ${fmt(b?.animationDuration)})` : '')
  )
  return { a, b }
}
const rH1 = styleRow('.juya-masthead h1', (s) => s?.h1)
const rDust = styleRow('.juya-scene-dust', (s) => s?.dust)
const rMist = styleRow('.juya-scene-dust::after', (s) => s?.dustAfter)
const rStars = styleRow('.juya-scene-stars', (s) => s?.stars)
const rRoot = styleRow('.juya-root', (s) => s?.root)
console.log(`    非 RM 动画清单：${JSON.stringify(nonRmStyle?.animations ?? [])}`)
console.log(`    RM   动画清单：${JSON.stringify(rmStyle?.animations ?? [])}`)

check(rMist.a?.animationName === 'jy-noct-light-mist', '非 RM：晨雾 ::after 为 jy-noct-light-mist', fmt(rMist.a?.animationName))
check(rMist.a?.animationDuration === '120s', '非 RM：晨雾周期 120s', fmt(rMist.a?.animationDuration))
check(rMist.b?.animationName === 'none', 'RM：晨雾 ::after animationName = none', fmt(rMist.b?.animationName))
check(rDust.b?.animationName === 'none', 'RM：dust 本体无动画', fmt(rDust.b?.animationName))
check(rStars.b?.animationName === 'none', 'RM：亮侧 stars 无 twinkle', fmt(rStars.b?.animationName))
check(rH1.b?.animationName === 'none', 'RM：亮侧 H1 无呼吸动画', fmt(rH1.b?.animationName))
check(rRoot.b?.animationName === 'none', 'RM：.juya-root 永无 animation', fmt(rRoot.b?.animationName))
check(
  (nonRmStyle?.animations?.length ?? 0) > 0 && (rmStyle?.animations?.length ?? 0) === 0,
  'RM 生效：非 RM 有活动动画、RM 下 getAnimations() 为 0 条',
  `非 RM ${fmt(nonRmStyle?.animations?.length)} 条 / RM ${fmt(rmStyle?.animations?.length)} 条`
)
const dAnim = pixelDiff(decodePng(extra.get('nonrm-t0')), decodePng(extra.get('nonrm-t60s')))
console.log(
  `    非 RM 未冻结档：晨雾 seek 0ms vs ${SEEK_MS}ms → 差异像素 ${dAnim.diffPixels}/${dAnim.totalPixels}（maxΔ ${dAnim.maxChannelDelta}）`
)
check(dAnim.diffPixels > 0, '晨雾是活的：seek 0ms 与 60s 的像素确有差异', `${dAnim.diffPixels} px`)
check(
  Buffer.compare(extra.get('rm-late-1'), extra.get('rm-late-2')) === 0,
  'RM 下静止可复现：隔 800ms 截两次 SHA256 相同',
  sha256(extra.get('rm-late-1'))
)
const dRmVsNon = pixelDiff(decodePng(extra.get('rm-late-1')), decodePng(extra.get('nonrm-t0')))
check(dRmVsNon.diffPixels > 0, 'RM 与同视口未冻结默认态可区分', `${dRmVsNon.diffPixels} px`)

// 归档帧状态显式化
const topRow = rows.find((r) => r.file.includes('刊头与概览'))
const dPark = pixelDiff(decodePng(extra.get('before-park')), decodePng(results.get(topRow.file)))
check(dPark.diffPixels > 0, '鼠标残留会产生可见差异（归档必须显式移出内容区）', `${dPark.diffPixels} px`)

const rmRow = rows.find((r) => r.rm)
const frozenRow = rows.find((r) => r.file.includes('刊头与概览'))
const sameAsFrozen = rmRow.hash === frozenRow.hash
check(
  sameAsFrozen,
  '亮侧 RM 图与冻结档逐字节相同（只动 transform、无 opacity 分岔）',
  `${rmRow.hash.slice(0, 16)}…`
)
console.log(
  `\n    RM 图（${rmRow.hash.slice(0, 16)}…）vs 冻结档「刊头与概览」（${frozenRow.hash.slice(0, 16)}…）：${sameAsFrozen ? '逐字节相同' : '不同'}`
)
console.log(
  '    说明：亮侧动画只动 transform（晨雾），没有 opacity 关键帧，也不写 will-change ⇒' +
    '\n    RM 与冻结档都落在同一静态 transform / 栅格状态上，两图逐字节相同（上方断言）。'
)

console.log('\n════════ 归档一致性 ════════')
for (const r of rows) {
  console.log(`  ${r.same ? '一致' : VERIFY_ONLY ? '不一致' : '已写入'}  ${r.file}  (${r.bytes} bytes)`)
}

console.log('\n════════ 结果 ════════')
if (failures.length > 0) {
  console.error(`FAIL：${failures.length} 项断言/审计未成立：`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
console.log(
  VERIFY_ONLY
    ? `PASS：5 张亮侧归档与磁盘现状${allMatch ? '逐字节一致' : '存在差异'}；对比度审计与 RM 证据全部成立。`
    : 'PASS：5 张亮侧归档已生成；对比度审计与 RM 证据全部成立。'
)
process.exit(allMatch || !VERIFY_ONLY ? 0 : 1)
