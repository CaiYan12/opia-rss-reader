import type { Article, LayoutConfig } from '../../shared/types'
import { ArticleCard } from '../components/ArticleCard'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  articles: Article[]
  layout: LayoutConfig
}

/** 紧凑列表：单行标题 + 日期 */
function CompactList({ articles }: { articles: Article[] }): JSX.Element {
  const { history, openArticle, sources } = useAppStore()
  return (
    <ul className="flex flex-col gap-1">
      {articles.map((a, i) => {
        const read = history[a.guid]?.read ?? false
        const sourceName = sources.find((s) => s.id === a.sourceId)?.name ?? ''
        return (
          <li key={a.guid}>
            <button
              onClick={() => void openArticle(a)}
              className="card-enter flex w-full items-center gap-3 rounded-card border border-border bg-card px-4 py-2.5 text-left transition-colors hover:bg-surface"
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            >
              <span
                className={`flex-1 truncate text-sm ${read ? 'text-read' : 'text-text'}`}
              >
                {a.title}
              </span>
              <span className="shrink-0 text-xs text-text-secondary">
                {sourceName && <span className="mr-2 rounded bg-chip px-1.5 py-0.5 text-chip-text">{sourceName}</span>}
                {new Date(a.pubDate).toLocaleDateString('zh-CN')}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** 杂志风：首条大幅 + 其余网格，参照 juya-brief 概览排版 */
function Magazine({ articles, layout }: Props): JSX.Element {
  const [featured, ...rest] = articles
  return (
    <div className="flex flex-col gap-4">
      {featured && (
        <div className="magazine-featured">
          <ArticleCard article={featured} layout={{ ...layout, fields: { ...layout.fields, cover: true, summary: true } }} index={0} />
        </div>
      )}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${layout.gridColumns}, minmax(0, 1fr))` }}
      >
        {rest.map((a, i) => (
          <ArticleCard key={a.guid} article={a} layout={layout} index={i + 1} />
        ))}
      </div>
    </div>
  )
}

export function ArticleList(props: Props): JSX.Element {
  const { articles, layout } = props
  if (articles.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-text-secondary">
        暂无内容，点击右上角刷新获取
      </div>
    )
  }
  if (layout.preset === 'compact') return <CompactList articles={articles} />
  if (layout.preset === 'magazine') return <Magazine {...props} />
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${layout.gridColumns}, minmax(0, 1fr))` }}
    >
      {articles.map((a, i) => (
        <ArticleCard key={a.guid} article={a} layout={layout} index={i} />
      ))}
    </div>
  )
}
