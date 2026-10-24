import { sourceHostname } from './shared'

interface WabiFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** Feed identity stays source-scoped; issue dates remain on their own cards. */
export function WabiFeedMasthead({ sourceName, sourceUrl }: WabiFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="wabi-feed-masthead">
      <div className="wabi-feed-masthead-copy">
        <p className="wabi-feed-masthead-kicker">订阅源</p>
        <h1>{sourceName}</h1>
      </div>
      {hostname && <p className="wabi-feed-masthead-domain">{hostname}</p>}
      <span className="wabi-feed-rubbing" aria-hidden="true" />
    </div>
  )
}
