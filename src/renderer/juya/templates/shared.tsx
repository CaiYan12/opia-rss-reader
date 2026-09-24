import type { ReactNode } from 'react'
import type { JuyaEntry, JuyaImage, JuyaLink, JuyaOverviewEntry } from '../parseJuyaIssue'

/** 语义层共享构件：只负责「语义模型 → 安全的 React 元素」映射（文本经 React 转义，
 *  链接经 onOpenLink 拦截，图片懒加载）。版式差异由各风格模板的组合方式与 CSS 承担。
 *  原子层（SafeLink/EntryTitle/Lead/Paragraphs/ImageGrid/LinksBlock）供手写定制模板组合；
 *  组合层（OverviewItems/EntryBlocks）维持原行为，工厂与 newsprint90s 继续引用。 */

/** 唯一合法的链接出口：拦截默认跳转，统一走 onOpenLink（外链设置：系统浏览器/内置标签）。 */
export function SafeLink({
  href,
  className,
  children,
  onOpenLink
}: {
  href: string
  className?: string
  children: ReactNode
  onOpenLink: (href: string) => void
}): JSX.Element {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        onOpenLink(href)
      }}
    >
      {children}
    </a>
  )
}

/** 条目标题（h3 + 编号徽章，徽章保留 # 前缀——reader.spec 锚点） */
export function EntryTitle({
  entry,
  onOpenLink
}: {
  entry: JuyaEntry
  onOpenLink: (href: string) => void
}): JSX.Element {
  return (
    <h3>
      {entry.titleLink ? (
        <SafeLink href={entry.titleLink} onOpenLink={onOpenLink}>
          {entry.title}
        </SafeLink>
      ) : (
        entry.title
      )}
      {entry.index && <span className="juya-index">#{entry.index}</span>}
    </h3>
  )
}

/** 导语引用块 */
export function Lead({ lead }: { lead: string }): JSX.Element {
  return <blockquote className="juya-lead">{lead}</blockquote>
}

/** 正文段落 */
export function Paragraphs({ paragraphs }: { paragraphs: string[] }): JSX.Element {
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  )
}

/** 图片容器模式：
 *  stack = 纵向堆叠（原行为）；grid = 自适应多列海报；
 *  hero = 首图通栏 21/9 + 其余子网格；plate = figure 题注装裱。 */
export type JuyaMediaMode = 'stack' | 'grid' | 'hero' | 'plate'

export function ImageGrid({
  images,
  mode = 'stack'
}: {
  images: JuyaImage[]
  mode?: JuyaMediaMode
}): JSX.Element {
  if (mode === 'plate') {
    return (
      <div className="juya-media juya-media-plate">
        {images.map((img, i) => (
          <figure className="juya-plate" key={i}>
            <img src={img.src} alt={img.alt} loading="lazy" />
            {img.alt && <figcaption>{img.alt}</figcaption>}
          </figure>
        ))}
      </div>
    )
  }
  const cls = mode === 'stack' ? 'juya-media' : `juya-media juya-media-${mode}`
  return (
    <div className={cls}>
      {images.map((img, i) => (
        <img key={i} src={img.src} alt={img.alt} loading="lazy" />
      ))}
    </div>
  )
}

/** 「相关链接」块 */
export function LinksBlock({
  links,
  onOpenLink
}: {
  links: JuyaLink[]
  onOpenLink: (href: string) => void
}): JSX.Element | null {
  if (links.length === 0) return null
  return (
    <>
      <p className="juya-links-label">相关链接</p>
      <ul className="juya-links">
        {links.map((l, i) => (
          <li key={i}>
            <SafeLink href={l.href} onOpenLink={onOpenLink}>
              {l.text}
            </SafeLink>
          </li>
        ))}
      </ul>
    </>
  )
}

export function OverviewItems({
  overview,
  onOpenLink
}: {
  overview: JuyaOverviewEntry[]
  onOpenLink: (href: string) => void
}): JSX.Element {
  return (
    <ul className="juya-overview">
      {overview.map((o, i) => (
        <li key={i}>
          {o.index && <span className="juya-index">{o.index}</span>}
          {o.href ? (
            <SafeLink href={o.href} onOpenLink={onOpenLink}>
              {o.title}
            </SafeLink>
          ) : (
            <span>{o.title}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** 条目正文块：段落 + 图片（懒加载）+ 相关链接（stack 模式，工厂/newsprint90s 用） */
export function EntryBlocks({
  entry,
  onOpenLink
}: {
  entry: JuyaEntry
  onOpenLink: (href: string) => void
}): JSX.Element {
  return (
    <>
      {entry.lead && <Lead lead={entry.lead} />}
      <Paragraphs paragraphs={entry.paragraphs} />
      {entry.images.length > 0 && <ImageGrid images={entry.images} />}
      <LinksBlock links={entry.links} onOpenLink={onOpenLink} />
    </>
  )
}
