import { sourceHostname } from './shared'

interface NewsprintFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** 订阅页头版（#72）：报刊报头——引导词 + 楷体大字源名 + host 信息行。
 *  只承载源身份，期号日期留在各卡片（与阅读页三栏刊头的日期行语义不互通）；
 *  host 派生走共享原子层单一来源（#68），空串与解析失败都不渲染 host 行。 */
export function NewsprintFeedMasthead({
  sourceName,
  sourceUrl
}: NewsprintFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jynews-feed-masthead">
      <p className="jynews-feed-masthead-kicker">订阅源</p>
      <h1>{sourceName}</h1>
      {hostname && <p className="jynews-feed-masthead-domain">{hostname}</p>}
    </div>
  )
}
