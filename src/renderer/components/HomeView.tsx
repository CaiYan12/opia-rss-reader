import { useAppStore, type Tab } from '../stores/useAppStore'
import { ArticleList } from '../layouts/ArticleList'
import { BlankPage } from './BlankPage'

interface Props {
  tab: Extract<Tab, { kind: 'home' }>
  showFavorites: boolean
}

/** 主页标签内容：订阅文章列表或空页面引导页（源切换入口在主页标签的下拉按钮） */
export function HomeView({ tab, showFavorites }: Props): JSX.Element {
  const { articles, activeSourceId, history, settings } = useAppStore()

  if (tab.homePage === 'blank') {
    return (
      <div className="flex h-full flex-col">
        <BlankPage tabId={tab.id} />
      </div>
    )
  }

  const all = activeSourceId ? articles[activeSourceId] ?? [] : []
  const list = showFavorites ? all.filter((a) => history[a.guid]?.favorite) : all

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto p-4">
        {settings && <ArticleList articles={list} layout={settings.layout} />}
      </main>
    </div>
  )
}
