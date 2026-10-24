import { sourceHostname } from './shared'

interface FolioFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** Feed identity stays source-scoped; issue dates remain on their own cards.
 *  信笺刊头：书眉式引导词 + 衬线大字源名 + 朱菱花押（复用 .jyfolio-divider 语汇）+ host 信息行，
 *  居中信笺排法由 juya.css folio 分节承担；头版不承载期号日期。 */
export function FolioFeedMasthead({ sourceName, sourceUrl }: FolioFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jyfolio-feed-masthead">
      <p className="jyfolio-feed-masthead-kicker">订阅源</p>
      <h1>{sourceName}</h1>
      {hostname && (
        <>
          <div className="jyfolio-divider" aria-hidden="true">
            <span />
          </div>
          <p className="jyfolio-feed-masthead-domain">{hostname}</p>
        </>
      )}
    </div>
  )
}
