import { useEffect, useState } from 'react'
import {
  Minus,
  Newspaper,
  RefreshCw,
  Settings,
  Minimize2,
  Star,
  Square,
  Copy,
  X
} from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  showFavorites: boolean
  onToggleFavorites(): void
}

/** 无边框自绘标题栏：logo/标题 + 拖拽区 + 全局动作（收藏/刷新/Mini/设置）+ 窗口控制按钮 */
export function TitleBar({ showFavorites, onToggleFavorites }: Props): JSX.Element {
  const { refresh, refreshing, openSettingsTab, toggleMini, activeSourceId } = useAppStore()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    return window.opia.onWindowMaximizeChanged(setMaximized)
  }, [])

  return (
    <header
      className="flex select-none items-center justify-between border-b border-border bg-surface px-3 py-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <Newspaper size={18} className="text-accent" />
        <h1 className="font-heading text-base font-bold tracking-wide">Opia RSS</h1>
      </div>
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          title={showFavorites ? '显示全部' : '只看收藏'}
          onClick={onToggleFavorites}
          className={`rounded-card p-2 transition-colors hover:bg-chip ${
            showFavorites ? 'text-accent' : 'text-text-secondary'
          }`}
        >
          <Star size={17} fill={showFavorites ? 'currentColor' : 'none'} />
        </button>
        <button
          title="刷新"
          onClick={() => void refresh(activeSourceId ?? undefined)}
          disabled={refreshing}
          className="rounded-card p-2 text-text-secondary transition-colors hover:bg-chip disabled:opacity-50"
        >
          <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <button
          title="Mini 模式"
          onClick={() => void toggleMini()}
          className="rounded-card p-2 text-text-secondary transition-colors hover:bg-chip"
        >
          <Minimize2 size={17} />
        </button>
        <button
          title="设置"
          onClick={openSettingsTab}
          className="rounded-card p-2 text-text-secondary transition-colors hover:bg-chip"
        >
          <Settings size={17} />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button
          title="最小化"
          onClick={() => void window.opia.windowMinimize()}
          className="flex h-8 w-10 items-center justify-center rounded-card text-text-secondary transition-colors hover:bg-chip"
        >
          <Minus size={15} />
        </button>
        <button
          title={maximized ? '还原' : '最大化'}
          onClick={() => void window.opia.windowToggleMaximize()}
          className="flex h-8 w-10 items-center justify-center rounded-card text-text-secondary transition-colors hover:bg-chip"
        >
          {maximized ? <Copy size={14} /> : <Square size={13} />}
        </button>
        <button
          title="关闭"
          onClick={() => void window.opia.windowClose()}
          className="flex h-8 w-10 items-center justify-center rounded-card text-text-secondary transition-colors hover:bg-[#e81123] hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  )
}
