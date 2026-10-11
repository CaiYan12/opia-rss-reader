import { Fragment } from 'react'
import { EntryTitle, Lead, LinksBlock, OverviewItems } from './shared'
import { DefaultFeedItem, FeedShell } from './parts'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import type { JuyaEntry, JuyaImage } from '../parseJuyaIssue'
import { useAppStore } from '../../stores/useAppStore'

const VARIANT_CLASS = 'jyfolio'

/** 纸感精读式（第二轮定制排版）：刊头两端排布（标题 + 竖排日期）+ 朱色短粗线与印章水印，
 *  概览两列目录（点状引线），条目不装卡片直接写在纸上；信纸横格下沉到正文段落
 *  （行高=格距 28px 天然对齐）+ 段首缩进两字符，朱丝栏叠在内容区背景。
 *  图文由内容流 blocks 驱动：首图升为开卷通栏图（紧跟导语/标题），其余图随文走、
 *  按出现顺序窄幅左/右交替错位，题注居中。 */

/** 装裱图（plate）：方角画框 + 居中题注，懒加载 */
function Plate({ image, className }: { image: JuyaImage; className?: string }): JSX.Element {
  return (
    <figure className={className ? `juya-plate ${className}` : 'juya-plate'}>
      <img src={image.src} alt={image.alt} loading="lazy" />
      {image.alt && <figcaption>{image.alt}</figcaption>}
    </figure>
  )
}

/** 条目正文流：段落与图片按文档顺序交织；首图脱离原位升为开卷图 */
function EntryFlow({ entry }: { entry: JuyaEntry }): JSX.Element {
  const coverBlock = entry.blocks.find((b) => b.kind === 'img')
  return (
    <>
      {coverBlock?.kind === 'img' && <Plate image={coverBlock.image} />}
      {entry.blocks.map((b, i) => {
        if (b === coverBlock) return null
        if (b.kind === 'p') return <p key={i}>{b.text}</p>
        // 其余插图：按该图之前的插图数定奇偶 → 窄幅左/右交替
        const insetsBefore = entry.blocks.slice(0, i).filter((x) => x.kind === 'img' && x !== coverBlock).length
        return (
          <Plate
            key={i}
            image={b.image}
            className={insetsBefore % 2 === 0 ? 'jyfolio-plate-inset' : 'jyfolio-plate-inset jyfolio-plate-right'}
          />
        )
      })}
    </>
  )
}

function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <div className="juya-issue">
        <header className="juya-masthead">
          <h1>{issue.heading || article.title}</h1>
          <span className="juya-date-line">
            {new Date(article.pubDate).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            })}
          </span>
        </header>
        {issue.overview && <OverviewItems overview={issue.overview} onOpenLink={onOpenLink} />}
        {issue.sections.map((section) => (
          <section className="juya-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.entries.map((entry, i) => (
              <Fragment key={i}>
                {/* 书尾花押式分隔符：仅同栏目相邻条目之间（i>0）渲染，细线—朱菱—细线 */}
                {i > 0 && (
                  <div className="jyfolio-divider" aria-hidden="true">
                    <span />
                  </div>
                )}
                <article className="juya-entry">
                  <EntryTitle entry={entry} onOpenLink={onOpenLink} />
                  {entry.lead && <Lead lead={entry.lead} />}
                  <EntryFlow entry={entry} />
                  <LinksBlock links={entry.links} onOpenLink={onOpenLink} />
                </article>
              </Fragment>
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

export const folioTemplate: JuyaTemplate = { IssueView, FeedList }
