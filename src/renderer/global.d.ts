import type { JSX as ReactJSX } from 'react'

declare global {
  namespace JSX {
    type Element = ReactJSX.Element
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          partition?: string
          allowpopups?: string
        },
        HTMLElement
      >
    }
    type ElementClass = ReactJSX.ElementClass
  }
}
