import { useAppStore, type Tab } from '../stores/useAppStore'
import { ArticleList } from '../layouts/ArticleList'
import { BlankPage } from './BlankPage'
import { JUYA_SOURCE_ID } from '../../shared/types'
import { resolveJuyaVariant } from '../juya/effectiveJuyaStyle'
import { JUYA_TEMPLATES } from '../juya/templates'

interface Props {
  tab: Extract<Tab, { kind: 'home' }>
  showFavorites: boolean
}

/** 主页标签内容：订阅文章列表或空页面引导页（源切换入口在主页标签的下拉按钮）。
 *  橘鸦订阅页：风格开启时按所选风格渲染期号列表（遵循通用 layout 设置：预设/列数/显示字段）。 */
export function HomeView({ tab, showFavorites }: Props): JSX.Element {
  const { articles, activeSourceId, history, settings, systemDark } = useAppStore()

  if (tab.homePage === 'blank') {
    return (
      <div className="flex h-full flex-col">
        <BlankPage tabId={tab.id} />
      </div>
    )
  }

  const all = activeSourceId ? articles[activeSourceId] ?? [] : []
  const list = showFavorites ? all.filter((a) => history[a.guid]?.favorite) : all

  const juyaVariant =
    activeSourceId === JUYA_SOURCE_ID && settings
      ? resolveJuyaVariant(settings, systemDark)
      : null
  const JuyaFeed = juyaVariant ? JUYA_TEMPLATES[juyaVariant.styleId].FeedList : null

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto">
        {/* 内容区随 uiZoom 缩放 */}
        <div style={{ zoom: settings?.uiZoom ?? 1 }}>
          {JuyaFeed && juyaVariant && settings ? (
            <JuyaFeed articles={list} variantId={juyaVariant.id} layout={settings.layout} />
          ) : (
            <div className="p-4">
              {settings && <ArticleList articles={list} layout={settings.layout} />}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
