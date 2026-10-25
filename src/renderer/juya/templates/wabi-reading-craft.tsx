interface WabiReadingMastheadProps {
  heading: string
  pubDate: string
}

function publicationDate(pubDate: string): { machine: string; label: string } | null {
  const date = new Date(pubDate)
  if (!Number.isFinite(date.getTime())) return null

  return {
    machine: date.toISOString(),
    label: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  }
}

export function WabiReadingMasthead({ heading, pubDate }: WabiReadingMastheadProps): JSX.Element {
  const date = publicationDate(pubDate)

  return (
    <header className="juya-masthead wabi-reading-craft-masthead">
      <h1 className="wabi-reading-craft-title">{heading}</h1>
      {date && (
        <time className="wabi-reading-craft-date" dateTime={date.machine}>
          {date.label}
        </time>
      )}
      <svg
        className="wabi-reading-craft-rubbing"
        viewBox="0 0 760 120"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          className="wabi-reading-craft-rubbing-body"
          d="M8 79C20 67 31 61 43 65C58 70 67 62 80 59C95 56 103 66 116 70C130 74 141 63 154 67C165 71 172 73 180 79C174 87 164 89 154 86C141 82 134 93 121 93C108 93 101 84 89 87C77 90 68 98 57 93C44 88 36 98 24 95C15 93 10 99 6 91ZM194 75C207 63 219 59 233 63C247 67 257 62 270 57C284 52 296 62 309 68C321 73 334 69 348 64C364 58 378 66 392 68C407 70 418 63 432 70C442 75 450 80 457 86C448 92 438 93 427 88C414 82 404 95 390 94C376 94 365 87 351 90C337 94 326 85 312 88C298 91 289 99 275 95C261 91 250 84 236 90C223 95 212 88 200 89C191 88 186 81 194 75ZM475 77C487 68 499 63 512 67C526 71 536 63 549 58C563 52 575 61 588 66C601 71 614 68 628 63C644 57 657 64 670 67C683 70 694 63 707 59C724 54 738 61 753 55L750 80C739 84 730 80 719 87C707 94 696 86 684 89C670 94 660 84 647 88C633 92 624 82 611 85C596 90 587 82 574 87C560 92 550 84 537 89C524 94 511 85 499 90C487 94 478 89 470 85Z"
        />
        <path
          className="wabi-reading-craft-rubbing-groove"
          d="M17 86C27 77 34 76 44 80M60 81L69 85L82 77M102 79C110 73 118 75 128 80M149 75L160 79M204 77C214 69 222 70 231 75M253 76L266 70M292 76C302 71 308 72 318 78M344 75L355 79M382 78C392 69 401 70 409 75M436 81L447 77M482 78C491 71 498 72 507 77M531 76L544 71M577 73C586 66 594 68 603 73M623 74L637 68M669 72C678 65 686 66 694 71M720 67L738 62"
        />
        <path
          className="wabi-reading-craft-rubbing-scratch"
          d="M28 65L35 61M76 98L82 92M121 59L131 63M212 57L220 53M247 97L255 92M300 56L307 52M371 61L379 57M407 101L414 96M467 58L473 53M514 100L521 95M556 54L564 50M600 95L607 90M644 54L651 50M681 98L688 93M713 48L720 43M739 91L744 86"
        />
      </svg>
    </header>
  )
}
