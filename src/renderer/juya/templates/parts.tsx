import type { CSSProperties } from 'react'
import type { Article, LayoutConfig } from '../../../shared/types'
import type { JuyaStyleVariantId } from '../juyaStyles'
import type { JuyaEntry } from '../parseJuyaIssue'
import { EntryTitle, ImageGrid, Lead, LinksBlock, Paragraphs, type JuyaMediaMode } from './shared'
import { useAppStore } from '../../stores/useAppStore'

/** 模板级构件：场景层、订阅页骨架、图文并排骨架、显示字段门控。
 *  与 shared.tsx 原子层的约定一致：文本 React 转义、链接 onOpenLink 拦截、图片懒加载。 */

/** 场景固定层：挂在 .juya-root 内、内容之下（z-index 0），不随正文滚动。
 *  动画一律挂 .juya-scene-* 子层（.juya-root 永无 animation，reduced-motion 断言结构保证）。 */
export function Scene({
  sun = false,
  grid,
  stars = false
}: {
  sun?: boolean
  grid?: 'persp' | 'horizon'
  stars?: boolean
}): JSX.Element | null {
  if (!sun && !grid && !stars) return null
  return (
    <div className="juya-scene" aria-hidden="true">
      {stars && <div className="juya-scene-stars" />}
      {sun && <div className="juya-scene-sun" />}
      {grid && <div className={`juya-scene-grid${grid === 'persp' ? ' juya-scene-grid-persp' : ''}`} />}
    </div>
  )
}

/** 显示字段门控（单一来源）：各风格 renderItem 必须经此判断 fields.* 显隐，
 *  防止多份抄写出现字段开关漂移（feed.spec fieldsoff 用例守护）。 */
export interface FeedGates {
  cover: boolean
  summary: boolean
  pubDate: boolean
  source: boolean
}

export type FeedItemMode = 'card' | 'compact' | 'featured'

export function feedFieldGates(fields: LayoutConfig['fields'], mode: FeedItemMode): FeedGates {
  return {
    cover: fields.cover || mode === 'featured',
    summary: mode !== 'compact' && (fields.summary || mode === 'featured'),
    pubDate: fields.pubDate,
    source: fields.source
  }
}

/** 订阅页布局骨架（单一来源）：预设分发（grid/compact/magazine）、--jy-cols 分列、
 *  入场 stagger、空态文案都在这里；各风格只注入 renderItem 决定卡片内部排布。
 *  显示字段门控由本骨架按模式计算后传给 renderItem。 */
export function FeedShell({
  articles,
  variantId,
  variantClass,
  layout,
  renderItem
}: {
  articles: Article[]
  variantId: JuyaStyleVariantId
  variantClass: string
  layout: LayoutConfig
  renderItem: (a: Article, i: number, mode: FeedItemMode, gates: FeedGates, delay: number) => JSX.Element
}): JSX.Element {
  const { preset, gridColumns } = layout
  const empty = articles.length === 0
  const gridProps = { '--jy-cols': gridColumns } as CSSProperties
  const delay = (i: number): number => Math.min(i, 10) * 40

  if (preset === 'magazine') {
    return (
      <div className={`juya-root ${variantClass}`} data-juya-variant={variantId}>
        <div className="juya-feed">
          {empty && <div className="juya-feed-empty">暂无内容，点击右上角刷新获取</div>}
          {articles[0] &&
            renderItem(articles[0], 0, 'featured', feedFieldGates(layout.fields, 'featured'), delay(0))}
          {articles.length > 1 && (
            <div className="juya-feed-grid" style={gridProps}>
              {articles
                .slice(1)
                .map((a, i) => renderItem(a, i + 1, 'card', feedFieldGates(layout.fields, 'card'), delay(i + 1)))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (preset === 'compact') {
    return (
      <div className={`juya-root ${variantClass}`} data-juya-variant={variantId}>
        <div className="juya-feed juya-feed-compact">
          {empty ? (
            <div className="juya-feed-empty">暂无内容，点击右上角刷新获取</div>
          ) : (
            articles.map((a, i) => renderItem(a, i, 'compact', feedFieldGates(layout.fields, 'compact'), delay(i)))
          )}
        </div>
      </div>
    )
  }
  return (
    <div className={`juya-root ${variantClass}`} data-juya-variant={variantId}>
      <div className="juya-feed juya-feed-grid" style={gridProps}>
        {empty ? (
          <div className="juya-feed-empty">暂无内容，点击右上角刷新获取</div>
        ) : (
          articles.map((a, i) => renderItem(a, i, 'card', feedFieldGates(layout.fields, 'card'), delay(i)))
        )}
      </div>
    </div>
  )
}

/** 图文并排骨架：正文（标题/导语/段落）与图（ImageGrid 指定模式）左右分栏，
 *  flip 时图右文左（追加 .juya-entry-alt）；相关链接通栏在下方。 */
export function EntrySplit({
  entry,
  onOpenLink,
  mediaMode = 'grid',
  flip = false
}: {
  entry: JuyaEntry
  onOpenLink: (href: string) => void
  mediaMode?: JuyaMediaMode
  flip?: boolean
}): JSX.Element {
  return (
    <article className={`juya-entry juya-entry-split${flip ? ' juya-entry-alt' : ''}`}>
      <div className="juya-entry-row">
        <div className="juya-entry-body">
          <EntryTitle entry={entry} onOpenLink={onOpenLink} />
          {entry.lead && <Lead lead={entry.lead} />}
          <Paragraphs paragraphs={entry.paragraphs} />
        </div>
        {entry.images.length > 0 && (
          <div className="juya-entry-figure">
            <ImageGrid images={entry.images} mode={mediaMode} />
          </div>
        )}
      </div>
      <LinksBlock links={entry.links} onOpenLink={onOpenLink} />
    </article>
  )
}

/** 默认期号卡片：多数风格的订阅页 renderItem 直接复用；个性化的风格在此基础上自写。 */
export function DefaultFeedItem({
  a,
  mode,
  gates,
  delay,
  onOpen
}: {
  a: Article
  mode: FeedItemMode
  gates: FeedGates
  delay: number
  onOpen: () => void
}): JSX.Element {
  const { history, sources } = useAppStore()
  const read = history[a.guid]?.read ?? false
  const sourceName = sources.find((s) => s.id === a.sourceId)?.name ?? ''
  return (
    <button
      className={`juya-feed-item${mode === 'featured' ? ' juya-feed-featured' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onOpen}
    >
      {gates.cover && a.coverUrl && (
        <img className="juya-feed-cover" src={a.coverUrl} alt="" loading="lazy" />
      )}
      <span className="juya-feed-body">
        <span className="juya-feed-title">{a.title}</span>
        {gates.summary && a.summary && <span className="juya-feed-summary">{a.summary}</span>}
        <span className="juya-feed-meta">
          {!read && <span className="juya-feed-read-dot" aria-hidden />}
          {gates.pubDate && (
            <span>
              {new Date(a.pubDate).toLocaleString('zh-CN', {
                dateStyle: 'medium',
                timeStyle: 'short'
              })}
            </span>
          )}
          {gates.source && sourceName && <span className="juya-feed-source">{sourceName}</span>}
        </span>
      </span>
    </button>
  )
}

