import { EntryTitle, Lead, LinksBlock, OverviewItems } from './shared'
import { DefaultFeedItem, FeedShell } from './parts'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import type { JuyaEntry } from '../parseJuyaIssue'
import { useAppStore } from '../../stores/useAppStore'
import { useState } from 'react'

const VARIANT_CLASS = 'jyedit'

function EditorialEntry({
  entry,
  onOpenLink,
  sectionOpening = false
}: {
  entry: JuyaEntry
  onOpenLink: JuyaIssueProps['onOpenLink']
  sectionOpening?: boolean
}): JSX.Element {
  const [openingImageLayout, setOpeningImageLayout] = useState<'landscape' | 'stacked'>('stacked')
  const openingImage = sectionOpening ? entry.blocks.find((block) => block.kind === 'img') : undefined

  return (
    <article className="juya-entry">
      {sectionOpening ? (
        <div className="juya-editorial-opening" data-image-layout={openingImageLayout}>
          <div className="juya-editorial-opening-copy">
            <EntryTitle entry={entry} onOpenLink={onOpenLink} />
            {entry.lead && <Lead lead={entry.lead} />}
          </div>
          {openingImage?.kind === 'img' && (
            <figure className="juya-plate juya-editorial-opening-image">
              <img
                src={openingImage.image.src}
                alt={openingImage.image.alt}
                loading="lazy"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget
                  setOpeningImageLayout(naturalWidth / naturalHeight >= 1.3 ? 'landscape' : 'stacked')
                }}
              />
              {openingImage.image.alt && <figcaption>{openingImage.image.alt}</figcaption>}
            </figure>
          )}
        </div>
      ) : (
        <>
          <EntryTitle entry={entry} onOpenLink={onOpenLink} />
          {entry.lead && <Lead lead={entry.lead} />}
        </>
      )}
      {entry.blocks.map((block, i) =>
        block === openingImage ? null : block.kind === 'p' ? (
          <p key={i}>{block.text}</p>
        ) : (
          <figure className="juya-plate" key={i}>
            <img src={block.image.src} alt={block.image.alt} loading="lazy" />
            {block.image.alt && <figcaption>{block.image.alt}</figcaption>}
          </figure>
        )
      )}
      <LinksBlock links={entry.links} onOpenLink={onOpenLink} />
    </article>
  )
}

/** 杂志编辑式：正文段落与图片沿内容流呈现；条目间发丝线留白，末尾为 colophon 刊尾。 */
function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  const publicationDate = new Date(article.pubDate)
  const publicationDay = [
    String(publicationDate.getFullYear()).padStart(4, '0'),
    String(publicationDate.getMonth() + 1).padStart(2, '0'),
    String(publicationDate.getDate()).padStart(2, '0')
  ].join('-')

  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <div className="juya-issue">
        <header className="juya-masthead">
          <h1>{issue.heading || article.title}</h1>
          <div className="juya-date-line">
            {publicationDate.toLocaleDateString('zh-CN', {
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
            {section.entries.map((entry, i) => (
              <EditorialEntry key={i} entry={entry} onOpenLink={onOpenLink} sectionOpening={i === 0} />
            ))}
          </section>
        ))}
        <footer className="juya-colophon">本期编辑 · 橘鸦日报 · {publicationDay}</footer>
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
