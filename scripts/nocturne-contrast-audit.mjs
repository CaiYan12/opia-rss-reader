#!/usr/bin/env node
/**
 * nocturne-dark 叠加态对比度全量实算（GitHub issue #9）
 * =============================================================================
 * 目的：各张票单独看都合规，但 **nebula 雾 + 导语高亮窗 + 阅读窗遮罩 + 序号发光**
 *       同时存在时的合成结果，没有一张票能单独回答。本脚本把「叠加态」逐一重算。
 *
 * 纪律（票面明写）：
 *  1. **不采信浏览器目测**；取值一律**从 juya.css 实读**（源码即唯一真源，脚本内不手抄数值）。
 *  2. **不用「三层 nebula 全重叠」当最坏面** —— 它不可达（见下「支撑域」证明）。
 *     真正的可达最坏面来自**滚动**：`.juya-scene` 是 `position: sticky; top: 0`，
 *     **视口锚定**而非文档锚定；内容滚到滚动口顶端时，落在顶部雾层的峰值区。
 *  3. 脚本**自己判 PASS/FAIL**：正文文字 ≥ 4.5:1、非文本 UI 件 ≥ 3:1；
 *     任一 FAIL ⇒ 退出码 1（CI/复核可据此拦截）。
 *
 * 口径与分类：
 *  · text  —— 承载信息的文字（正文/导语/标题/链接/序号/元信息）：门槛 4.5:1
 *  · ui    —— 非文本 UI 件（导语左侧发光竖线等）：门槛 3:1
 *  · decor —— 装饰件（尘埃微粒 / 阅读窗渐隐遮罩 / 发丝分隔线 / hover 描边）：
 *             不承载信息、WCAG 1.4.11 不适用（本仓既有裁决：需求 §7.1 与 F-7 已留痕），
 *             仅打印数值 + 取色来源，不计入 PASS/FAIL。
 *
 * 用法：node scripts/nocturne-contrast-audit.mjs [--vh=800] [--quiet]
 * 退出码：0 = 全部达标；1 = 有 text/ui 项未达标（逐项打印）。
 *
 * 与栅格化实测的关系（可复现）：`tests/e2e/contrast.spec.ts` 在真实像素上量同一口径的最坏面
 * （把导语滚到滚动口顶端 → 截图 → 逐列取中位数滤掉 dust → 算导语文字对比度）。实测比本脚本的
 * 解析式**高 0.05~0.12**（本脚本取雾峰像素并逐层取整 ⇒ 偏保守）：
 *   vw=700 默认态：解析式 4.5995 / 实测 **4.6567**；vw=800：4.6617 / 4.7303；
 *   vw=1280：4.8504 / 4.9105（#6 时代的 muted 档留档；#13 起导语行改读 --jy-lead-text，见下）。
 * #13 / SPEC 批次 B1（2026-10-20）：导语改用**专用**文字记号 `--jy-lead-text`（不再复用 --jy-muted），
 *   本脚本的导语行（含 hover 变体）**实读该 token**；另新增「条目标题编号 #N 对页面底」一行。
 * 已修缺口（2026-10-12，本脚本现判 PASS，退出码 0）：
 *   ① 「条目 hover ∩ 导语」：原 `.jynoct .juya-entry:hover` 与 `.juya-lead` 同用 --jy-lead-bg
 *      ⇒ 悬停时导语像素叠两层 0.08 白，muted 掉到 3.53~3.82（8/8 档 < 4.5）。
 *      实测**任何正 alpha 都不可行**（底色近黑 ⇒ 微亮成比例放大分母，连 0.005 都把 vw=480 压到
 *      4.4967），故暗侧撤掉 hover 背景微亮、改走 `border-bottom-color` 提亮（边框不参与文字背景合成）。
 *      本脚本改为**实读 hover 背景层 alpha**：`background: none` ⇒ 0 层。
 *   ② vw≤520px 窄窗：该分支 nebula 退化为单条顶部窄带，而它同样**视口锚定**（sticky）——
 *      导语滚到滚动口顶端即落进窄带峰值，原 0.07 只有 4.4915 < 4.5。已把窄窗峰值 alpha 单独
 *      收到 **0.055**（vw=480 → 4.6046，余量 0.1046）。本脚本从窄窗规则**自身的 token 覆写**读取该值。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSS_PATH = join(ROOT, 'src/renderer/juya/juya.css')
const RAW = readFileSync(CSS_PATH, 'utf-8')
/** 取值一律从**代码视图**读（注释里复述的数值不作为证据；注释与代码不一致时以代码为准） */
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))

const argv = process.argv.slice(2)
const QUIET = argv.includes('--quiet')
const VH = Number((argv.find((a) => a.startsWith('--vh=')) ?? '--vh=800').split('=')[1])
/** 视口宽度档：覆盖票面点名的窄窗 560–800 与常规 900+；480 走 ≤520px 窄窗退化分支 */
const WIDTHS = [480, 560, 700, 800, 900, 1024, 1280]

// ---------------------------------------------------------------- CSS 取值工具
/** 花括号配平取块（可处理嵌套规则：媒体查询 / 关键帧） */
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
const block = (re) => CSS.match(re)?.[0] ?? ''
/** ≤520px 媒体块（多处；只看含 nocturne 选择器的那些） */
const NARROW_BLOCKS = (() => {
  const out = []
  let rest = CSS
  for (;;) {
    const b = extractBlock(rest, /@media \(max-width: 520px\) \{/)
    if (!b) break
    out.push(b)
    rest = rest.replace(b, '')
  }
  return out
})()
const narrowWith = (needle) => NARROW_BLOCKS.find((b) => b.includes(needle)) ?? ''
const must = (value, what) => {
  if (value === '' || value === undefined || value === null || Number.isNaN(value)) {
    console.error(`[fatal] 无法从 juya.css 抠出：${what}（选择器或取值可能已改名——本脚本拒绝用兜底值继续）`)
    process.exit(2)
  }
  return value
}
const decl = (src, prop) =>
  src.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`))?.[1]?.trim() ?? ''
const px = (src, prop) => {
  const m = decl(src, prop).match(/(-?[\d.]+)px/)
  return m ? Number(m[1]) : Number.NaN
}
const hex = (src, name) => {
  const m = src.match(new RegExp(`${name}\\s*:\\s*#([0-9a-fA-F]{6})`))
  return m ? Number.parseInt(m[1], 16) : Number.NaN
}
/** 抠某条声明值里的 rgba()（`background: rgba(...)` 与 `border-bottom: 1px solid rgba(...)` 通吃） */
const rgba = (src, name) => {
  const m = decl(src, name).match(
    /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/
  )
  if (!m) return null
  return { rgb: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]), a: Number(m[4]) }
}

// ---------------------------------------------------------------- 取值（全部实读）
const DARK = must(block(/\[data-juya-variant='nocturne-dark'\]\s*\{[^}]*\}/), 'nocturne-dark token 块')
const TOKEN = {
  bg: must(hex(DARK, '--jy-bg'), '--jy-bg'),
  text: must(hex(DARK, '--jy-text'), '--jy-text'),
  muted: must(hex(DARK, '--jy-muted'), '--jy-muted'),
  link: must(hex(DARK, '--jy-link'), '--jy-link'),
  heading: must(hex(DARK, '--jy-heading'), '--jy-heading'),
  accent: must(hex(DARK, '--jy-accent'), '--jy-accent'),
  focus: must(hex(DARK, '--jy-focus'), '--jy-focus'),
  leadBg: must(rgba(DARK, '--jy-lead-bg'), '--jy-lead-bg'),
  /** 导语专用文字记号（#13 / SPEC B1）：导语不再复用 muted —— 本脚本的导语行必须**实读**它，
   *  否则会继续报旧值（票面明确点名的失真点）。 */
  leadText: must(hex(DARK, '--jy-lead-text'), '--jy-lead-text')
}
const NEBULA_BASE = must(
  block(/\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula\s*\{[^}]*\}/),
  'nocturne-dark 的 .juya-scene-nebula 覆写规则'
)
/** 从一条规则里抠出 radial-gradient 层（半径/中心/停靠点 + 引用哪条 --jy-nebula-N）。
 *  y 中心支持两种写法：百分比（`0%`）或**贴底像素锚** `calc(100% - 136px)`（2026-10-12 Spec 轴
 *  修正后 n3 用后者按 y2k 约定抬升，避免设计峰值落进被裁的 128px chrome）。`cyPx` 缺省为 undefined。 */
const gradientLayers = (src) =>
  [...src.matchAll(/radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+(?:([\d.]+)%|calc\(100%\s*-\s*([\d.]+)px\))\s*,\s*var\((--jy-nebula-\d)\)\s*,\s*transparent\s+([\d.]+)%\s*\)/g)].map(
    (m) => ({
      rx: Number(m[1]) / 100,
      ry: Number(m[2]) / 100,
      cx: Number(m[3]) / 100,
      cy: m[4] === undefined ? undefined : Number(m[4]) / 100,
      ...(m[5] === undefined ? {} : { cyPx: Number(m[5]) }),
      token: m[6],
      stop: Number(m[7]) / 100
    })
  )
const withColor = (layer, src) => {
  const c = must(rgba(src, layer.token), layer.token)
  return { ...layer, r: (c.rgb >> 16) & 0xff, g: (c.rgb >> 8) & 0xff, b: c.rgb & 0xff, a: c.a, rgb: c.rgb }
}
/** 基础（>520px）三层雾；CSS 首个 background-image 画在最上层，故合成序为反序（3 → 2 → 1） */
const NEBULA_MAIN = gradientLayers(NEBULA_BASE).map((l) => withColor(l, NEBULA_BASE))
/** ≤520px 窄窗退化：收束为单条顶部窄带（左右边缘雾全撤，见 #2 窄窗块） */
const NEBULA_NARROW_RAW = must(
  (narrowWith('.juya-scene-nebula').match(
    /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-scene-nebula\s*\{[^}]*\}/
  ) ?? [''])[0],
  '窄窗 nebula 退化规则'
)
const NEBULA_NARROW = gradientLayers(NEBULA_NARROW_RAW).map((l) => {
  // #9 G-2 修复：窄窗规则自身会覆写 --jy-nebula-1（单独收峰值 alpha）⇒ 颜色优先取本规则的 token，
  // 未覆写的层回退主规则取值。这样「窄窗峰值」始终跟随 CSS 真值，不会因主规则改动而失真。
  const c = rgba(NEBULA_NARROW_RAW, l.token) ?? rgba(NEBULA_BASE, l.token)
  return { ...l, r: (c.rgb >> 16) & 0xff, g: (c.rgb >> 8) & 0xff, b: c.rgb & 0xff, a: c.a, rgb: c.rgb }
})

const ISSUE_RULE = must(
  block(/\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-issue\s*\{[^}]*\}/),
  'nocturne-dark 的 .juya-issue 收窄规则'
)
const ISSUE_MAX = must(px(ISSUE_RULE, 'max-width'), '.juya-issue max-width')
const padOf = (v) => {
  const n = v.split(/\s+/).map((s) => Number.parseFloat(s))
  if (n.length === 1) return { t: n[0], r: n[0], b: n[0], l: n[0] }
  if (n.length === 2) return { t: n[0], r: n[1], b: n[0], l: n[1] }
  if (n.length === 3) return { t: n[0], r: n[1], b: n[2], l: n[1] }
  return { t: n[0], r: n[1], b: n[2], l: n[3] }
}
const ISSUE_PAD = padOf(must(decl(ISSUE_RULE, 'padding'), '.juya-issue padding'))
/** ≤520px 全局窄窗块把 .juya-issue 内边距收到 20px 14px 48px（既有规则，实读） */
const ISSUE_PAD_NARROW = padOf(
  must(
    (NARROW_BLOCKS.map((b) => (b.match(/\.juya-issue\s*\{[^}]*\}/) ?? [])[0]).find(Boolean) ?? '').match(
      /padding\s*:\s*([^;}]+)/
    )?.[1],
    '≤520px .juya-issue padding'
  )
)
const LEAD_RULE = must(
  block(/\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-lead\s*\{[^}]*\}/),
  'nocturne-dark 的 .juya-lead 规则'
)
const LEAD_PAD = padOf(must(decl(LEAD_RULE, 'padding'), '.juya-lead padding'))
/** 一致性闸门（#13 / SPEC B1）：导语行的取值来源是**新记号**，因此暗侧导语规则必须真的消费它 ——
 *  否则本脚本会为一个页面上并不存在的颜色下结论（票面点名的失真点，换个形式复发）。
 *  规则一旦退回 `var(--jy-muted)`（旧取值），本脚本以退出码 2 拒绝继续，而不是报旧值。 */
if (!must(decl(LEAD_RULE, 'color'), 'nocturne-dark .juya-lead 的 color 声明').includes('var(--jy-lead-text)')) {
  console.error(
    '[fatal] 暗侧导语规则未消费 --jy-lead-text —— 导语行的取值来源与页面不一致，本脚本拒绝用失真值继续'
  )
  process.exit(2)
}
/** 条目标题编号 `#N` 的规则（#13 / SPEC B1）：这一行同样**实读规则**而不是「假定是 accent」。
 *  选择器形态是票面硬约束（后代形态，`EntrySplit` 把 h3 嵌在 .juya-entry-body 里）。 */
const BADGE_RULE = must(
  block(/\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-entry h3 \.juya-index\s*\{[^}]*\}/),
  "条目标题编号 #N 规则（[data-juya-variant='nocturne-dark'].jynoct .juya-entry h3 .juya-index）"
)
const MASK_COMMON = must(
  block(
    /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-issue::before,[\s\S]*?\.juya-issue::after\s*\{[^}]*\}/
  ),
  '阅读窗遮罩共用规则'
)
const MASK = must(rgba(MASK_COMMON, '--jy-window-mask'), '--jy-window-mask（遮罩最深档）')
const MASK_W = must(px(MASK_COMMON, 'width'), '遮罩宽度')
const MASK_W_NARROW = must(
  px(
    (narrowWith('.juya-issue::before').match(/\.juya-issue::before,[\s\S]*?\{[^}]*\}/) ?? [''])[0],
    'width'
  ),
  '窄窗遮罩宽度'
)
const SECTION_LINE = must(
  rgba(
    must(
      block(/\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-section > h2\s*\{[^}]*\}/),
      'nocturne-dark 栏目 h2 规则'
    ),
    'border-bottom'
  ),
  '栏目发丝线色（rgba）'
)
const OVERVIEW_HOVER = must(
  rgba(
    must(
      block(/\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-overview li:hover\s*\{[^}]*\}/),
      '概览 li:hover 规则'
    ),
    'background'
  ),
  '概览 hover 底色'
)
const OVERVIEW_SEP = must(
  rgba(
    must(
      block(/\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-overview li \+ li::after\s*\{[^}]*\}/),
      '概览发丝线规则'
    ),
    'background'
  ),
  '概览发丝线色'
)
/** 暗侧条目 hover 的**有效背景层 alpha**（#9 G-1 修复后应为 0）。
 *  注意：共享规则 `.jynoct .juya-entry:hover` 仍写 `background: var(--jy-lead-bg)`（亮侧在用），
 *  暗侧由变体专属规则覆写为 `background: none` ⇒ 有效层数为 0。故这里必须读**变体专属覆盖**，
 *  不能读共享规则（否则会误判成仍在叠层）。 */
const ENTRY_HOVER_DARK = (() => {
  const override = block(
    /\[data-juya-variant='nocturne-dark'\]\.jynoct \.juya-entry:hover\s*\{[^}]*\}/
  )
  if (!override) {
    // 无变体覆盖 ⇒ 沿用共享规则的 token
    const shared = must(block(/\.jynoct \.juya-entry:hover\s*\{[^}]*\}/), '.jynoct .juya-entry:hover 规则')
    return shared.includes('var(--jy-lead-bg)') ? TOKEN.leadBg.a : 0
  }
  const bg = decl(override, 'background')
  if (bg === 'none' || bg === 'transparent') return 0
  if (bg.includes('var(--jy-lead-bg)')) return TOKEN.leadBg.a
  const c = rgba(override, 'background')
  return c ? c.a : 0
})()
const DUST = must(rgba(block(/\.juya-scene-dust\s*\{[^}]*\}/), '--jy-scene-dust'), '--jy-scene-dust')
const FEED_HOVER_BORDER = must(
  rgba(block(/(?:^|\n)\.jynoct \.juya-feed-item:hover\s*\{[^}]*\}/), 'border-color'),
  '.jynoct .juya-feed-item:hover border-color'
)

// ---------------------------------------------------------------- 色彩数学
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
/** source-over：半透明层合成到不透明底（WCAG 不定义半透明色，必须先合成） */
const over = (rgb, alpha, base) =>
  [16, 8, 0].reduce(
    (acc, s) =>
      acc |
      (Math.round(((rgb >> s) & 0xff) * alpha + ((base >> s) & 0xff) * (1 - alpha)) << s),
    0
  )
const hexOf = (rgb) => `#${rgb.toString(16).padStart(6, '0')}`
const f1 = (n) => n.toFixed(4)

// ---------------------------------------------------------------- 场景雾模型
const layersFor = (vw) => (vw <= 520 ? NEBULA_NARROW : NEBULA_MAIN)
/** 某像素上的场景雾合成底（viewport 锚定：场景盒 = 滚动口，故 y 就是视口内相对滚动口顶端的像素行）。
 *  y 锚点两种写法：百分比 ⇒ 相对场景盒高 vh；像素锚 cyPx ⇒ 相对场景盒**底边**上移 cyPx
 *  （CSS `calc(100% - Npx)` 在 `at` 位置里就是「底边上 Npx」，与 y2k 的 `bottom: Npx` 同约定）。 */
const fogAt = (x, y, vw, vh) => {
  let acc = TOKEN.bg
  for (const l of [...layersFor(vw)].reverse()) {
    const dyCenter = l.cyPx === undefined ? l.cy * vh : vh - l.cyPx
    const dx = (x / vw - l.cx) / l.rx
    const dy = (y - dyCenter) / (l.ry * vh)
    const t = Math.hypot(dx, dy)
    const a = t >= l.stop ? 0 : l.a * (1 - t / l.stop)
    if (a > 0) acc = over(l.rgb, a, acc)
  }
  return acc
}

// ---------------------------------------------------------------- 可达面几何
/** 正文列几何（全部实读 padding/max-width）：内容盒左右缘即文字列缘 */
const geometry = (vw) => {
  const narrow = vw <= 520
  const pad = narrow ? ISSUE_PAD_NARROW : ISSUE_PAD
  const issueW = Math.min(vw, ISSUE_MAX)
  const issueLeft = Math.max(0, (vw - issueW) / 2)
  const contentLeft = issueLeft + pad.l
  const contentRight = issueLeft + issueW - pad.r
  return { narrow, pad, issueW, issueLeft, contentLeft, contentRight, maskW: narrow ? MASK_W_NARROW : MASK_W }
}

// ---------------------------------------------------------------- 实算条目
const TEXT_THRESHOLD = 4.5
const UI_THRESHOLD = 3

/** 条目标题编号 `#N` 的取色（#13 / SPEC B1）——**实读**规则里的 color 声明，不假定成 accent：
 *   · `var(--jy-<token>)`（正常路径）⇒ 直接引用同一 token；
 *   · 字面 `rgba()`/hex ⇒ 按 source-over 先合成到页面底再算（「降 alpha」的失败模式会被如实量化，
 *     而不是拿 token 数值蒙混过关）。解析不出 ⇒ 退出码 2（拒绝用失真值继续）。 */
const BADGE_COLOR = (() => {
  const v = must(decl(BADGE_RULE, 'color'), '条目标题编号 #N 的 color 声明')
  const tok = v.match(/var\((--jy-[\w-]+)\)/)
  if (tok) return { key: tok[1].slice('--jy-'.length), label: tok[1] }
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
  if (m) {
    const raw = (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3])
    const rgb = over(raw, m[4] === undefined ? 1 : Number(m[4]), TOKEN.bg)
    return { rgb, label: `${hexOf(rgb)}（字面 ${v.trim()} 叠页面底）` }
  }
  return must('', `条目标题编号 #N 的 color 无法解析：${v}`)
})()

/**
 * 每个条目声明：色 / 面 / 可达像素框。
 * 「可达」= 该元素被滚到滚动口顶端后，其像素在场景坐标系里的位置（场景视口锚定 ⇒ y 就是视口行）。
 * 采样：x 逐 1px 扫过文字列缘之内；y 扫 0..24px（首行行盒；被滚动口裁切时 y=0 亦可承载墨迹）。
 */
const ITEMS = [
  { id: '正文段落 --jy-text（纯雾底）', kind: 'text', color: 'text', surface: 'plain', box: 'content' },
  { id: '正文链接 --jy-link（纯雾底）', kind: 'text', color: 'link', surface: 'plain', box: 'content' },
  { id: '栏目标题 --jy-heading（纯雾底）', kind: 'text', color: 'heading', surface: 'plain', box: 'content' },
  { id: '元信息/题注 --jy-muted（纯雾底）', kind: 'text', color: 'muted', surface: 'plain', box: 'content' },
  {
    id: '导语 --jy-lead-text（导语底 0.08）',
    kind: 'text',
    color: 'leadText',
    surface: 'lead',
    box: 'leadInk'
  },
  { id: '概览序号 --jy-accent（纯雾底）', kind: 'text', color: 'accent', surface: 'plain', box: 'index' },
  /* #13 / SPEC B1：条目标题编号 `#N` 改取 accent（无微光、不降 alpha），新增一行单独判 AA。
     选择器形态（`.jynoct .juya-entry h3 .juya-index`）决定它与概览序号是**两个角色**：
     概览序号带微光、本行不带；两者的对比度各自独立达标。
     `color` 不写死：由 `BADGE_COLOR` **实读该规则的 color 声明**（token 或字面 rgba 均可），
     否则把规则退回 muted / 降成半透明时，本行会继续报一个页面上并不存在的值。 */
  {
    id: `条目标题编号 #N ${BADGE_COLOR.label}（纯雾底）`,
    kind: 'text',
    color: BADGE_COLOR.key ?? BADGE_COLOR.rgb,
    surface: 'plain',
    box: 'content'
  },
  {
    id: '概览行 hover：--jy-text（accent 0.06）',
    kind: 'text',
    color: 'text',
    surface: 'overviewHover',
    box: 'content'
  },
  {
    id: `条目 hover：--jy-text（hover 层 ${ENTRY_HOVER_DARK}）`,
    kind: 'text',
    color: 'text',
    surface: 'hover',
    box: 'content'
  },
  {
    id: `条目 hover ∩ 导语：--jy-lead-text（导语底 0.08 + hover ${ENTRY_HOVER_DARK}）`,
    kind: 'text',
    color: 'leadText',
    surface: 'leadHover',
    box: 'leadInk'
  },
  { id: '导语左侧发光竖线 --jy-focus（非文本 UI）', kind: 'ui', color: 'focus', surface: 'lead', box: 'leadBar' },
  { id: '栏目发丝线 0.22（装饰分隔件）', kind: 'decor', overlay: 'sectionLine', box: 'content' },
  { id: '概览条目发丝线 0.05（装饰分隔件）', kind: 'decor', overlay: 'overviewSep', box: 'content' },
  { id: '条目 hover 描边 0.16（装饰描边）', kind: 'decor', overlay: 'feedHoverBorder', box: 'content' },
  { id: '尘埃微粒 dust 0.16（纯装饰层）', kind: 'decor', overlay: 'dust', box: 'content' },
  { id: '阅读窗渐隐遮罩 0.3（装饰遮罩）', kind: 'decor', overlay: 'mask', box: 'issueEdge' }
]

const boxOf = (name, g) => {
  switch (name) {
    case 'leadInk':
      return { x0: g.contentLeft + LEAD_PAD.l, x1: g.contentRight - LEAD_PAD.r, yMax: 24 }
    case 'leadBar':
      return { x0: g.contentLeft, x1: g.contentLeft, yMax: 24 }
    case 'index':
      return { x0: g.contentLeft, x1: g.contentLeft + 24, yMax: 24 }
    case 'issueEdge':
      return { x0: g.issueLeft, x1: g.issueLeft + 1, yMax: 24 }
    default:
      return { x0: g.contentLeft, x1: g.contentRight, yMax: 24 }
  }
}
const overlayOf = (name) => {
  switch (name) {
    case 'sectionLine':
      return SECTION_LINE
    case 'overviewSep':
      return OVERVIEW_SEP
    case 'feedHoverBorder':
      return FEED_HOVER_BORDER
    case 'dust':
      return DUST
    case 'mask':
      return MASK
    default:
      throw new Error(name)
  }
}
/** 面的合成：把条目声明的环境层按 CSS 绘制顺序叠到雾底之上 */
const surfaceOf = (name, base) => {
  switch (name) {
    case 'plain':
      return base
    case 'lead':
      return over(0xffffff, TOKEN.leadBg.a, base)
    case 'hover':
      // 条目 hover：背景微亮层叠在雾底之上（暗侧修复后为 0 层）
      return ENTRY_HOVER_DARK > 0 ? over(0xffffff, ENTRY_HOVER_DARK, base) : base
    case 'leadHover':
      // 悬停在条目上时：导语自身底 0.08 + 条目 hover 层（暗侧修复后 hover 为 0 ⇒ 回到单层）
      return ENTRY_HOVER_DARK > 0
        ? over(0xffffff, ENTRY_HOVER_DARK, over(0xffffff, TOKEN.leadBg.a, base))
        : over(0xffffff, TOKEN.leadBg.a, base)
    case 'overviewHover':
      return over(OVERVIEW_HOVER.rgb, OVERVIEW_HOVER.a, base)
    default:
      throw new Error(name)
  }
}

/** 单条目的可达最坏面：扫过可达像素框取对比度最小值 */
const worstOf = (item, vw) => {
  const g = geometry(vw)
  const box = boxOf(item.box, g)
  let worst = { ratio: Number.POSITIVE_INFINITY, x: Number.NaN, y: Number.NaN }
  for (let x = box.x0; x <= box.x1; x += 1) {
    for (let y = 0; y <= box.yMax; y += 1) {
      const base = fogAt(x, y, vw, VH)
      let ratio
      if (item.overlay) {
        const o = overlayOf(item.overlay)
        ratio = contrast(over(o.rgb, o.a, base), base)
      } else {
        // item.color 是 token 键（正常）或已合成的不透明 RGB（规则里写字面色值时，见 BADGE_COLOR）
        const color = typeof item.color === 'string' ? TOKEN[item.color] : item.color
        ratio = contrast(color, surfaceOf(item.surface, base))
      }
      if (ratio < worst.ratio) worst = { ratio, x, y }
    }
  }
  return worst
}

// ---------------------------------------------------------------- 打印
const line = (s = '') => console.log(s)
const pad = (s, n) => String(s).padEnd(n, ' ')
const padL = (s, n) => String(s).padStart(n, ' ')

line('nocturne-dark 叠加态对比度全量实算（issue #9）')
line(`取值来源：${CSS_PATH.replace(ROOT + '\\', '').replace(ROOT + '/', '')}（实读，非手抄）`)
line(`视口高度 VH=${VH}px；正文列 max-width=${ISSUE_MAX}px，水平内边距=${geometry(1280).pad.l}px（≤520px 时 ${ISSUE_PAD_NARROW.l}px）`)
line(`token：bg ${hexOf(TOKEN.bg)} / text ${hexOf(TOKEN.text)} / muted ${hexOf(TOKEN.muted)} / leadText ${hexOf(TOKEN.leadText)} / link ${hexOf(TOKEN.link)} / heading ${hexOf(TOKEN.heading)} / accent ${hexOf(TOKEN.accent)} / focus ${hexOf(TOKEN.focus)}`)
line(`导语底 --jy-lead-bg = rgba(255,255,255,${TOKEN.leadBg.a})；阅读窗遮罩 = rgba(${(MASK.rgb >> 16) & 0xff},${(MASK.rgb >> 8) & 0xff},${MASK.rgb & 0xff},${MASK.a}) 宽 ${geometry(700).maskW}px`)
line()

if (!QUIET) {
  // ---- 支撑域证明（为什么「三层全重叠」不可达）----
  line('【A】三层 nebula 的支撑域（alpha > 0 的像素集合）与两两相交性')
  const layers = NEBULA_MAIN
  /** 圆心 y 的**分数**表示（百分比写法直接用；像素锚 calc(100% - Npx) ⇒ (vh − N)/vh）。
   *  支撑域分析是纯几何，必须与 fogAt 用同一套锚点换算，否则 n3 会退化成 NaN。 */
  const cyFrac = (l, vh) => (l.cyPx === undefined ? l.cy : (vh - l.cyPx) / vh)
  const support = layers.map((l) => {
    const xr = l.stop * l.rx
    const yr = l.stop * l.ry
    const cy = cyFrac(l, VH)
    return {
      x0: Math.max(0, l.cx - xr) * 100,
      x1: Math.min(1, l.cx + xr) * 100,
      y0: Math.max(0, cy - yr) * 100,
      y1: Math.min(1, cy + yr) * 100
    }
  })
  layers.forEach((l, i) => {
    const s = support[i]
    const cyLabel =
      l.cyPx === undefined
        ? `${l.cy * 100}%`
        : `calc(100% - ${l.cyPx}px)（= ${(cyFrac(l, VH) * 100).toFixed(2)}% @VH=${VH}，按 y2k 约定抬升）`
    line(
      `  n${i + 1} ${l.token}: x∈[${f1(s.x0)}%, ${f1(s.x1)}%] y∈[${f1(s.y0)}%, ${f1(s.y1)}%]（圆心 ${l.cx * 100}%/${cyLabel}，半径 ${l.rx * 100}%/${l.ry * 100}%，transparent 停靠 ${l.stop * 100}%）`
    )
  })
  const overlap = (a, b) =>
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2]
  ]
  const anyOverlap = pairs.filter(([a, b]) => overlap(support[a], support[b]))
  line(
    `  两两相交：${anyOverlap.length === 0 ? '无（三对全不相交）' : anyOverlap.map(([a, b]) => `n${a + 1}∩n${b + 1}`).join(' ')}`
  )
  line(
    `  ⇒ 结论：**任何像素最多被一层雾覆盖**，「三层全重叠」面在几何上不存在（更不用说三层同时取峰值）。`
  )
  line(`     故本脚本把它作为**不可达参照**列出，绝不用作最坏面判定。`)
  line()

  // ---- 参考面（含不可达面）----
  line('【B】参照面（不可达 / 非叠加态）—— muted 与 text 对各面的对比度')
  const refFaces = [
    { name: '裸 --jy-bg（无雾）', base: () => TOKEN.bg, reachable: true },
    {
      name: `+ n1 单层（取 alpha 峰值 ${NEBULA_MAIN[0].a}）`,
      base: () => over(NEBULA_MAIN[0].rgb, NEBULA_MAIN[0].a, TOKEN.bg),
      reachable: true
    },
    {
      name: '+ n1+n2 双层（两层各自峰值——几何上不可达）',
      base: () =>
        over(NEBULA_MAIN[0].rgb, NEBULA_MAIN[0].a, over(NEBULA_MAIN[1].rgb, NEBULA_MAIN[1].a, TOKEN.bg)),
      reachable: false
    },
    {
      name: '+ n1+n2+n3 三层全重叠（几何上不可达，仅作反证）',
      base: () =>
        NEBULA_MAIN.reduce((acc, l) => over(l.rgb, l.a, acc), TOKEN.bg),
      reachable: false
    }
  ]
  line(
    `  ${pad('面', 44)}${padL('text', 10)}${padL('muted', 10)}${padL('link', 10)}${padL('heading', 10)}${padL('lead/导语底', 14)}  可达`
  )
  for (const face of refFaces) {
    const b = face.base()
    const row = [TOKEN.text, TOKEN.muted, TOKEN.link, TOKEN.heading].map((c) => f1(contrast(c, b)))
    const lead = f1(contrast(TOKEN.leadText, over(0xffffff, TOKEN.leadBg.a, b)))
    line(
      `  ${pad(face.name, 44)}${row.map((r) => padL(r, 10)).join('')}${padL(lead, 14)}  ${face.reachable ? '是' : '否'}`
    )
  }
  line()
}

// ---- 可达最坏面（滚动锚定）----
line(
  '【C】可达最坏面（`.juya-scene` sticky top:0 ⇒ 视口锚定；元素滚到滚动口顶端时的真实合成底）'
)
const results = []
line(
  `  ${pad('视口宽', 8)}${pad('场景', 34)}${padL('最坏比', 9)}${padL('位置', 12)}  门槛  判定`
)
for (const vw of WIDTHS) {
  for (const item of ITEMS) {
    const worst = worstOf(item, vw)
    const threshold = item.kind === 'ui' ? UI_THRESHOLD : item.kind === 'decor' ? null : TEXT_THRESHOLD
    const pass = threshold === null ? null : worst.ratio >= threshold
    results.push({ vw, item, worst, threshold, pass })
    if (QUIET && pass !== false) continue
    const verdict = threshold === null ? 'decor' : pass ? 'PASS' : '**FAIL**'
    line(
      `  ${pad(vw, 8)}${pad(item.id, 34)}${padL(f1(worst.ratio), 9)}${padL(`(${worst.x},${worst.y})`, 12)}  ${pad(threshold ?? '-', 4)}  ${verdict}`
    )
  }
}
line()

// ---- 汇总 ----
const fails = results.filter((r) => r.pass === false)
const texts = results.filter((r) => r.item.kind === 'text')
const uis = results.filter((r) => r.item.kind === 'ui')
line('【D】汇总')
line(
  `  text 项 ${texts.length} 个（${texts.filter((r) => r.pass).length} PASS / ${texts.filter((r) => !r.pass).length} FAIL），门槛 ${TEXT_THRESHOLD}:1`
)
line(`  ui   项 ${uis.length} 个（${uis.filter((r) => r.pass).length} PASS / ${uis.filter((r) => !r.pass).length} FAIL），门槛 ${UI_THRESHOLD}:1`)
line(`  decor 项 ${results.filter((r) => r.item.kind === 'decor').length} 个（不计判定，数值见上表；豁免依据：需求 §7.1 与 §9 F-7 已留痕）`)
if (fails.length === 0) {
  line('  结论：全部达标（PASS）')
} else {
  line(`  结论：FAIL ${fails.length} 项 —— 逐项如下：`)
  for (const r of fails) {
    line(
      `    · vw=${r.vw} ${r.item.id} ⇒ ${f1(r.worst.ratio)} < ${r.threshold}（合成点 (${r.worst.x},${r.worst.y})）`
    )
  }
}
line()
line('参考：上表「导语 --jy-lead-text（导语底 0.08）」行是**默认态**（鼠标不在条目上）的可达最坏面。')
line('「条目 hover ∩ 导语」行是鼠标悬停在条目上时的同一像素面 —— 经 #9 G-1 修复后，暗侧 hover')
line('不再叠背景微亮（改走 border-bottom-color 提亮，边框不参与文字背景合成），故两行取值一致。')
line('vw≤520 行的「导语」项走 #2 的窄窗 nebula 退化分支（单条顶部窄带，同样视口锚定）：')
line('  经 #9 G-2 修复后窄窗峰值 alpha 单独收到 0.055（同面 muted 档 vw=480 → 4.6046，余量 0.1046）；')
line('  #13 起导语改读专用记号 --jy-lead-text，同一面随之为 7.1870（契约值，见行内实算）。')
line('栅格化交叉验证：tests/e2e/contrast.spec.ts（可复现，实测 4.6567 @700 / 4.7303 @800）。')
process.exit(fails.length === 0 ? 0 : 1)
