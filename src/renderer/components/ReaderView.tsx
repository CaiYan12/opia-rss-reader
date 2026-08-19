import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { ArrowLeft, ExternalLink, Star } from 'lucide-react'
import type { Article } from '../../shared/types'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  article: Article
}

export function ReaderView({ article }: Props): JSX.Element {
  const { closeReader, toggleFavorite, history } = useAppStore()
  const favorite = history[article.guid]?.favorite ?? false

  const cleanHtml = useMemo(
    () =>
      DOMPurify.sanitize(article.contentHtml, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'iframe', 'form', 'input', 'style'],
        FORBID_ATTR: ['style', 'onerror', 'onload']
      }),
    [article.contentHtml]
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <button
          onClick={closeReader}
          className="flex items-center gap-1 rounded-card px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-chip"
        >
          <ArrowLeft size={16} /> 返回
        </button>
        <div className="flex-1" />
        <button
          title={favorite ? '取消收藏' : '收藏'}
          onClick={() => void toggleFavorite(article.guid)}
          className={`rounded-card p-2 transition-colors hover:bg-chip ${
            favorite ? 'text-accent' : 'text-text-secondary'
          }`}
        >
          <Star size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>
        <button
          title="在浏览器打开原文"
          onClick={() => void window.opia.openExternal(article.link)}
          className="flex items-center gap-1 rounded-card px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-chip"
        >
          <ExternalLink size={16} /> 原文
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="reader-body mx-auto max-w-3xl px-6 py-8">
          <h1 className="mb-6 font-heading text-3xl font-bold leading-tight text-accent">
            {article.title}
          </h1>
          <div
            className="article-content leading-relaxed"
            dangerouslySetInnerHTML={{ __html: cleanHtml }}
          />
        </div>
      </div>
    </div>
  )
}
