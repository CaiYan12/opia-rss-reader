import { ChevronDown, ChevronRight, Maximize2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { getMiniDigest } from './miniDigest'

/** Mini 模式主视图：日期行可展开——橘鸦源展开简报（概览），
 *  其他源展开限长文本摘要；「查看更多」回正常模式阅读页（不开外链）。 */
export function MiniView(): JSX.Element {
  const { articles, sources, activeSourceId, history, openFromMini, toggleMini, refresh, refreshing } =
    useAppStore()
  // 手风琴式单开：小窗内同时只展开一条
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
          const digest = getMiniDigest(a)
          const expanded = expandedId === a.guid
          return (
            <li key={a.guid}>
              <button
                onClick={() => {
                  if (digest) setExpandedId(expanded ? null : a.guid)
                }}
                className={`flex w-full items-start gap-1 rounded px-1.5 py-1.5 text-left text-[13px] transition-colors hover:bg-chip ${
                  read ? 'text-read' : 'text-text'
                }`}
                title={a.title}
              >
                <span className="mt-[1px] inline-flex w-[16px] shrink-0 justify-center">
                  {digest ? (
                    expanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
              </button>
              {expanded && digest && (
                <div className="mb-1 ml-[22px] border-l border-border pl-2 pr-1">
                  {digest.kind === 'juya' ? (
                    <ul className="space-y-0.5 text-xs leading-5 text-text-secondary">
                      {digest.entries!.map((entry, i) => (
                        <li key={i} className="line-clamp-2">
                          {entry}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="line-clamp-4 text-xs leading-5 text-text-secondary">{digest.text}</p>
                  )}
                  {digest.truncated && (
                    <button
                      onClick={() => void openFromMini(a)}
                      className="mt-1 rounded text-xs text-accent hover:underline"
                    >
                      查看更多 →
                    </button>
                  )}
                </div>
              )}
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
