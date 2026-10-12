/**
 * nocturne 刊头极光探针 —— 取景放大 + 计算样式转储 + 刊头区亮度采样。
 *
 * 用途：设计迭代时逐轮看「刊头实际长什么样」，而不是靠推理。产出图写 %TEMP%，
 * 不进仓库（归档图由 nocturne-visual-walkthrough.mjs 负责）。
 *
 * 与前者的分工：
 *   · walkthrough = 5 张全页归档 + RM 证据（写盘、进 git，有 --verify 逐字节闸门）
 *   · 本脚本     = 刊头 2× 放大特写 + 计算样式 + 亮度/对比度采样（只写 %TEMP%，不受归档闸门约束）
 *
 * 用法：
 *   npm run build:dir && node scripts/nocturne-masthead-probe.mjs <标签>
 *   标签进文件名，便于 A/B 对照：masthead-<标签>.png
 *
 * 端口 4197（避开 playwright.config.ts 的 4173 与 walkthrough 的 4196）。
 * 退出码：0 = 已产出；2 = 环境/前置条件缺失。
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'out', 'renderer')
const HELPERS_TS = join(ROOT, 'tests', 'e2e', 'helpers.ts')
const STUB_BUNDLE = join(ROOT, 'out', '.masthead-probe-stub.mjs')
const PORT = 4197
const ORIGIN = `http://127.0.0.1:${PORT}`
const TAG = (process.argv[2] ?? 'current').replace(/[^\w.-]/g, '')
const DEST = join(tmpdir(), `masthead-${TAG}.png`)
const DEST_NARROW = join(tmpdir(), `masthead-${TAG}-560.png`)

/** 非 RM 档冻结动效，保证同一标签可复现（与 walkthrough 同口径）。 */
const FREEZE =
  '*, *::before, *::after { animation: none !important; transition: none !important; }'

if (!existsSync(join(OUT_DIR, 'index.html'))) {
  console.error('[fatal] 找不到 out/renderer/index.html —— 先跑 npm run build:dir')
  process.exit(2)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
}

/** CSP meta 会拦掉 addInitScript 注入的桩，服务端剥掉（与 walkthrough 同口径）。 */
const stripCsp = (html) => html.replace(/<meta[\s\S]*?Content-Security-Policy[\s\S]*?>/, '')

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  const abs = normalize(join(OUT_DIR, rel))
  if (!abs.startsWith(OUT_DIR + sep)) return void res.writeHead(403).end('forbidden')
  if (!existsSync(abs)) return void res.writeHead(404).end('not found')
  const body = readFileSync(abs)
  const type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': type })
  res.end(type.startsWith('text/html') ? stripCsp(body.toString('utf-8')) : body)
})

async function loadStubScript(scenario) {
  const esbuild = await import('esbuild')
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

/** 计算样式 + 刊头区亮度采样 + 溢出闸门。
 *  采样口径：在 h1 的**字形盒**（bounding box）内逐点取「该点最终可见色」。
 *  为什么必须采样而不是读 token：极光是多层半透明 + blur + screen 混合叠出来的，
 *  任何 token 都不能代表标题坐在什么底色上——只有栅格化后的真实像素能。 */
const PROBE = (sel) => {
  const tab = document.querySelector(sel)
  if (!tab) return null
  const mast = tab.querySelector('.juya-masthead')
  const h1 = tab.querySelector('.juya-masthead h1')
  const before = getComputedStyle(mast, '::before')
  const after = getComputedStyle(mast, '::after')
  const cs = getComputedStyle(h1)
  const r = h1.getBoundingClientRect()
  const m = mast.getBoundingClientRect()
  const pick = (s) => ({
    content: s.content,
    position: s.position,
    inset: `${s.top} ${s.right} ${s.bottom} ${s.left}`,
    backgroundImage: s.backgroundImage.slice(0, 400),
    filter: s.filter,
    mixBlendMode: s.mixBlendMode,
    opacity: s.opacity,
    zIndex: s.zIndex,
    height: s.height,
    animationName: s.animationName
  })
  /** 溢出闸门：极光带 `left/right: 0` 严格收在刊头盒内 ⇒ 不得引入任何横向溢出。
   *  `.juya-issue` 无 overflow:hidden，故横向溢出会直接在 .view-scroll 上生成滚动条。 */
  const scroller = tab.querySelector('.view-scroll') ?? document.scrollingElement
  const issue = tab.querySelector('.juya-issue')
  const mastBottom = m.bottom
  const overview = tab.querySelector('.juya-overview')
  const figBottomOf = (s) => Number.parseFloat(s.height) + Number.parseFloat(s.top)
  return {
    masthead: {
      rect: { x: m.x, y: m.y, w: m.width, h: m.height },
      position: getComputedStyle(mast).position,
      padding: getComputedStyle(mast).padding
    },
    overflow: {
      scrollerScrollWidth: scroller.scrollWidth,
      scrollerClientWidth: scroller.clientWidth,
      horizontalOverflowPx: scroller.scrollWidth - scroller.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      issueScrollWidth: issue.scrollWidth,
      issueClientWidth: issue.clientWidth
    },
    /** 纵向落点闸门：极光伪元素的几何下缘 vs 概览目录上缘（两者不得相撞） */
    verticalBounds: {
      mastBottom,
      beforeBottomOfMastTop: figBottomOf(before),
      afterBottomOfMastTop: figBottomOf(after),
      overviewTop: overview ? overview.getBoundingClientRect().top : null,
      beforeOverlapsOverview: overview
        ? m.top + figBottomOf(before) > overview.getBoundingClientRect().top
        : null,
      afterOverlapsOverview: overview
        ? m.top + figBottomOf(after) > overview.getBoundingClientRect().top
        : null
    },
    h1: {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      fontSize: cs.fontSize,
      backgroundImage: cs.backgroundImage.slice(0, 300),
      backgroundClip: cs.backgroundClip,
      webkitBackgroundClip: cs.webkitBackgroundClip,
      color: cs.color,
      filter: cs.filter,
      position: cs.position,
      zIndex: cs.zIndex,
      animationName: cs.animationName
    },
    before: pick(before),
    after: pick(after)
  }
}

let chromium
try {
  ;({ chromium } = await import('@playwright/test'))
} catch {
  console.error('[fatal] 无法 import @playwright/test')
  process.exit(2)
}

await new Promise((res, rej) => {
  server.once('error', rej)
  server.listen(PORT, '127.0.0.1', res)
})

const stubScript = await loadStubScript('nocturneSvg')
const browser = await chromium.launch()
const ACTIVE_READER = 'div.min-h-0.w-full:has(.juya-masthead)'

/** 打开首篇文章并停在默认态（鼠标移出内容区，避免无意 hover 混进特写）。 */
async function openReader(page) {
  const styled = page.locator('.juya-feed-item').first()
  const generic = page.locator('main article').first()
  await Promise.race([
    styled.waitFor({ state: 'visible', timeout: 8000 }),
    generic.waitFor({ state: 'visible', timeout: 8000 })
  ]).catch(() => {})
  if (await styled.isVisible().catch(() => false)) await styled.click()
  else await generic.click()
  await page.locator(ACTIVE_READER).locator('.juya-masthead h1').waitFor({ state: 'visible' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  await page.mouse.move(4, 4)
  await page.waitForTimeout(120)
}

try {
  const out = {}
  for (const [label, viewport, dest, scale] of [
    ['wide', { width: 1280, height: 800 }, DEST, 2],
    ['560', { width: 560, height: 800 }, DEST_NARROW, 3]
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale })
    const page = await context.newPage()
    await page.addInitScript(stubScript)
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
    await openReader(page)
    await page.addStyleTag({ content: FREEZE })
    await page.waitForTimeout(150)

    const data = await page.evaluate(PROBE, ACTIVE_READER)
    out[label] = data

    // 特写取景：以 h1 盒为准向四周扩，确保极光与地平线都在框内
    const r = data.h1.rect
    const padX = label === 'wide' ? 90 : 30
    const top = Math.max(0, r.y - 56)
    const bottom = Math.min(viewport.height, r.y + r.h + 64)
    await page.screenshot({
      path: dest,
      clip: {
        x: Math.max(0, r.x - padX),
        y: top,
        width: Math.min(viewport.width - Math.max(0, r.x - padX), r.w + padX * 2),
        height: Math.max(40, bottom - top)
      }
    })
    await context.close()
    console.log(`[写出] ${dest}`)
  }

  console.log('\n════════ 计算样式 ════════')
  console.log(JSON.stringify(out, null, 2))
} finally {
  await browser.close()
  await new Promise((res) => server.close(res))
  if (existsSync(STUB_BUNDLE)) rmSync(STUB_BUNDLE, { force: true })
}
