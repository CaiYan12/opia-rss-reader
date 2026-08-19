import { create } from 'zustand'
import type {
  Article,
  FeedSource,
  HistoryEntry,
  Settings,
  ThemeTokens
} from '../../shared/types'
import { applyTheme } from '../theme/applyTheme'

type View = { kind: 'home' } | { kind: 'reader'; article: Article } | { kind: 'settings' }

interface AppState {
  ready: boolean
  settings: Settings | null
  sources: FeedSource[]
  articles: Record<string, Article[]>
  history: Record<string, HistoryEntry>
  themes: ThemeTokens[]
  activeSourceId: string | null
  view: View
  mini: boolean
  refreshing: boolean

  init(): Promise<void>
  refresh(sourceId?: string): Promise<void>
  setActiveSource(id: string): void
  openArticle(article: Article): Promise<void>
  closeReader(): void
  openSettings(): void
  closeSettings(): void
  toggleFavorite(guid: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  setTheme(id: string): Promise<void>
  toggleMini(): Promise<void>
  reloadSources(): Promise<void>
  reloadThemes(): Promise<ThemeTokens[]>
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  settings: null,
  sources: [],
  articles: {},
  history: {},
  themes: [],
  activeSourceId: null,
  view: { kind: 'home' },
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

    set({
      ready: true,
      settings,
      sources,
      history,
      themes,
      articles: Object.fromEntries(articleEntries),
      activeSourceId: enabled[0]?.id ?? null
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
    set({ activeSourceId: id, view: { kind: 'home' } })
  },

  async openArticle(article) {
    const behavior = get().settings?.clickBehavior ?? 'reader'
    if (behavior === 'browser') {
      await window.opia.openExternal(article.link)
    } else {
      set({ view: { kind: 'reader', article } })
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

  closeReader() {
    set({ view: { kind: 'home' } })
  },

  openSettings() {
    set({ view: { kind: 'settings' } })
  },

  closeSettings() {
    set({ view: { kind: 'home' } })
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
  }
}))
