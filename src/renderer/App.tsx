import { useEffect, useState } from 'react'
import { useAppStore, type Tab } from './stores/useAppStore'
import { TitleBar } from './components/TitleBar'
import { TabStrip } from './components/TabStrip'
import { HomeView } from './components/HomeView'
import { ReaderView } from './components/ReaderView'
import { SettingsPanel } from './components/SettingsPanel'
import { MiniView } from './components/MiniView'
import { BrowserPage } from './components/BrowserPage'

/** 解析组合串（如 "Ctrl+Shift+Tab"）为修饰键 + 主键 */
function parseCombo(combo: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = combo.split('+').map((p) => p.trim().toLowerCase())
  return {
    ctrl: parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts[parts.length - 1] ?? ''
  }
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
  )
}

export default function App(): JSX.Element {
  const { ready, init, mini, tabs, activeTabId, settings, closeTab, activateTab } = useAppStore()
  const [showFavorites, setShowFavorites] = useState(false)

  useEffect(() => {
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 标签快捷键（可在设置中自定义）
  useEffect(() => {
    if (!settings) return
    const onKey = (e: KeyboardEvent): void => {
      // 输入控件内不触发（如快捷键捕获框、地址栏）
      if (isTypingTarget(e)) return
      const match = (combo: string): boolean => {
        const c = parseCombo(combo)
        return (
          (e.ctrlKey || e.metaKey) === c.ctrl &&
          e.shiftKey === c.shift &&
          e.altKey === c.alt &&
          e.key.toLowerCase() === c.key
        )
      }
      const s = settings.shortcuts
      const cycle = (dir: number): void => {
        const idx = tabs.findIndex((t) => t.id === activeTabId)
        if (idx < 0 || tabs.length < 2) return
        activateTab(tabs[(idx + dir + tabs.length) % tabs.length].id)
      }
      if (match(s.closeTab)) {
        e.preventDefault()
        closeTab(activeTabId)
      } else if (match(s.nextTab)) {
        e.preventDefault()
        cycle(1)
      } else if (match(s.prevTab)) {
        e.preventDefault()
        cycle(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settings, tabs, activeTabId, closeTab, activateTab])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-text-secondary">
        加载中…
      </div>
    )
  }

  if (mini) return <MiniView />

  const renderTab = (tab: Tab): JSX.Element => {
    switch (tab.kind) {
      case 'home':
        return <HomeView tab={tab} showFavorites={showFavorites} />
      case 'reader':
        return <ReaderView article={tab.article} />
      case 'browser':
        return <BrowserPage tabId={tab.id} url={tab.url} />
      case 'settings':
        return <SettingsPanel />
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <TitleBar showFavorites={showFavorites} onToggleFavorites={() => setShowFavorites((v) => !v)} />
      <TabStrip />
      {/* keep-alive：inactive 标签隐藏但保留 DOM/webview/滚动状态 */}
      <div className="flex min-h-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={tab.id === activeTabId ? 'min-h-0 w-full' : 'hidden'}
          >
            {renderTab(tab)}
          </div>
        ))}
      </div>
    </div>
  )
}
