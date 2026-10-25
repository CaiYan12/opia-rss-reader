import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { JuyaEntry, JuyaImage, JuyaLink, JuyaOverviewEntry } from '../parseJuyaIssue'
import { scrollToEntry } from '../scrollToEntry'

/** 语义层共享构件：只负责「语义模型 → 安全的 React 元素」映射（文本经 React 转义，
 *  链接经 onOpenLink 拦截，图片懒加载）。版式差异由各风格模板的组合方式与 CSS 承担。
 *  原子层（SafeLink/EntryTitle/Lead/Paragraphs/ImageGrid/LinksBlock）供手写定制模板组合；
 *  组合层（OverviewItems/EntryBlocks）维持原行为，工厂与 newsprint90s 继续引用。 */

/** 从订阅源 URL 派生 hostname（订阅页头版单一来源，#68 收敛 wabi/editorial 打样期两份本地副本）。
 *  空串与解析失败都返回空串，调用方据空值决定是否渲染 host 行。 */
export function sourceHostname(sourceUrl: string): string {
  if (!sourceUrl) return ''
  try {
    return new URL(sourceUrl).hostname
  } catch {
    return ''
  }
}

/** 唯一合法的链接出口：拦截默认跳转，统一走 onOpenLink（外链设置：系统浏览器/内置标签）。 */
export function SafeLink({
  href,
  className,
  children,
  onOpenLink,
  ariaLabel
}: {
  href: string
  className?: string
  children: ReactNode
  onOpenLink: (href: string) => void
  ariaLabel?: string
}): JSX.Element {
  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault()
        onOpenLink(href)
      }}
    >
      {children}
    </a>
  )
}

/** 条目标题（h3 + 编号徽章，徽章保留 # 前缀——reader.spec 锚点）。
 *  条目锚点由 overviewAnchors 注入：id 供概览标题跳转，tabIndex=-1 让跳转后焦点落在标题上。 */
export function EntryTitle({
  entry,
  onOpenLink
}: {
  entry: JuyaEntry
  onOpenLink: (href: string) => void
}): JSX.Element {
  return (
    <h3 id={entry.anchorId} tabIndex={entry.anchorId ? -1 : undefined}>
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

/** 「相关链接」块。
 *  icon：外链箭头改用 ArrowUpRight 图标（12px，装饰性故 aria-hidden），并给链接挂
 *  `.juya-link-icon` 供变体样式接管；基础层 `.juya-links a::after` 的文本 ↗ 由变体 CSS 关闭。
 *  不传时 DOM 与观感与改造前完全一致。 */
export function LinksBlock({
  links,
  onOpenLink,
  icon = false
}: {
  links: JuyaLink[]
  onOpenLink: (href: string) => void
  icon?: boolean
}): JSX.Element | null {
  if (links.length === 0) return null
  return (
    <>
      <p className="juya-links-label">相关链接</p>
      <ul className="juya-links">
        {links.map((l, i) => (
          <li key={i}>
            <SafeLink
              href={l.href}
              className={icon ? 'juya-link-icon' : undefined}
              onOpenLink={onOpenLink}
            >
              {l.text}
              {icon && <ArrowUpRight size={12} aria-hidden />}
            </SafeLink>
          </li>
        ))}
      </ul>
    </>
  )
}

/** 外链图标（用户提供的 1024 视图框素材；填充改 currentColor，随各主题链接色）。
 *  装饰性图形：可访问名由外层链接的 aria-label 提供。 */
function ExternalLinkIcon(): JSX.Element {
  return (
    <svg className="juya-overview-ext-icon" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
      <path
        d="M384 128v85.333H170.667v597.334h682.666v-384h85.334v426.666A42.667 42.667 0 0 1 896 896H128a42.667 42.667 0 0 1-42.667-42.667V170.667A42.667 42.667 0 0 1 128 128h256z m298.667 85.333V42.667l298.666 256h-384A85.333 85.333 0 0 0 512 384v256h-85.333V384a170.667 170.667 0 0 1 170.666-170.667h85.334z"
        fill="currentColor"
      />
    </svg>
  )
}

/** 概览目录：标题跳至页内对应条目（仅唯一命中时），末尾图标打开原文外链。
 *  两个动作分成两个链接：标题是页内锚点，图标是新窗口外链——互不吞掉对方的默认行为。 */
export function OverviewItems({
  overview,
  onOpenLink
}: {
  overview: JuyaOverviewEntry[]
  onOpenLink: (href: string) => void
}): JSX.Element {
  return (
    <ul className="juya-overview">
      {overview.map((o, i) => {
        const anchorId = o.anchorId ?? null
        return (
          <li key={i}>
            {o.index && <span className="juya-index">{o.index}</span>}
            <span className="juya-overview-text">
              {anchorId ? (
                <a
                  className="juya-overview-jump"
                  href={`#${anchorId}`}
                  onClick={(e) => {
                    e.preventDefault()
                    const root = e.currentTarget.closest('.juya-root')
                    const target = root?.querySelector<HTMLElement>(`#${anchorId}`)
                    if (target) scrollToEntry(target)
                  }}
                  // 中键的默认动作不经过 click：这里一并拦掉，避免绕过 24px 落点/焦点转移
                  onAuxClick={(e) => e.preventDefault()}
                >
                  {o.title}
                </a>
              ) : (
                o.title
              )}
              {o.href && (
                <SafeLink
                  className="juya-overview-ext"
                  href={o.href}
                  ariaLabel={`打开原文外链：${o.title}`}
                  onOpenLink={onOpenLink}
                >
                  <ExternalLinkIcon />
                </SafeLink>
              )}
            </span>
          </li>
        )
      })}
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
