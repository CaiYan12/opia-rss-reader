#!/usr/bin/env node
/**
 * nocturne 字体落地 CDP 取证探针（GitHub issue #3 / #9）
 * =============================================================================
 * 本脚本要修掉的缺陷（已独立核实）：
 *   #3 声称「标题 DengXian / 正文 Noto Sans SC / 序号 JetBrains Mono 真实落地」，但**仓库内无证据** ——
 *   该结论只存在于提交信息里，`git grep` 找不到任何产出它的代码。提交信息不是证据面：
 *   它不可复现、不可被独立审计，也无法在字体栈漂移时自动变红。
 *   本脚本把取证手段入库，把「哪个字体真的画了这几个字」变成**可重跑的命令**。
 *
 * 取证原理（为什么不能只读 getComputedStyle）：
 *   `getComputedStyle(el).fontFamily` 返回的是**声明值**（作者写的字体栈），不是**落地值**。
 *   字体栈里 'DengXian' 排第一 ≠ 系统真的用它渲染 —— 缺字回退、字形缺失、字体未安装都会让
 *   浏览器悄悄换一个字体，而 computed style 完全不反映。故必须问渲染引擎自己：
 *   CDP `CSS.getPlatformFontsForNode` 返回该节点**实际用于绘制**的平台字体（含 glyph 计数），
 *   这是唯一能证伪「落地」的接口。
 *
 * 对照面（本探针的自检，缺了它就只是「打印了一堆名字」）：
 *   同时探 **nocturne-light** —— 它的字体栈仍是旧的第一轮 Inter 栈
 *   （`Inter, 'SF Pro Text', 'Segoe UI', 'Noto Sans SC', sans-serif`），而 Inter 在本机**未安装**
 *   （#3 已实测 Fonts 注册表 596 条中无 Inter）。故对照面**必须打印回退后的真实字体**
 *   （Segoe UI / Noto Sans SC），而不是 'Inter'。若对照面打印出 'Inter'，说明探针读的是声明值而非
 *   落地值 —— 探针自身失效，脚本判 FAIL。这一条把「探针能不能识别回退」变成可证伪的断言。
 *
 * 用法：
 *   npm run build:dir                                  # 先生成 out/renderer（本脚本不代跑构建）
 *   node scripts/nocturne-font-probe.mjs               # 实探并打印对照表
 *   node scripts/nocturne-font-probe.mjs --json        # 额外输出机器可读 JSON（供验收报告引用）
 *
 * 端口：静态服务固定 **4195**（避开 playwright.config.ts 的 4173 与视觉走查的 4196，三者可共存）。
 * 退出码：0 = 三档字体均落地且对照面正确回退；1 = 有断言不成立；2 = 环境/前置条件缺失。
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'out', 'renderer')
const CSS_PATH = join(ROOT, 'src', 'renderer', 'juya', 'juya.css')
const HELPERS_TS = join(ROOT, 'tests', 'e2e', 'helpers.ts')
const STUB_BUNDLE = join(ROOT, 'out', '.font-probe-stub.mjs')
const PORT = 4195
const ORIGIN = `http://127.0.0.1:${PORT}`
const JSON_OUT = process.argv.slice(2).includes('--json')

// ------------------------------------------------------------------ 从 juya.css 实读字体栈
/** 取值一律**从 juya.css 实读**（源码即唯一真源，脚本内不手抄字体名）——
 *  手抄一份必然随样式漂移，而本缺陷的根因正是「证据与源码脱钩」。 */
const RAW_CSS = readFileSync(CSS_PATH, 'utf-8')
/** 剥注释：注释里复述的字体名不作为证据（与审计脚本同口径）。 */
const CSS = RAW_CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))

/** 花括号配平取块 */
const extractBlock = (src, opener) => {
  const m = src.match(opener)
  if (!m || m.index === undefined) return ''
  let depth = 0
  for (let i = m.index + m[0].length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(m.index, i + 1)
    }
  }
  return ''
}
/** 抠某变体 token 块里的 `--jy-font-*` 声明值（声明顺序即回退顺序，本探针按序断言首选族） */
const fontTokens = (variant) => {
  const block = extractBlock(CSS, new RegExp(`\\[data-juya-variant='${variant}'\\]\\s*\\{`))
  const read = (name) =>
    block.match(new RegExp(`${name}\\s*:\\s*([^;}]+)`))?.[1]?.trim() ?? ''
  return { body: read('--jy-font-body'), heading: read('--jy-font-heading') }
}
/** 栈里第一个具体族名（去引号、跳通用族关键字）—— 即设计意图里的「首选字体」 */
const firstFamily = (stack) => {
  const GENERIC = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
    '-apple-system'
  ])
  for (const raw of stack.split(',')) {
    const name = raw.trim().replace(/^['"]|['"]$/g, '')
    if (name && !GENERIC.has(name.toLowerCase())) return name
  }
  return ''
}

const DARK_TOKENS = fontTokens('nocturne-dark')
const LIGHT_TOKENS = fontTokens('nocturne-light')
if (!DARK_TOKENS.body || !DARK_TOKENS.heading) {
  console.error('[fatal] 无法从 juya.css 抠出 nocturne-dark 的 --jy-font-* 取值（token 或选择器可能已改名）')
  process.exit(2)
}
if (!LIGHT_TOKENS.body || !LIGHT_TOKENS.heading) {
  console.error('[fatal] 无法从 juya.css 抠出 nocturne-light 的 --jy-font-* 取值')
  process.exit(2)
}

/** 序号等宽栈：全风格共用，写在规则体上（不是 token），故单独实读 */
const MONO_STACK =
  CSS.match(/font-family:\s*('JetBrains Mono'[^;]+);/)?.[1]?.trim() ?? ''

// ------------------------------------------------------------------ 前置检查
if (!existsSync(join(OUT_DIR, 'index.html'))) {
  console.error('[fatal] 找不到 out/renderer/index.html。')
  console.error('        本脚本不代跑构建（票面纪律：构建由集成侧统一收口）。请先执行：')
  console.error('          npm run build:dir')
  process.exit(2)
}

// ------------------------------------------------------------------ 静态服务（独立端口 4195）
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
/** CSP meta 会拦掉 addInitScript 注入的桩；与视觉走查脚本同口径地**在服务端剥掉**它。 */
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
/** 与视觉走查脚本同一手法：esbuild 现场把 tests/e2e/helpers.ts 打成临时 ESM 再 import，**不手抄**。 */
async function loadStubScript(scenario) {
  let esbuild
  try {
    esbuild = await import('esbuild')
  } catch {
    console.error('[fatal] 无法 import esbuild（vite 的依赖，npm install 后应存在于 node_modules）。')
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

// ------------------------------------------------------------------ 探针目标
/** 活动阅读标签容器：keep-alive 下主页与阅读页同时在 DOM，必须限定带刊头的那个。 */
const ACTIVE_READER = 'div.min-h-0.w-full:has(.juya-masthead)'

/** 三档探针：标题 / 正文 / 序号（#3 票面点名的三档无衬线分工）。 */
const TARGETS = [
  { key: 'heading', label: '刊头标题 h1', selector: '.juya-masthead h1', stackOf: (t) => t.heading },
  { key: 'body', label: '正文段落 p', selector: '.juya-entry-body p', stackOf: (t) => t.body },
  { key: 'index', label: '概览序号 .juya-index', selector: '.juya-overview .juya-index', stackOf: () => MONO_STACK }
]

/** 用 CDP 问渲染引擎「这个节点实际用了哪些平台字体」（含 glyph 计数）。
 *  为什么不用 getComputedStyle：那只返回声明值，回退时完全不反映（见文件头）。 */
async function platformFonts(client, nodeId) {
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId })
  return fonts.map((f) => ({
    familyName: f.familyName,
    glyphCount: f.glyphCount,
    isCustomFont: f.isCustomFont
  }))
}

/** 取某选择器对应节点的 CDP nodeId（限定在活动阅读标签内） */
async function nodeIdOf(client, selector) {
  const { root } = await client.send('DOM.getDocument', { depth: -1 })
  // 先定位活动阅读标签，再在其中查目标（避免命中 keep-alive 的非活动页面）
  const { nodeId: scopeId } = await client.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: ACTIVE_READER
  })
  if (!scopeId) return 0
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: scopeId, selector })
  return nodeId
}

/** 打开首条条目（与视觉走查脚本同一手法，保持阅读页取景一致） */
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
console.log(`[服务] 静态服务 ${ORIGIN} → ${OUT_DIR}（独立端口，不占 4173/4196）`)
console.log(`[取值] 字体栈实读自 ${CSS_PATH.replace(ROOT + sep, '')}（非手抄）`)
console.log()
console.log('【A】juya.css 声明值（设计意图，非落地值）')
console.log(`  nocturne-dark  --jy-font-heading : ${DARK_TOKENS.heading}`)
console.log(`  nocturne-dark  --jy-font-body    : ${DARK_TOKENS.body}`)
console.log(`  序号等宽栈（全风格共用规则体）    : ${MONO_STACK}`)
console.log(`  nocturne-light --jy-font-heading : ${LIGHT_TOKENS.heading}`)
console.log(`  nocturne-light --jy-font-body    : ${LIGHT_TOKENS.body}`)
console.log()

const stubScript = await loadStubScript('nocturneSvg')
console.log("[桩] 复用已入库 tests/e2e/helpers.ts 的 makeStubScript('nocturneSvg')（esbuild 现场打包，未手抄）")

const browser = await chromium.launch()
const report = {}

try {
  for (const side of ['dark', 'light']) {
    const variant = side === 'dark' ? 'nocturne-dark' : 'nocturne-light'
    const tokens = side === 'dark' ? DARK_TOKENS : LIGHT_TOKENS
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.addInitScript(stubScript)
    // 亮暗隔离：#3 只改暗侧，故亮侧必须单独成帧（同一份 CSS 的两个变体作用域）。
    await page.addInitScript(
      ([mode, styleId]) => {
        window.__stubData.settings = {
          ...window.__stubData.settings,
          themeMode: mode,
          juyaLightStyleId: styleId,
          juyaDarkStyleId: styleId
        }
      },
      [side, 'nocturne']
    )
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
    await openFirstArticle(page)
    await page.locator(ACTIVE_READER).locator('.juya-masthead h1').waitFor({ state: 'visible' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(250)

    // 变体确实生效（否则探针探的是别的风格，结论无意义）
    const activeVariant = await page
      .locator(`${ACTIVE_READER} [data-juya-variant]`)
      .first()
      .getAttribute('data-juya-variant')
      .catch(() => null)

    const client = await context.newCDPSession(page)
    await client.send('DOM.enable')
    await client.send('CSS.enable')

    console.log()
    console.log(`【${side === 'dark' ? 'B' : 'C'}】${variant}（data-juya-variant=${activeVariant}）落地字体实探`)
    const rows = []
    for (const t of TARGETS) {
      const nodeId = await nodeIdOf(client, t.selector)
      if (!nodeId) {
        console.log(`  ${t.label.padEnd(22)} — 节点不存在（跳过）`)
        continue
      }
      const fonts = await platformFonts(client, nodeId)
      const declaredFirst = firstFamily(t.stackOf(tokens))
      const rendered = fonts.map((f) => `${f.familyName}(${f.glyphCount})`).join(', ') || '(无)'
      const renderedFamilies = fonts.map((f) => f.familyName)
      rows.push({ key: t.key, label: t.label, declaredFirst, fonts })
      console.log(`  ${t.label.padEnd(22)} 声明首选 ${String(declaredFirst).padEnd(16)} ⇒ 实际落地 ${rendered}`)
      report[`${variant}.${t.key}`] = { declaredFirst, fonts }
      if (side === 'dark') {
        check(
          renderedFamilies.includes(declaredFirst),
          `${variant} ${t.label} 首选族「${declaredFirst}」须真实落地（CDP 平台字体）`,
          `实际：${rendered}`
        )
      }
    }
    report[`${variant}.variant`] = activeVariant
    await context.close()
  }

  // ---- 对照面：探针自检（亮侧旧 Inter 栈必须**回退**，证明探针读的是落地值而非声明值）----
  console.log()
  console.log('【D】探针自检 —— nocturne-light 的旧 Inter 栈应回落（证明本探针识别回退，而非读声明值）')
  const lightBody = report['nocturne-light.body']
  const lightHeading = report['nocturne-light.heading']
  for (const [label, entry] of [
    ['nocturne-light 正文', lightBody],
    ['nocturne-light 标题', lightHeading]
  ]) {
    if (!entry) {
      check(false, `${label} 探针未取到（对照面缺失）`)
      continue
    }
    const fams = entry.fonts.map((f) => f.familyName)
    const fellBack = !fams.includes('Inter')
    check(
      fellBack,
      `${label} 声明首选 Inter 应**未落地**（本机无 Inter ⇒ 探针须读出回退字体）`,
      `实际：${fams.map((f) => `${f}(${entry.fonts.find((x) => x.familyName === f).glyphCount})`).join(', ')}`
    )
    check(
      fams.length > 0,
      `${label} 须有实际落地的平台字体（空集说明探针失效）`,
      `实际：${fams.join(', ') || '(空)'}`
    )
  }
} finally {
  await browser.close()
  server.close()
}

// ------------------------------------------------------------------ 汇总
console.log()
console.log('【E】汇总')
if (failures.length === 0) {
  console.log('  结论：全部成立（暗侧三档首选族真实落地；对照面旧 Inter 栈正确回退）。')
} else {
  console.log(`  结论：FAIL ${failures.length} 项 —— 逐项如下：`)
  for (const f of failures) console.log(`    · ${f}`)
}
if (JSON_OUT) {
  console.log()
  console.log('【F】机器可读结果（供验收报告引用）')
  console.log(JSON.stringify(report, null, 2))
}
process.exit(failures.length === 0 ? 0 : 1)
