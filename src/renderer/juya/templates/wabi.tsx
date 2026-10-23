import { EntryTitle, Lead, LinksBlock, OverviewItems } from './shared'
import { DefaultFeedItem, FeedShell } from './parts'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { useAppStore } from '../../stores/useAppStore'

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
  const { openArticle } = useAppStore()
  return (
    <FeedShell
      articles={articles}
      variantId={variantId}
      variantClass={VARIANT_CLASS}
      layout={layout}
      renderItem={(a, _i, mode, gates, delay) => (
        <DefaultFeedItem a={a} mode={mode} gates={gates} delay={delay} onOpen={() => void openArticle(a)} />
      )}
    />
  )
}

export const wabiTemplate: JuyaTemplate = { IssueView, FeedList }
