import { type CSSProperties } from 'react'
import { makeJuyaTemplate } from './base'
import type { JuyaFeedProps, JuyaIssueProps, JuyaTemplate } from '../templateTypes'
import { EntryBlocks, EntryTitle, OverviewItems } from './shared'
import { NewsprintFeedMasthead } from './newsprint90s-feed-craft'
import { useAppStore } from '../../stores/useAppStore'

/** 90 年代报刊式：锚定真实 90 年代中文报刊语言——刊头（三栏报头）、栏目栏、
 *  宽窗口正文两栏、宋体系衬线。非现代 broadsheet hairline 模板。
 *
 *  结构分工（#26/#32）：订阅页非空时委托工厂 FeedList（骨架/预设/门控单一来源在 parts.tsx），
 *  本文件只覆盖阅读页 IssueView 与空态 —— 刊头需要真实三栏 DOM（左日期/中期号/右星期），
 *  伪元素做不到；空态需要「黑体标题 + 小字提示」两级真实元素。概览、栏目、条目仍走共享语义构件，
 *  视觉由 juya.css 的 jynews 段承担。
 *  订阅页头版（#72）：经工厂 feedScene 场景透传接线（T1 交付的契约）；空态走同一组件
 *  由 EmptyFeed 自渲染（头版是源身份锚点，不随列表清空消失），两条路径渲染同一 DOM 形态。 */
const factory = makeJuyaTemplate({
  variantClass: 'jynews',
  entryColumns: true,
  feedScene: (source) => <NewsprintFeedMasthead sourceName={source.name} sourceUrl={source.url} />
})

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
        {/* 刊头三栏：左日期 / 中期号标题 / 右星期；≤899 由 CSS 回落为居中堆叠（#32 与 900 双栏互斥）。
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
                <EntryTitle entry={entry} onOpenLink={onOpenLink} />
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

/** 空态（#32）：共享骨架 FeedShell 的空态是一整行字符串，无法拆成「黑体标题 + 小字提示」
 *  两级报纸公告，故本风格自渲染空态；非空仍委托工厂 FeedList（骨架/预设/门控单一来源）。
 *  容器类按预设复刻 FeedShell 的分发，让公告框继续吃 .juya-feed-grid 的列宽与
 *  `grid-column: 1 / -1` 通栏规则（compact/magazine 容器非网格，该声明惰性无效）。 */
function EmptyFeed({ variantId, layout }: Pick<JuyaFeedProps, 'variantId' | 'layout'>): JSX.Element {
  const { preset, gridColumns } = layout
  const { sources, activeSourceId } = useAppStore()
  const activeSource = sources.find((source) => source.id === activeSourceId)
  const containerClass =
    preset === 'compact'
      ? 'juya-feed juya-feed-compact'
      : preset === 'magazine'
        ? 'juya-feed'
        : 'juya-feed juya-feed-grid'
  const gridStyle = preset === 'grid' ? ({ '--jy-cols': gridColumns } as CSSProperties) : undefined
  return (
    <div className="juya-root jynews" data-juya-variant={variantId}>
      {/* 头版（#72）与工厂路径同位：.juya-root 直接子元素、列表容器之前 —— 取值口径
          （活跃订阅源，取不到为空串）与工厂 feedScene 的透传一致 */}
      <NewsprintFeedMasthead
        sourceName={activeSource?.name ?? ''}
        sourceUrl={activeSource?.url ?? ''}
      />
      <div className={containerClass} style={gridStyle}>
        <div className="juya-feed-empty">
          <strong>暂无内容</strong>
          <span>点击右上角刷新获取</span>
        </div>
      </div>
    </div>
  )
}

function FeedList({ articles, variantId, layout }: JuyaFeedProps): JSX.Element {
  if (articles.length === 0) return <EmptyFeed variantId={variantId} layout={layout} />
  return <factory.FeedList articles={articles} variantId={variantId} layout={layout} />
}

export const newsprint90sTemplate: JuyaTemplate = { IssueView, FeedList }
