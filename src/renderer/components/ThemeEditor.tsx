import { useEffect, useState } from 'react'
import type { ThemeTokens } from '../../shared/types'
import { applyTheme } from '../theme/applyTheme'
import { useAppStore } from '../stores/useAppStore'

const COLOR_FIELDS: Array<{ key: keyof ThemeTokens['colors']; label: string }> = [
  { key: 'bg', label: '背景' },
  { key: 'surface', label: '表面' },
  { key: 'card', label: '卡片' },
  { key: 'border', label: '边框' },
  { key: 'text', label: '文字' },
  { key: 'textSecondary', label: '次要文字' },
  { key: 'accent', label: '强调色' },
  { key: 'accentHover', label: '强调悬停' },
  { key: 'onAccent', label: '强调上文字' },
  { key: 'chip', label: '标签底' },
  { key: 'chipText', label: '标签字' },
  { key: 'read', label: '已读色' }
]

export function ThemeEditor(): JSX.Element {
  const { settings, themes } = useAppStore()
  const [draft, setDraft] = useState<ThemeTokens | null>(null)
  const [message, setMessage] = useState('')

  const active = themes.find((t) => t.id === settings?.activeThemeId) ?? null

  useEffect(() => {
    if (active && !draft) setDraft(structuredClone(active))
  }, [active, draft])

  if (!draft) return <div className="text-sm text-text-secondary">加载主题中…</div>

  const preview = (next: ThemeTokens): void => {
    setDraft(next)
    applyTheme(next) // 实时预览
  }

  const reset = (): void => {
    if (active) {
      setDraft(structuredClone(active))
      applyTheme(active)
    }
    setMessage('')
  }

  const saveAs = async (): Promise<void> => {
    setMessage('')
    const isBuiltin = themes.find((t) => t.id === draft.id)?.builtin
    const id = isBuiltin
      ? `custom-${draft.id}-${Date.now().toString(36)}`
      : draft.id
    const name = isBuiltin ? `${draft.name} 副本` : draft.name
    try {
      await window.opia.themeSave({ ...draft, id, name, builtin: false })
      await useAppStore.getState().reloadThemes()
      await useAppStore.getState().setTheme(id)
      setDraft(null)
      setMessage(`已保存并应用「${name}」`)
    } catch (err) {
      setMessage(`保存失败：${String(err)}`)
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-secondary">
          自定义主题（基于「{active?.name ?? ''}」，改动实时预览）
        </h3>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="rounded-card border border-border bg-surface px-3 py-1 text-xs hover:bg-chip"
          >
            还原
          </button>
          <button
            onClick={() => void saveAs()}
            className="rounded-card bg-accent px-3 py-1 text-xs text-on-accent hover:bg-accent-hover"
          >
            另存为新主题
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-2">
        {COLOR_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-xs">
            <input
              type="color"
              value={draft.colors[key]}
              onChange={(e) =>
                preview({ ...draft, colors: { ...draft.colors, [key]: e.target.value } })
              }
              className="h-6 w-8 cursor-pointer rounded border border-border"
            />
            <span className="w-14 text-text-secondary">{label}</span>
            <span className="text-text-secondary">{draft.colors[key]}</span>
          </label>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-text-secondary">标题字体</span>
          <input
            value={draft.fonts.heading}
            onChange={(e) =>
              preview({ ...draft, fonts: { ...draft.fonts, heading: e.target.value } })
            }
            className="rounded-card border border-border bg-surface px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-text-secondary">正文字体</span>
          <input
            value={draft.fonts.body}
            onChange={(e) =>
              preview({ ...draft, fonts: { ...draft.fonts, body: e.target.value } })
            }
            className="rounded-card border border-border bg-surface px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-text-secondary">正文字号：{draft.fonts.sizeBase}px</span>
          <input
            type="range"
            min={12}
            max={20}
            value={draft.fonts.sizeBase}
            onChange={(e) =>
              preview({ ...draft, fonts: { ...draft.fonts, sizeBase: Number(e.target.value) } })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-text-secondary">圆角：{draft.radius}px</span>
          <input
            type="range"
            min={0}
            max={20}
            value={draft.radius}
            onChange={(e) => preview({ ...draft, radius: Number(e.target.value) })}
          />
        </label>
      </div>

      {message && <p className="mt-2 text-xs text-text-secondary">{message}</p>}
    </div>
  )
}
