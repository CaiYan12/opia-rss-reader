#!/usr/bin/env node
/**
 * nocturne 排印探针（GitHub issue #17 / SPEC 批次 B3）
 * =============================================================================
 * 本脚本把「排印三件事」的实测证据做成可复现的一键探针，而不是只写在提交信息里：
 *   ① `text-wrap`：导语在 560 / 常规 1280 / 宽屏 1920 三档取景下，默认 wrap / `pretty` / `balance`
 *      的末行字数、末行宽度、总行数，并各出一张导语特写（写 %TEMP%，不进仓库）。
 *   ② `line-break: strict`：同一帧内 `auto` vs `strict` 的每行字数，逐档比对是否真有断行差异。
 *   ③ `text-autospace`：在 `.juya-issue` 上开关自动间距，量刊头 h1 的文本宽（**必须 Δ 0**）
 *      与一个正对照（.juya-issue 内的混排串，**必须 > 0**，证明规则真的生效而非被内核丢弃）。
 *   ④ `tabular-nums`：等宽栈下 1/8/0 的推进宽是否相等（日期与序号的等宽数字前提）。
 * 另含**目标内核**（Electron 打包的 Chromium，非 Playwright 自带）支持性探测：
 *   SPEC 明确「不用 Playwright 内核的结论替代实际内核」，故本脚本直接拉起 Electron 主进程，
 *   在真实 BrowserWindow 里跑 CSS.supports + 一次 0.125em 插距的几何实测。
 *
 * 用法：
 *   npm run build:dir && node scripts/nocturne-typography-probe.mjs [标签]
 *   标签只进 %TEMP% 文件名，便于 A/B 对照（默认 current）。
 *
 * 端口 4199（避开 playwright.config.ts 的 4173、walkthrough 的 4196、masthead 探针的 4197）。
 * 退出码：0 = 全部测量产出且断言成立；1 = 有断言不成立；2 = 环境/前置条件缺失。
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'out', 'renderer')
const HELPERS_TS = join(ROOT, 'tests', 'e2e', 'helpers.ts')
const STUB_BUNDLE = join(ROOT, 'out', '.typography-probe-stub.mjs')
const PORT = 4199
const ORIGIN = `http://127.0.0.1:${PORT}`
const TAG = (process.argv[2] ?? 'current').replace(/[^\w.-]/g, '')
const DEST = join(tmpdir(), `nocturne-typo-${TAG}`)

const WIDTHS = [560, 1280, 1920]

/** 导语实测样本：长度足以铺满 4~5 行，结尾落在「一 / 推」这类 1 字残行上时最能暴露孤字。 */
const LEAD =
  '这是一段用于排印实测的导语占位文本：本周模型侧的最大变量来自推理成本，三家厂商在同一周内把长上下文价格压到过去的四成，而真正的分水岭是「单位 token 的有效算力」——它决定了下一季度的应用形态，也决定了哪些团队能在一夜之间把原型推给真实用户。'

/** line-break 实测样本：刻意堆满简体中文的标点禁则候选（引号/括号/分号/冒号/破折号/百分号）。 */
const LB_SAMPLES = [
  '本周模型侧的最大变量来自推理成本：三家厂商在同一周内把长上下文价格压到过去的四成，而真正的分水岭是「单位 token 的有效算力」——它决定了下一季度的应用形态。',
  'OpenAI 发布了新的推理模型（代号 o5），官方称在数学与代码基准上比上一代提升约 12%，价格维持在每百万 token 2.5 美元；国内两家厂商把上下文窗口拉到 200 万 token，并在文档里明确标注「长上下文不等于有效上下文」。',
  '注意：以下数字均来自厂商自述，未经第三方复现——包括 12%、2.5 美元与 200 万 token；「有效上下文」指的是在真实任务里能被稳定利用的长度（通常只有标称值的 20%–40%）。'
]

const ACTIVE_READER = 'div.min-h-0.w-full:has(.juya-masthead)'
const FREEZE = '*, *::before, *::after { animation: none !important; transition: none !important; }'

if (!existsSync(join(OUT_DIR, 'index.html'))) {
  console.error('[fatal] 找不到 out/renderer/index.html —— 先跑 npm run build:dir')
  process.exit(2)
}
mkdirSync(DEST, { recursive: true })

const failures = []
const check = (ok, label, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

// ------------------------------------------------------------------ 0. 目标内核支持性探测（Electron）
/** 拉起 Electron 打包的 Chromium（43.4.1 / Chromium 150），在真实 BrowserWindow 里探测。
 *  为什么不用 Playwright 的结论替代：两者内核版本不同（Playwright 自带 151），
 *  而 SPEC 明写「不用它的结论替代实际内核」。`--no-sandbox` 是本机 DSH 完整性标签下的启动前提
 *  （见 AGENTS.md「本机环境陷阱」），与本项目运行配置无关。 */
async function probeTargetKernel() {
  const main = join(tmpdir(), `nocturne-kernel-probe-${process.pid}.cjs`)
  writeFileSync(
    main,
    `const { app, BrowserWindow } = require('electron')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 800, height: 600 })
  await win.loadURL('about:blank')
  const res = await win.webContents.executeJavaScript(${JSON.stringify(`(() => {
    const t = document.createElement('div')
    t.style.cssText = 'display:inline-block;white-space:nowrap;font:20px "Noto Sans SC",sans-serif'
    t.textContent = '第6天'
    document.body.appendChild(t)
    t.style.textAutospace = 'no-autospace'
    const off = t.getBoundingClientRect().width
    t.style.textAutospace = 'normal'
    const on = t.getBoundingClientRect().width
    return {
      ua: navigator.userAgent,
      pretty: CSS.supports('text-wrap','pretty'),
      balance: CSS.supports('text-wrap','balance'),
      autospace: CSS.supports('text-autospace','normal'),
      strict: CSS.supports('line-break','strict'),
      tabular: CSS.supports('font-variant-numeric','tabular-nums'),
      autospaceDeltaPx: Math.round((on - off) * 1000) / 1000
    }
  })()`)})
  console.log('PROBE_JSON:' + JSON.stringify(res))
  app.quit()
}).catch((e) => { console.error('PROBE_ERR', e); app.exit(3) })
`,
    'utf-8'
  )
  const exe = join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  if (!existsSync(exe)) {
    rmSync(main, { force: true })
    return null
  }
  const out = await new Promise((res) => {
    // ELECTRON_RUN_AS_NODE 存在于本机用户环境（AGENTS.md「本机环境陷阱」）：必须**删除**而不是置空字符串，
    // 置空仍会被 Electron 当成已设置 ⇒ 退化为纯 Node 模式，`--no-sandbox` 变非法参数。
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(exe, ['--no-sandbox', main], { env, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill(), 30000)
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', () => {
      clearTimeout(timer)
      rmSync(main, { force: true })
      const m = /PROBE_JSON:(\{.*\})/.exec(stdout)
      res(m ? { ...JSON.parse(m[1]), stderr } : { error: (stderr || stdout || 'no output').slice(-400) })
    })
  })
  return out
}

console.log('════════ 0. 目标内核（Electron 打包的 Chromium）支持性探测 ════════')
const kernel = await probeTargetKernel()
if (!kernel) {
  console.error('[fatal] 找不到 node_modules/electron/dist/electron.exe')
  process.exit(2)
}
console.log('  ' + JSON.stringify(kernel, null, 1).replace(/\n/g, '\n  '))
if (kernel.error) {
  check(false, '目标内核探针应能启动并返回结果', kernel.error)
} else {
  for (const [name, label] of [
    ['pretty', 'text-wrap: pretty'],
    ['balance', 'text-wrap: balance'],
    ['autospace', 'text-autospace: normal'],
    ['strict', 'line-break: strict'],
    ['tabular', 'font-variant-numeric: tabular-nums']
  ]) {
    check(kernel[name] === true, `目标内核支持 ${label}`)
  }
  check(
    kernel.autospaceDeltaPx > 0,
    '目标内核的 text-autospace 真的插距（不是只解析不生效）',
    `「第6天」@20px Δ ${kernel.autospaceDeltaPx}px`
  )
}

// ------------------------------------------------------------------ 静态服务 + 桩（与 visual-walkthrough 同口径）
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
  writeFileSync(STUB_BUNDLE, built.outputFiles[0].text, 'utf-8')
  const mod = await import(pathToFileURL(STUB_BUNDLE).href)
  return mod.makeStubScript(scenario)
}

await new Promise((res, rej) => {
  server.once('error', rej)
  server.listen(PORT, '127.0.0.1', res)
})
const stubScript = await loadStubScript('nocturneSvg')

const { chromium } = await import('@playwright/test')
const browser = await chromium.launch()

/** 打开阅读页（nocturne 暗侧 + 内联 SVG 图源），冻结动效、字体与图片就绪、鼠标移出内容区。 */
async function openReader(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.addInitScript(stubScript)
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
  const styled = page.locator('.juya-feed-item').first()
  await styled.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await styled.click()
  await page.locator(`${ACTIVE_READER} .juya-masthead h1`).waitFor({ state: 'visible' })
  await page.addStyleTag({ content: FREEZE })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  await page.mouse.move(4, 4)
  return { context, page }
}

/** 逐字符量行盒：返回行数、每行字数、末行字数与末行右缘（孤字 = 末行 1 字）。 */
const LINE_METRICS = (sel) => {
  const el = document.querySelector(sel)
  if (!el || !el.firstChild || el.firstChild.nodeType !== 3) return null
  const tn = el.firstChild
  const text = tn.textContent
  const range = document.createRange()
  const tops = []
  for (let i = 0; i < text.length; i++) {
    range.setStart(tn, i)
    range.setEnd(tn, i + 1)
    const r = range.getBoundingClientRect()
    tops.push(Math.round(r.top * 100) / 100)
  }
  const uniq = [...new Set(tops)].sort((a, b) => a - b)
  const lines = uniq.map((top) => tops.filter((t) => t === top).length)
  const lastTop = uniq[uniq.length - 1]
  const lastChars = tops.filter((t) => t === lastTop).length
  range.setStart(tn, text.length - lastChars)
  range.setEnd(tn, text.length)
  const lastRect = range.getBoundingClientRect()
  return {
    lineCount: lines.length,
    lines,
    lastChars,
    lastWidth: Math.round(lastRect.width * 100) / 100,
    contentWidth: Math.round(el.getBoundingClientRect().width * 100) / 100
  }
}

/** text-autospace 的开关实测：同一帧内先关再开，量刊头 h1 文本宽与 .juya-issue 内的正对照。 */
const AUTOSPACE_PROBE = (tabSel) => {
  const tab = document.querySelector(tabSel)
  const issue = tab?.querySelector('.juya-issue')
  const h1 = issue?.querySelector('.juya-masthead h1')
  const rangeW = (el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    return Math.round(r.getBoundingClientRect().width * 1000) / 1000
  }
  const control = document.createElement('span')
  control.className = 'juya-autospace-control'
  control.style.cssText = 'display:inline-block;white-space:nowrap;font:20px "Noto Sans SC",sans-serif'
  control.textContent = '第6天'
  issue.appendChild(control)
  const snap = () => ({
    h1TextWidth: rangeW(h1),
    h1Height: Math.round(h1.getBoundingClientRect().height * 1000) / 1000,
    controlWidth: Math.round(control.getBoundingClientRect().width * 1000) / 1000,
    computed: { issue: getComputedStyle(issue).textAutospace, h1: getComputedStyle(h1).textAutospace }
  })
  const st = document.createElement('style')
  st.textContent = `${tabSel} .juya-issue { text-autospace: no-autospace !important }`
  document.head.appendChild(st)
  const off = snap()
  st.remove()
  const on = snap()
  control.remove()
  return { h1Text: h1.textContent, off, on }
}

const results = []
try {
  for (const width of WIDTHS) {
    const { context, page } = await openReader(width)
    // 用真实长度的中文导语替换占位文本（只测 CSS 断行行为，不改夹具、不写回仓库）
    await page.evaluate(
      ([tabSel, lead]) => {
        const tab = document.querySelector(tabSel)
        tab.querySelector('.juya-lead').textContent = lead
      },
      [ACTIVE_READER, LEAD]
    )

    // ---- ① text-wrap 三态对比 + 三张特写 ----
    const wrapRows = []
    for (const [key, value] of [
      ['wrap', 'wrap'],
      ['pretty', 'pretty'],
      ['balance', 'balance']
    ]) {
      await page.evaluate(
        ([tabSel, v]) => {
          document.querySelector(tabSel).querySelector('.juya-lead').style.textWrap = v
        },
        [ACTIVE_READER, value]
      )
      const m = await page.evaluate(LINE_METRICS, `${ACTIVE_READER} .juya-lead`)
      const png = await page.locator(`${ACTIVE_READER} .juya-lead`).first().screenshot()
      writeFileSync(join(DEST, `lead-${width}-${key}.png`), png)
      wrapRows.push({ key, ...m })
    }
    await page.evaluate(
      ([tabSel]) => {
        document.querySelector(tabSel).querySelector('.juya-lead').style.textWrap = ''
      },
      [ACTIVE_READER]
    )

    // ---- ①b 长度切片扫描：孤字的出现与 pretty / balance 的处置 ----
    // 为什么需要它：单条样本未必恰好落成「末行 1 字」，而票面要证的是「pretty 能修孤字、且只修孤字」。
    // 做法：把导语样本按长度逐字截短（0..59），同一元素上分别用三态量末行字数。
    const sweep = await page.evaluate(
      ([tabSel, lead]) => {
        const el = document.querySelector(tabSel).querySelector('.juya-lead')
        const lineCounts = () => {
          const tn = el.firstChild
          const range = document.createRange()
          const tops = []
          for (let i = 0; i < tn.textContent.length; i++) {
            range.setStart(tn, i)
            range.setEnd(tn, i + 1)
            tops.push(Math.round(range.getBoundingClientRect().top * 100) / 100)
          }
          const uniq = [...new Set(tops)].sort((a, b) => a - b)
          return uniq.map((top) => tops.filter((t) => t === top).length)
        }
        const rows = []
        for (let cut = 0; cut < 60; cut++) {
          el.textContent = lead.slice(0, lead.length - cut)
          const row = { cut }
          for (const v of ['wrap', 'pretty', 'balance']) {
            el.style.textWrap = v
            row[v] = lineCounts()
          }
          rows.push(row)
        }
        el.style.textWrap = ''
        return rows
      },
      [ACTIVE_READER, LEAD]
    )

    // ---- ② line-break: strict 差异（同一帧内开关） ----
    const lbRows = []
    for (const [i, sample] of LB_SAMPLES.entries()) {
      await page.evaluate(
        ([tabSel, text]) => {
          document.querySelector(tabSel).querySelector('.juya-entry p:not(.juya-links-label)').textContent =
            text
        },
        [ACTIVE_READER, sample]
      )
      const sel = `${ACTIVE_READER} .juya-entry p:not(.juya-links-label)`
      const auto = await page.evaluate(LINE_METRICS, sel)
      await page.evaluate((tabSel) => {
        const st = document.createElement('style')
        st.id = 'probe-lb'
        st.textContent = `${tabSel} .juya-issue { line-break: strict }`
        document.head.appendChild(st)
      }, ACTIVE_READER)
      const strict = await page.evaluate(LINE_METRICS, sel)
      await page.evaluate(() => document.getElementById('probe-lb')?.remove())
      lbRows.push({ sample: i, auto, strict, same: JSON.stringify(auto?.lines) === JSON.stringify(strict?.lines) })
    }

    // ---- ③ text-autospace：h1 必须 Δ 0，正对照必须 > 0 ----
    const as = await page.evaluate(AUTOSPACE_PROBE, ACTIVE_READER)
    const h1Delta = Math.round((as.on.h1TextWidth - as.off.h1TextWidth) * 1000) / 1000
    const controlDelta = Math.round((as.on.controlWidth - as.off.controlWidth) * 1000) / 1000

    // ---- ④ tabular-nums（等宽栈） ----
    const tab = await page.evaluate(() => {
      const probe = document.createElement('span')
      probe.style.cssText =
        'position:absolute;visibility:hidden;white-space:nowrap;font-family:"JetBrains Mono","SF Mono",Consolas,"Noto Sans SC",monospace;font-size:12px'
      document.body.appendChild(probe)
      const w = (t) => {
        probe.textContent = t
        return Math.round(probe.getBoundingClientRect().width * 1000) / 1000
      }
      const off = { 1: w('1'), 8: w('8'), 0: w('0') }
      probe.style.fontVariantNumeric = 'tabular-nums'
      const on = { 1: w('1'), 8: w('8'), 0: w('0') }
      probe.remove()
      return { off, on, equal: off['1'] === off['8'] && off['8'] === off['0'] }
    })

    results.push({ width, wrapRows, sweep, lbRows, autospace: { h1Delta, controlDelta, ...as }, tabular: tab })
    await context.close()
  }
} finally {
  await browser.close()
  await new Promise((res) => server.close(res))
  if (existsSync(STUB_BUNDLE)) rmSync(STUB_BUNDLE, { force: true })
}

// ------------------------------------------------------------------ 报告
console.log('\n════════ ① text-wrap：导语三态（560 / 1280 / 1920）════════')
for (const r of results) {
  const lead = r.wrapRows[0]
  console.log(
    `  @${r.width}  内容列 ${lead.contentWidth}px  行数 ${lead.lineCount}  每行字数 [${lead.lines.join(',')}]`
  )
  for (const row of r.wrapRows) {
    console.log(
      `    ${row.key.padEnd(8)} 末行 ${String(row.lastChars).padStart(2)} 字 / 宽 ${String(row.lastWidth).padStart(6)}px` +
        `  全部行数 [${row.lines.join(',')}]`
    )
  }
  const def = r.wrapRows[0]
  const pretty = r.wrapRows[1]
  const balance = r.wrapRows[2]
  check(
    def.lines.length === pretty.lines.length && def.lines.length === balance.lines.length,
    `@${r.width} text-wrap 三态总行数一致（不改段落高度）`,
    `${def.lineCount}/${pretty.lineCount}/${balance.lineCount}`
  )
  check(
    pretty.lines.slice(0, -1).join(',') === def.lines.slice(0, -1).join(','),
    `@${r.width} pretty 只动末行、不动其余断行`,
    `默认 [${def.lines.join(',')}] / pretty [${pretty.lines.join(',')}]`
  )
  check(
    balance.lines.join(',') !== def.lines.join(','),
    `@${r.width} balance 会重排多行（作为「不取 balance」的对照证据）`,
    `默认 [${def.lines.join(',')}] / balance [${balance.lines.join(',')}]`
  )
}
console.log(`  三档导语特写已写：${DEST}\\lead-<宽度>-<wrap|pretty|balance>.png`)

console.log('\n════════ ①b 长度切片扫描（60 组）：pretty 只改写末尾两行、balance 重排多行 ════════')
for (const r of results) {
  const lastOf = (a) => a[a.length - 1]
  const sig = (a) => a.join(',')
  const orphans = r.sweep.filter((x) => lastOf(x.wrap) === 1)
  const prettyOrphans = r.sweep.filter((x) => lastOf(x.pretty) === 1)
  const changed = r.sweep.filter((x) => sig(x.wrap) !== sig(x.pretty))
  const balanceChanged = r.sweep.filter((x) => sig(x.wrap) !== sig(x.balance))
  const sameHeight = r.sweep.every((x) => x.wrap.length === x.pretty.length && x.wrap.length === x.balance.length)
  /** 首个不同行的下标：pretty 的改动必须落在末尾 4 行窗口内（Chromium 的 pretty 实现只重排末尾几行） */
  const firstDiff = (x) => x.wrap.findIndex((v, i) => v !== x.pretty[i])
  const tailOnly = changed.every((x) => firstDiff(x) >= x.wrap.length - 4)
  console.log(
    `  @${r.width}  默认末行=1 字：${orphans.length} 组（cut ${orphans.map((x) => x.cut).join(',') || '—'}）；` +
      `pretty 后仍 1 字：${prettyOrphans.length} 组；pretty 改动 ${changed.length} 组（${changed
        .map((x) => `${sig(x.wrap)}→${sig(x.pretty)}`)
        .join(' ')}）；balance 改动 ${balanceChanged.length}/60 组`
  )
  check(orphans.length > 0, `@${r.width} 样本确实能触发孤字（否则 pretty 的价值无法被证实）`, `${orphans.length} 组`)
  check(prettyOrphans.length === 0, `@${r.width} pretty 消除了全部孤字`, `${prettyOrphans.length} 组仍为 1 字`)
  check(sameHeight, `@${r.width} 三态总行数全程一致（不改段落高度）`)
  check(
    tailOnly,
    `@${r.width} pretty 的改动只落在末尾 4 行窗口内（段落前部一字不动）`,
    `${changed.length} 组改动，首个差异行下标 ${changed.map(firstDiff).join(',') || '—'}`
  )
  check(
    balanceChanged.length > changed.length,
    `@${r.width} balance 的改动面远大于 pretty（故弃用 balance）`,
    `${balanceChanged.length} vs ${changed.length} 组`
  )
}

console.log('\n════════ ② line-break: strict 实测差异（同一帧内开关）════════')
let lbTotal = 0
let lbDiff = 0
for (const r of results) {
  for (const row of r.lbRows) {
    lbTotal++
    if (!row.same) lbDiff++
    console.log(
      `  @${r.width} 样本${row.sample + 1}  auto [${row.auto.lines.join(',')}]  strict [${row.strict.lines.join(',')}]  → ${row.same ? '相同' : '不同'}`
    )
  }
}
check(lbDiff === 0, 'line-break: strict 对简体中文无可观测差异（决定不加）', `${lbDiff}/${lbTotal} 组不同`)

console.log('\n════════ ③ text-autospace：h1 必须不变、正对照必须生效 ════════')
for (const r of results) {
  console.log(
    `  @${r.width}  h1「${r.autospace.h1Text}」文本宽 ${r.autospace.off.h1TextWidth} → ${r.autospace.on.h1TextWidth}px（Δ ${r.autospace.h1Delta}）` +
      `  盒高 ${r.autospace.off.h1Height} → ${r.autospace.on.h1Height}px` +
      `  正对照「第6天」@20px ${r.autospace.off.controlWidth} → ${r.autospace.on.controlWidth}px（Δ ${r.autospace.controlDelta}）`
  )
  check(r.autospace.h1Delta === 0, `@${r.width} 刊头 h1 在 text-autospace 开关下文本宽不变`, `Δ ${r.autospace.h1Delta}px`)
  check(r.autospace.controlDelta > 0, `@${r.width} 正对照确实插入间距（证明属性生效）`, `Δ ${r.autospace.controlDelta}px`)
}

console.log('\n════════ ④ tabular-nums：等宽栈下数字推进宽 ════════')
for (const r of results) {
  console.log(
    `  @${r.width}  1/8/0 = ${r.tabular.off['1']} / ${r.tabular.off['8']} / ${r.tabular.off['0']} px` +
      `（tabular-nums 后 ${r.tabular.on['1']} / ${r.tabular.on['8']} / ${r.tabular.on['0']}）`
  )
  check(r.tabular.equal, `@${r.width} 等宽栈数字推进宽相等（日期与序号的等宽前提）`)
}

console.log(`\n产出目录：${DEST}`)
console.log('\n════════ 结果 ════════')
if (failures.length > 0) {
  console.error(`FAIL：${failures.length} 项断言未成立`)
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
console.log('PASS：目标内核支持性探测 + text-wrap 三态 + line-break 实测 + autospace h1 不变 + 等宽数字，全部成立。')
process.exit(0)
