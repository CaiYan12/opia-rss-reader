import { sourceHostname } from './shared'

interface PopFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** Feed identity stays source-scoped; issue dates remain on their own cards.
 *  波普印刷拼贴 nameplate：品红标题面板（kicker 贴纸 + 斜置大字源名）+ 奶油 host 面板 +
 *  底缘 Ben-Day 色带，浮在柔蓝沟槽底板上。语义顺序 kicker → 标题 → host；
 *  色带是唯一纯装饰（aria-hidden + pointer-events:none，CSS 同步兜底），
 *  头版无动画、无 hover 载体、无新增 Tab 停留点。 */
export function PopFeedMasthead({ sourceName, sourceUrl }: PopFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jypop-feed-masthead">
      <div className="jypop-feed-masthead-panel">
        <p className="jypop-feed-masthead-kicker">订阅源</p>
        <h1>{sourceName}</h1>
      </div>
      {hostname && (
        <div className="jypop-feed-masthead-side">
          <p className="jypop-feed-masthead-domain">{hostname}</p>
        </div>
      )}
      <span className="jypop-feed-masthead-strip" aria-hidden="true" />
    </div>
  )
}
