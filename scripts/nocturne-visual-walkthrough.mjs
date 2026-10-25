#!/usr/bin/env node
/**
 * nocturne-dark 视觉走查截图归档生成器（GitHub issue #9）
 * =============================================================================
 * 本脚本要修掉的缺陷（已独立核实）：
 *   `docs/juyathemesworks/` 下 5 张归档截图**没有任何已入库的生成脚本**——`git grep` 全仓找不到
 *   产出这些 png 的代码（只有 `tests/e2e/contrast.spec.ts` 里一处用于测量的小条带
 *   `page.screenshot`）。后果有二：
 *     ① 5 张图**不可复现**：别人无法重新生成、无法核对；
 *     ② 提交信息里「RM 张只走 emulateMedia、其 SHA256 与冻结态逐字节相同 ⇒ RM 下动效完全降级」
 *        这一论证**无法被独立审计**（当时怎么冻结、怎么截的，代码里没有）。
 *   本脚本把整条流程入库，并把它从「两张图恰好一样」升级为**脚本级、可证伪的证据链**。
 *
 * 用法：
 *   npm run build:dir                                   # 先生成 out/renderer（本脚本不代跑构建）
 *   node scripts/nocturne-visual-walkthrough.mjs            # 重新生成 5 张归档图 + 打印 SHA256 + RM 证据
 *   node scripts/nocturne-visual-walkthrough.mjs --verify   # 只截到内存、与 docs/ 现有归档逐字节比对（不写盘）
 *
 * 复现口径（三档状态，务必分清）：
 *   · **非 RM 冻结档**（本脚本写盘的 4 张非 RM 图）：注入 `animation: none !important`。
 *     为什么必须冻结：刊头 9s 呼吸（`jy-noct-glow`）与 dust 96s 漂移（`jy-dust-drift`）
 *     会让归档图**逐次不同**，归档就失去「同一张图可被反复核对」的意义。
 *   · **RM 档**（`nocturne-dark-reduced-motion-1280-阅读页.png`）：**只**走
 *     `page.emulateMedia({ reducedMotion: 'reduce' })`，**不注入任何冻结**。
 *     它的可复现性由浏览器自身的 RM 降级保证（见下「RM 证据」）。
 *   · **非 RM 未冻结档**（只用于证据探针，不写盘）：动画在跑，用于证明「动画真的会改像素」。
 *
 * 为什么 RM 图与「刊头与概览」图**逐字节相同**（这是正确结果，不是复制粘贴疏漏）：
 *   冻结档把 `animation` 全量置 `none`；RM 档由 juya.css 的三条规则把承载动画的元素也置 `none`
 *   （`.juya-masthead h1` / `.juya-scene-dust` 显式 `animation: none`，`.juya-feed-item` 同理）。
 *   两者最终计算样式同为 `animation-name: none`，**静态渲染逐像素一致**——所以同视口、同滚动
 *   位置下必然逐字节相同。这一等价关系由本脚本**并排打印计算样式**来证，而不是靠「图一样」来断言。
 *   真正能区分「RM 生效」与「同一帧复制一份」的证据是：
 *     ① 非 RM 下同元素 `animationName` 是关键帧名、RM 下是 `none`；
 *     ② 静态辉光（`filter: drop-shadow`）在两档下都保留（RM 只取消动画、不取消静态辉光）；
 *     ③ 非 RM 未冻结档把动画 seek 到不同时刻 → 像素确有差异（动画是活的）；
 *     ④ RM 档隔一段时间截两次 → SHA256 完全相同（动画确实被 RM 停住了）。
 *
 * 与 `tests/e2e/helpers.ts` 的关系：桩**直接复用**已入库的 `makeStubScript('nocturneSvg')`
 *   （用 esbuild 现场把该 .ts 打成临时 ESM 再 import），**不手抄**——抄一份必然随 helpers.ts 漂移。
 *   该场景自带内联 SVG 图源（`data:image/svg+xml`，480×320 固有尺寸），不依赖被 gitignore 的
 *   `tests/fixtures/`，新克隆也能跑出同样的几何。
 *
 * 本次重生成时量出的**第二个不可复现因素**（同一类缺陷，一并留痕）：
 *   归档的 4 张非 RM 图里，有 3 张（「刊头与概览」「窄窗-560」「RM」，原 SHA256 分别为
 *   `AFFA5FA6…` / `232A0C52…` / `AFFA5FA6…`）是**带着一个无意的 hover 态**抓的，不是默认态。
 *   机制：Playwright 打开页面后鼠标停在 (0,0)，而脚本**点击主页期号卡片**去打开阅读标签时，
 *   鼠标会留在被点元素的屏幕坐标上；阅读标签渲染后，同一屏幕坐标落进阅读页内容区
 *   ⇒ 页面上出现一个没人有意触发的 hover 高亮。
 *   实测（本脚本定稿前的探针，同视口 1280×800、同滚动位置）：
 *     · 不移动鼠标：`:hover` 链含 `.juya-overview li`（概览项高亮）；
 *     · 显式 `page.mouse.move(4,4)`：`:hover` 链只剩 chrome（HTML/BODY/标题栏/标签栏）；
 *     · 两者像素差 **15942 px**（≈1.6% 视口面积）。
 *   另一张「首条图文与回流带」（原 `91553E07…`）是**条目 hover** 版：把 G-1 修复前的暗侧
 *   hover 规则（`background: var(--jy-lead-bg)`）重新注入 + 鼠标停在条目上 → 与旧帧**逐字节相同**
 *   （复现 `91553E07…`），差值正好是 0.08 白叠底（10 → 10+0.08×245 ≈ 29.6，实测 10→29），
 *   且差异包围盒 x∈[314,965]、y∈[130,799] 恰为条目盒内、内容列之外零差异。
 *   **处置**：本脚本在每次截图前**显式** `page.mouse.move(4, 4)` 并断言 `:hover` 链不含任何
 *   `juya-*` 元素（不成立即抛错）——归档帧一律为**默认态**。悬停是可达状态，但它必须
 *   **显式命名、单独出图**，不能靠鼠标恰好停在哪里决定归档内容。
 *
 * 端口：静态服务固定 **4196**（避开 playwright.config.ts 的 4173，二者可同时存在、互不抢）。
 * 退出码：0 = 5 张图已生成且 RM 证据全部成立；1 = 有断言不成立或（--verify 下）与磁盘不一致；
 *         2 = 环境/前置条件缺失。
 * 归档比对口径：4 张非 RM 档逐字节；RM 档字节不等时回退「有界像素等价」（RM_NOISE 容差，
 * 见常量注释——2026-10-24 事件：图版 1px 装饰边 AA 存在环境级双变体翻转）。
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'out', 'renderer')
const ARCHIVE_DIR = join(ROOT, 'docs', 'juyathemesworks')
const HELPERS_TS = join(ROOT, 'tests', 'e2e', 'helpers.ts')
const STUB_BUNDLE = join(ROOT, 'out', '.visual-walkthrough-stub.mjs')
const PORT = 4196
const ORIGIN = `http://127.0.0.1:${PORT}`

/** 五张归档图（文件名与既有归档**完全一致**，覆盖写，保证仓库内引用不变）。 */
const SHOTS = [
  { file: 'nocturne-dark-阅读页-1280-刊头与概览.png', viewport: { width: 1280, height: 800 }, kind: 'reader-top' },
  { file: 'nocturne-dark-阅读页-1280-首条图文与回流带.png', viewport: { width: 1280, height: 800 }, kind: 'reader-entry' },
  { file: 'nocturne-dark-订阅页-1280.png', viewport: { width: 1280, height: 800 }, kind: 'feed-top' },
  { file: 'nocturne-dark-窄窗-560-阅读页.png', viewport: { width: 560, height: 800 }, kind: 'reader-top' },
  { file: 'nocturne-dark-reduced-motion-1280-阅读页.png', viewport: { width: 1280, height: 800 }, kind: 'reader-top', rm: true }
]

const VERIFY_ONLY = process.argv.slice(2).includes('--verify')

/** 与 `tests/e2e/contrast.spec.ts` 同源的冻结样式（非 RM 档专用）。 */
const FREEZE =
  '*, *::before, *::after { animation: none !important; transition: none !important; }'

/** 动画 seek 探针的取样时刻：9s 呼吸关键帧的中点（`alternate` 下即 `to` 端，辉光最亮档）。 */
const SEEK_MS = 4500

// ------------------------------------------------------------------ 前置检查
if (!existsSync(join(OUT_DIR, 'index.html'))) {
  console.error('[fatal] 找不到 out/renderer/index.html。')
  console.error('        本脚本不代跑构建（票面纪律：构建由集成侧统一收口）。请先执行：')
  console.error('          npm run build:dir')
  process.exit(2)
}

// ------------------------------------------------------------------ 静态服务（独立端口 4196）
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

/** CSP meta 会拦掉 addInitScript 注入的桩；与 tests/e2e/setup.ts 同口径地**在服务端剥掉**它
 *  （setup.ts 走 page.route 改写响应，本脚本服务端剥更简单，且不依赖路由拦截时序）。 */
const stripCsp = (html) => html.replace(/<meta[\s\S]*?Content-Security-Policy[\s\S]*?>/, '')

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  const abs = normalize(join(OUT_DIR, rel))
  if (!abs.startsWith(OUT_DIR + sep)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (!existsSync(abs)) {
    res.writeHead(404).end('not found')
    return
  }
  const body = readFileSync(abs)
  const type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': type })
  res.end(type.startsWith('text/html') ? stripCsp(body.toString('utf-8')) : body)
})

// ------------------------------------------------------------------ 复用已入库的 helpers.ts 桩
/** 用 esbuild 把 tests/e2e/helpers.ts（含其 src/ 依赖）打成临时 ESM，再动态 import。
 *  为什么不手抄桩：抄一份必然随 helpers.ts 漂移，而本缺陷的根因正是「归档证据与源码脱钩」。 */
async function loadStubScript(scenario) {
  let esbuild
  try {
    esbuild = await import('esbuild')
  } catch {
    console.error('[fatal] 无法 import esbuild（vite 的依赖，npm install 后应存在于 node_modules）。')
    console.error('        本脚本用它把 tests/e2e/helpers.ts 打成临时 ESM 以复用 makeStubScript。')
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

// ------------------------------------------------------------------ PNG 解码 / 比对（与 contrast.spec.ts 同口径）
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

/** 逐像素比对的量化差异：差异像素数与最大单通道差（归档图是「证据」，差异必须给数而不是「看着不一样」）。 */
function pixelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: true, diffPixels: Number.NaN, totalPixels: 0, maxChannelDelta: Number.NaN }
  }
  let diffPixels = 0
  let maxChannelDelta = 0
  const n = a.width * a.height
  for (let i = 0; i < n; i++) {
    const pa = i * a.bpp
    const pb = i * b.bpp
    let d = 0
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.pixels[pa + c] - b.pixels[pb + c]))
    if (d > 0) diffPixels++
    if (d > maxChannelDelta) maxChannelDelta = d
  }
  return { sizeMismatch: false, diffPixels, totalPixels: n, maxChannelDelta }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').toUpperCase()

// ------------------------------------------------------------------ 页面操作
/** 活动阅读标签容器：keep-alive 下主页与阅读页同时在 DOM，必须限定带刊头的那个。 */
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

/** 把首条条目顶到滚动口顶端（「首条图文与回流带」那张的取景）。 */
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

/** 把鼠标移到内容区之外，锁定**默认态**（非 hover）。
 *  为什么必须显式做：Playwright 打开页面后鼠标停在 (0,0)，但**点击主页期号卡片时鼠标会留在被点元素处**；
 *  阅读标签打开后，该屏幕坐标落进阅读页内容区 ⇒ 页面上出现一个**无意的 hover 态**。
 *  实测（本脚本定稿前的探针）：不移动鼠标时 `:hover` 链含 `.juya-overview li`，
 *  比显式移出内容区多出 **15942 px** 的差异（概览项 hover 高亮）。
 *  原归档的「刊头与概览」「窄窗-560」「RM」三张正是带着这层无意 hover 抓的（见文件头）。
 *  归档图必须由**显式声明的状态**决定，不能由鼠标恰好停在哪里决定。 */
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

/** 计算样式探针：RM 证据的核心——把「承载动画的元素」的两档计算样式并排打出来。
 *  `.juya-root` 一并探（AGENTS.md 硬约束「.juya-root 永无 animation」，是结构不变量而非 RM 判据）。 */
const STYLE_PROBE = (sel) => {
  const tab = document.querySelector(sel)
  const cs = (root, q) => {
    const el = root?.querySelector(q)
    if (!el) return null
    const s = getComputedStyle(el)
    return { animationName: s.animationName, animationDuration: s.animationDuration, filter: s.filter }
  }
  return {
    mastheadH1: cs(tab, '.juya-masthead h1'),
    dust: cs(tab, '.juya-scene-dust'),
    root: tab ? { animationName: getComputedStyle(tab.querySelector('.juya-root')).animationName } : null,
    animations: document.getAnimations().map((a) => a.animationName ?? '(non-css)')
  }
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
console.log(`[服务] 静态服务 ${ORIGIN} → ${OUT_DIR}（独立端口，不占 playwright.config.ts 的 4173）`)

const stubScript = await loadStubScript('nocturneSvg')
console.log('[桩] 复用已入库 tests/e2e/helpers.ts 的 makeStubScript(\'nocturneSvg\')（esbuild 现场打包，未手抄）')

const browser = await chromium.launch()
const results = new Map()
const extra = new Map()

try {
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

    // 冻结**只**作用于非 RM 档；RM 档的可复现性由浏览器自身的 RM 降级保证。
    if (!shot.rm) await page.addStyleTag({ content: FREEZE })
    await settle(page)
    // 「未显式移出鼠标」对照帧（不写盘）：点击主页期号卡片后鼠标留在原屏幕坐标上，
    // 该坐标在阅读页恰好落进概览区 ⇒ 一个**无意的 hover 态**。先留证再纠正。
    if (shot.kind === 'reader-top' && shot.viewport.width === 1280) {
      extra.set('before-park', await page.screenshot())
    }
    // 状态显式化：归档帧一律取默认态（鼠标在内容区外），避免 hover 混进「默认态」的证据面。
    await parkMouseOutside(page)
    const buf = await page.screenshot()
    results.set(shot.file, buf)
    if (shot.rm) {
      // RM 档额外留两份不同时刻的帧：用于证明「RM 下动画确实停住」（不写盘）。
      const t1 = await page.screenshot()
      await page.waitForTimeout(800)
      const t2 = await page.screenshot()
      extra.set('rm-late-1', t1)
      extra.set('rm-late-2', t2)
      extra.set('rm-style', await page.evaluate(STYLE_PROBE, ACTIVE_READER))
    } else if (shot.file.includes('刊头与概览')) {
      extra.set('frozen-top', buf)
    }
    await context.close()
  }

  // ---- 非 RM 未冻结对照（同视口 1280×800、同滚动位置 scrollTop=0，只是不冻结、不 emulateMedia）----
  // 这一档**不写盘**，只为 RM 证据服务：没有它，「RM 生效」就仍是不可证伪的断言。
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
    // 把动画暂停并 seek 到固定时刻：可复现地证明「动画真的在改像素」（不依赖抓拍时机）
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
    extra.set('nonrm-t4500', await seek(SEEK_MS))
    await context.close()
  }
} finally {
  await browser.close()
  await new Promise((res) => server.close(res))
  if (existsSync(STUB_BUNDLE)) rmSync(STUB_BUNDLE, { force: true })
}

// ------------------------------------------------------------------ 落盘 / 校验
console.log('\n════════ 五张归档截图 SHA256 ════════')
if (VERIFY_ONLY) console.log('（--verify：不写盘，只与 docs/ 现有归档逐字节比对）')

const rows = []
let allMatch = true
// RM 档光栅噪声容差（2026-10-24 事件）：RM 阅读页归档在两次启动间出现 9px/最大通道差 9 的
// 双变体翻转，全部落在图版 plate-1/plate-2 的 1px 装饰边右缘 3px 竖条内（x963-965）；
// 同批次非 RM 含图版归档逐字节一致、守卫锁死阅读页规则零改动 ⇒ 判定为 GPU 光栅化噪声
// 而非规则变化。字节比对失败时回退有界像素等价：差异必须给数，超容差仍判不一致。
const RM_NOISE = { maxPixels: 64, maxChannel: 16 }
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
      noiseNote = `（字节不等，有界像素等价回退通过：diff=${d.diffPixels}px / maxΔ=${d.maxChannelDelta}，容差 ${RM_NOISE.maxPixels}px / Δ${RM_NOISE.maxChannel}）`
    }
  }
  if (!VERIFY_ONLY) {
    mkdirSync(ARCHIVE_DIR, { recursive: true })
    writeFileSync(target, fresh)
  } else if (!same) allMatch = false
  rows.push({ file: shot.file, hash, onDiskHash, same, rm: !!shot.rm, bytes: fresh.length })
  console.log(`${hash}  ${shot.rm ? '[RM]' : '    '} ${shot.file}${noiseNote}`)
}
console.log(`\n落盘目录：${ARCHIVE_DIR}${VERIFY_ONLY ? '（--verify 未写入）' : ''}`)

// ------------------------------------------------------------------ RM 证据（本缺陷的核心）
console.log('\n════════ RM 证据（脚本级、可证伪；不依赖「两张图恰好一样」）════════')
const rmStyle = extra.get('rm-style')
const nonRmStyle = extra.get('nonrm-style')

console.log('\n[1] 计算样式并排（同视口 1280×800、同滚动位置 scrollTop=0）')
const fmt = (v) => (v === null || v === undefined ? '(元素缺失)' : v)
console.log('    元素                     属性             非 RM（未 emulateMedia）        RM（reducedMotion: reduce）')
const styleRow = (label, pick) => {
  const a = pick(nonRmStyle)
  const b = pick(rmStyle)
  console.log(
    `    ${label.padEnd(24)} ${'animationName'.padEnd(16)} ${String(fmt(a?.animationName)).padEnd(30)} ${fmt(b?.animationName)}`
  )
  return { a, b }
}
const rMast = styleRow('.juya-masthead h1', (s) => s?.mastheadH1)
const rDust = styleRow('.juya-scene-dust', (s) => s?.dust)
const rRoot = styleRow('.juya-root', (s) => s?.root)
console.log(
  `    ${'.juya-masthead h1'.padEnd(24)} ${'filter'.padEnd(16)} ${String(fmt(rMast.a?.filter)).slice(0, 30).padEnd(30)} ${String(fmt(rMast.b?.filter)).slice(0, 30)}`
)
console.log(
  `    ${'（document.getAnimations）'.padEnd(24)} ${'动画条数'.padEnd(16)} ${String(fmt(nonRmStyle?.animations?.length)).padEnd(30)} ${fmt(rmStyle?.animations?.length)}`
)
console.log(`    非 RM 动画清单：${JSON.stringify(nonRmStyle?.animations ?? [])}`)
console.log(`    RM   动画清单：${JSON.stringify(rmStyle?.animations ?? [])}`)

console.log('\n[2] 断言')
check(
  rMast.b?.animationName === 'none',
  'RM：.juya-masthead h1 animationName = none（9s 呼吸被 RM 取消）',
  `实测 ${fmt(rMast.b?.animationName)}`
)
check(
  rDust.b?.animationName === 'none',
  'RM：.juya-scene-dust animationName = none（96s dust 漂移被 RM 取消）',
  `实测 ${fmt(rDust.b?.animationName)}`
)
check(
  rRoot.b?.animationName === 'none',
  'RM：.juya-root animationName = none（结构不变量，两档均须成立）',
  `实测 ${fmt(rRoot.b?.animationName)}`
)
check(
  typeof rMast.b?.filter === 'string' && rMast.b.filter.includes('drop-shadow'),
  'RM：静态辉光保留（filter 仍含 drop-shadow，RM 只取消动画）',
  String(fmt(rMast.b?.filter)).slice(0, 64)
)
check(
  rMast.a?.animationName === 'jy-noct-glow',
  '非 RM 对照：.juya-masthead h1 animationName = jy-noct-glow（关键帧名，非 none）',
  `实测 ${fmt(rMast.a?.animationName)}`
)
check(
  rDust.a?.animationName === 'jy-dust-drift',
  '非 RM 对照：.juya-scene-dust animationName = jy-dust-drift（关键帧名，非 none）',
  `实测 ${fmt(rDust.a?.animationName)}`
)
check(
  (nonRmStyle?.animations?.length ?? 0) > 0 && (rmStyle?.animations?.length ?? 0) === 0,
  'RM 生效：非 RM 有活动动画、RM 下 document.getAnimations() 为 0 条',
  `非 RM ${fmt(nonRmStyle?.animations?.length)} 条 / RM ${fmt(rmStyle?.animations?.length)} 条`
)

console.log('\n[3] 像素级量化差异（差异必须给数，不给「看着不一样」）')
const dAnim = pixelDiff(decodePng(extra.get('nonrm-t0')), decodePng(extra.get('nonrm-t4500')))
console.log(
  `    非 RM 未冻结档：动画 seek 0ms vs ${SEEK_MS}ms → 差异像素 ${dAnim.diffPixels}/${dAnim.totalPixels}` +
    `（最大单通道差 ${dAnim.maxChannelDelta}）`
)
check(
  dAnim.diffPixels > 0,
  `非 RM 动画是活的：seek 0ms 与 ${SEEK_MS}ms 的像素确有差异`,
  `${dAnim.diffPixels} px 不同`
)
check(
  Buffer.compare(extra.get('rm-late-1'), extra.get('rm-late-2')) === 0,
  'RM 下动画确实停住：RM 档隔 800ms 截两次，SHA256 相同（无需注入冻结即可复现）',
  sha256(extra.get('rm-late-1'))
)
const dRmVsNon = pixelDiff(decodePng(extra.get('rm-late-1')), decodePng(extra.get('nonrm-t0')))
console.log(
  `    RM 档 vs 非 RM 未冻结档（seek 0ms）：差异像素 ${dRmVsNon.diffPixels}/${dRmVsNon.totalPixels}` +
    `（最大单通道差 ${dRmVsNon.maxChannelDelta}）`
)
check(
  dRmVsNon.diffPixels > 0,
  'RM 图与「同视口、同滚动位置的默认态（未冻结、动画在跑）」可区分',
  `${dRmVsNon.diffPixels} px 不同`
)

console.log('\n[4] 归档帧状态显式化（修掉「原归档帧被无意 hover 污染」这一同类缺陷）')
const topRow = rows.find((r) => r.file.includes('刊头与概览'))
const dPark = pixelDiff(decodePng(extra.get('before-park')), decodePng(results.get(topRow.file)))
console.log(
  `    「刊头与概览」：点击期号卡片后的残留鼠标位置 vs 显式移出内容区 → 差异像素 ` +
    `${dPark.diffPixels}/${dPark.totalPixels}（最大单通道差 ${dPark.maxChannelDelta}）`
)
check(
  dPark.diffPixels > 0,
  '鼠标残留会产生可见差异（故归档必须显式移出，否则「默认态」其实是 hover 态）',
  `${dPark.diffPixels} px 不同`
)
const rmRow = rows.find((r) => r.rm)
const frozenRow = rows.find((r) => r.file.includes('刊头与概览'))
const sameAsFrozen = rmRow.hash === frozenRow.hash
console.log(
  `\n    RM 图（${rmRow.hash.slice(0, 16)}…）vs 冻结档「刊头与概览」（${frozenRow.hash.slice(0, 16)}…）：` +
    `${sameAsFrozen ? '逐字节相同' : '不同'}`
)
console.log(
  '    说明：冻结档把 animation 全量置 none；RM 档由 juya.css 把承载动画的元素也置 none ⇒ 两者计算样式等价、' +
    '\n    静态渲染逐像素一致，故同视口同滚动位置下**本就应当**逐字节相同。这不是复制粘贴疏漏，' +
    '\n    而是「RM 只取消动画、保留静态辉光」的直接推论；其成立由上面 [1][2][3] 的并排计算样式与像素量化佐证。'
)
if (!sameAsFrozen) {
  console.log('    （本次两图不同——若你刚改过 juya.css 的静态辉光/场景色值，这是预期结果，请核对 diff。）')
}

console.log('\n════════ 归档一致性 ════════')
for (const r of rows) {
  console.log(
    `  ${r.same ? '一致' : VERIFY_ONLY ? '不一致' : '已写入'}  ${r.file}  (${r.bytes} bytes)`
  )
}

console.log(`\n════════ 结果 ════════`)
if (failures.length > 0) {
  console.error(`FAIL：${failures.length} 项断言未成立：`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
console.log(
  VERIFY_ONLY
    ? `PASS：5 张归档图与磁盘现状${allMatch ? '逐字节一致' : '存在差异'}；RM 证据全部成立。`
    : 'PASS：5 张归档图已重新生成；RM 证据全部成立。'
)
process.exit(allMatch || !VERIFY_ONLY ? 0 : 1)
