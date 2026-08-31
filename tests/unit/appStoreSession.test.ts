import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAppStore, type Tab } from '../../src/renderer/stores/useAppStore'
import { useToastStore } from '../../src/renderer/stores/useToastStore'
import { MAX_TABS, TAB_LIMIT_MSG } from '../../src/renderer/stores/tabOps'
import { BUILTIN_THEMES } from '../../src/main/theme/builtinThemes'
import { installOpiaStub, makeArticle, makeSettings, makeSource, type OpiaStub } from './helpers/opiaStub'
import type { Article, FeedSource, SavedSession, Settings } from '../../src/shared/types'

/**
 * 标签会话测试要点：
 * - tabSeq / lastSessionJson 是模块级状态，同文件内跨用例累积 → 断言 sessionSave 前先 mockClear
 * - 标签 id 每次自增，因此不会出现「新会话与上次 JSON 相同而被 memo 跳过落盘」的假阴性
 */

let stub: OpiaStub

function resetState(over: Partial<Record<string, unknown>> = {}) {
  useAppStore.setState({
    ready: false,
    settings: makeSettings(),
    sources: [makeSource()],
    articles: {},
    history: {},
    themes: BUILTIN_THEMES,
    activeSourceId: null,
    tabs: [],
    activeTabId: '',
    mini: false,
    refreshing: false,
    systemDark: false,
    ...over
  })
}

function homeTabs(count: number): Tab[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `h${i}`,
    kind: 'home' as const,
    homePage: 'feed' as const
  }))
}

/** 落盘可区分的标签：SavedSession 不含 id，同形态 home 标签序列化后完全相同 */
function distinctTabs(count: number): Tab[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    kind: 'browser' as const,
    url: `https://example.com/${i}`
  }))
}

function savedHome(): SavedSession['tabs'][number] {
  return { kind: 'home', homePage: 'feed' }
}

beforeEach(() => {
  useToastStore.getState().clear()
  stub = installOpiaStub()
  resetState()
  stub.sessionSave.mockClear()
})

afterEach(() => {
  useToastStore.getState().clear()
})

function savedSessions(): SavedSession[] {
  return stub.sessionSave.mock.calls.map((c) => c[0] as SavedSession)
}

describe('标签创建与激活', () => {
  it('openHomeTab 追加并激活', () => {
    resetState({ tabs: homeTabs(1), activeTabId: 'h0' })
    useAppStore.getState().openHomeTab()
    const state = useAppStore.getState()
    expect(state.tabs).toHaveLength(2)
    expect(state.activeTabId).toBe(state.tabs[1].id)
    expect(state.tabs[1]).toMatchObject({ kind: 'home', homePage: 'feed' })
  })

  it('无默认订阅时主页标签为空白引导页', () => {
    resetState({ sources: [makeSource({ isDefault: false })] })
    useAppStore.getState().openHomeTab()
    expect(useAppStore.getState().tabs[0]).toMatchObject({ kind: 'home', homePage: 'blank' })
  })

  it('homeContent=blank 时主页标签为空白页', () => {
    resetState({ settings: makeSettings({ homeContent: 'blank' }) })
    useAppStore.getState().openHomeTab()
    expect(useAppStore.getState().tabs[0]).toMatchObject({ homePage: 'blank' })
  })

  it('打开 feed 主页时同步选中启用中的默认源', () => {
    resetState({
      sources: [
        makeSource({ id: 'disabled', isDefault: true, enabled: false }),
        makeSource({ id: 'fallback' })
      ],
      activeSourceId: null
    })
    useAppStore.getState().openHomeTab()
    expect(useAppStore.getState().activeSourceId).toBe('fallback')
  })

  it('openReaderTab 携带完整文章并激活', () => {
    const article = makeArticle({ guid: 'g9' })
    useAppStore.getState().openReaderTab(article)
    const state = useAppStore.getState()
    expect(state.tabs[0]).toMatchObject({ kind: 'reader', article })
    expect(state.activeTabId).toBe(state.tabs[0].id)
  })

  it('openBrowserTab 记录 url', () => {
    useAppStore.getState().openBrowserTab('https://example.com/x')
    expect(useAppStore.getState().tabs[0]).toMatchObject({
      kind: 'browser',
      url: 'https://example.com/x'
    })
  })
})

describe('设置标签单例', () => {
  it('重复打开只激活既有设置标签，不占额度', () => {
    resetState({ tabs: [...homeTabs(MAX_TABS - 1)], activeTabId: 'h0' })
    const before = useAppStore.getState().tabs.length
    useAppStore.getState().openSettingsTab()
    useAppStore.getState().openSettingsTab()
    const state = useAppStore.getState()
    expect(state.tabs.length).toBe(before + 1)
    expect(state.tabs.filter((t) => t.kind === 'settings')).toHaveLength(1)
  })

  it('已达上限时仍能激活已存在的设置标签', () => {
    resetState({
      tabs: [...homeTabs(MAX_TABS - 1), { id: 'st', kind: 'settings' } as Tab],
      activeTabId: 'h0'
    })
    useAppStore.getState().openSettingsTab()
    expect(useAppStore.getState().activeTabId).toBe('st')
    expect(useAppStore.getState().tabs).toHaveLength(MAX_TABS)
  })
})

describe('标签数量上限守卫（覆盖全部创建入口）', () => {
  const entryPoints: Array<[string, () => void]> = [
    ['openHomeTab', () => useAppStore.getState().openHomeTab()],
    ['openReaderTab', () => useAppStore.getState().openReaderTab(makeArticle())],
    ['openBrowserTab', () => useAppStore.getState().openBrowserTab('https://example.com')],
    ['openSettingsTab', () => useAppStore.getState().openSettingsTab()]
  ]

  it.each(entryPoints)('%s 在上限处拒绝创建并提示', (_name, open) => {
    resetState({ tabs: homeTabs(MAX_TABS), activeTabId: 'h0' })
    const before = useAppStore.getState().tabs
    open()
    expect(useAppStore.getState().tabs).toBe(before)
    expect(useToastStore.getState().message).toBe(TAB_LIMIT_MSG)
  })

  it('超限不改变激活标签，也不落盘会话', () => {
    resetState({ tabs: homeTabs(MAX_TABS), activeTabId: 'h5' })
    stub.sessionSave.mockClear()
    useAppStore.getState().openHomeTab()
    expect(useAppStore.getState().activeTabId).toBe('h5')
    expect(stub.sessionSave).not.toHaveBeenCalled()
  })

  it('未超限时不提示', () => {
    resetState({ tabs: homeTabs(MAX_TABS - 1) })
    useAppStore.getState().openHomeTab()
    expect(useToastStore.getState().message).toBeNull()
  })
})

describe('标签关闭与激活权移交', () => {
  it('关闭非激活标签不改变激活标签', () => {
    resetState({ tabs: homeTabs(3), activeTabId: 'h1' })
    useAppStore.getState().closeTab('h2')
    expect(useAppStore.getState().activeTabId).toBe('h1')
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['h0', 'h1'])
  })

  it('关闭激活标签优先激活右侧邻居', () => {
    resetState({ tabs: homeTabs(3), activeTabId: 'h1' })
    useAppStore.getState().closeTab('h1')
    expect(useAppStore.getState().activeTabId).toBe('h2')
  })

  it('无右侧邻居时激活左侧', () => {
    resetState({ tabs: homeTabs(3), activeTabId: 'h2' })
    useAppStore.getState().closeTab('h2')
    expect(useAppStore.getState().activeTabId).toBe('h1')
  })

  it('关闭最后一个标签退出程序且不改状态', () => {
    resetState({ tabs: homeTabs(1), activeTabId: 'h0' })
    const before = useAppStore.getState().tabs
    useAppStore.getState().closeTab('h0')
    expect(stub.windowClose).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().tabs).toBe(before)
  })

  it('未知 id 关闭无副作用', () => {
    resetState({ tabs: homeTabs(2), activeTabId: 'h0' })
    useAppStore.getState().closeTab('nope')
    expect(useAppStore.getState().tabs).toHaveLength(2)
    expect(stub.windowClose).not.toHaveBeenCalled()
  })

  it('activateTab 忽略不存在的标签', () => {
    resetState({ tabs: homeTabs(2), activeTabId: 'h0' })
    useAppStore.getState().activateTab('ghost')
    expect(useAppStore.getState().activeTabId).toBe('h0')
  })
})

describe('moveTab 提交语义（避免拖动中频繁写盘）', () => {
  it('有效移动一次性提交且不改变激活标签', () => {
    resetState({ tabs: distinctTabs(3), activeTabId: 'b0' })
    stub.sessionSave.mockClear()
    useAppStore.getState().moveTab('b2', 'b0', 'after')
    const state = useAppStore.getState()
    expect(state.tabs.map((t) => t.id)).toEqual(['b0', 'b2', 'b1'])
    expect(state.activeTabId).toBe('b0')
    expect(stub.sessionSave).toHaveBeenCalledTimes(1)
    expect(savedSessions().at(-1)?.tabs.map((t) => (t as { url: string }).url)).toEqual([
      'https://example.com/0',
      'https://example.com/2',
      'https://example.com/1'
    ])
  })

  it('结果与原顺序相同则不提交（零写盘）', () => {
    resetState({ tabs: distinctTabs(3), activeTabId: 'b0' })
    const before = useAppStore.getState().tabs
    stub.sessionSave.mockClear()
    useAppStore.getState().moveTab('b1', 'b2', 'before')
    expect(useAppStore.getState().tabs).toBe(before)
    expect(stub.sessionSave).not.toHaveBeenCalled()
  })

  it('无效 id 不提交', () => {
    resetState({ tabs: distinctTabs(2), activeTabId: 'b0' })
    stub.sessionSave.mockClear()
    useAppStore.getState().moveTab('ghost', 'b0', 'before')
    useAppStore.getState().moveTab('b0', 'ghost', 'after')
    useAppStore.getState().moveTab('b0', 'b0', 'before')
    expect(stub.sessionSave).not.toHaveBeenCalled()
  })

  it('持久化会话相同则跳过写盘（SavedSession 不含标签 id）', () => {
    resetState({ tabs: homeTabs(3), activeTabId: 'h0' })
    stub.sessionSave.mockClear()
    useAppStore.getState().moveTab('h2', 'h0', 'after')
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['h0', 'h2', 'h1'])
    expect(stub.sessionSave).not.toHaveBeenCalled()
  })
})

describe('会话序列化落盘（SavedSession 契约）', () => {
  it('reader 标签只持久化 guid，不写文章对象', () => {
    useAppStore.getState().openReaderTab(makeArticle({ guid: 'big-article' }))
    const session = savedSessions().at(-1)!
    expect(session.tabs).toEqual([{ kind: 'reader', guid: 'big-article' }])
    expect(JSON.stringify(session)).not.toContain('contentHtml')
  })

  it('home / browser / settings 各自保留必要字段', () => {
    resetState()
    useAppStore.getState().openHomeTab()
    useAppStore.getState().openBrowserTab('https://example.com/a')
    useAppStore.getState().openSettingsTab()
    const session = savedSessions().at(-1)!
    expect(session.tabs.map((t) => t.kind)).toEqual(['home', 'browser', 'settings'])
    expect(session.tabs[1]).toEqual({ kind: 'browser', url: 'https://example.com/a', title: undefined })
  })

  it('activeTabIndex 指向当前激活标签在列表中的下标', () => {
    resetState({ tabs: homeTabs(3) })
    const third = useAppStore.getState().tabs[2].id
    useAppStore.getState().activateTab(third)
    expect(savedSessions().at(-1)).toMatchObject({ activeTabIndex: 2 })
  })

  it('激活标签 id 不在列表时 activeTabIndex 归零', () => {
    resetState({ tabs: homeTabs(2), activeTabId: 'ghost' })
    stub.sessionSave.mockClear()
    useAppStore.getState().activateTab(useAppStore.getState().tabs[1].id)
    const session = savedSessions().at(-1)!
    expect(session.tabs).toHaveLength(2)
    expect(session.activeTabIndex).toBe(1)
  })

  it('非标签态变更不触发落盘', () => {
    resetState({ tabs: homeTabs(1), activeTabId: 'h0' })
    stub.sessionSave.mockClear()
    useAppStore.getState().setActiveSource('other')
    expect(stub.sessionSave).not.toHaveBeenCalled()
  })

  it('setTabTitle 只更新浏览器标签', () => {
    resetState()
    useAppStore.getState().openBrowserTab('https://example.com')
    useAppStore.getState().openHomeTab()
    const browserId = useAppStore.getState().tabs[0].id
    const homeId = useAppStore.getState().tabs[1].id
    useAppStore.getState().setTabTitle(browserId, '新标题')
    useAppStore.getState().setTabTitle(homeId, '不该出现')
    const state = useAppStore.getState()
    expect(state.tabs[0]).toMatchObject({ kind: 'browser', title: '新标题' })
    expect(state.tabs[1]).toMatchObject({ kind: 'home' })
    expect((state.tabs[1] as { title?: string }).title).toBeUndefined()
  })

  it('setHomeTabSource 把空白主页切到订阅视图并选中源', () => {
    resetState({ tabs: [{ id: 'h0', kind: 'home', homePage: 'blank' } as Tab], activeTabId: 'h0' })
    useAppStore.getState().setHomeTabSource('h0', 'src-9')
    const state = useAppStore.getState()
    expect(state.tabs[0]).toMatchObject({ kind: 'home', homePage: 'feed' })
    expect(state.activeSourceId).toBe('src-9')
  })
})

describe('openExternalSmart 与上限/Mini 的交互', () => {
  it('builtin 模式下受上限约束，超限不开标签也不退 Mini', async () => {
    resetState({
      settings: makeSettings({ externalLinkBehavior: 'builtin' }),
      tabs: homeTabs(MAX_TABS),
      activeTabId: 'h0',
      mini: true
    })
    await useAppStore.getState().openExternalSmart('https://example.com')
    expect(useAppStore.getState().tabs).toHaveLength(MAX_TABS)
    expect(useAppStore.getState().mini).toBe(true)
    expect(stub.toggleMini).not.toHaveBeenCalled()
  })

  it('system 模式直接走系统浏览器，不占标签额度', async () => {
    resetState({
      settings: makeSettings({ externalLinkBehavior: 'system' }),
      tabs: homeTabs(MAX_TABS)
    })
    await useAppStore.getState().openExternalSmart('https://example.com')
    expect(stub.openExternal).toHaveBeenCalledWith('https://example.com')
    expect(useAppStore.getState().tabs).toHaveLength(MAX_TABS)
  })
})

describe('init 恢复标签会话', () => {
  const articles: Record<string, Article[]> = {
    s1: [makeArticle({ guid: 'g1', sourceId: 's1' }), makeArticle({ guid: 'g2', sourceId: 's1' })],
    s2: [makeArticle({ guid: 'g3', sourceId: 's2' })]
  }
  const sources: FeedSource[] = [
    makeSource({ id: 's1', isDefault: true }),
    makeSource({ id: 's2', isDefault: false })
  ]

  async function boot(
    settings: Partial<Settings>,
    session: SavedSession | null
  ): Promise<void> {
    stub = installOpiaStub({
      settingsGet: vi.fn(async () => makeSettings({ startupOpen: 'lastSession', ...settings })),
      feedSources: vi.fn(async () => sources),
      feedList: vi.fn(async (sourceId?: string) =>
        sourceId ? (articles[sourceId] ?? []) : Object.values(articles).flat()
      ),
      themeList: vi.fn(async () => BUILTIN_THEMES),
      historyGet: vi.fn(async () => ({})),
      themeSystemGet: vi.fn(async () => false),
      sessionGet: vi.fn(async () => session)
    })
    await useAppStore.getState().init()
  }

  it('恢复混合标签并保持顺序与激活位', async () => {
    await boot({}, {
      tabs: [
        savedHome(),
        { kind: 'reader', guid: 'g2' },
        { kind: 'browser', url: 'https://example.com/b', title: 'B' },
        { kind: 'settings' }
      ],
      activeTabIndex: 2
    })
    const state = useAppStore.getState()
    expect(state.tabs.map((t) => t.kind)).toEqual(['home', 'reader', 'browser', 'settings'])
    expect(state.tabs[1]).toMatchObject({ kind: 'reader', article: { guid: 'g2' } })
    expect(state.tabs[2]).toMatchObject({ kind: 'browser', url: 'https://example.com/b', title: 'B' })
    expect(state.activeTabId).toBe(state.tabs[2].id)
    expect(state.ready).toBe(true)
    expect(state.activeSourceId).toBe('s1')
  })

  it('缓存中解析不到的 reader guid 静默丢弃', async () => {
    await boot({}, {
      tabs: [savedHome(), { kind: 'reader', guid: 'expired-article' }],
      activeTabIndex: 0
    })
    expect(useAppStore.getState().tabs.map((t) => t.kind)).toEqual(['home'])
  })

  it('全部条目都失效时回退单个主页标签', async () => {
    await boot({}, { tabs: [{ kind: 'reader', guid: 'gone' }], activeTabIndex: 0 })
    const state = useAppStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]).toMatchObject({ kind: 'home', homePage: 'feed' })
  })

  it('旧会话超过上限时截断到 MAX_TABS 并 clamp 激活位', async () => {
    await boot(
      {},
      {
        tabs: Array.from({ length: MAX_TABS + 5 }, () => savedHome()),
        activeTabIndex: MAX_TABS + 4
      }
    )
    const state = useAppStore.getState()
    expect(state.tabs).toHaveLength(MAX_TABS)
    expect(state.activeTabId).toBe(state.tabs[MAX_TABS - 1].id)
  })

  it('恢复后 home 标签保留其 blank/feed 形态', async () => {
    await boot({}, {
      tabs: [{ kind: 'home', homePage: 'blank' }, savedHome()],
      activeTabIndex: 0
    })
    expect(useAppStore.getState().tabs[0]).toMatchObject({ kind: 'home', homePage: 'blank' })
    expect(useAppStore.getState().tabs[1]).toMatchObject({ kind: 'home', homePage: 'feed' })
  })

  it('startupOpen=home 时完全不读会话', async () => {
    await boot({ startupOpen: 'home' }, { tabs: [{ kind: 'settings' }], activeTabIndex: 0 })
    expect(stub.sessionGet).not.toHaveBeenCalled()
    expect(useAppStore.getState().tabs.map((t) => t.kind)).toEqual(['home'])
  })

  it('startupOpen=blank 直接进空白引导页', async () => {
    await boot({ startupOpen: 'blank' }, null)
    expect(useAppStore.getState().tabs[0]).toMatchObject({ kind: 'home', homePage: 'blank' })
  })

  it('无会话且无默认订阅时进空白页且无选中源', async () => {
    stub = installOpiaStub({
      settingsGet: vi.fn(async () => makeSettings({ startupOpen: 'home' })),
      feedSources: vi.fn(async () => [makeSource({ isDefault: false, enabled: false })]),
      feedList: vi.fn(async () => []),
      themeList: vi.fn(async () => BUILTIN_THEMES),
      historyGet: vi.fn(async () => ({})),
      themeSystemGet: vi.fn(async () => false),
      sessionGet: vi.fn(async () => null)
    })
    await useAppStore.getState().init()
    const state = useAppStore.getState()
    expect(state.tabs[0]).toMatchObject({ kind: 'home', homePage: 'blank' })
    expect(state.activeSourceId).toBeNull()
  })

  it('默认源被停用时回退第一个启用源', async () => {
    stub = installOpiaStub({
      settingsGet: vi.fn(async () => makeSettings({ startupOpen: 'home' })),
      feedSources: vi.fn(async () => [
        makeSource({ id: 's1', isDefault: true, enabled: false }),
        makeSource({ id: 's2', isDefault: false })
      ]),
      feedList: vi.fn(async () => []),
      themeList: vi.fn(async () => BUILTIN_THEMES),
      historyGet: vi.fn(async () => ({})),
      themeSystemGet: vi.fn(async () => false),
      sessionGet: vi.fn(async () => null)
    })
    await useAppStore.getState().init()
    expect(useAppStore.getState().activeSourceId).toBe('s2')
  })

  it('启动即后台刷新一次，并为每个启用源拉取文章', async () => {
    await boot({}, null)
    expect(stub.feedRefresh).toHaveBeenCalledTimes(1)
    expect(stub.feedList).toHaveBeenCalledWith('s1')
    expect(stub.feedList).toHaveBeenCalledWith('s2')
    expect(useAppStore.getState().articles.s2).toHaveLength(1)
  })

  it('注册 feed 与系统主题变更订阅', async () => {
    await boot({}, null)
    expect(stub.onFeedUpdated).toHaveBeenCalledTimes(1)
    expect(stub.onThemeSystemChanged).toHaveBeenCalledTimes(1)
  })
})

describe('主题三态在 store 中的落点', () => {
  beforeEach(() => {
    resetState({ themes: BUILTIN_THEMES, systemDark: false })
  })

  it('setThemeMode 写回设置并按新模式注入主题', async () => {
    stub.settingsSet.mockImplementation(async (patch: Partial<Settings>) =>
      makeSettings({ ...useAppStore.getState().settings!, ...patch })
    )
    await useAppStore.getState().setThemeMode('dark')
    expect(stub.settingsSet).toHaveBeenCalledWith({ themeMode: 'dark' })
    expect(useAppStore.getState().settings?.themeMode).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--t-bg')).toBe(
      BUILTIN_THEMES.find((t) => t.id === 'windows-dark')!.colors.bg
    )
  })

  it('跟随系统时系统切暗即应用暗侧主题', async () => {
    resetState({ themes: BUILTIN_THEMES, systemDark: false })
    stub = installOpiaStub({
      settingsGet: vi.fn(async () => makeSettings({ themeMode: 'system', startupOpen: 'home' })),
      feedSources: vi.fn(async () => [makeSource()]),
      feedList: vi.fn(async () => []),
      themeList: vi.fn(async () => BUILTIN_THEMES),
      historyGet: vi.fn(async () => ({})),
      themeSystemGet: vi.fn(async () => false)
    })
    await useAppStore.getState().init()
    expect(document.documentElement.style.colorScheme).toBe('light')

    const handler = stub.onThemeSystemChanged.mock.calls[0]?.[0] as (dark: boolean) => void
    expect(handler).toBeTypeOf('function')
    handler(true)
    expect(useAppStore.getState().systemDark).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--t-bg')).toBe(
      BUILTIN_THEMES.find((t) => t.id === 'windows-dark')!.colors.bg
    )
  })

  it('拒绝把暗色主题选到亮色分类（选择器跨分类守卫）', async () => {
    stub.settingsSet.mockClear()
    await useAppStore.getState().setThemeForScheme('light', 'windows-dark')
    expect(stub.settingsSet).not.toHaveBeenCalled()
    expect(useAppStore.getState().settings?.lightThemeId).not.toBe('windows-dark')
  })

  it('同分类主题正常写入', async () => {
    stub.settingsSet.mockImplementation(async (patch: Partial<Settings>) =>
      makeSettings({ ...useAppStore.getState().settings!, ...patch })
    )
    await useAppStore.getState().setThemeForScheme('dark', 'windows-dark')
    expect(stub.settingsSet).toHaveBeenCalledWith({ darkThemeId: 'windows-dark' })
  })
})
