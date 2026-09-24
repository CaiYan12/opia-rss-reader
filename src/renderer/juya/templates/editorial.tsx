import { EntryTitle, ImageGrid, Lead, LinksBlock, OverviewItems, Paragraphs } from './shared'
import { DefaultFeedItem, EntrySplit, FeedShell } from './parts'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { useAppStore } from '../../stores/useAppStore'

const VARIANT_CLASS = 'jyedit'

/** 杂志编辑式（第二轮定制排版）：deck 副题 + 每栏目首条封面故事（图文并排图右 46%），
 *  条目间发丝线留白节奏，末尾 colophon 刊尾；颗粒与裁切角标为纸质细节。 */
function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <div className="juya-issue">
        <header className="juya-masthead">
          <h1>{issue.heading || article.title}</h1>
          <div className="juya-date-line">
            {new Date(article.pubDate).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            })}
          </div>
        </header>
        {article.summary && <p className="juya-deck">{article.summary}</p>}
        {issue.overview && <OverviewItems overview={issue.overview} onOpenLink={onOpenLink} />}
        {issue.sections.map((section) => (
          <section className="juya-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.entries.map((entry, i) =>
              i === 0 ? (
                <EntrySplit key={i} entry={entry} onOpenLink={onOpenLink} mediaMode="hero" />
              ) : (
                <article className="juya-entry" key={i}>
                  <EntryTitle entry={entry} onOpenLink={onOpenLink} />
                  {entry.lead && <Lead lead={entry.lead} />}
                  <Paragraphs paragraphs={entry.paragraphs} />
                  {entry.images.length > 0 && <ImageGrid images={entry.images} mode="plate" />}
                  <LinksBlock links={entry.links} onOpenLink={onOpenLink} />
                </article>
              )
            )}
          </section>
        ))}
        <footer className="juya-colophon">本期编辑 · 橘鸦日报 · {article.pubDate.slice(0, 10)}</footer>
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

export const editorialTemplate: JuyaTemplate = { IssueView, FeedList }
