import { useState } from 'react'
import { Rss } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { Select } from './Select'

interface Props {
  tabId: string
}

/** 空页面引导页：输入订阅链接或选择已有订阅；提交后弹窗询问是否设为默认（可取消） */
export function BlankPage({ tabId }: Props): JSX.Element {
  const { sources, setHomeTabSource, reloadSources, refresh } = useAppStore()
  const [url, setUrl] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [askDefault, setAskDefault] = useState<{ id: string; name: string } | null>(null)

  const submit = async (): Promise<void> => {
    setError('')
    const link = url.trim()
    if (link) {
      if (!/^https?:\/\/.+/i.test(link)) {
        setError('请输入合法的 http(s) 订阅链接')
        return
      }
      setBusy(true)
      try {
        let name = link
        try {
          name = new URL(link).hostname
        } catch {
          /* 保持原值 */
        }
        const added = await window.opia.feedSourceAdd({
          name,
          url: link,
          enabled: true,
          providerId: 'builtin-rss'
        })
        await reloadSources()
        setHomeTabSource(tabId, added.id)
        void refresh(added.id)
        setAskDefault({ id: added.id, name: added.name })
      } finally {
        setBusy(false)
      }
      return
    }
    if (selectedId) {
      const src = sources.find((s) => s.id === selectedId)
      if (!src) return
      setHomeTabSource(tabId, src.id)
      setAskDefault({ id: src.id, name: src.name })
      return
    }
    setError('请输入订阅链接，或从下拉框选择一个订阅')
  }

  return (
    <div className="relative flex h-full flex-1 items-start justify-center overflow-y-auto p-8">
      <div className="w-full max-w-md">
        <div className="rounded-card border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Rss size={20} className="text-accent" />
            <h2 className="font-heading text-lg font-bold">开始订阅</h2>
          </div>
          <p className="mb-4 text-sm text-text-secondary">
            输入一个 RSS 订阅链接，或从下方选择已有的订阅源。
          </p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) void submit()
            }}
            placeholder="https://example.com/rss.xml"
            spellCheck={false}
            className="mb-3 w-full rounded-card border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          {sources.length > 0 && (
            <Select
              value={selectedId}
              onChange={setSelectedId}
              className="mb-4 w-full"
              options={[
                { value: '', label: '选择已有订阅…' },
                ...sources.map((s) => ({
                  value: s.id,
                  label: `${s.name}${s.isDefault ? '（默认）' : ''}`
                }))
              ]}
            />
          )}
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="w-full rounded-card bg-accent px-3 py-2 text-sm text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? '正在添加…' : '打开'}
          </button>
          {error && <p className="mt-2 text-xs text-accent">{error}</p>}
        </div>
      </div>

      {askDefault && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <div className="rounded-card border border-border bg-card p-5 shadow-lg">
            <p className="text-sm">是否将「{askDefault.name}」设为默认订阅？</p>
            <p className="mt-1 text-xs text-text-secondary">设为默认后，主页与「＋」新标签将默认打开它。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAskDefault(null)}
                className="rounded-card border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-chip"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const target = askDefault
                  setAskDefault(null)
                  void window.opia.feedSourceSetDefault(target.id).then(() => reloadSources())
                }}
                className="rounded-card bg-accent px-3 py-1.5 text-sm text-on-accent transition-colors hover:bg-accent-hover"
              >
                设为默认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
