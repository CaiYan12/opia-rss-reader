import { makeJuyaTemplate } from './base'
import type { JuyaIssueProps, JuyaTemplate } from '../templateTypes'
import { EntryBlocks, OverviewItems } from './shared'

/** 90 年代报刊式：锚定真实 90 年代中文报刊语言——刊头（三栏报头）、栏目栏、
 *  宽窗口正文两栏、宋体系衬线。非现代 broadsheet hairline 模板。
 *
 *  结构分工（#26）：订阅页继续用工厂生成的 FeedList（骨架/预设/门控单一来源在 parts.tsx），
 *  本文件只覆盖阅读页 IssueView —— 刊头需要真实三栏 DOM（左日期/中期号/右星期），
 *  伪元素做不到；概览、栏目、条目仍走共享语义构件，视觉由 juya.css 的 jynews 段承担。 */
const factory = makeJuyaTemplate({ variantClass: 'jynews', entryColumns: true })

/** 刊头三段文字全部取自真实发布字段：日期与星期来自同一 pubDate（不编造期号/版次）。 */
function mastheadParts(pubDate: string): { date: string; weekday: string } {
  const d = new Date(pubDate)
  return {
    date: d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
    weekday: d.toLocaleDateString('zh-CN', { weekday: 'long' })
  }
}

function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  const { date, weekday } = mastheadParts(article.pubDate)
  return (
    <div className="juya-root jynews" data-juya-variant={variantId}>
      <div className="juya-issue">
        {/* 刊头三栏：左日期 / 中期号标题 / 右星期；≤900 由 CSS 回落为居中堆叠。
            日期线语义类保留：既有端到端用例以 .juya-date-line 定位日期行 */}
        <header className="juya-masthead">
          <div className="juya-date-line">{date}</div>
          <h1 className="juya-masthead-title">{issue.heading || article.title}</h1>
          <div className="juya-masthead-weekday">{weekday}</div>
        </header>
        {issue.overview && (
          /* 框线导读（#29）：概览包进上下 1px 框线块，小标必须是真实 DOM —
             伪元素 content 不进可访问性树，也无法被定位/复制。共享 OverviewItems 原样复用。 */
          <aside className="jynews-overview">
            <p className="jynews-overview-label">导读</p>
            <OverviewItems overview={issue.overview} onOpenLink={onOpenLink} />
          </aside>
        )}
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
                <div className="juya-entry-columns">
                  <EntryBlocks entry={entry} onOpenLink={onOpenLink} />
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

export const newsprint90sTemplate: JuyaTemplate = { IssueView, FeedList: factory.FeedList }
