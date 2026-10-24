import { sourceHostname } from './shared'

interface SynthwaveFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** 订阅页头版 nameplate（#73）：内容层，浮于既有落日/透视网格场景装饰底之上（共存裁决，不互斥）。
 *  host 经共享 sourceHostname 从真实源 URL 派生；期号日期仍留在各自卡片上，头版内无日期。 */
export function SynthwaveFeedMasthead({ sourceName, sourceUrl }: SynthwaveFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jysynth-feed-masthead">
      <p className="jysynth-feed-masthead-kicker">订阅源</p>
      <h1>{sourceName}</h1>
      {hostname && <p className="jysynth-feed-masthead-domain">{hostname}</p>}
    </div>
  )
}
