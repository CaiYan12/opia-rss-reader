import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { ExternalLink, Star } from 'lucide-react'
import type { Article } from '../../shared/types'
import { JUYA_SOURCE_ID } from '../../shared/types'
import { useAppStore } from '../stores/useAppStore'
import { parseJuyaIssue } from '../juya/parseJuyaIssue'
import { resolveJuyaVariant } from '../juya/effectiveJuyaStyle'
import { JUYA_TEMPLATES } from '../juya/templates'

interface Props {
  article: Article
}

export function ReaderView({ article }: Props): JSX.Element {
  const { toggleFavorite, history, openExternalSmart, settings, systemDark } = useAppStore()
  const favorite = history[article.guid]?.favorite ?? false
  // 内容区缩放系数：只作用于正文（工具栏在 zoom 容器外，保持固定尺寸）
  const uiZoom = settings?.uiZoom ?? 1

  const cleanHtml = useMemo(
    () =>
      DOMPurify.sanitize(article.contentHtml, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'iframe', 'form', 'input', 'style'],
        FORBID_ATTR: ['style', 'onerror', 'onload']
      }),
    [article.contentHtml]
  )

  // 橘鸦定制路径：源身份判据 + 风格开启 + 结构化解析成功；任一不满足 → 静默回退通用渲染
  const juya = useMemo(() => {
    if (article.sourceId !== JUYA_SOURCE_ID || !settings) return null
    const variant = resolveJuyaVariant(settings, systemDark)
    if (!variant) return null
    const issue = parseJuyaIssue(article.contentHtml)
    if (!issue) return null
    return { variant, issue, template: JUYA_TEMPLATES[variant.styleId] }
  }, [article, settings, systemDark])

  /** 拦截正文内链点击：按设置分流（系统浏览器 / 内置浏览器页），禁止窗口内原地导航 */
  const onContentClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || !/^https?:\/\//i.test(href)) return
    e.preventDefault()
    void openExternalSmart(href)
  }

  const toolbar = (
    <div className="view-nav flex items-center justify-end gap-2 border-b border-border bg-surface px-4 py-2.5">
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
  )

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <div className="flex-1 overflow-y-auto">
        {/* 内容区随 uiZoom 缩放；工具栏在 zoom 容器外，保持固定尺寸 */}
        <div style={{ zoom: uiZoom }}>
          {juya ? (
            <juya.template.IssueView
              article={article}
              issue={juya.issue}
              variantId={juya.variant.id}
              onOpenLink={(href) => void openExternalSmart(href)}
            />
          ) : (
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
          )}
        </div>
      </div>
    </div>
  )
}
