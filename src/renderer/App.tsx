import { useEffect, useState } from 'react'
import { useAppStore } from './stores/useAppStore'
import { NavBar } from './components/NavBar'
import { SourceTabs } from './components/SourceTabs'
import { ArticleList } from './layouts/ArticleList'
import { ReaderView } from './components/ReaderView'
import { SettingsPanel } from './components/SettingsPanel'
import { MiniView } from './components/MiniView'

export default function App(): JSX.Element {
  const { ready, init, view, mini, articles, activeSourceId, settings, history } = useAppStore()
  const [showFavorites, setShowFavorites] = useState(false)

  useEffect(() => {
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-text-secondary">
        加载中…
      </div>
    )
  }

  if (mini) return <MiniView />

  if (view.kind === 'settings') return <SettingsPanel />
  if (view.kind === 'reader') return <ReaderView article={view.article} />

  const all = activeSourceId ? articles[activeSourceId] ?? [] : []
  const list = showFavorites ? all.filter((a) => history[a.guid]?.favorite) : all

  return (
    <div className="flex h-screen flex-col">
      <NavBar showFavorites={showFavorites} onToggleFavorites={() => setShowFavorites((v) => !v)} />
      <SourceTabs />
      <main className="flex-1 overflow-y-auto p-4">
        {settings && <ArticleList articles={list} layout={settings.layout} />}
      </main>
    </div>
  )
}
