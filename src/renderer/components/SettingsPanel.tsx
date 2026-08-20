import { useState } from 'react'
import { Plus, Star, Trash2 } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { ThemeEditor } from './ThemeEditor'
import { Select } from './Select'
import type { LayoutConfig, ShortcutConfig } from '../../shared/types'

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded-card border border-border bg-card p-4">
      <h2 className="mb-3 font-heading text-base font-bold">{title}</h2>
      {children}
    </section>
  )
}

/** 快捷键录入框：聚焦后按下组合键即录入（Esc 取消）；readOnly 使全局快捷键引擎跳过输入期。
 *  modifierOnly 模式用于滚轮类快捷键：只录入修饰键组合（按下修饰键即实时录入，可叠加） */
function ShortcutCapture({
  value,
  onChange,
  modifierOnly = false
}: {
  value: string
  onChange: (combo: string) => void
  modifierOnly?: boolean
}): JSX.Element {
  const [capturing, setCapturing] = useState(false)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    e.preventDefault()
    if (e.key === 'Escape') {
      setCapturing(false)
      e.currentTarget.blur()
      return
    }
    if (modifierOnly) {
      // 只响应修饰键，非修饰键忽略
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
      const mods: string[] = []
      if (e.ctrlKey || e.metaKey) mods.push('Ctrl')
      if (e.altKey) mods.push('Alt')
      if (e.shiftKey) mods.push('Shift')
      if (mods.length > 0) onChange(mods.join('+'))
      return
    }
    // 纯修饰键按下不录入，等待主键
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
    onChange(parts.join('+'))
    setCapturing(false)
    e.currentTarget.blur()
  }

  return (
    <input
      readOnly
      value={capturing ? (modifierOnly ? '按住修饰键组合…' : '按下组合键…（Esc 取消）') : value}
      onFocus={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={onKeyDown}
      className={`w-44 rounded-card border px-2 py-1.5 text-sm ${
        capturing ? 'border-accent bg-surface' : 'border-border bg-surface'
      }`}
    />
  )
}

export function SettingsPanel(): JSX.Element {
  const { settings, sources, themes, updateSettings, setTheme, reloadSources, refresh } =
    useAppStore()
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [addError, setAddError] = useState('')

  if (!settings) return <div />

  const layout = settings.layout

  const setLayout = (patch: Partial<LayoutConfig>): void => {
    void updateSettings({ layout: { ...layout, ...patch } })
  }

  const setShortcut = (key: keyof ShortcutConfig, combo: string): void => {
    void updateSettings({ shortcuts: { ...settings.shortcuts, [key]: combo } })
  }

  const toggleDefault = async (id: string, isDefault: boolean): Promise<void> => {
    await window.opia.feedSourceSetDefault(isDefault ? null : id)
    await reloadSources()
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
        <h1 className="font-heading text-lg font-bold">设置</h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Section title="订阅源">
          <p className="mb-2 text-xs text-text-secondary">
            默认订阅决定新开主页标签的内容；默认订阅最多一个，可无（无默认订阅时主页为空页面）。
          </p>
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
                  title={s.isDefault ? '取消默认订阅' : '设为默认订阅'}
                  onClick={() => void toggleDefault(s.id, s.isDefault === true)}
                  className={`rounded p-1 transition-colors hover:bg-chip ${
                    s.isDefault ? 'text-accent' : 'text-text-secondary hover:text-accent'
                  }`}
                >
                  <Star size={15} fill={s.isDefault ? 'currentColor' : 'none'} />
                </button>
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
              <span className="text-text-secondary">外链打开方式</span>
              <Select
                value={settings.externalLinkBehavior}
                onChange={(v) =>
                  void updateSettings({ externalLinkBehavior: v as 'system' | 'builtin' })
                }
                options={[
                  { value: 'system', label: '系统默认浏览器' },
                  { value: 'builtin', label: '内置浏览器（新标签打开）' }
                ]}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary">点击卡片行为</span>
              <Select
                value={settings.clickBehavior}
                onChange={(v) =>
                  void updateSettings({ clickBehavior: v as 'reader' | 'browser' })
                }
                options={[
                  { value: 'reader', label: '应用内阅读' },
                  { value: 'browser', label: '浏览器打开原文' }
                ]}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary">主页内容（「+」新建标签时）</span>
              <Select
                value={settings.homeContent}
                onChange={(v) =>
                  void updateSettings({ homeContent: v as 'defaultSource' | 'blank' })
                }
                options={[
                  { value: 'defaultSource', label: '默认订阅视图' },
                  { value: 'blank', label: '空页面' }
                ]}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary">启动时打开</span>
              <Select
                value={settings.startupOpen}
                onChange={(v) =>
                  void updateSettings({ startupOpen: v as 'home' | 'blank' | 'lastSession' })
                }
                options={[
                  { value: 'home', label: '仅主页' },
                  { value: 'blank', label: '空页面' },
                  { value: 'lastSession', label: '上一次标签会话' }
                ]}
              />
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

        <Section title="快捷键">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="w-24 text-text-secondary">关闭标签</span>
              <ShortcutCapture
                value={settings.shortcuts.closeTab}
                onChange={(combo) => setShortcut('closeTab', combo)}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 text-text-secondary">下一标签</span>
              <ShortcutCapture
                value={settings.shortcuts.nextTab}
                onChange={(combo) => setShortcut('nextTab', combo)}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 text-text-secondary">上一标签</span>
              <ShortcutCapture
                value={settings.shortcuts.prevTab}
                onChange={(combo) => setShortcut('prevTab', combo)}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 text-text-secondary">缩放（滚轮）</span>
              <ShortcutCapture
                modifierOnly
                value={settings.shortcuts.zoomWheel}
                onChange={(combo) => setShortcut('zoomWheel', combo)}
              />
              <span className="text-xs text-text-secondary">
                按住该组合后滚动滚轮缩放内容区
              </span>
            </div>
          </div>
        </Section>

        <Section title="布局">
          <div className="flex flex-col gap-1.5 text-sm">
            <label className="flex min-h-9 items-center gap-3">
              <span className="w-24 shrink-0 text-text-secondary">预设</span>
              <Select
                value={layout.preset}
                onChange={(v) => setLayout({ preset: v as LayoutConfig['preset'] })}
                options={[
                  { value: 'compact', label: '紧凑列表' },
                  { value: 'grid', label: '卡片网格' },
                  { value: 'magazine', label: '杂志风' }
                ]}
              />
            </label>
            <label className="flex min-h-9 items-center gap-3">
              <span className="w-24 shrink-0 text-text-secondary">列数</span>
              <input
                type="range"
                min={1}
                max={4}
                value={layout.gridColumns}
                onChange={(e) => setLayout({ gridColumns: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                style={
                  {
                    '--range-progress': `${((layout.gridColumns - 1) / 3) * 100}%`
                  } as React.CSSProperties
                }
              />
              <span className="w-5 shrink-0 text-center tabular-nums">{layout.gridColumns}</span>
            </label>
            <div className="flex min-h-9 items-center gap-3">
              <span className="w-24 shrink-0 text-text-secondary">显示字段</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
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
            </div>
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
