import { Maximize2, RefreshCw } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'

export function MiniView(): JSX.Element {
  const { articles, sources, activeSourceId, history, openFromMini, toggleMini, refresh, refreshing } =
    useAppStore()
  const list = activeSourceId ? articles[activeSourceId] ?? [] : []
  const sourceName = sources.find((s) => s.id === activeSourceId)?.name ?? '全部'

  return (
    <div className="flex h-screen flex-col bg-bg">
      <div
        className="drag-region flex items-center justify-between border-b border-border bg-surface px-3 py-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="truncate font-heading text-sm font-bold">{sourceName}</span>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            title="刷新"
            onClick={() => void refresh(activeSourceId ?? undefined)}
            className="rounded p-1 text-text-secondary hover:bg-chip"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            title="切回完整模式"
            onClick={() => void toggleMini()}
            className="rounded p-1 text-text-secondary hover:bg-chip"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {list.map((a) => {
          const read = history[a.guid]?.read ?? false
          return (
            <li key={a.guid}>
              <button
                onClick={() => void openFromMini(a)}
                className={`w-full truncate rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-chip ${
                  read ? 'text-read' : 'text-text'
                }`}
                title={a.title}
              >
                {a.title}
              </button>
            </li>
          )
        })}
        {list.length === 0 && (
          <li className="p-4 text-center text-xs text-text-secondary">暂无内容</li>
        )}
      </ul>
    </div>
  )
}
