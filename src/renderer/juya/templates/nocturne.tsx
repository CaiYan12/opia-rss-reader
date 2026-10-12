import { EntryTitle, ImageGrid, Lead, LinksBlock, OverviewItems, Paragraphs } from './shared'
import { DefaultFeedItem, FeedShell, Scene } from './parts'
import type { JuyaEntry } from '../parseJuyaIssue'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { useAppStore } from '../../stores/useAppStore'

const VARIANT_CLASS = 'jynoct'

/** 右列最多容纳的图片张数；第 3 张及以后回流为正文下方通栏（#8 决策 13）。
 *  仅本文件消费（`NocturneEntrySplit` 内切片），故不导出 —— 导出会误导为公共契约。 */
const NOCTURNE_FIGURE_LIMIT = 2

/** nocturne 专属图文并排骨架（#8）：在模板内组合 shared.tsx 原子层，**零共享层改动**
 *  （共享 EntrySplit 无「右列限 N 张」参数，改它会波及 y2k / editorial）。
 *  与共享 EntrySplit 的差异只有一处：右列只取前 2 张 plate，剩余图回流到
 *  `.jynoct-overflow-media` 通栏图片带，顺序不变；`LinksBlock` 仍是条目尾部。
 *
 *  纪律签名保留：类名沿用 `juya-entry-split` / `juya-entry-row` / `juya-entry-body` /
 *  `juya-entry-figure`（既有 CSS 与 E2E 锚点），且**永不**加 `juya-entry-alt`——
 *  图恒在右、不左右交替。
 *
 *  几何实测结论（2026-10-12，#8 收口；集成侧串行 E2E 实测**已完成**，原「真值待实测」注释已过期）：
 *    · 坏链夹具（`tests/fixtures/juya-content.html` 的 6 张图全指向不可达的 assets.example.com，
 *      高度塌陷）：空洞 **145.8px**；
 *    · `nocturneSvg` 内联 SVG 图源（480×320 = 3:2，几何真实可复现）：空洞 **167px**。
 *    **票面「约 270px 降到约 100px 内」的目标未达成** —— 如实记录，不粉饰。原因（已定位）：
 *      溢出带 `.jynoct-overflow-media` 落在行**之下**（`juya-entry-row` 之后），填不上右列旁的
 *      空白；而空洞的定义就是「右列 2 张图高度 − 正文列高度」，把图移出行**不会**缩小右列高度，
 *      只是减少了堆在右列里的张数（4 张 → 2 张）。
 *    用户裁决（2026-10-12）：**保持通栏实现**（决策 13 形态不动），以实测值收口并记录该偏差。
 *    回归闸门见 `tests/e2e/reader.spec.ts` 的「已接受偏差的回归闸门」注释（引用 167px）。 */
export function NocturneEntrySplit({
  entry,
  onOpenLink
}: {
  entry: JuyaEntry
  onOpenLink: (href: string) => void
}): JSX.Element {
  const figureImages = entry.images.slice(0, NOCTURNE_FIGURE_LIMIT)
  const overflowImages = entry.images.slice(NOCTURNE_FIGURE_LIMIT)
  return (
    <article className="juya-entry juya-entry-split">
      <div className="juya-entry-row">
        <div className="juya-entry-body">
          <EntryTitle entry={entry} onOpenLink={onOpenLink} />
          {entry.lead && <Lead lead={entry.lead} />}
          <Paragraphs paragraphs={entry.paragraphs} />
        </div>
        {figureImages.length > 0 && (
          <div className="juya-entry-figure">
            <ImageGrid images={figureImages} mode="plate" />
          </div>
        )}
      </div>
      {/* 第 3 张及以后：通栏海报带（grid 模式自适应多列，1 张时退化为单幅通栏） */}
      {overflowImages.length > 0 && (
        <div className="jynoct-overflow-media">
          <ImageGrid images={overflowImages} mode="grid" />
        </div>
      )}
      <LinksBlock links={entry.links} onOpenLink={onOpenLink} />
    </article>
  )
}

/** 暗夜精修式（第二轮定制排版）：图文并排但图恒在右侧（纪律感不交替），
 *  题注等宽字体；序号退化为灰色 # 前缀小字（发丝线体系的一部分）。
 *  场景层（#2）：dust + nebula 两个纯氛围预设，挂在 .juya-issue 之前（与 y2k / dreamcore 同位，
 *  场景在内容之下 z-index 0）；色值/避让/降级全部在 juya.css 的 nocturne 段内。 */
function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <Scene dust nebula />
      <div className="juya-issue">
        <header className="juya-masthead">
          <h1>{issue.heading || article.title}</h1>
        </header>
        {issue.overview && <OverviewItems overview={issue.overview} onOpenLink={onOpenLink} />}
        {issue.sections.map((section) => (
          <section className="juya-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.entries.map((entry, i) => (
              <NocturneEntrySplit key={i} entry={entry} onOpenLink={onOpenLink} />
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

export const nocturneTemplate: JuyaTemplate = { IssueView, FeedList }
