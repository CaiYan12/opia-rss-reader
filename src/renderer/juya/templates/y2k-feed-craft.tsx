import { sourceHostname } from './shared'

interface Y2kFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** Feed identity stays source-scoped; issue dates remain on their own cards. */
export function Y2kFeedMasthead({ sourceName, sourceUrl }: Y2kFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jyy2k-feed-masthead">
      <p className="jyy2k-feed-masthead-kicker">订阅源</p>
      <h1>{sourceName}</h1>
      {hostname && <p className="jyy2k-feed-masthead-domain">{hostname}</p>}
    </div>
  )
}
