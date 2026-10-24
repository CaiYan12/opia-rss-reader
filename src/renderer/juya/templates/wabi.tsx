import { EntryTitle, Lead, LinksBlock, OverviewItems } from './shared'
import { FeedShell } from './parts'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { useAppStore } from '../../stores/useAppStore'
import { WabiFeedMasthead } from './wabi-feed-craft'

const VARIANT_CLASS = 'jywabi'

/** 侘寂日杂式：用原文内容块维持段落与图版的连续阅读顺序。 */
function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <div className="juya-issue">
        <header className="juya-masthead">
          <h1>{issue.heading || article.title}</h1>
        </header>
        {issue.overview && <OverviewItems overview={issue.overview} onOpenLink={onOpenLink} />}
        {issue.sections.map((section) => (
          <section className="juya-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.entries.map((entry, i) => (
              <article className="juya-entry" key={i}>
                <EntryTitle entry={entry} onOpenLink={onOpenLink} />
                {entry.lead && <Lead lead={entry.lead} />}
                {entry.blocks.map((block, blockIndex) =>
                  block.kind === 'p' ? (
                    <p key={`p-${blockIndex}`}>{block.text}</p>
                  ) : (
                    <figure className="jywabi-figure" key={`img-${blockIndex}`}>
                      <img src={block.image.src} alt={block.image.alt} loading="lazy" />
                      {block.image.alt && <figcaption>{block.image.alt}</figcaption>}
                    </figure>
                  )
                )}
                <LinksBlock links={entry.links} onOpenLink={onOpenLink} />
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

function FeedList({ articles, variantId, layout }: JuyaFeedProps): JSX.Element {
  const { openArticle, history, sources, activeSourceId } = useAppStore()
  const activeSource = sources.find((source) => source.id === activeSourceId)
  return (
    <FeedShell
      articles={articles}
      variantId={variantId}
      variantClass={VARIANT_CLASS}
      layout={layout}
      scene={
        <WabiFeedMasthead
          sourceName={activeSource?.name ?? ''}
          sourceUrl={activeSource?.url ?? ''}
        />
      }
      renderItem={(a, _i, mode, gates, delay) => {
        const read = history[a.guid]?.read ?? false
        const sourceName = sources.find((source) => source.id === a.sourceId)?.name ?? ''
        const hasMeta = !read || gates.pubDate || (gates.source && sourceName)
        return (
          <button
            type="button"
            className={`juya-feed-item${mode === 'featured' ? ' juya-feed-featured' : ''}`}
            style={{ animationDelay: `${delay}ms` }}
            onClick={() => void openArticle(a)}
          >
            <span className="juya-feed-body">
              {hasMeta && (
                <span className={`juya-feed-meta${!read ? ' juya-feed-meta-unread' : ''}`}>
                  {!read && <span className="juya-feed-read-dot" aria-hidden />}
                  {gates.pubDate && (
                    <span className="juya-feed-date">
                      {new Date(a.pubDate).toLocaleString('zh-CN', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </span>
                  )}
                  {gates.source && sourceName && (
                    <span className="juya-feed-source">{sourceName}</span>
                  )}
                </span>
              )}
              <span className="juya-feed-title">{a.title}</span>
            </span>
            {gates.cover && a.coverUrl && (
              <img className="juya-feed-cover" src={a.coverUrl} alt="" loading="lazy" />
            )}
            {gates.summary && a.summary && <span className="juya-feed-summary">{a.summary}</span>}
          </button>
        )
      }}
    />
  )
}

export const wabiTemplate: JuyaTemplate = { IssueView, FeedList }
