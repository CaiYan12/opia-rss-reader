import { EntryTitle, ImageGrid, Lead, LinksBlock, OverviewItems, Paragraphs } from './shared'
import { DefaultFeedItem, FeedShell, Scene } from './parts'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { useAppStore } from '../../stores/useAppStore'

const VARIANT_CLASS = 'jysynth'

/** 蒸汽梦核式（styleId `synthwave`，2026-10-22 由 `dreamcore` 更名，界面名不变）：
 *  synthwave 场景（条纹太阳 + 透视霓虹网格，Scene 固定层），
 *  条目首图通栏 21/9 + 其余两列子网格（hero 媒体），毛玻璃卡片即文字遮罩。 */
function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <Scene sun grid="persp" />
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
                <Paragraphs paragraphs={entry.paragraphs} />
                {entry.images.length > 0 && <ImageGrid images={entry.images} mode="hero" />}
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

export const synthwaveTemplate: JuyaTemplate = { IssueView, FeedList }
