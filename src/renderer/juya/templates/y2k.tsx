import { OverviewItems } from './shared'
import { DefaultFeedItem, EntrySplit, FeedShell, Scene } from './parts'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { useAppStore } from '../../stores/useAppStore'

const VARIANT_CLASS = 'jyy2k'

/** 千禧网页式（第二轮定制排版）：窗口化刊头（CSS 伪元素标题栏）+ 条目图文并排交替（EntrySplit），
 *  暗侧星空场景 + 地平网格（Scene 固定层；亮侧 Scene 由 CSS 隐藏，保留原有星光渐变）。 */
function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <Scene stars grid="horizon" />
      <div className="juya-issue">
        <header className="juya-masthead">
          <h1>{issue.heading || article.title}</h1>
        </header>
        {issue.overview && <OverviewItems overview={issue.overview} onOpenLink={onOpenLink} />}
        {issue.sections.map((section) => (
          <section className="juya-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.entries.map((entry, i) => (
              <EntrySplit key={i} entry={entry} onOpenLink={onOpenLink} mediaMode="grid" flip={i % 2 === 1} />
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

export const y2kTemplate: JuyaTemplate = { IssueView, FeedList }
