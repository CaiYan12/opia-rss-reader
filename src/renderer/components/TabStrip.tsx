import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  FileText,
  Globe,
  Newspaper,
  Plus,
  Settings as SettingsIcon,
  X
} from 'lucide-react'
import { useAppStore, type Tab } from '../stores/useAppStore'

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function tabMeta(tab: Tab): { icon: JSX.Element; title: string } {
  switch (tab.kind) {
    case 'home':
      return { icon: <Newspaper size={14} />, title: '主页' }
    case 'reader':
      return { icon: <FileText size={14} />, title: tab.article.title }
    case 'browser':
      return { icon: <Globe size={14} />, title: tab.title || hostnameOf(tab.url) }
    case 'settings':
      return { icon: <SettingsIcon size={14} />, title: '设置' }
  }
}

/** 下拉菜单锚点（视口坐标，取自下拉按钮 rect） */
interface MenuAnchor {
  tabId: string
  left: number
  top: number
}

/** 常驻标签栏：页面标签（可关闭/中键关闭）+ 主页标签内源切换下拉 +「＋」紧跟最后一个标签新开主页 */
export function TabStrip(): JSX.Element {
  const {
    tabs,
    activeTabId,
    sources,
    activeSourceId,
    activateTab,
    closeTab,
    openHomeTab,
    setActiveSource,
    setHomeTabSource
  } = useAppStore()
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const enabledSources = sources.filter((s) => s.enabled)

  // 菜单关闭：外部 mousedown / Escape / 标签容器滚动
  useEffect(() => {
    if (!menu) return
    const onMouseDown = (e: MouseEvent): void => {
      if (!(e.target instanceof HTMLElement)) return
      if (
        e.target.closest('[data-source-menu]') ||
        e.target.closest('[data-source-menu-trigger]')
      ) {
        return
      }
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    const onScroll = (): void => setMenu(null)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKey)
    scrollRef.current?.addEventListener('scroll', onScroll)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKey)
      scrollRef.current?.removeEventListener('scroll', onScroll)
    }
  }, [menu])

  const pickSource = (tab: Extract<Tab, { kind: 'home' }>, sourceId: string): void => {
    // blank 主页切换到订阅视图；feed 主页仅切换激活源
    if (tab.homePage === 'blank') {
      setHomeTabSource(tab.id, sourceId)
    } else {
      setActiveSource(sourceId)
    }
    setMenu(null)
  }

  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : undefined
  const menuHomeTab = menuTab && menuTab.kind === 'home' ? menuTab : undefined

  return (
    <div className="flex select-none items-stretch border-b border-border bg-surface">
      <div ref={scrollRef} className="flex min-w-0 flex-1 items-stretch overflow-x-auto px-1">
        {tabs.map((tab) => {
          const { icon, title } = tabMeta(tab)
          const active = tab.id === activeTabId
          return (
            <button
              key={tab.id}
              onClick={() => activateTab(tab.id)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(tab.id)
                }
              }}
              title={title}
              className={`group flex min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-accent font-semibold text-accent'
                  : 'border-transparent text-text-secondary hover:text-text'
              }`}
            >
              <span className="shrink-0">{icon}</span>
              <span className="min-w-0 truncate">{title}</span>
              {tab.kind === 'home' && (
                <span
                  role="button"
                  data-source-menu-trigger
                  title="切换订阅源"
                  onClick={(e) => {
                    e.stopPropagation()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setMenu(
                      menu?.tabId === tab.id
                        ? null
                        : { tabId: tab.id, left: rect.left, top: rect.bottom + 2 }
                    )
                  }}
                  className={`flex shrink-0 items-center rounded p-0.5 text-text-secondary transition-colors hover:bg-chip hover:text-text ${
                    active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70'
                  }`}
                >
                  <ChevronDown size={13} />
                </span>
              )}
              <span
                role="button"
                title="关闭标签"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className={`ml-0.5 flex shrink-0 items-center rounded p-0.5 text-text-secondary transition-colors hover:bg-chip hover:text-text ${
                  active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70'
                }`}
              >
                <X size={13} />
              </span>
            </button>
          )
        })}
        {/* Chrome 式：「＋」紧跟最后一个标签，随标签滚动 */}
        <button
          title="新开主页标签"
          onClick={openHomeTab}
          className="flex shrink-0 items-center px-2 text-text-secondary transition-colors hover:bg-chip hover:text-text"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* fixed 定位规避滚动容器 overflow 裁剪 */}
      {menu && menuHomeTab && (
        <div
          data-source-menu
          style={{ position: 'fixed', left: menu.left, top: menu.top }}
          className="z-50 min-w-[180px] rounded-card border border-border bg-card p-1 shadow-lg"
        >
          {enabledSources.length === 0 ? (
            <div className="px-3 py-1.5 text-sm text-text-secondary">当前暂无订阅</div>
          ) : (
            enabledSources.map((s) => {
              const current = s.id === activeSourceId
              return (
                <button
                  key={s.id}
                  onClick={() => pickSource(menuHomeTab, s.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-chip ${
                    current ? 'font-semibold text-accent' : 'text-text'
                  }`}
                >
                  <span className="min-w-0 truncate">{s.name}</span>
                  {current && <Check size={14} className="shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
