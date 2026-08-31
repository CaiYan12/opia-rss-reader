import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Article, FeedSource, SavedSession, Settings } from '../../src/shared/types'
import { DEFAULT_SETTINGS, DEFAULT_SOURCE } from '../../src/shared/types'
import { BUILTIN_THEMES } from '../../src/main/theme/builtinThemes'

/** Playwright 渲染层验证辅助：注入 window.opia 桩（数据在内存，不落盘）。
 *  场景由 URL 参数决定初始数据；settingsSet 等调用会修改内存状态并记录到 __stubCalls。 */

// 夹具目录按项目约定不入库（见 .gitignore）；缺失时降级为空内容，
// 使本模块仍可被单测导入以校验桩与契约同形。
const FIXTURE_PATH = join(process.cwd(), 'tests/fixtures/juya-content.html')
const fixtureHtml = existsSync(FIXTURE_PATH) ? readFileSync(FIXTURE_PATH, 'utf-8') : ''

const SVG_COVER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='180'%3E%3Crect width='100%25' height='100%25' fill='%23c1502e'/%3E%3C/svg%3E"

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
  | 'pop'
  | 'newsprint'
  | 'y2k'
  | 'system'
  | 'grid4'
  | 'compact'
  | 'magazine'
  | 'fieldsoff'
  | 'many'
  | 'zoom2'
  | 'zoomBuiltin'
  | 'zoomBuiltin2'
  | 'tabs5'
  | 'tabs20'
  | 'tabs20Builtin'
  | 'tabs25'
  | 'tabsMany'

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
    settings.juyaDarkStyleId = 'dreamcore'
  } else if (scenario === 'pop') {
    settings.juyaLightStyleId = 'pop'
  } else if (scenario === 'newsprint') {
    settings.juyaLightStyleId = 'newsprint90s'
  } else if (scenario === 'y2k') {
    settings.juyaLightStyleId = 'y2k'
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
