import { Star } from 'lucide-react'
import type { Article, LayoutConfig } from '../../shared/types'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  article: Article
  layout: LayoutConfig
  index: number
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function ArticleCard({ article, layout, index }: Props): JSX.Element {
  const { history, openArticle, toggleFavorite, sources } = useAppStore()
  const entry = history[article.guid]
  const read = entry?.read ?? false
  const favorite = entry?.favorite ?? false
  const sourceName = sources.find((s) => s.id === article.sourceId)?.name ?? ''
  const { fields } = layout

  return (
    <article
      onClick={() => void openArticle(article)}
      className={`card-enter group relative flex cursor-pointer flex-col overflow-hidden rounded-card border border-border bg-card shadow-sm transition-shadow hover:shadow-md ${
        read ? 'opacity-70' : ''
      }`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      {fields.cover && article.coverUrl && (
        <img
          src={article.coverUrl}
          alt=""
          loading="lazy"
          className="h-36 w-full object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3
          className={`font-heading text-base font-bold leading-snug ${
            read ? 'text-read' : 'text-text'
          }`}
        >
          {article.title}
        </h3>
        {fields.summary && article.summary && (
          <p className="line-clamp-3 text-sm leading-relaxed text-text-secondary">
            {article.summary}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-text-secondary">
          {fields.pubDate && <span>{formatDate(article.pubDate)}</span>}
          {fields.source && sourceName && (
            <span className="rounded bg-chip px-1.5 py-0.5 text-chip-text">{sourceName}</span>
          )}
        </div>
      </div>
      <button
        title={favorite ? '取消收藏' : '收藏'}
        onClick={(e) => {
          e.stopPropagation()
          void toggleFavorite(article.guid)
        }}
        className={`absolute right-2 top-2 rounded-full bg-surface/80 p-1.5 backdrop-blur transition-opacity ${
          favorite ? 'text-accent opacity-100' : 'text-text-secondary opacity-0 group-hover:opacity-100'
        }`}
      >
        <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  )
}
