import { create } from 'zustand'
import type {
  Article,
  FeedSource,
  HistoryEntry,
  SavedSession,
  Settings,
  ThemeTokens
} from '../../shared/types'
import { applyTheme } from '../theme/applyTheme'

export type Tab =
  | { id: string; kind: 'home'; homePage: 'feed' | 'blank' }
  | { id: string; kind: 'reader'; article: Article }
  | { id: string; kind: 'browser'; url: string; title?: string }
  | { id: string; kind: 'settings' }

let tabSeq = 0
function nextTabId(): string {
  tabSeq += 1
  return `tab-${tabSeq}`
}

interface AppState {
  ready: boolean
  settings: Settings | null
  sources: FeedSource[]
  articles: Record<string, Article[]>
  history: Record<string, HistoryEntry>
  themes: ThemeTokens[]
  activeSourceId: string | null
  tabs: Tab[]
  activeTabId: string
  mini: boolean
  refreshing: boolean

  init(): Promise<void>
  refresh(sourceId?: string): Promise<void>
  setActiveSource(id: string): void
  openArticle(article: Article): Promise<void>
  toggleFavorite(guid: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  setTheme(id: string): Promise<void>
  /** 内容区缩放（0.5–2，步进 0.05），持久化到 settings.uiZoom */
  setZoom(z: number): void
  toggleMini(): Promise<void>
  reloadSources(): Promise<void>
  reloadThemes(): Promise<ThemeTokens[]>
  /** 按 externalLinkBehavior 设置打开外链：system=系统浏览器，builtin=新开内置浏览器标签 */
  openExternalSmart(url: string): Promise<void>
  /** Mini 模式点击文章：标记已读并打开原文（不进入阅读视图） */
  openFromMini(article: Article): Promise<void>
  /** 新开主页标签（内容按 homeContent 设置；feed 时选中默认订阅）并激活 */
  openHomeTab(): void
  /** 新开阅读标签并激活 */
  openReaderTab(article: Article): void
  /** 新开内置浏览器标签并激活 */
  openBrowserTab(url: string): void
  /** 新开设置标签并激活 */
  openSettingsTab(): void
  /** 关闭标签；关的是激活标签则激活右侧邻标签（无右取左）；关掉最后一个标签退出程序 */
  closeTab(id: string): void
  activateTab(id: string): void
  /** 更新浏览器标签标题（webview page-title-updated 同步用） */
  setTabTitle(id: string, title: string): void
  /** 空页面引导页提交：该主页标签切换到订阅视图并选中指定源 */
  setHomeTabSource(tabId: string, sourceId: string): void
}

function serializeSession(tabs: Tab[], activeTabId: string): SavedSession {
  const idx = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTabId)
  )
  return {
    tabs: tabs.map((t): SavedSession['tabs'][number] => {
      if (t.kind === 'home') return { kind: 'home', homePage: t.homePage }
      if (t.kind === 'reader') return { kind: 'reader', guid: t.article.guid }
      if (t.kind === 'browser') return { kind: 'browser', url: t.url, title: t.title }
      return { kind: 'settings' }
    }),
    activeTabIndex: idx
  }
}

/** 从持久化会话恢复标签：reader 按 guid 从全量文章缓存解析，解析不到则跳过 */
function restoreSession(saved: SavedSession, allArticles: Article[]): { tabs: Tab[]; activeTabId: string } | null {
  const byGuid = new Map(allArticles.map((a) => [a.guid, a]))
  const tabs: Tab[] = []
  for (const st of saved.tabs) {
    if (st.kind === 'home') {
      tabs.push({ id: nextTabId(), kind: 'home', homePage: st.homePage })
    } else if (st.kind === 'reader') {
      const article = byGuid.get(st.guid)
      if (article) tabs.push({ id: nextTabId(), kind: 'reader', article })
    } else if (st.kind === 'browser') {
      tabs.push({ id: nextTabId(), kind: 'browser', url: st.url, title: st.title })
    } else {
      tabs.push({ id: nextTabId(), kind: 'settings' })
    }
  }
  if (tabs.length === 0) return null
  const idx = Math.min(Math.max(saved.activeTabIndex, 0), tabs.length - 1)
  return { tabs, activeTabId: tabs[idx].id }
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  settings: null,
  sources: [],
  articles: {},
  history: {},
  themes: [],
  activeSourceId: null,
  tabs: [],
  activeTabId: '',
  mini: false,
  refreshing: false,

  async init() {
    const [settings, sources, history, themes] = await Promise.all([
      window.opia.settingsGet(),
      window.opia.feedSources(),
      window.opia.historyGet(),
      window.opia.themeList()
    ])
    const theme = themes.find((t) => t.id === settings.activeThemeId) ?? themes[0]
    if (theme) applyTheme(theme)

    const enabled = sources.filter((s) => s.enabled)
    const articleEntries = await Promise.all(
      enabled.map(async (s) => [s.id, await window.opia.feedList(s.id)] as const)
    )

    // 初始选中源：默认订阅（被禁用时回退第一个启用源）
    const defaultSource = sources.find((s) => s.isDefault)
    const initialSourceId =
      defaultSource && defaultSource.enabled ? defaultSource.id : enabled[0]?.id ?? null

    // 按启动设置建立初始标签
    let tabs: Tab[] = []
    let activeTabId = ''
    if (settings.startupOpen === 'lastSession') {
      const saved = await window.opia.sessionGet()
      const allArticles = await window.opia.feedList()
      const restored = saved ? restoreSession(saved, allArticles) : null
      if (restored) {
        tabs = restored.tabs
        activeTabId = restored.activeTabId
      }
    }
    if (tabs.length === 0) {
      const hasDefault = sources.some((s) => s.isDefault)
      const homePage =
        settings.startupOpen === 'blank' || settings.homeContent === 'blank' || !hasDefault
          ? 'blank'
          : 'feed'
      tabs = [{ id: nextTabId(), kind: 'home', homePage }]
      activeTabId = tabs[0].id
    }

    set({
      ready: true,
      settings,
      sources,
      history,
      themes,
      articles: Object.fromEntries(articleEntries),
      activeSourceId: initialSourceId,
      tabs,
      activeTabId
    })

    // 后台刷新一次
    void get().refresh()

    window.opia.onFeedUpdated(({ sourceId }) => {
      void window.opia.feedList(sourceId).then((list) => {
        set((st) => ({ articles: { ...st.articles, [sourceId]: list } }))
      })
    })
  },

  async refresh(sourceId) {
    set({ refreshing: true })
    try {
      await window.opia.feedRefresh(sourceId)
      const sources = get().sources.filter((s) => s.enabled)
      const targets = sourceId ? sources.filter((s) => s.id === sourceId) : sources
      const entries = await Promise.all(
        targets.map(async (s) => [s.id, await window.opia.feedList(s.id)] as const)
      )
      set((st) => ({ articles: { ...st.articles, ...Object.fromEntries(entries) } }))
    } finally {
      set({ refreshing: false })
    }
  },

  setActiveSource(id) {
    set({ activeSourceId: id })
  },

  async openArticle(article) {
    const behavior = get().settings?.clickBehavior ?? 'reader'
    if (behavior === 'browser') {
      await window.opia.openExternal(article.link)
    } else {
      get().openReaderTab(article)
    }
    await window.opia.historyMarkRead(article.guid)
    set((st) => ({
      history: {
        ...st.history,
        [article.guid]: {
          guid: article.guid,
          read: true,
          favorite: st.history[article.guid]?.favorite ?? false,
          readAt: new Date().toISOString()
        }
      }
    }))
  },

  async toggleFavorite(guid) {
    const fav = await window.opia.historyToggleFavorite(guid)
    set((st) => ({
      history: {
        ...st.history,
        [guid]: {
          guid,
          read: st.history[guid]?.read ?? false,
          readAt: st.history[guid]?.readAt ?? null,
          favorite: fav
        }
      }
    }))
  },

  async updateSettings(patch) {
    const next = await window.opia.settingsSet(patch)
    set({ settings: next })
  },

  async setTheme(id) {
    const theme = get().themes.find((t) => t.id === id) ?? (await window.opia.themeGet(id))
    if (!theme) return
    applyTheme(theme)
    await get().updateSettings({ activeThemeId: id })
  },

  setZoom(z) {
    const next = Math.min(2, Math.max(0.5, Math.round(z * 100) / 100))
    if (next === (get().settings?.uiZoom ?? 1)) return
    void get().updateSettings({ uiZoom: next })
  },

  async toggleMini() {
    const mini = await window.opia.toggleMini()
    set({ mini })
  },

  async reloadSources() {
    const sources = await window.opia.feedSources()
    set({ sources })
    const enabled = sources.filter((s) => s.enabled)
    if (!enabled.some((s) => s.id === get().activeSourceId)) {
      set({ activeSourceId: enabled[0]?.id ?? null })
    }
  },

  async reloadThemes() {
    const themes = await window.opia.themeList()
    set({ themes })
    return themes
  },

  async openExternalSmart(url) {
    const behavior = get().settings?.externalLinkBehavior ?? 'system'
    if (behavior === 'builtin') {
      if (get().mini) {
        const mini = await window.opia.toggleMini()
        set({ mini })
      }
      get().openBrowserTab(url)
    } else {
      await window.opia.openExternal(url)
    }
  },

  async openFromMini(article) {
    await window.opia.historyMarkRead(article.guid)
    set((st) => ({
      history: {
        ...st.history,
        [article.guid]: {
          guid: article.guid,
          read: true,
          favorite: st.history[article.guid]?.favorite ?? false,
          readAt: new Date().toISOString()
        }
      }
    }))
    await get().openExternalSmart(article.link)
  },

  openHomeTab() {
    // 主页内容：设置 blank 或当前无默认订阅 → 空页面；否则默认订阅视图
    const hasDefault = get().sources.some((s) => s.isDefault)
    const homePage =
      get().settings?.homeContent === 'blank' || !hasDefault ? 'blank' : 'feed'
    const patch: Partial<AppState> = {}
    if (homePage === 'feed') {
      const sources = get().sources
      const def = sources.find((s) => s.isDefault && s.enabled) ?? sources.find((s) => s.enabled)
      if (def) patch.activeSourceId = def.id
    }
    const tab: Tab = { id: nextTabId(), kind: 'home', homePage }
    set((st) => ({ tabs: [...st.tabs, tab], activeTabId: tab.id, ...patch }))
  },

  openReaderTab(article) {
    const tab: Tab = { id: nextTabId(), kind: 'reader', article }
    set((st) => ({ tabs: [...st.tabs, tab], activeTabId: tab.id }))
  },

  openBrowserTab(url) {
    const tab: Tab = { id: nextTabId(), kind: 'browser', url }
    set((st) => ({ tabs: [...st.tabs, tab], activeTabId: tab.id }))
  },

  openSettingsTab() {
    const tab: Tab = { id: nextTabId(), kind: 'settings' }
    set((st) => ({ tabs: [...st.tabs, tab], activeTabId: tab.id }))
  },

  closeTab(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const next = tabs.filter((t) => t.id !== id)
    if (next.length === 0) {
      // 关闭最后一个标签 = 退出程序
      void window.opia.windowClose()
      return
    }
    let nextActive = activeTabId
    if (id === activeTabId) {
      nextActive = (next[idx] ?? next[idx - 1]).id
    }
    set({ tabs: next, activeTabId: nextActive })
  },

  activateTab(id) {
    if (get().tabs.some((t) => t.id === id)) set({ activeTabId: id })
  },

  setTabTitle(id, title) {
    set((st) => ({
      tabs: st.tabs.map((t) =>
        t.id === id && t.kind === 'browser' && t.title !== title ? { ...t, title } : t
      )
    }))
  },

  setHomeTabSource(tabId, sourceId) {
    set((st) => ({
      tabs: st.tabs.map((t) => (t.id === tabId && t.kind === 'home' ? { ...t, homePage: 'feed' } : t)),
      activeSourceId: sourceId
    }))
  }
}))

// 会话持久化：tabs / activeTabId 变化即保存（低频操作，不做防抖保证退出前落盘）
let lastSessionJson = ''
useAppStore.subscribe((state, prev) => {
  if (state.tabs === prev.tabs && state.activeTabId === prev.activeTabId) return
  const session = serializeSession(state.tabs, state.activeTabId)
  const json = JSON.stringify(session)
  if (json === lastSessionJson) return
  lastSessionJson = json
  void window.opia.sessionSave(session)
})
