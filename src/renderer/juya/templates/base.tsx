import type { CSSProperties } from 'react'
import type { Article } from '../../../shared/types'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { EntryBlocks, OverviewItems } from './shared'
import { useAppStore } from '../../stores/useAppStore'

/** 模板基座：把语义模型渲染为安全的 React 结构。亮/暗由入参 variantId 决定
 *  （data-juya-variant 调色板作用域），版式差异由 variantClass 结构类承担。
 *  每个风格模板是独立文件，各自声明结构选项，不共享可变状态。 */

interface TemplateOptions {
  /** 根节点结构类（如 jycard） */
  variantClass: string
  /** 条目正文是否包分栏容器（90 年代报刊宽窗口两栏） */
  entryColumns?: boolean
  /** 报头附加行（如报刊日期线），入参为文章发布日期 */
  mastheadExtra?: (pubDate: string) => JSX.Element | null
}

export function makeJuyaTemplate(opts: TemplateOptions): JuyaTemplate {
  const { variantClass, entryColumns = false, mastheadExtra } = opts

  function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
    return (
      <div className={`juya-root ${variantClass}`} data-juya-variant={variantId}>
        <div className="juya-issue">
          <header className="juya-masthead">
            <h1>{issue.heading || article.title}</h1>
            {mastheadExtra?.(article.pubDate) ?? null}
          </header>
          {issue.overview && <OverviewItems overview={issue.overview} onOpenLink={onOpenLink} />}
          {issue.sections.map((section) => (
            <section className="juya-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {section.entries.map((entry, i) => (
                <article className="juya-entry" key={i}>
                  <h3>
                    {entry.titleLink ? (
                      <a
                        href={entry.titleLink}
                        onClick={(e) => {
                          e.preventDefault()
                          onOpenLink(entry.titleLink as string)
                        }}
                      >
                        {entry.title}
                      </a>
                    ) : (
                      entry.title
                    )}
                    {entry.index && <span className="juya-index">#{entry.index}</span>}
                  </h3>
                  {entryColumns ? (
                    <div className="juya-entry-columns">
                      <EntryBlocks entry={entry} onOpenLink={onOpenLink} />
                    </div>
                  ) : (
                    <EntryBlocks entry={entry} onOpenLink={onOpenLink} />
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    )
  }

  function FeedList({ articles, variantId, layout }: JuyaFeedProps): JSX.Element {
    const { history, openArticle, sources } = useAppStore()
    const { preset, gridColumns, fields } = layout

    /** 期号条目：遵循「布局」显示字段（compact 精简为行式、magazine 首条加大）。 */
    function renderItem(a: Article, i: number, mode: 'card' | 'compact' | 'featured'): JSX.Element {
      const read = history[a.guid]?.read ?? false
      const sourceName = sources.find((s) => s.id === a.sourceId)?.name ?? ''
      return (
        <button
          key={a.guid}
          className={`juya-feed-item${mode === 'featured' ? ' juya-feed-featured' : ''}`}
          style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
          onClick={() => void openArticle(a)}
        >
          {(fields.cover || mode === 'featured') && a.coverUrl && (
            <img className="juya-feed-cover" src={a.coverUrl} alt="" loading="lazy" />
          )}
          <span className="juya-feed-body">
            <span className="juya-feed-title">{a.title}</span>
            {mode !== 'compact' && (fields.summary || mode === 'featured') && a.summary && (
              <span className="juya-feed-summary">{a.summary}</span>
            )}
            <span className="juya-feed-meta">
              {!read && <span className="juya-feed-read-dot" aria-hidden />}
              {fields.pubDate && (
                <span>
                  {new Date(a.pubDate).toLocaleString('zh-CN', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}
                </span>
              )}
              {fields.source && sourceName && <span className="juya-feed-source">{sourceName}</span>}
            </span>
          </span>
        </button>
      )
    }

    const empty = articles.length === 0
    const gridProps = { '--jy-cols': gridColumns } as CSSProperties

    if (preset === 'magazine') {
      return (
        <div className={`juya-root ${variantClass}`} data-juya-variant={variantId}>
          <div className="juya-feed">
            {empty && <div className="juya-feed-empty">暂无内容，点击右上角刷新获取</div>}
            {articles[0] && renderItem(articles[0], 0, 'featured')}
            {articles.length > 1 && (
              <div className="juya-feed-grid" style={gridProps}>
                {articles.slice(1).map((a, i) => renderItem(a, i + 1, 'card'))}
              </div>
            )}
          </div>
        </div>
      )
    }
    if (preset === 'compact') {
      return (
        <div className={`juya-root ${variantClass}`} data-juya-variant={variantId}>
          <div className="juya-feed juya-feed-compact">
            {empty ? (
              <div className="juya-feed-empty">暂无内容，点击右上角刷新获取</div>
            ) : (
              articles.map((a, i) => renderItem(a, i, 'compact'))
            )}
          </div>
        </div>
      )
    }
    return (
      <div className={`juya-root ${variantClass}`} data-juya-variant={variantId}>
        <div className="juya-feed juya-feed-grid" style={gridProps}>
          {empty ? (
            <div className="juya-feed-empty">暂无内容，点击右上角刷新获取</div>
          ) : (
            articles.map((a, i) => renderItem(a, i, 'card'))
          )}
        </div>
      </div>
    )
  }

  return { IssueView, FeedList }
}
