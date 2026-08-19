import { useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { ThemeEditor } from './ThemeEditor'
import type { LayoutConfig } from '../../shared/types'

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded-card border border-border bg-card p-4">
      <h2 className="mb-3 font-heading text-base font-bold">{title}</h2>
      {children}
    </section>
  )
}

export function SettingsPanel(): JSX.Element {
  const {
    settings,
    sources,
    themes,
    closeSettings,
    updateSettings,
    setTheme,
    reloadSources,
    refresh
  } = useAppStore()
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [addError, setAddError] = useState('')

  if (!settings) return <div />

  const layout = settings.layout

  const setLayout = (patch: Partial<LayoutConfig>): void => {
    void updateSettings({ layout: { ...layout, ...patch } })
  }

  const addSource = async (): Promise<void> => {
    setAddError('')
    if (!newName.trim() || !/^https?:\/\/.+/i.test(newUrl.trim())) {
      setAddError('请填写名称和合法的 http(s) 链接')
      return
    }
    await window.opia.feedSourceAdd({
      name: newName.trim(),
      url: newUrl.trim(),
      enabled: true,
      providerId: 'builtin-rss'
    })
    setNewName('')
    setNewUrl('')
    await reloadSources()
    await refresh()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <button
          onClick={closeSettings}
          className="flex items-center gap-1 rounded-card px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-chip"
        >
          <ArrowLeft size={16} /> 返回
        </button>
        <h1 className="font-heading text-lg font-bold">设置</h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Section title="订阅源">
          <ul className="mb-3 space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={async (e) => {
                    await window.opia.feedSourceToggle(s.id, e.target.checked)
                    await reloadSources()
                  }}
                />
                <span className="font-medium">{s.name}</span>
                <span className="flex-1 truncate text-text-secondary">{s.url}</span>
                <button
                  title="删除"
                  onClick={async () => {
                    await window.opia.feedSourceRemove(s.id)
                    await reloadSources()
                  }}
                  className="rounded p-1 text-text-secondary hover:bg-chip hover:text-accent"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              placeholder="名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-36 rounded-card border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <input
              placeholder="https://example.com/rss.xml"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-1 rounded-card border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => void addSource()}
              className="flex items-center gap-1 rounded-card bg-accent px-3 py-1.5 text-sm text-on-accent hover:bg-accent-hover"
            >
              <Plus size={15} /> 添加
            </button>
          </div>
          {addError && <p className="mt-1 text-xs text-accent">{addError}</p>}
        </Section>

        <Section title="偏好">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary">点击卡片行为</span>
              <select
                value={settings.clickBehavior}
                onChange={(e) =>
                  void updateSettings({ clickBehavior: e.target.value as 'reader' | 'browser' })
                }
                className="rounded-card border border-border bg-surface px-2 py-1.5"
              >
                <option value="reader">应用内阅读</option>
                <option value="browser">浏览器打开原文</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary">自动刷新间隔（分钟，0 为关闭）</span>
              <input
                type="number"
                min={0}
                value={settings.refreshIntervalMin}
                onChange={(e) =>
                  void updateSettings({ refreshIntervalMin: Math.max(0, Number(e.target.value) || 0) })
                }
                className="rounded-card border border-border bg-surface px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary">历史保留天数</span>
              <input
                type="number"
                min={1}
                value={settings.historyRetentionDays}
                onChange={(e) =>
                  void updateSettings({ historyRetentionDays: Math.max(1, Number(e.target.value) || 30) })
                }
                className="rounded-card border border-border bg-surface px-2 py-1.5"
              />
            </label>
          </div>
        </Section>

        <Section title="布局">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-text-secondary">预设</span>
              <select
                value={layout.preset}
                onChange={(e) => setLayout({ preset: e.target.value as LayoutConfig['preset'] })}
                className="rounded-card border border-border bg-surface px-2 py-1.5"
              >
                <option value="compact">紧凑列表</option>
                <option value="grid">卡片网格</option>
                <option value="magazine">杂志风</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-text-secondary">列数</span>
              <input
                type="range"
                min={1}
                max={4}
                value={layout.gridColumns}
                onChange={(e) => setLayout({ gridColumns: Number(e.target.value) as 1 | 2 | 3 | 4 })}
              />
              <span>{layout.gridColumns}</span>
            </label>
            {(Object.keys(layout.fields) as Array<keyof LayoutConfig['fields']>).map((key) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={layout.fields[key]}
                  onChange={(e) =>
                    setLayout({ fields: { ...layout.fields, [key]: e.target.checked } })
                  }
                />
                {{ cover: '封面', summary: '摘要', pubDate: '时间', source: '来源' }[key]}
              </label>
            ))}
          </div>
        </Section>

        <Section title="主题">
          <div className="mb-4 flex flex-wrap gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => void setTheme(t.id)}
                className={`rounded-card border px-3 py-1.5 text-sm transition-colors ${
                  t.id === settings.activeThemeId
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-border bg-surface hover:bg-chip'
                }`}
              >
                {t.name}
                {t.builtin ? '' : ' *'}
              </button>
            ))}
          </div>
          <ThemeEditor />
        </Section>
      </div>
    </div>
  )
}
