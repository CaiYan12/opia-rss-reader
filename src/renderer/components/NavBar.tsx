import { RefreshCw, Settings, Minimize2, Newspaper, Star } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  showFavorites: boolean
  onToggleFavorites(): void
}

export function NavBar({ showFavorites, onToggleFavorites }: Props): JSX.Element {
  const { refresh, refreshing, openSettings, toggleMini, activeSourceId } = useAppStore()

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Newspaper size={20} className="text-accent" />
        <h1 className="font-heading text-lg font-bold tracking-wide">Opia RSS</h1>
      </div>
      <div className="flex items-center gap-1">
        <button
          title={showFavorites ? '显示全部' : '只看收藏'}
          onClick={onToggleFavorites}
          className={`rounded-card p-2 transition-colors hover:bg-chip ${
            showFavorites ? 'text-accent' : 'text-text-secondary'
          }`}
        >
          <Star size={18} fill={showFavorites ? 'currentColor' : 'none'} />
        </button>
        <button
          title="刷新"
          onClick={() => void refresh(activeSourceId ?? undefined)}
          disabled={refreshing}
          className="rounded-card p-2 text-text-secondary transition-colors hover:bg-chip disabled:opacity-50"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <button
          title="Mini 模式"
          onClick={() => void toggleMini()}
          className="rounded-card p-2 text-text-secondary transition-colors hover:bg-chip"
        >
          <Minimize2 size={18} />
        </button>
        <button
          title="设置"
          onClick={openSettings}
          className="rounded-card p-2 text-text-secondary transition-colors hover:bg-chip"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  )
}
