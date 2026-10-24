import { sourceHostname } from './shared'

interface EditorialFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** Feed identity stays source-scoped; issue dates remain on their own cards. */
export function EditorialFeedMasthead({ sourceName, sourceUrl }: EditorialFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jyedit-feed-masthead">
      <p className="jyedit-feed-masthead-kicker">订阅源</p>
      <h1>{sourceName}</h1>
      {hostname && <p className="jyedit-feed-masthead-domain">{hostname}</p>}
    </div>
  )
}
