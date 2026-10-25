import type { ReactNode } from 'react'
import type { Article } from '../../../shared/types'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { EntryBlocks, EntryTitle, OverviewItems } from './shared'
import { FeedShell, type FeedGates, type FeedItemMode } from './parts'
import { useAppStore } from '../../stores/useAppStore'

/** 模板基座：把语义模型渲染为安全的 React 结构。亮/暗由入参 variantId 决定
 *  （data-juya-variant 调色板作用域），版式差异由 variantClass 结构类承担。
 *  每个风格模板是独立文件，各自声明结构选项，不共享可变状态。
 *  订阅页骨架（预设分发/分列/stagger/空态）单一来源在 parts.tsx FeedShell。 */

interface TemplateOptions {
  /** 根节点结构类（如 jyfolio） */
  variantClass: string
  /** 条目正文是否包分栏容器（90 年代报刊宽窗口两栏） */
  entryColumns?: boolean
  /** 报头附加行（如报刊日期线），入参为文章发布日期 */
  mastheadExtra?: (pubDate: string) => JSX.Element | null
  /** 订阅页场景槽位（可选，#68 工厂透传）：FeedList 渲染期以当前活跃订阅源调用，
   *  name/url 取不到时为空串（与 wabi/editorial 手写接线的取值一致）；
   *  返回值原样透传给 FeedShell 既有 scene 槽位。不传时输出与现状逐字一致。 */
  feedScene?: (source: { name: string; url: string }) => ReactNode
}

export function makeJuyaTemplate(opts: TemplateOptions): JuyaTemplate {
  const { variantClass, entryColumns = false, mastheadExtra, feedScene } = opts

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
                  <EntryTitle entry={entry} onOpenLink={onOpenLink} />
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
    const { history, openArticle, sources, activeSourceId } = useAppStore()
    const activeSource = sources.find((s) => s.id === activeSourceId)

    /** 期号条目（工厂默认卡片）：遵循「布局」显示字段（compact 精简为行式、magazine 首条加大）。 */
    function renderItem(
      a: Article,
      _i: number,
      mode: FeedItemMode,
      gates: FeedGates,
      delay: number
    ): JSX.Element {
      const read = history[a.guid]?.read ?? false
      const sourceName = sources.find((s) => s.id === a.sourceId)?.name ?? ''
      return (
        <button
          key={a.guid}
          className={`juya-feed-item${mode === 'featured' ? ' juya-feed-featured' : ''}`}
          style={{ animationDelay: `${delay}ms` }}
          onClick={() => void openArticle(a)}
        >
          {gates.cover && a.coverUrl && (
            <img className="juya-feed-cover" src={a.coverUrl} alt="" loading="lazy" />
          )}
          <span className="juya-feed-body">
            <span className="juya-feed-title">{a.title}</span>
            {gates.summary && a.summary && <span className="juya-feed-summary">{a.summary}</span>}
            <span className="juya-feed-meta">
              {!read && <span className="juya-feed-read-dot" aria-hidden />}
              {gates.pubDate && (
                <span>
                  {new Date(a.pubDate).toLocaleString('zh-CN', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}
                </span>
              )}
              {gates.source && sourceName && <span className="juya-feed-source">{sourceName}</span>}
            </span>
          </span>
        </button>
      )
    }

    return (
      <FeedShell
        articles={articles}
        variantId={variantId}
        variantClass={variantClass}
        layout={layout}
        scene={feedScene?.({ name: activeSource?.name ?? '', url: activeSource?.url ?? '' })}
        renderItem={renderItem}
      />
    )
  }

  return { IssueView, FeedList }
}
