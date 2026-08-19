import { useAppStore } from '../stores/useAppStore'

export function SourceTabs(): JSX.Element | null {
  const { sources, activeSourceId, setActiveSource } = useAppStore()
  const enabled = sources.filter((s) => s.enabled)

  if (enabled.length === 0) return null

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-3">
      {enabled.map((s) => {
        const active = s.id === activeSourceId
        return (
          <button
            key={s.id}
            onClick={() => setActiveSource(s.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${
              active
                ? 'border-accent font-semibold text-accent'
                : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {s.name}
          </button>
        )
      })}
    </nav>
  )
}
