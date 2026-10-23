import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator } from '@playwright/test'
import type { Article, FeedSource, SavedSession, Settings } from '../../src/shared/types'
import { DEFAULT_SETTINGS, DEFAULT_SOURCE } from '../../src/shared/types'
import { BUILTIN_THEMES } from '../../src/main/theme/builtinThemes'

/** Playwright 渲染层验证辅助：注入 window.opia 桩（数据在内存，不落盘）。
 *  场景由 URL 参数决定初始数据；settingsSet 等调用会修改内存状态并记录到 __stubCalls。 */

// 夹具目录按项目约定不入库（见 .gitignore）；缺失时读取仓库内的合成兜底，
// 使 CI checkout（没有 tests/fixtures/）也能跑出与本地一致的渲染结构。
const FIXTURE_PATH = join(process.cwd(), 'tests/fixtures/juya-content.html')
const SYNTHETIC_FIXTURE_PATH = join(process.cwd(), 'tests/e2e/fixtures/juya-content.synthetic.html')
const fixtureHtml = existsSync(FIXTURE_PATH)
  ? readFileSync(FIXTURE_PATH, 'utf-8')
  : readFileSync(SYNTHETIC_FIXTURE_PATH, 'utf-8')

const SVG_COVER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='180'%3E%3Crect width='100%25' height='100%25' fill='%23c1502e'/%3E%3C/svg%3E"

/** 自带内联 SVG 图源的图片（2026-10-12，#9）：`data:` URI 带固有 width/height，
 *  渲染高度真实且离线可用。夹具 tests/fixtures/juya-content.html 的 6 张图全指向
 *  `https://assets.example.com/…`（不可达 ⇒ 高度塌陷），且该目录被 .gitignore 排除
 *  （新克隆没有它）⇒ 视觉走查与图文几何断言必须改用本图源。 */
const svgImage = (w: number, h: number, fill: string, label: string): string =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<rect width="100%" height="100%" fill="#${fill}"/>` +
      `<text x="16" y="34" font-family="sans-serif" font-size="22" fill="#f2f2f5">${label}</text>` +
      '</svg>'
  )

/** 「内联图源橘鸦期」contentHtml（2026-10-12，#9）：结构对照夹具（h1 期头 + 概览 + 两个栏目），
 *  但**图片全部换成可渲染的内联 SVG**。首条 4 张图（3:2 固有比）用于 #8「右列限 2 张、
 *  其余回流通栏」的真实几何验证；第二条 1 张图作对照。 */
const SVG_ISSUE_HTML = `<div style="max-width:760px">
<h1>AI 早报 2026-10-12</h1>
<h2>概览</h2>
<h3>要闻</h3>
<ul><li>内联图源要闻一 <a href="https://example.com/n/1" rel="noopener noreferrer">↗</a> <code>#1</code></li><li>内联图源要闻二 <a href="https://example.com/n/2" rel="noopener noreferrer">↗</a> <code>#2</code></li></ul>
<h3>产品应用</h3>
<ul><li>内联图源产品一 <code>#3</code></li></ul>
<hr>
<h2>要闻</h2>
<h3><a href="https://example.com/n/1" rel="noopener noreferrer">内联图源要闻一</a> <code>#1</code></h3>
<blockquote>导语占位：一行摘要文本，用于量取「导语滚到滚动口顶端」时的真实合成底色。</blockquote>
<p>正文段落一占位文本，说明该要闻的详细内容与背景。</p>
<p>正文段落二占位文本，补充说明与后续影响。</p>
<p><img src="${svgImage(480, 320, '3b4a8f', 'plate-1')}" alt="图版一"></p>
<p><img src="${svgImage(480, 320, '2f6f6a', 'plate-2')}" alt="图版二"></p>
<p><img src="${svgImage(480, 320, '7a3f6b', 'plate-3')}" alt="图版三"></p>
<p><img src="${svgImage(480, 320, '8a5a2f', 'plate-4')}" alt="图版四"></p>
<p>相关链接：</p>
<ul><li><a href="https://example.com/n/1" rel="noopener noreferrer">https://example.com/n/1</a></li></ul>
<hr>
<h2>模型发布</h2>
<h3><a href="https://example.com/m/1" rel="noopener noreferrer">内联图源模型一</a> <code>#2</code></h3>
<blockquote>导语占位二。</blockquote>
<p>正文占位文本。</p>
<p><img src="${svgImage(480, 320, '4a4a52', 'plate-5')}" alt="图版五"></p>
<p>相关链接：</p>
<ul><li><a href="https://example.com/m/1" rel="noopener noreferrer">https://example.com/m/1</a></li></ul>
</div>`

/** lightbox 专用期（#21 / SPEC B5b）：一张裸图 + 一张被 `<a>` 包裹的图。
 *  与 `nocturneSvg` 分开建场景，**不改**后者 —— 5 张视觉走查归档的像素必须逐字节不变
 *  （`scripts/nocturne-visual-walkthrough.mjs --verify`）。 */
const LIGHTBOX_ISSUE_HTML = `<div style="max-width:760px">
<h1>AI 早报 2026-10-20</h1>
<h2>要闻</h2>
<h3>图片放大条目 <code>#1</code></h3>
<blockquote>导语占位：用于验证点击裸图打开放大视图。</blockquote>
<p>正文占位文本。</p>
<p><img src="${svgImage(480, 320, '3b4a8f', 'bare')}" alt="裸图"></p>
<p><a href="https://example.com/linked-image" rel="noopener noreferrer"><img src="${svgImage(480, 320, '7a3f6b', 'linked')}" alt="链接图"></a></p>
<p><img src="${svgImage(480, 320, '2f6f6a', 'bare-2')}" alt="裸图二"></p>
</div>`

const EDITORIAL_T1_ISSUE_HTML = `<div>
<h1>杂志编辑式 T1</h1>
<h2>概览</h2>
<ul><li><a href="https://example.com/overview">目录链接</a> <code>#1</code></li></ul>
<h2>首篇</h2>
<h3><a href="https://example.com/title">中文开篇</a> <code>#1</code></h3>
<blockquote>中文开篇导语，字形应完整显示。</blockquote>
<h3>英文条目</h3>
<blockquote>English opening lead stays in normal typesetting.</blockquote>
<p>普通正文用来确认条目标题与正文层级。</p>
<p><img src="${svgImage(480, 320, '3b4a8f', 'editorial')}" alt="图片题注可读"></p>
<p>相关链接：</p><ul><li><a href="https://example.com/related">相关链接文字</a></li></ul>
<h3>引号条目</h3>
<blockquote>“引号开头的导语”应完整显示。</blockquote>
<h2>第二篇</h2>
<h3>英文开篇 <code>#4</code></h3>
<blockquote>Another English opening lead.</blockquote>
</div>`

const EDITORIAL_T2_OVERVIEW = Array.from({ length: 32 }, (_, i) => {
  const index = i + 1
  return `<li><a href="https://example.com/editorial/${index}">第${index}条概览项目含完整中文标题</a> <code>#${index}</code></li>`
}).join('')
const EDITORIAL_T2_ISSUE_HTML = `<div>
<h1>杂志编辑式 T2 长标题 Magazine Editorial Issue</h1>
<h2>概览</h2><ul>${EDITORIAL_T2_OVERVIEW}</ul>
<h2>正文栏目</h2><h3>正文条目 <code>#1</code></h3><p>用于核对刊头与概览后正文仍完整保留。</p>
</div>`
const EDITORIAL_T2_FALLBACK_HTML = '<div><h2>栏目</h2><h3>标题回退样本</h3><p>正文内容保留。</p></div>'
const EDITORIAL_T3_UNBREAKABLE = `EditorialT3${'W'.repeat(120)}`
const EDITORIAL_T3_LONG_PARAGRAPH = '后续段落甲。这段文字用于验证长文与单图之间的连续排版。'.repeat(8)
const EDITORIAL_T3_ISSUE_HTML = `<div>
<h1>杂志编辑式 T3 图文流</h1>
<h2>连续内容</h2>
<h3>栏目首条交错样本 ${EDITORIAL_T3_UNBREAKABLE} <code>#1</code></h3>
<blockquote>首条导语保持现有来源。</blockquote>
<p>首条段落甲。</p>
<p><img src="${svgImage(640, 360, '3b4a8f', 'wide')}" alt="横向图题注"></p>
<p>首条段落乙。</p>
<p><img src="${svgImage(360, 340, '2f6f6a', 'square')}" alt="近方图题注"></p>
<p>首条段落丙。</p>
<p><a href="https://example.com/editorial-image"><img src="${svgImage(480, 240, '7a3f6b', 'linked')}" alt="链接图题注"></a></p>
<p>首条段落丁。</p>
<p>相关链接：</p><ul><li><a href="https://example.com/editorial-related?ref=${'u'.repeat(160)}">首条相关链接 ${'U'.repeat(160)}</a></li></ul>
<h3>栏目后续交错样本 <code>#2</code></h3>
<p>${EDITORIAL_T3_LONG_PARAGRAPH}</p>
<p><img src="${svgImage(300, 540, '8a5a2f', 'portrait')}" alt="竖向图题注"></p>
<p>后续段落乙。</p>
<p>相关链接：</p><ul><li><a href="https://example.com/editorial-related-2">后续相关链接</a></li></ul>
<h2>无图边界</h2>
<h3>没有图片的条目</h3><p>无图正文仍完整呈现。</p>
<h2>图片失败边界</h2>
<h3>坏图周围文字仍可读</h3>
<p>坏图之前的段落仍可读。</p>
<p><img src="data:image/svg+xml;base64,not-a-valid-image" alt="损坏图片"></p>
<p>坏图之后的段落仍可读。</p>
</div>`
const EDITORIAL_T4_ISSUE_HTML = EDITORIAL_T3_ISSUE_HTML.replace(
  '</div>',
  `<h2>竖图开篇边界</h2>
<h3>无导语竖图首条</h3>
<p><img src="${svgImage(300, 540, '8a5a2f', 'opening-portrait')}" alt="竖图开篇题注"></p>
<p>竖图开篇后的连续正文。</p>
</div>`
)

export function juyaArticle(overrides: Partial<Article> = {}): Article {
  return {
    guid: 'https://daily.juya.uk/issues/2026-08-28/',
    sourceId: 'juya-daily',
    title: '2026-08-28',
    link: 'https://daily.juya.uk/issues/2026-08-28/',
    pubDate: '2026-08-28T01:31:42.000Z',
    summary: '示例摘要占位文本',
    contentHtml: fixtureHtml,
    coverUrl: SVG_COVER,
    ...overrides
  }
}

/** 生成 n 条连续期号（供多列/杂志布局截图与断言） */
function manyJuya(n: number): Article[] {
  return Array.from({ length: n }, (_, i) =>
    juyaArticle({
      guid: `https://daily.juya.uk/issues/2026-08-${String(28 - i).padStart(2, '0')}/`,
      title: `2026-08-${String(28 - i).padStart(2, '0')}`
    })
  )
}

export type Scenario =
  | 'default'
  | 'off'
  | 'broken'
  | 'other'
  | 'dark'
  | 'synthwaveLight'
  | 'synthwaveZoom'
  | 'synthwaveLightZoom'
  | 'synthwaveTabs'
  | 'pop'
  | 'newsprint'
  | 'y2k'
  | 'nocturne'
  | 'nocturneSvg'
  | 'nocturneLightbox'
  | 'editorial'
  | 'editorialT1'
  | 'editorialT2'
  | 'editorialT2Fallback'
  | 'editorialT3'
  | 'editorialT4'
  | 'editorialT4Zoom'
  | 'wabi'
  | 'system'
  | 'grid4'
  | 'compact'
  | 'magazine'
  | 'fieldsoff'
  | 'newsprintGrid'
  | 'newsprintNoCover'
  | 'newsprintCompact'
  | 'newsprintMagazine'
  | 'newsprintEmpty'
  | 'many'
  | 'zoom2'
  | 'zoomBuiltin'
  | 'zoomBuiltin2'
  | 'tabs5'
  | 'tabs20'
  | 'tabs20Builtin'
  | 'tabs25'
  | 'tabsMany'
  | 'miniText'

export function makeStubScript(scenario: Scenario): string {
  const settings: Settings = { ...DEFAULT_SETTINGS }
  let sources: FeedSource[] = [DEFAULT_SOURCE]
  let articles: Article[] = [juyaArticle()]

  if (scenario === 'off') {
    settings.juyaLightStyleId = 'off'
    settings.juyaDarkStyleId = 'off'
  } else if (scenario === 'broken') {
    articles = [juyaArticle({ contentHtml: '<p>无结构纯文本占位，无栏目无条目。</p>' })]
  } else if (scenario === 'other') {
    sources = [
      DEFAULT_SOURCE,
      { id: 'src-other', name: '其他源', url: 'https://example.com/rss.xml', enabled: true, providerId: 'builtin-rss' }
    ]
    articles = [juyaArticle(), juyaArticle({ guid: 'other-1', sourceId: 'src-other', title: '其他源文章' })]
  } else if (scenario === 'dark') {
    settings.themeMode = 'dark'
    settings.juyaDarkStyleId = 'synthwave'
  } else if (scenario === 'synthwaveLight') {
    // #41 亮侧：同一母题的日间版（洋红橙），主题亮 + 亮侧风格 synthwave
    settings.themeMode = 'light'
    settings.juyaLightStyleId = 'synthwave'
  } else if (scenario === 'synthwaveZoom') {
    // #45 边界回归：用户实际常用的 uiZoom 1.2（整份内容按 1.2 倍缩放），暗侧
    settings.themeMode = 'dark'
    settings.juyaDarkStyleId = 'synthwave'
    settings.uiZoom = 1.2
  } else if (scenario === 'synthwaveLightZoom') {
    // #45 边界回归：亮侧 + uiZoom 1.2
    settings.themeMode = 'light'
    settings.juyaLightStyleId = 'synthwave'
    settings.uiZoom = 1.2
  } else if (scenario === 'synthwaveTabs') {
    settings.themeMode = 'dark'
    settings.juyaDarkStyleId = 'synthwave'
  } else if (scenario === 'pop') {
    settings.juyaLightStyleId = 'pop'
  } else if (scenario === 'newsprint') {
    settings.juyaLightStyleId = 'newsprint90s'
  } else if (scenario === 'y2k') {
    settings.juyaLightStyleId = 'y2k'
  } else if (scenario === 'nocturne') {
    settings.themeMode = 'dark'
    settings.juyaDarkStyleId = 'nocturne'
  } else if (scenario === 'nocturneSvg') {
    // 视觉走查 / 图文几何专用（#9）：nocturne 暗侧 + 自带内联 SVG 图源的正文
    settings.themeMode = 'dark'
    settings.juyaDarkStyleId = 'nocturne'
    articles = [juyaArticle({ contentHtml: SVG_ISSUE_HTML })]
  } else if (scenario === 'nocturneLightbox') {
    // 点击图片放大查看（#21 / SPEC B5b）：nocturne 暗侧 + 裸图/链接图各一
    settings.themeMode = 'dark'
    settings.juyaDarkStyleId = 'nocturne'
    articles = [juyaArticle({ contentHtml: LIGHTBOX_ISSUE_HTML })]
  } else if (scenario === 'editorial') {
    settings.juyaLightStyleId = 'editorial'
  } else if (scenario === 'editorialT1') {
    settings.themeMode = 'light'
    settings.juyaLightStyleId = 'editorial'
    settings.juyaDarkStyleId = 'editorial'
    articles = [juyaArticle({ contentHtml: EDITORIAL_T1_ISSUE_HTML })]
  } else if (
    scenario === 'editorialT2' ||
    scenario === 'editorialT2Fallback'
  ) {
    settings.themeMode = 'light'
    settings.juyaLightStyleId = 'editorial'
    settings.juyaDarkStyleId = 'editorial'
    articles = [juyaArticle({
      pubDate: scenario === 'editorialT2' ? '2026-10-21T17:00:00.000Z' : '2026-10-22T01:00:00.000Z',
      title: '文章标题回退来源：长标题 fallback',
      summary: scenario === 'editorialT2Fallback' ? '' : '摘要完整，无改写无截断。'.repeat(12),
      contentHtml: scenario === 'editorialT2Fallback' ? EDITORIAL_T2_FALLBACK_HTML : EDITORIAL_T2_ISSUE_HTML
    })]
  } else if (scenario === 'editorialT3') {
    settings.themeMode = 'light'
    settings.juyaLightStyleId = 'editorial'
    settings.juyaDarkStyleId = 'editorial'
    articles = [juyaArticle({ contentHtml: EDITORIAL_T3_ISSUE_HTML })]
  } else if (scenario === 'editorialT4' || scenario === 'editorialT4Zoom') {
    settings.themeMode = 'light'
    settings.juyaLightStyleId = 'editorial'
    settings.juyaDarkStyleId = 'editorial'
    if (scenario === 'editorialT4Zoom') settings.uiZoom = 1.2
    articles = [juyaArticle({ contentHtml: EDITORIAL_T4_ISSUE_HTML })]
  } else if (scenario === 'wabi') {
    settings.juyaLightStyleId = 'wabi'
  } else if (scenario === 'system') {
    settings.themeMode = 'system'
  } else if (scenario === 'grid4') {
    settings.layout = { ...settings.layout, preset: 'grid', gridColumns: 4 }
    articles = manyJuya(6)
  } else if (scenario === 'compact') {
    settings.layout = { ...settings.layout, preset: 'compact' }
    articles = manyJuya(4)
  } else if (scenario === 'magazine') {
    settings.layout = { ...settings.layout, preset: 'magazine' }
    articles = manyJuya(5)
  } else if (scenario === 'fieldsoff') {
    settings.layout = {
      ...settings.layout,
      fields: { cover: false, summary: false, pubDate: false, source: false }
    }
  } else if (scenario === 'newsprintGrid') {
    // #30 订阅页头版（card/grid）：newsprint 亮侧 + 2 列网格 + 4 期
    settings.juyaLightStyleId = 'newsprint90s'
    settings.layout = { ...settings.layout, preset: 'grid', gridColumns: 2 }
    articles = manyJuya(4)
  } else if (scenario === 'newsprintNoCover') {
    // #30：仅关闭封面字段 —— 标题应独占整行，其余字段仍在
    settings.juyaLightStyleId = 'newsprint90s'
    settings.layout = { ...settings.layout, fields: { ...settings.layout.fields, cover: false } }
    articles = manyJuya(2)
  } else if (scenario === 'newsprintCompact') {
    // #31 compact 三态：newsprint 亮侧 + 单列行式 + 4 期（保留小缩略图）
    settings.juyaLightStyleId = 'newsprint90s'
    settings.layout = { ...settings.layout, preset: 'compact' }
    articles = manyJuya(4)
  } else if (scenario === 'newsprintMagazine') {
    // #31 magazine 三态：newsprint 亮侧 + 首条大图 + 其余网格 + 5 期
    settings.juyaLightStyleId = 'newsprint90s'
    settings.layout = { ...settings.layout, preset: 'magazine' }
    articles = manyJuya(5)
  } else if (scenario === 'newsprintEmpty') {
    // #31 空态：newsprint 亮侧 + 0 期（grid 预设 2 列，公告框须通栏）
    settings.juyaLightStyleId = 'newsprint90s'
    articles = []
  } else if (scenario === 'many') {
    articles = manyJuya(6)
  } else if (scenario === 'zoom2') {
    settings.uiZoom = 2
  } else if (scenario === 'zoomBuiltin') {
    settings.externalLinkBehavior = 'builtin'
  } else if (scenario === 'zoomBuiltin2') {
    settings.externalLinkBehavior = 'builtin'
    settings.uiZoom = 2
  } else if (scenario === 'tabs20Builtin') {
    settings.externalLinkBehavior = 'builtin'
  } else if (scenario === 'miniText') {
    // Mini 展开摘要：非橘鸦文本源（默认源唯一，Mini 列表直接展示）
    sources = [
      {
        id: 'src-text',
        name: '文本源',
        url: 'https://example.com/rss.xml',
        enabled: true,
        providerId: 'builtin-rss',
        isDefault: true
      }
    ]
    articles = [
      {
        guid: 'text-1',
        sourceId: 'src-text',
        title: '普通文章标题',
        link: 'https://example.com/a1',
        pubDate: '2026-08-30T00:00:00.000Z',
        summary: '',
        contentHtml: '<p>' + '这是用于验证文本摘要截断的段落内容。'.repeat(20) + '</p>',
        coverUrl: null
      }
    ]
  }

  // ---- 标签栏场景：startupOpen=lastSession，经 sessionGet 恢复初始会话 ----
  const issueUrl = (date: string): string => `https://daily.juya.uk/issues/${date}/`
  const readerGuids = (n: number): Array<{ kind: 'reader'; guid: string }> =>
    Array.from({ length: n }, (_, i) => ({
      kind: 'reader' as const,
      guid: issueUrl(`2026-08-${String(28 - i).padStart(2, '0')}`)
    }))
  let session: SavedSession | null = null
  if (scenario === 'tabs5') {
    settings.startupOpen = 'lastSession'
    articles = manyJuya(4)
    session = {
      tabs: [
        { kind: 'home', homePage: 'feed' },
        readerGuids(2)[0],
        readerGuids(2)[1],
        { kind: 'browser', url: 'https://example.com/page', title: '示例页' },
        { kind: 'settings' }
      ],
      activeTabIndex: 0
    }
  } else if (scenario === 'tabs20' || scenario === 'tabs20Builtin' || scenario === 'tabsMany') {
    settings.startupOpen = 'lastSession'
    articles = manyJuya(20)
    session = {
      tabs: [{ kind: 'home', homePage: 'feed' }, ...readerGuids(19)],
      activeTabIndex: 0
    }
  } else if (scenario === 'tabs25') {
    settings.startupOpen = 'lastSession'
    articles = manyJuya(25)
    session = {
      tabs: [{ kind: 'home', homePage: 'feed' }, ...readerGuids(24)],
      activeTabIndex: 5
    }
  } else if (scenario === 'synthwaveTabs') {
    // #45 keep-alive 回归：订阅页 + 阅读页各一，启动即停在阅读页，便于「切走再切回」。
    // 风格在下面的 Scenario 分支里已切到蒸汽梦核暗侧。
    settings.startupOpen = 'lastSession'
    articles = manyJuya(2)
    session = {
      tabs: [{ kind: 'home', homePage: 'feed' }, { kind: 'reader', guid: issueUrl('2026-08-28') }],
      activeTabIndex: 1
    }
  }

  const data = { settings, sources, articles, themes: BUILTIN_THEMES, session }

  return `
    window.__stubData = ${JSON.stringify(data)};
    window.__stubCalls = [];
    window.opia = {
      settingsGet: async () => window.__stubData.settings,
      settingsSet: async (patch) => {
        window.__stubCalls.push(['settingsSet', patch]);
        window.__stubData.settings = { ...window.__stubData.settings, ...patch };
        return window.__stubData.settings;
      },
      feedSources: async () => window.__stubData.sources,
      feedList: async (sourceId) =>
        window.__stubData.articles.filter((a) => !sourceId || a.sourceId === sourceId),
      feedRefresh: async () => ({ added: 0 }),
      feedSourceValidate: async (source) => { window.__stubCalls.push(['feedSourceValidate', source]); },
      historyGet: async () => window.__stubData.history ?? {},
      historyMarkRead: async (guid) => {
        const h = window.__stubData.history ?? {};
        h[guid] = { guid, read: true, favorite: h[guid]?.favorite ?? false, readAt: new Date().toISOString() };
        window.__stubData.history = h;
      },
      historyToggleFavorite: async (guid) => {
        const h = window.__stubData.history ?? {};
        const prev = h[guid];
        h[guid] = { guid, read: prev?.read ?? false, readAt: prev?.readAt ?? null, favorite: !(prev?.favorite ?? false) };
        window.__stubData.history = h;
        return h[guid].favorite;
      },
      sessionGet: async () => window.__stubData.session ?? null,
      sessionSave: async (session) => { window.__stubCalls.push(['sessionSave', session]); },
      themeList: async () => window.__stubData.themes,
      themeGet: async (id) => window.__stubData.themes.find((t) => t.id === id) ?? null,
      themeSave: async (theme) => {
        window.__stubCalls.push(['themeSave', theme]);
        const rest = window.__stubData.themes.filter((t) => t.id !== theme.id);
        window.__stubData.themes = [...rest, { ...theme, builtin: false }];
      },
      themeDelete: async (id) => {
        window.__stubCalls.push(['themeDelete', id]);
        window.__stubData.themes = window.__stubData.themes.filter((t) => t.id !== id);
      },
      themeSystemGet: async () => false,
      feedSourceAdd: async (source) => {
        window.__stubCalls.push(['feedSourceAdd', source]);
        const created = { ...source, id: 'src-' + window.__stubData.sources.length + '-' + Date.now().toString(36) };
        window.__stubData.sources = [...window.__stubData.sources, created];
        return created;
      },
      feedSourceRemove: async (id) => {
        window.__stubCalls.push(['feedSourceRemove', id]);
        window.__stubData.sources = window.__stubData.sources.filter((s) => s.id !== id);
      },
      feedSourceToggle: async (id, enabled) => {
        window.__stubCalls.push(['feedSourceToggle', id, enabled]);
        window.__stubData.sources = window.__stubData.sources.map((s) => (s.id === id ? { ...s, enabled } : s));
      },
      feedSourceSetDefault: async (id) => {
        window.__stubCalls.push(['feedSourceSetDefault', id]);
        window.__stubData.sources = window.__stubData.sources.map((s) => ({
          ...s,
          isDefault: id === null ? false : s.id === id
        }));
        return window.__stubData.sources;
      },
      toggleMini: async () => false,
      windowMinimize: async () => {},
      windowToggleMaximize: async () => {},
      windowClose: async () => { window.__stubCalls.push(['windowClose']); },
      windowSetTitle: async (pageTitle) => { window.__stubCalls.push(['windowSetTitle', pageTitle]); },
      openExternal: async (url) => { window.__stubCalls.push(['openExternal', url]); },
      onFeedUpdated: () => () => {},
      onWindowMaximizeChanged: () => () => {},
      onThemeSystemChanged: () => () => {}
    };
  `
}

/* ---- 蒸汽梦核式网格几何（#45 边界回归） ----
   #44 把周期纹理移进 `.juya-scene-grid.juya-scene-grid-persp::after`，用 translateY 滚动。
   三条不变量都在**真实布局**上量，不抄 CSS 声明：
     ① 纹理层在任意相位都盖满父层高度（露底 = 父层地面底色透出来）；
     ② 纹理层左右缘与父层重合（错位 = 纹理与地面不在同一个透视平面）；
     ③ 平面左右居中于滚动口（透视平面的灭点在内容中线）。 */
export const SYNTHWAVE_GRID = '.juya-scene-grid.juya-scene-grid-persp'

export interface GridPlaneFacts {
  /** 父层（透视平面）与滚动口的视口坐标 */
  plane: { top: number; bottom: number; left: number; right: number; width: number; height: number; centerX: number }
  port: { top: number; bottom: number; left: number; right: number; width: number; height: number; centerX: number }
  texture: {
    top: number
    height: number
    left: number
    right: number
    translateY: number
    animationName: string
    animationDuration: string
    animationPlayState: string
    willChange: string
  }
  /** 当前相位下纹理层的上下缺口（≤0 表示盖住父层；>0 即露底的高度） */
  topGap: number
  bottomGap: number
  /** 父层布局高度（未乘 perspective/rotateX 的投影） */
  layoutHeight: number
}

/** 读一次网格平面 + 纹理层的几何与计算样式（相位随调用时刻，动画在跑时两次调用值不同）。 */
export async function readGridPlane(plane: Locator): Promise<GridPlaneFacts> {
  return plane.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const scroller = el.closest('.view-scroll')
    // 没有滚动口就不能「以滚动口为基准」：拿平面自己当基准会让居中/底边断言自证成立，
    // 所以这里显式失败，而不是安静地退化成空断言。
    if (!scroller) throw new Error('网格平面不在 .view-scroll 滚动容器内，无法量取可视区')
    const port = scroller.getBoundingClientRect()
    // 伪元素的 top / height 是布局长度（未乘父层 transform），故父层高度也必须取布局值，
    // 不能用 getBoundingClientRect 的投影高 —— 两者在不同坐标系里，比出来的缺口没有意义。
    const layoutHeight = Number.parseFloat(getComputedStyle(el).height)
    const tex = getComputedStyle(el, '::after')
    /** computed transform → translateY（matrix 第 6 位 / matrix3d 第 14 位） */
    const translateY = (value: string): number => {
      const m = value.match(/matrix(3d)?\(([^)]+)\)/)
      if (!m) return value === 'none' ? 0 : Number.NaN
      const nums = (m[2] ?? '').split(',').map(Number)
      return m[1] ? (nums[13] as number) : (nums[5] as number)
    }
    const top = Number.parseFloat(tex.top)
    const height = Number.parseFloat(tex.height)
    const left = Number.parseFloat(tex.left)
    const right = Number.parseFloat(tex.right)
    const ty = translateY(tex.transform)
    return {
      plane: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        centerX: (rect.left + rect.right) / 2
      },
      port: {
        top: port.top,
        bottom: port.bottom,
        left: port.left,
        right: port.right,
        width: port.width,
        height: port.height,
        centerX: (port.left + port.right) / 2
      },
      texture: {
        top,
        height,
        left,
        right,
        translateY: ty,
        animationName: tex.animationName,
        animationDuration: tex.animationDuration,
        animationPlayState: tex.animationPlayState,
        willChange: tex.willChange
      },
      topGap: top + ty,
      bottomGap: layoutHeight - (top + height + ty),
      layoutHeight
    }
  })
}
