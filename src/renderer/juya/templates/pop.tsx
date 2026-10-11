import { EntryTitle, ImageGrid, Lead, LinksBlock, OverviewItems, Paragraphs } from './shared'
import { DefaultFeedItem, FeedShell } from './parts'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { useAppStore } from '../../stores/useAppStore'

const VARIANT_CLASS = 'jypop'

/** 期号数字（审计建议②b-a）：JuyaIssue 无独立期号字段（parseJuyaIssue 核实 2026-10-11），
 *  期头 h1 形如「AI 早报 2026-08-28」，取其中日期渲染 MM.DD；期头无日期时回退 pubDate，
 *  均无法解析则返回 null（调用方条件渲染，不塌）。 */
function issueNoOf(heading: string, pubDate: string): string | null {
  const m =
    /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(heading) ??
    /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(pubDate)
  if (!m) return null
  return `${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}`
}

/** 波普艺术式（第二轮定制排版）：每栏目首条大图通栏（hero），其余图片 Ben-Day 海报网格，
 *  序号徽章放大为绝对定位角标（与三色系轮换同为构成语言）。 */
function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  const issueNo = issueNoOf(issue.heading || article.title, article.pubDate)
  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <div className="juya-issue">
        {/* 2026-10-11 用户指令：刊头由单方块改多色矩形拼贴（品红标题面板 + 荧光黄期号面板 +
            黑色 Ben-Day 色带，蓝色沟槽分隔），全部矩形收在 .juya-masthead 盒内不外溢正文 */}
        <header className="juya-masthead">
          <div className="jypop-title-panel">
            <h1>{issue.heading || article.title}</h1>
          </div>
          {issueNo && (
            <div className="jypop-issue-panel">
              <span className="jypop-issue-no" aria-hidden="true">
                {issueNo}
              </span>
            </div>
          )}
          <div className="jypop-strip" aria-hidden="true" />
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
                {entry.images.length > 0 && (
                  <ImageGrid images={entry.images} mode={i === 0 ? 'hero' : 'grid'} />
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

export const popTemplate: JuyaTemplate = { IssueView, FeedList }
