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
import {
  getDragX,
  getEdgeScrollDelta,
  getTabShift,
  isPointerInsideWindow,
  releasePointerCapture
} from './tabDrag'

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

interface InsertionPoint {
  targetId: string
  placement: 'before' | 'after'
  /** 原始标签数组中的插入边界（0 到 tabs.length）。 */
  boundary: number
  /** 插入线相对于标签滚动内容左侧的 x 坐标。 */
  x: number
}

// ---- 拖动手势参数（建议初值，真机验收时标定）----
/** 指针移动超过该像素数才进入拖动态（避免普通单击误触） */
const DRAG_THRESHOLD = 5
/** 边缘自动滚动触发区宽度（px） */
const EDGE_ZONE = 48
/** 边缘自动滚动最大速度（px/帧） */
const EDGE_MAX_SPEED = 24

/**
 * 常驻标签栏：等宽弹性标签（可拖动排序/中键关闭/主页源切换下拉）+「＋」紧跟最后一个标签新开主页。
 * 拖动语义（经 grilling 确认）：全部标签自由排序；实时让位（被拖标签浮起跟随指针，其余标签保持铺满）；
 * 拖动期间顺序只存本地 state，释放时经 moveTab 一次提交（不改 activeTabId）；取消/Escape/失焦恢复原序。
 */
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
    setHomeTabSource,
    moveTab
  } = useAppStore()
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ---- 拖动态（本地 state，不写 store；释放时一次提交）----
  const [drag, setDrag] = useState<{
    dragId: string
    dragX: number
    width: number
    insertion: InsertionPoint | null
  } | null>(null)
  const [revealVersion, setRevealVersion] = useState(0)
  const dragRef = useRef<{
    pointerId: number
    dragId: string
    startX: number
    startY: number
    grabOffset: number
    armed: boolean
    clientX: number
    pointerTarget: HTMLElement
  } | null>(null)
  const edgeRaf = useRef<number | null>(null)
  const revealTabRef = useRef<string | null>(null)

  const enabledSources = sources.filter((s) => s.enabled)

  // 退出动画：先置 closing（.menu-pop 淡出），时长与 CSS transition 一致后再卸载
  const closeMenu = (): void => {
    if (!menu || closing) return
    setClosing(true)
    closeTimer.current = setTimeout(() => {
      setMenu(null)
      setClosing(false)
    }, 180)
  }

  const toggleMenu = (tabId: string, left: number, top: number): void => {
    // closing 期间再点 = 中断退出、重新展开
    if (menu?.tabId === tabId && !closing) {
      closeMenu()
      return
    }
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setClosing(false)
    setMenu({ tabId, left, top })
  }

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    const d = dragRef.current
    releasePointerCapture(d?.pointerTarget ?? null, d?.pointerId ?? -1)
    dragRef.current = null
    if (edgeRaf.current != null) cancelAnimationFrame(edgeRaf.current)
  }, [])

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
      closeMenu()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeMenu()
    }
    const onScroll = (): void => closeMenu()
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKey)
    scrollRef.current?.addEventListener('scroll', onScroll)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKey)
      scrollRef.current?.removeEventListener('scroll', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, closing])

  /** 指针 x 落点所在标签 + 位于其中心前/后 + 标签栏内容坐标中的插入线位置。 */
  const computeInsertion = (
    clientX: number,
    excludeId?: string
  ): InsertionPoint | null => {
    const scroller = scrollRef.current
    if (!scroller) return null
    const scrollerRect = scroller.getBoundingClientRect()
    const els = [...scroller.querySelectorAll<HTMLElement>('[data-tab-id]')].filter(
      (el) => el.dataset.tabId !== excludeId
    )
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (clientX < r.left + r.width / 2) {
        const targetId = el.dataset.tabId as string
        const targetIndex = tabs.findIndex((tab) => tab.id === targetId)
        if (targetIndex < 0) return null
        return {
          targetId,
          placement: 'before',
          boundary: targetIndex,
          x: r.left - scrollerRect.left + scroller.scrollLeft
        }
      }
    }
    const last = els[els.length - 1]
    if (last) {
      const r = last.getBoundingClientRect()
      const targetId = last.dataset.tabId as string
      const targetIndex = tabs.findIndex((tab) => tab.id === targetId)
      if (targetIndex < 0) return null
      return {
        targetId,
        placement: 'after',
        boundary: targetIndex + 1,
        x: r.right - scrollerRect.left + scroller.scrollLeft
      }
    }
    return null
  }

  const endDrag = (): void => {
    const d = dragRef.current
    releasePointerCapture(d?.pointerTarget ?? null, d?.pointerId ?? -1)
    dragRef.current = null
    if (edgeRaf.current != null) {
      cancelAnimationFrame(edgeRaf.current)
      edgeRaf.current = null
    }
    setDrag(null)
  }

  /** 边缘自动滚动：拖动中指针进入左右触发区持续滚动（越靠边越快） */
  const startEdgeScroll = (): void => {
    if (edgeRaf.current != null) return
    const loop = (): void => {
      const d = dragRef.current
      const scroller = scrollRef.current
      if (!d?.armed || !scroller) {
        edgeRaf.current = null
        return
      }
      const rect = scroller.getBoundingClientRect()
      const leftDist = d.clientX - rect.left
      const rightDist = rect.right - d.clientX
      const delta = getEdgeScrollDelta(leftDist, rightDist, EDGE_ZONE, EDGE_MAX_SPEED)
      if (delta !== 0) scroller.scrollLeft += delta
      if (delta !== 0) {
        setDrag((prev) => {
          if (!prev) return prev
          const nextX = getDragX(d.clientX, rect.left, d.grabOffset, scroller.scrollLeft)
          const insertion = computeInsertion(d.clientX, d.dragId)
          const sameInsertion =
            prev.insertion?.targetId === insertion?.targetId &&
            prev.insertion?.placement === insertion?.placement &&
            prev.insertion?.boundary === insertion?.boundary &&
            prev.insertion?.x === insertion?.x
          return prev.dragX === nextX && sameInsertion
            ? prev
            : { ...prev, dragX: nextX, insertion }
        })
      }
      edgeRaf.current = requestAnimationFrame(loop)
    }
    edgeRaf.current = requestAnimationFrame(loop)
  }

  // 全局拖动事件（指针捕获挂在标签按钮上；window 兜底监听取消路径）
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      d.clientX = e.clientX
      const scroller = scrollRef.current
      const rect = scroller?.getBoundingClientRect()
      if (!d.armed) {
        if (
          Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD &&
          Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD
        ) {
          return
        }
        // 超过阈值进入拖动态
        d.armed = true
        closeMenu()
        const el = scroller?.querySelector<HTMLElement>(`[data-tab-id="${d.dragId}"]`)
        const width = el?.getBoundingClientRect().width ?? 0
        setDrag({
          dragId: d.dragId,
          dragX: getDragX(e.clientX, rect?.left ?? 0, d.grabOffset, scroller?.scrollLeft ?? 0),
          width,
          insertion: computeInsertion(e.clientX, d.dragId)
        })
        startEdgeScroll()
      } else {
        setDrag((prev) =>
          prev
            ? {
                ...prev,
                dragX: getDragX(e.clientX, rect?.left ?? 0, d.grabOffset, scroller?.scrollLeft ?? 0),
                insertion: computeInsertion(e.clientX, d.dragId)
              }
            : prev
        )
      }
    }
    const onUp = (e: PointerEvent): void => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      if (d.armed) {
        e.preventDefault()
        if (isPointerInsideWindow(e.clientX, e.clientY, window.innerWidth, window.innerHeight)) {
          revealTabRef.current = d.dragId
          setRevealVersion((version) => version + 1)
          const res = computeInsertion(e.clientX, d.dragId)
          if (res) moveTab(d.dragId, res.targetId, res.placement)
        }
      }
      endDrag()
    }
    const onCancel = (e: PointerEvent): void => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      endDrag() // 不提交
    }
    const onKey = (e: KeyboardEvent): void => {
      if (dragRef.current) {
        if (e.key === 'Escape') endDrag() // 取消不提交
      } else if (e.key === 'Escape') {
        closeMenu()
      }
    }
    const onBlur = (): void => {
      if (dragRef.current) endDrag() // 失焦取消不提交
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, moveTab, menu, closing])

  // 滚动可用性：新建/激活标签滚到可见、关闭后 clamp 越界；拖动释放后确保被拖标签可见
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    scroller.scrollLeft = Math.min(scroller.scrollLeft, scroller.scrollWidth - scroller.clientWidth)
    const revealId = revealTabRef.current ?? activeTabId
    const el = scroller.querySelector<HTMLElement>(`[data-tab-id="${revealId}"]`)
    if (el) {
      const cr = scroller.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      if (er.left < cr.left || er.right > cr.right) {
        el.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      }
      if (revealTabRef.current === revealId) revealTabRef.current = null
    }
  }, [tabs, activeTabId, revealVersion])

  const pickSource = (tab: Extract<Tab, { kind: 'home' }>, sourceId: string): void => {
    // blank 主页切换到订阅视图；feed 主页仅切换激活源
    if (tab.homePage === 'blank') {
      setHomeTabSource(tab.id, sourceId)
    } else {
      setActiveSource(sourceId)
    }
    closeMenu()
  }

  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : undefined
  const menuHomeTab = menuTab && menuTab.kind === 'home' ? menuTab : undefined

  // 拖动态渲染：保留原槽位作为透明占位，其余标签用 transform 平滑让位。
  const renderOrder = tabs
  const draggedTab = drag ? tabs.find((t) => t.id === drag.dragId) : undefined
  const dragIndex = drag ? tabs.findIndex((tab) => tab.id === drag.dragId) : -1

  return (
    <div className="flex select-none items-stretch border-b border-border bg-surface">
      <div ref={scrollRef} className="relative flex min-w-0 flex-1 items-stretch overflow-x-auto px-1">
        {renderOrder.map((tab, tabIndex) => {
          if (drag?.dragId === tab.id) {
            return (
              <div
                key={`placeholder-${tab.id}`}
                data-drag-placeholder
                aria-hidden="true"
                className="shrink-0"
                style={{ width: drag.width, flexBasis: drag.width }}
              />
            )
          }
          const { icon, title } = tabMeta(tab)
          const active = tab.id === activeTabId
          const shift = drag?.insertion
            ? getTabShift(tabIndex, dragIndex, drag.insertion.boundary, drag.width)
            : 0
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              title={title}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(tab.id)
                }
              }}
              data-active={active}
              data-drag-active-target={drag && active && tab.id !== drag.dragId ? 'true' : undefined}
              onClick={() => activateTab(tab.id)}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                const el = e.currentTarget as HTMLElement
                el.setPointerCapture(e.pointerId)
                dragRef.current = {
                  pointerId: e.pointerId,
                  dragId: tab.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  grabOffset: e.clientX - el.getBoundingClientRect().left,
                  armed: false,
                  clientX: e.clientX,
                  pointerTarget: el
                }
              }}
              className={`tab-item group flex min-w-[140px] max-w-[260px] flex-1 cursor-pointer items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                active
                  ? 'border-accent font-semibold text-accent'
                  : 'border-transparent text-text-secondary hover:text-text'
              }`}
              style={shift ? { transform: `translate3d(${shift}px, 0, 0)` } : undefined}
            >
              <button
                type="button"
                aria-label={active ? `${title}（当前标签）` : title}
                aria-pressed={active}
                className="tab-main flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <span className="shrink-0">{icon}</span>
                <span className="min-w-0 truncate">{title}</span>
              </button>
              {tab.kind === 'home' && (
                <button
                  type="button"
                  data-source-menu-trigger
                  aria-label="切换订阅源"
                  title="切换订阅源"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    toggleMenu(tab.id, rect.left, rect.bottom + 2)
                  }}
                  className={`tab-action flex shrink-0 items-center rounded p-0.5 text-text-secondary ${
                    active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70'
                  }`}
                >
                  <ChevronDown size={13} />
                </button>
              )}
              <button
                type="button"
                aria-label={`关闭标签 ${title}`}
                title="关闭标签"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className={`tab-action ml-0.5 flex shrink-0 items-center rounded p-0.5 text-text-secondary ${
                  active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70'
                }`}
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
        {/*
          让位动画已经提供预测插入位置，暂不额外显示竖线。
          保留 insertion 状态供标签让位计算和释放提交使用。
        */}
        {/* {drag?.insertion && (
          <div
            data-drop-indicator
            aria-hidden="true"
            className="tab-drop-indicator pointer-events-none absolute inset-y-1 z-20"
            style={{ transform: `translate3d(${drag.insertion.x - 1}px, 0, 0)` }}
          />
        )} */}
        {/* 被拖标签：absolute 浮起跟随指针（pointer-events-none 让指针穿透，插入判定仍以其余标签为准） */}
        {drag && draggedTab && (() => {
          const { icon, title } = tabMeta(draggedTab)
          return (
            <div
              key={`drag-${drag.dragId}`}
              data-dragging
              aria-hidden="true"
              title={title}
              className="pointer-events-none absolute inset-y-0 z-10 flex items-center gap-1.5 whitespace-nowrap rounded-card border-b-2 border-accent bg-card px-3 py-2 text-sm font-semibold text-accent shadow-lg"
              style={{ left: 0, width: drag.width, transform: `translateX(${drag.dragX}px) scale(1.03)` }}
            >
              <span className="shrink-0">{icon}</span>
              <span className="min-w-0 truncate">{title}</span>
            </div>
          )
        })()}
        {/* Chrome 式：「＋」紧跟最后一个标签，随标签滚动 */}
        <button
          title="新开主页标签"
          onClick={openHomeTab}
          className="tab-plus flex shrink-0 items-center px-2 text-text-secondary"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* fixed 定位规避滚动容器 overflow 裁剪 */}
      {menu && menuHomeTab && (
        <div
          data-source-menu
          data-closing={closing}
          style={{ position: 'fixed', left: menu.left, top: menu.top }}
          className="menu-pop z-50 min-w-[180px] rounded-card border border-border bg-card p-1 shadow-lg"
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
