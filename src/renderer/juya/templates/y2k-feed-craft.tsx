import { sourceHostname } from './shared'

interface Y2kFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** 订阅页头版（#70 打样 → #76 窗口拟真化）：像素浮雕 plaque + 顶部窗口标题栏。
 *  标题栏必须是真实 DOM 元素（伪元素 content 无法承载逐订阅源动态源名），以
 *  `◆ <源名>.EXE — 运行中` 呈现窗口标题（与阅读页伪标题栏同语法），右端 _ □ ×
 *  三钮为装饰 span 非控件；整栏 aria-hidden 对辅助技术静默（源名只在 h1 朗读一次）。
 *  期号日期留在各自卡片；V1 的铬字渐变 h1、像素浮雕窗体、monospace host 全部保留。 */
export function Y2kFeedMasthead({ sourceName, sourceUrl }: Y2kFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jyy2k-feed-masthead">
      <div className="jyy2k-feed-masthead-titlebar" aria-hidden="true">
        <span className="jyy2k-feed-masthead-titlebar-title">◆ {sourceName}.EXE — 运行中</span>
        <span className="jyy2k-feed-masthead-titlebar-btn">_</span>
        <span className="jyy2k-feed-masthead-titlebar-btn">□</span>
        <span className="jyy2k-feed-masthead-titlebar-btn jyy2k-feed-masthead-titlebar-btn-close">
          ×
        </span>
      </div>
      <p className="jyy2k-feed-masthead-kicker">订阅源</p>
      <h1>{sourceName}</h1>
      {hostname && <p className="jyy2k-feed-masthead-domain">{hostname}</p>}
    </div>
  )
}
