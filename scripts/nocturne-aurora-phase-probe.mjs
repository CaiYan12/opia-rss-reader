#!/usr/bin/env node
/**
 * nocturne 刊头极光**相位探针**（GitHub issue #19 / T8：让品红一端可见）
 * =============================================================================
 * 本脚本要回答的问题：远层（品红反相幕帘）在**各个相位**上到底有没有品红分量，
 * 以及它相对近层白脊有多强。票面的验收口径是「逐层隔离图」——只留近层、只留远层
 * 各一组、各自多个极端相位，由人看图层判断品红是否清楚。
 *
 * **与既有冻结方案的关系（硬约束）**：
 *   `scripts/nocturne-visual-walkthrough.mjs` 的 `FREEZE`（`animation: none !important`）
 *   被 5 张归档图依赖，**本脚本不 import、不修改、不复用**它。原因：一旦 `animation: none`，
 *   两条极光动画就从 `document.getAnimations()` 里消失，**无法 seek**，只能看到静态帧。
 *   本脚本因此改用 WAAPI：把全部动画 `pause()` 后逐层设 `currentTime` —— 可复现的相位，
 *   且不改变任何归档图依赖的冻结口径。
 *
 * **为什么不用同一个 `-Xs`**：两层是两条独立动画（前层 24s、后层 31s，且关键帧方向相反），
 *   相位必须按各层的 duration / direction / 关键帧端点分别计算；
 *   计算逻辑在 `scripts/nocturne-aurora-phase.mjs`（纯函数，单测守卫共用）。
 *
 * **逐层隔离怎么做**：注入 `visibility: hidden !important`（而不是 `display: none`）——
 *   被隐藏层的动画仍在 `getAnimations()` 中、仍可 seek，只是不参与绘制；
 *   于是同一相位的「只留近层 / 只留远层 / 两层 / 无极光」四张图是**只切一个变量**的对照。
 *
 * 指标口径（全在截图裁剪区内逐像素实算，不经任何 token 推导）：
 *   · R−G 最大值 —— 品红分量的直接证据（近层三色 R≤G，故只留近层时必然为 0）；
 *   · Δ —— 该层把像素整体改写的最大单通道差（对照「无极光」基线）；
 *   · 字形核心改写计数 —— 取自「无极光」图并做 1px 腐蚀的掩码，应为 0
 *     （极光 `z-index: -1` 结构性落在全部文字之下；非零即分层不变量被破坏）。
 *
 * 用法：
 *   npm run build:dir
 *   node scripts/nocturne-aurora-phase-probe.mjs
 *
 * 端口 4198（避开 playwright.config.ts 的 4173、walkthrough 的 4196、masthead 的 4197）。
 * 退出码：0 = 采样完成且结构断言全部成立；1 = 有断言不成立；2 = 环境/前置条件缺失。
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'
import { buildPhaseSamples } from './nocturne-aurora-phase.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'out', 'renderer')
const CSS_PATH = join(ROOT, 'src', 'renderer', 'juya', 'juya.css')
const HELPERS_TS = join(ROOT, 'tests', 'e2e', 'helpers.ts')
const STUB_BUNDLE = join(ROOT, 'out', '.aurora-phase-probe-stub.mjs')
const PORT = 4198
const ORIGIN = `http://127.0.0.1:${PORT}`

if (!existsSync(join(OUT_DIR, 'index.html'))) {
  console.error('[fatal] 找不到 out/renderer/index.html —— 先跑 npm run build:dir')
  process.exit(2)
}

// ------------------------------------------------------------------ 从 juya.css 实读相位配置
/** 不从模块缺省值硬编码：duration 与关键帧端点一律从 CSS 抠出，改了 CSS 探针自动跟上。 */
function readAuroraConfig() {
  const css = readFileSync(CSS_PATH, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const duration = (name) => {
    const m = css.match(new RegExp(`animation:\\s*${name}\\s+([\\d.]+)s`))
    if (!m) throw new Error(`[fatal] 读不到 ${name} 的 duration（CSS 里找不到 animation 声明）`)
    return Number(m[1])
  }
  const steps = (name) => {
    const block =
      css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
    const val = (step) =>
      Number.parseFloat(
        block.match(new RegExp(`(?:^|[\\s{])${step}\\s*\\{[^}]*opacity:\\s*([\\d.]+)`))?.[1] ?? 'NaN'
      )
    return { from: val('from'), to: val('to') }
  }
  const near = { duration: duration('jy-noct-aurora-near'), ...steps('jy-noct-aurora-near') }
  const far = { duration: duration('jy-noct-aurora-far'), ...steps('jy-noct-aurora-far') }
  for (const [k, l] of Object.entries({ near, far })) {
    if (!Number.isFinite(l.duration) || !Number.isFinite(l.from) || !Number.isFinite(l.to)) {
      throw new Error(`[fatal] ${k} 相位配置解析失败：${JSON.stringify(l)}`)
    }
  }
  return { near, far }
}

const AURORA = readAuroraConfig()
const PHASES = buildPhaseSamples(AURORA)
if (PHASES.length < 5) {
  console.error(`[fatal] 相位采样不足 5 个（实得 ${PHASES.length}）`)
  process.exit(2)
}

// ------------------------------------------------------------------ 静态服务（独立端口 4198）
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

// ------------------------------------------------------------------ 复用已入库 helpers.ts 的桩
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

// ------------------------------------------------------------------ PNG 解码（与 walkthrough 同口径）
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
  return { width, height, bpp, pixels: out }
}

// ------------------------------------------------------------------ 像素指标
/** 品红分量：裁剪区内 max(R − G)（近层三色 R≤G ⇒ 只留近层时该值必为 0） */
function maxRedMinusGreen(img) {
  let best = { value: -Infinity, rgb: null, x: 0, y: 0 }
  const { width, height, bpp, pixels } = img
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * bpp
      const v = pixels[i] - pixels[i + 1]
      if (v > best.value) best = { value: v, rgb: [pixels[i], pixels[i + 1], pixels[i + 2]], x, y }
    }
  }
  return best
}

/** Δ：相对基线图的最大单通道差（该层把像素改写多少） */
function maxChannelDelta(img, base) {
  if (img.width !== base.width || img.height !== base.height) {
    throw new Error('取景不一致：截图裁剪尺寸不同，逐层隔离对照无效')
  }
  let max = 0
  const n = img.width * img.height
  for (let i = 0; i < n; i++) {
    const a = i * img.bpp
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(img.pixels[a + c] - base.pixels[a + c])
      if (d > max) max = d
    }
  }
  return max
}

/** 亮度（感知近似；仅用于字形掩码阈值，不参与任何对比度结论） */
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** 字形核心掩码：取自「无极光」基线图 + 1px 腐蚀（排除抗锯齿边缘）。
 *  为什么掩码必须取自**去了极光**的那张：若取带极光的图，亮脊会被当成字形，
 *  得出一堆假「改写」。
 *  阈值 160：h1 渐变最低档 #b9c6f0 的亮度约 197、顶档 #ffffff 为 255，远高于 160；
 *  而背景（#0a0a0c + 雾）约 10–40，字边抗锯齿像素会迅速落到 160 以下；
 *  再以 8 邻域腐蚀一刀，确保掩码里只剩**不透明字形核心**（拿掉 1–2px 的过渡带）。
 *  第一版用阈值 100 + 4 邻域腐蚀，残留 12/1126 个抗锯齿像素被误判为「核心被改写」。 */
function glyphCoreMask(base, threshold = 160) {
  const { width, height, bpp, pixels } = base
  const solid = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const o = i * bpp
    if (luma(pixels[o], pixels[o + 1], pixels[o + 2]) >= threshold) solid[i] = 1
  }
  const core = new Uint8Array(width * height)
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      let all = solid[i]
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1 && all; dx++) if (!solid[i + dy * width + dx]) all = 0
      }
      if (!all) continue
      core[i] = 1
      count++
    }
  }
  return { core, count }
}

/** 掩码内被改写的像素数（任何通道差 > 0 即为改写） */
function changedWithinMask(img, base, mask) {
  let changed = 0
  for (let i = 0; i < mask.core.length; i++) {
    if (!mask.core[i]) continue
    const o = i * img.bpp
    if (
      img.pixels[o] !== base.pixels[o] ||
      img.pixels[o + 1] !== base.pixels[o + 1] ||
      img.pixels[o + 2] !== base.pixels[o + 2]
    ) {
      changed++
    }
  }
  return changed
}

// ------------------------------------------------------------------ 页面内探针
/** 只允许 seek 极光两层；其余动画（h1 呼吸 / dust 漂移）一律钉到 0 ——
 *  否则同一相位的重复采样会因别的动画漂移而不一致。 */
const SEEK = (times) => {
  const wanted = {
    'jy-noct-aurora-near': times.nearMs,
    'jy-noct-aurora-far': times.farMs
  }
  for (const a of document.getAnimations()) {
    a.pause()
    const t = wanted[a.animationName]
    a.currentTime = t === undefined ? 0 : t
  }
  const mast = document.querySelector('.juya-masthead')
  const cs = (p) => getComputedStyle(mast, p)
  const h1 = document.querySelector('.juya-masthead h1')
  const m = mast.getBoundingClientRect()
  const r = h1.getBoundingClientRect()
  return {
    nearOpacity: Number.parseFloat(cs('::before').opacity),
    farOpacity: Number.parseFloat(cs('::after').opacity),
    nearAnimation: cs('::before').animationName,
    farAnimation: cs('::after').animationName,
    mask: {
      x: Math.round(m.left),
      y: Math.max(0, Math.round(m.top - 56)),
      width: Math.round(m.width),
      height: Math.min(Math.round(m.bottom + 24) - Math.max(0, Math.round(m.top - 56)), 400)
    },
    h1: { x: r.x, y: r.y, w: r.width, h: r.height }
  }
}

/** 逐层隔离用：visibility（不是 display）——被隐藏层的动画仍存在、仍可 seek。
 *  语义：`data-aurora-hide='near'` 藏**近层**（::before）、`'far'` 藏**远层**（::after）、
 *  `'both'` 两层都藏（= 无极光基线）。 */
const ISOLATION_STYLE = `
  html[data-aurora-hide='near'] [data-juya-variant='nocturne-dark'].jynoct .juya-masthead::before,
  html[data-aurora-hide='far'] [data-juya-variant='nocturne-dark'].jynoct .juya-masthead::after,
  html[data-aurora-hide='both'] [data-juya-variant='nocturne-dark'].jynoct .juya-masthead::before,
  html[data-aurora-hide='both'] [data-juya-variant='nocturne-dark'].jynoct .juya-masthead::after {
    visibility: hidden !important;
  }
`

const ACTIVE_READER = 'div.min-h-0.w-full:has(.juya-masthead)'

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

// ------------------------------------------------------------------ 主流程
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
const failures = []
const check = (ok, label, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const rows = []
let glyph = null

try {
  // deviceScaleFactor: 1 ⇒ 1 CSS px = 1 设备 px，指标是真实渲染值
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.addInitScript(stubScript)
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  await openReader(page)
  await page.addStyleTag({ content: ISOLATION_STYLE })
  await page.waitForTimeout(120)

  const hide = async (what) => {
    await page.evaluate((v) => document.documentElement.setAttribute('data-aurora-hide', v), what)
    await page.waitForTimeout(90)
  }
  const shot = async (clip) => decodePng(await page.screenshot({ clip }))

  // 基线（无极光）：字形掩码与 Δ 的对照面
  const meta = await page.evaluate(SEEK, { nearMs: 0, farMs: 0 })
  if (meta.nearAnimation !== 'jy-noct-aurora-near' || meta.farAnimation !== 'jy-noct-aurora-far') {
    throw new Error(`[fatal] 极光动画未激活：near=${meta.nearAnimation} far=${meta.farAnimation}`)
  }
  const clip = meta.mask
  await hide('both')
  const baseline = await shot(clip)
  const mask = glyphCoreMask(baseline)

  for (const phase of PHASES) {
    await page.evaluate(SEEK, {
      nearMs: Math.round(phase.nearTime * 1000),
      farMs: Math.round(phase.farTime * 1000)
    })
    await page.waitForTimeout(80)

    await hide('far')
    const nearOnly = await shot(clip)
    await hide('near')
    const farOnly = await shot(clip)
    await hide('none')
    const both = await shot(clip)

    const nearRGB = maxRedMinusGreen(nearOnly)
    const farRGB = maxRedMinusGreen(farOnly)
    rows.push({
      ...phase,
      nearRGB,
      farRGB,
      nearDelta: maxChannelDelta(nearOnly, baseline),
      farDelta: maxChannelDelta(farOnly, baseline),
      bothDelta: maxChannelDelta(both, baseline),
      clip
    })

    // 最亮联合相位做字形校验（两层都有、且都能看见）
    const brightest =
      phase.nearOpacity === Math.max(AURORA.near.from, AURORA.near.to) &&
      phase.farOpacity === Math.max(AURORA.far.from, AURORA.far.to)
    if (brightest) {
      glyph = {
        label: phase.label,
        changed: changedWithinMask(both, baseline, mask),
        total: mask.count,
        maskPixels: mask.count
      }
    }
  }
  await context.close()
} finally {
  await browser.close()
  await new Promise((res) => server.close(res))
  if (existsSync(STUB_BUNDLE)) rmSync(STUB_BUNDLE, { force: true })
}

// ------------------------------------------------------------------ 输出
console.log(`\n极光相位配置（实读 juya.css）：`)
console.log(
  `  前层 jy-noct-aurora-near  ${AURORA.near.duration}s  ${AURORA.near.from} → ${AURORA.near.to}（alternate，峰 @${AURORA.near.duration}s / 谷 @0s）`
)
console.log(
  `  后层 jy-noct-aurora-far   ${AURORA.far.duration}s  ${AURORA.far.from} → ${AURORA.far.to}（alternate，峰 @0s / 谷 @${AURORA.far.duration}s）`
)
console.log(`\n相位采样 ${PHASES.length} 个（每层的 seek 时刻按各自 duration 分别计算）：`)
console.log(
  '  相位                                    nearT(s)  farT(s)  nearOp  farOp   远层R−G  远层Δ   近层R−G  近层Δ'
)
for (const r of rows) {
  const pad = (s, n) => String(s).padEnd(n)
  console.log(
    `  ${pad(r.label, 38)} ${pad(r.nearTime.toFixed(2), 9)} ${pad(r.farTime.toFixed(2), 8)} ${pad(
      r.nearOpacity.toFixed(2),
      7
    )} ${pad(r.farOpacity.toFixed(2), 7)} ${pad(r.farRGB.value, 8)} ${pad(r.farDelta, 7)} ${pad(
      r.nearRGB.value,
      8
    )} ${r.nearDelta}`
  )
}

const farPeakPx = rows[0].farRGB
console.log(
  `\n远层 R−G 最大值（峰值相位）：${farPeakPx.value}  颜色 rgb(${farPeakPx.rgb.join(', ')})  位置 (${farPeakPx.x}, ${farPeakPx.y})`
)
const nearPeak = rows[0]
console.log(
  `近层白脊 Δ（峰值相位）：${nearPeak.nearDelta}    远层 Δ：${nearPeak.farDelta}    ` +
    `压制比 ≈ 1 : ${(nearPeak.nearDelta / Math.max(1, nearPeak.farDelta)).toFixed(2)}`
)

console.log('\n════════ 断言 ════════')
check(PHASES.length >= 5, '相位采样数 ≥ 5', `实得 ${PHASES.length} 个`)
check(
  rows.some((r) => r.nearTime !== r.farTime),
  '两层不是被同一个时刻统一 seek（极端组合可各自落在 0s，那是按层算出的巧合）',
  rows.map((r) => `${r.nearTime}/${r.farTime}`).join(', ')
)
check(
  rows.every((r) => r.farRGB.value > 0),
  '每个相位上只留远层都有品红分量（R−G > 0）',
  `最小 ${Math.min(...rows.map((r) => r.farRGB.value))}`
)
check(
  rows.every((r) => r.nearRGB.value === 0),
  '只留近层时 R−G 恒为 0（近层三色 R≤G，结构上不含品红）',
  `最大 ${Math.max(...rows.map((r) => r.nearRGB.value))}`
)
if (glyph) {
  check(
    glyph.changed === 0,
    '字形核心像素被改写计数为 0（z-index: -1 的分层不变量仍成立）',
    `${glyph.changed}/${glyph.total}（${glyph.label}）`
  )
} else {
  check(false, '未能定位「两层都在峰值」的联合相位，字形校验未执行')
}

console.log(`\n════════ 结果 ════════`)
if (failures.length > 0) {
  console.error(`FAIL：${failures.length} 项断言未成立`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
console.log('PASS：相位采样与逐层隔离指标均已产出，结构断言全部成立。')
process.exit(0)
