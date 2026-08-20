import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { ExternalLink, Star } from 'lucide-react'
import type { Article } from '../../shared/types'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  article: Article
}

export function ReaderView({ article }: Props): JSX.Element {
  const { toggleFavorite, history, openExternalSmart } = useAppStore()
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

  /** 拦截正文内链点击：按设置分流（系统浏览器 / 内置浏览器页），禁止窗口内原地导航 */
  const onContentClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || !/^https?:\/\//i.test(href)) return
    e.preventDefault()
    void openExternalSmart(href)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-border bg-surface px-4 py-2.5">
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
            onClick={onContentClick}
            dangerouslySetInnerHTML={{ __html: cleanHtml }}
          />
        </div>
      </div>
    </div>
  )
}
