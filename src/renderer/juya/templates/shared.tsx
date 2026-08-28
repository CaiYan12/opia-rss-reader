import type { JuyaEntry, JuyaOverviewEntry } from '../parseJuyaIssue'

/** 语义层共享构件：只负责「语义模型 → 安全的 React 元素」映射（文本经 React 转义，
 *  链接经 onOpenLink 拦截，图片懒加载）。版式差异由各风格模板的组合方式与 CSS 承担。 */

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
            <a
              href={o.href}
              onClick={(e) => {
                e.preventDefault()
                onOpenLink(o.href as string)
              }}
            >
              {o.title}
            </a>
          ) : (
            <span>{o.title}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** 条目正文块：段落 + 图片（懒加载）+ 相关链接 */
export function EntryBlocks({
  entry,
  onOpenLink
}: {
  entry: JuyaEntry
  onOpenLink: (href: string) => void
}): JSX.Element {
  return (
    <>
      {entry.lead && <blockquote className="juya-lead">{entry.lead}</blockquote>}
      {entry.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {entry.images.length > 0 && (
        <div className="juya-media">
          {entry.images.map((img, i) => (
            <img key={i} src={img.src} alt={img.alt} loading="lazy" />
          ))}
        </div>
      )}
      {entry.links.length > 0 && (
        <>
          <p className="juya-links-label">相关链接</p>
          <ul className="juya-links">
            {entry.links.map((l, i) => (
              <li key={i}>
                <a
                  href={l.href}
                  onClick={(e) => {
                    e.preventDefault()
                    onOpenLink(l.href)
                  }}
                >
                  {l.text}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
