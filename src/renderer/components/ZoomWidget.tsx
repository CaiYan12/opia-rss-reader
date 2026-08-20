import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'

/** 内容区右下角浮动缩放控件（置于 zoom 容器之外，自身不随内容缩放） */
export function ZoomWidget(): JSX.Element {
  const zoom = useAppStore((s) => s.settings?.uiZoom ?? 1)
  const setZoom = useAppStore((s) => s.setZoom)

  const btn =
    'rounded-full p-1 text-text-secondary transition-colors hover:bg-chip hover:text-accent'

  return (
    <div className="absolute bottom-3 right-3 z-50 flex items-center gap-0.5 rounded-full border border-border bg-card px-2 py-1 shadow-sm">
      <button title="缩小" onClick={() => setZoom(zoom - 0.05)} className={btn}>
        <Minus size={14} />
      </button>
      <span className="w-11 select-none text-center text-xs tabular-nums text-text">
        {Math.round(zoom * 100)}%
      </span>
      <button title="放大" onClick={() => setZoom(zoom + 0.05)} className={btn}>
        <Plus size={14} />
      </button>
      <button title="重置为 100%" onClick={() => setZoom(1)} className={btn}>
        <RotateCcw size={13} />
      </button>
    </div>
  )
}
