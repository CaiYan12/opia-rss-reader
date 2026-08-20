import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  tabId: string
  url: string
}

type WebviewElement = HTMLElement & {
  loadURL(url: string): Promise<void>
  goBack(): void
  canGoBack(): boolean
  getURL(): string
}

/** 内置浏览器标签：工具栏（返回/地址栏/使用浏览器打开）+ webview；页面标题同步到标签 */
export function BrowserPage({ tabId, url }: Props): JSX.Element {
  const setTabTitle = useAppStore((s) => s.setTabTitle)
  const webviewRef = useRef<WebviewElement | null>(null)
  const [currentUrl, setCurrentUrl] = useState(url)
  const [addressInput, setAddressInput] = useState(url)
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const syncUrl = (): void => {
      const u = wv.getURL()
      if (u) {
        setCurrentUrl(u)
        setAddressInput(u)
      }
      setCanGoBack(wv.canGoBack())
    }
    const onNewWindow = (e: Event): void => {
      // webview 内 target=_blank：在当前 webview 中继续打开，不弹新窗口
      const target = (e as unknown as { url?: string }).url
      if (target && /^https?:\/\//i.test(target)) void wv.loadURL(target)
    }
    const onTitle = (e: Event): void => {
      const title = (e as unknown as { title?: string }).title
      if (title) setTabTitle(tabId, title)
    }

    wv.addEventListener('did-navigate', syncUrl)
    wv.addEventListener('did-navigate-in-page', syncUrl)
    wv.addEventListener('new-window', onNewWindow)
    wv.addEventListener('page-title-updated', onTitle)
    return () => {
      wv.removeEventListener('did-navigate', syncUrl)
      wv.removeEventListener('did-navigate-in-page', syncUrl)
      wv.removeEventListener('new-window', onNewWindow)
      wv.removeEventListener('page-title-updated', onTitle)
    }
  }, [tabId, setTabTitle])

  const goBack = (): void => {
    const wv = webviewRef.current
    if (wv?.canGoBack()) wv.goBack()
  }

  const navigate = (): void => {
    const wv = webviewRef.current
    if (!wv) return
    let target = addressInput.trim()
    if (!target) return
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`
    void wv.loadURL(target)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <button
          title="返回"
          onClick={goBack}
          disabled={!canGoBack}
          className="rounded-card p-2 text-text-secondary transition-colors hover:bg-chip disabled:opacity-40"
        >
          <ArrowLeft size={17} />
        </button>
        <input
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate()
          }}
          spellCheck={false}
          className="flex-1 rounded-card border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
        />
        <button
          title="使用浏览器打开"
          onClick={() => void window.opia.openExternal(currentUrl)}
          className="flex items-center gap-1 rounded-card px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-chip"
        >
          <ExternalLink size={16} />
          <span className="hidden sm:inline">使用浏览器打开</span>
        </button>
      </div>
      <webview
        ref={(el) => {
          webviewRef.current = el as WebviewElement | null
        }}
        src={url}
        className="flex-1"
      />
    </div>
  )
}
