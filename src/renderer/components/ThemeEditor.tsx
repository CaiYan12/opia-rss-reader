import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ThemeTokens } from '../../shared/types'
import type { ThemeScheme } from '../../shared/theme'
import { applyTheme } from '../theme/applyTheme'
import { useAppStore } from '../stores/useAppStore'
import { ColorPicker } from './ColorPicker'
import { Select } from './Select'
import type { SelectOption } from './Select'

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

/** 字体选项（固定常用列表）：value 为完整 font-family 栈（与 ThemeTokens.fonts 一致）。
 *  系统全量字体枚举方案已弃用——数百项 + 每项字体预览，打开与滚动均严重卡顿；
 *  不在列表中的字体可直接在下拉输入框键入（Enter 提交）。 */
const FONT_OPTIONS: SelectOption[] = [
  { value: "'Microsoft YaHei', 'Segoe UI', 'Noto Sans SC', sans-serif", label: '默认（微软雅黑）' },
  { value: "'Segoe UI', 'Microsoft YaHei', sans-serif", label: 'Segoe UI' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: 'Calibri, Segoe UI, sans-serif', label: 'Calibri' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Consolas, "Courier New", monospace', label: 'Consolas' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: "'Microsoft YaHei', 'Noto Sans SC', sans-serif", label: '微软雅黑' },
  { value: 'SimHei, "Microsoft YaHei", sans-serif', label: '黑体' },
  { value: 'SimSun, "Songti SC", serif', label: '宋体' },
  { value: 'KaiTi, "Kaiti SC", serif', label: '楷体' },
  { value: 'FangSong, "STFangsong", serif', label: '仿宋' },
  { value: '"Noto Sans SC", "Microsoft YaHei", sans-serif', label: '思源黑体' },
  { value: '"Noto Serif SC", SimSun, serif', label: '思源宋体' },
  { value: '"PingFang SC", "Microsoft YaHei", sans-serif', label: '苹方' },
  { value: 'system-ui, sans-serif', label: '系统界面字体' },
  { value: 'sans-serif', label: '无衬线（通用）' },
  { value: 'serif', label: '衬线（通用）' },
  { value: 'monospace', label: '等宽（通用）' }
]

/** 字体族名 → CSS font-family 值（含空格的名称加引号，内嵌单引号转义） */
function toCssFont(name: string): string {
  return `'${name.replace(/'/g, "\\'")}'`
}

/** 取 font-family 栈的首个族名（去引号），用于自定义栈值在输入框的回显 */
function firstFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim() ?? ''
  return first.replace(/^['"]|['"]$/g, '')
}

/** 触发器关闭态显示：命中选项显示 label（按字体预览），自定义值显示栈首族名 */
function fontDisplay(value: string): string {
  return FONT_OPTIONS.find((o) => o.value === value)?.label ?? firstFamily(value)
}

/** 色块按钮：整块显示颜色（无原生 color input 的白框干扰），点击调出自绘取色器。
 *  取色器经 portal 挂到 body：内容区在 zoom 容器内，fixed 坐标会被缩放，portal 到 body 可免疫。 */
function ColorSwatch({
  value,
  label,
  onChange
}: {
  value: string
  label: string
  onChange: (v: string) => void
}): JSX.Element {
  const [anchor, setAnchor] = useState<{ x: number; top: number; bottom: number } | null>(null)
  const [closing, setClosing] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const readAnchor = (): { x: number; top: number; bottom: number } | null => {
    const r = btnRef.current?.getBoundingClientRect()
    return r ? { x: r.left, top: r.top, bottom: r.bottom } : null
  }

  const close = (): void => {
    if (closing) return
    setClosing(true)
    timer.current = setTimeout(() => {
      setAnchor(null)
      setClosing(false)
    }, 180)
  }

  const toggle = (): void => {
    // closing 期间再点 = 中断退出、重新展开
    if (anchor && !closing) {
      close()
      return
    }
    if (timer.current) clearTimeout(timer.current)
    setClosing(false)
    setAnchor(readAnchor())
  }

  // 打开期间实时跟踪色块坐标：设置区滚动/窗口缩放时取色器紧贴不漂移
  useEffect(() => {
    if (!anchor) return
    const sync = (): void => {
      const a = readAnchor()
      if (a) setAnchor(a)
    }
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor !== null])

  useEffect(() => {
    if (!anchor) return
    const onDown = (e: MouseEvent): void => {
      if (!(e.target instanceof HTMLElement)) return
      if (e.target.closest('[data-color-picker]')) return
      // 点自己 = toggle 负责；点其他色块 = 先关当前再开新的
      if (e.target.closest('[data-swatch]') === btnRef.current) return
      close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, closing])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <>
      <button
        ref={btnRef}
        data-swatch
        type="button"
        title={`${label}：点击取色`}
        onClick={toggle}
        className="swatch h-6 w-9 shrink-0 rounded-card border border-border shadow-sm"
        style={{ backgroundColor: value }}
      />
      {anchor &&
        createPortal(
          <ColorPicker
            x={anchor.x}
            top={anchor.top}
            bottom={anchor.bottom}
            value={value}
            closing={closing}
            onChange={onChange}
          />,
          document.body
        )}
    </>
  )
}

export function ThemeEditor({
  scheme,
  themes,
  selectedId,
  isEffective,
  onSelect
}: {
  scheme: ThemeScheme
  themes: ThemeTokens[]
  selectedId: string
  isEffective: boolean
  onSelect: (id: string) => Promise<void>
}): JSX.Element {
  const selected = themes.find((theme) => theme.id === selectedId) ?? themes[0] ?? null
  const [draft, setDraft] = useState<ThemeTokens | null>(() =>
    selected ? structuredClone({ ...selected, colorScheme: scheme }) : null
  )
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (selected) {
      setDraft(structuredClone({ ...selected, colorScheme: scheme }))
      setMessage('')
    }
  }, [selected?.id, scheme])

  if (!draft) return <div className="text-sm text-text-secondary">加载主题中…</div>

  const preview = (next: ThemeTokens): void => {
    const classified = { ...next, colorScheme: scheme }
    setDraft(classified)
    if (isEffective) applyTheme(classified)
  }

  const reset = (): void => {
    if (selected) {
      const next = structuredClone({ ...selected, colorScheme: scheme })
      setDraft(next)
      if (isEffective) applyTheme(next)
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
      await window.opia.themeSave({ ...draft, id, name, builtin: false, colorScheme: scheme })
      await useAppStore.getState().reloadThemes()
      await onSelect(id)
      setMessage(`已保存并应用「${name}」`)
    } catch (err) {
      setMessage(`保存失败：${String(err)}`)
    }
  }

  return (
    <div className="theme-detail-enter rounded-card border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="font-heading text-base font-bold">
            {scheme === 'light' ? '亮色主题' : '暗色主题'}
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            此区域仅显示并保存{scheme === 'light' ? '亮色' : '暗色'}主题
          </p>
        </div>
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
            {draft.builtin ? '另存为新主题' : '保存主题'}
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 border-b border-border pb-3 text-sm">
        <span className="font-medium">主题预设</span>
        <Select
          value={selected?.id ?? ''}
          onChange={(id) => void onSelect(id)}
          options={themes.map((theme) => ({ value: theme.id, label: theme.name }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        {COLOR_FIELDS.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 border-b border-border py-2 text-sm">
            <span>{label}</span>
            <div className="flex min-w-0 items-center justify-end gap-3">
            <ColorSwatch
              value={draft.colors[key]}
              label={label}
              onChange={(v) => preview({ ...draft, colors: { ...draft.colors, [key]: v } })}
            />
              <span className="truncate font-mono text-xs text-text-secondary">{draft.colors[key]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-0 text-sm">
        <label className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 border-b border-border py-2">
          <span>标题字体</span>
          <Select
            value={draft.fonts.heading}
            onChange={(v) => preview({ ...draft, fonts: { ...draft.fonts, heading: v } })}
            options={FONT_OPTIONS}
            getOptionStyle={(o) => ({ fontFamily: o.value })}
            editable
            formatInput={toCssFont}
            getDisplay={fontDisplay}
          />
        </label>
        <label className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 border-b border-border py-2">
          <span>正文字体</span>
          <Select
            value={draft.fonts.body}
            onChange={(v) => preview({ ...draft, fonts: { ...draft.fonts, body: v } })}
            options={FONT_OPTIONS}
            getOptionStyle={(o) => ({ fontFamily: o.value })}
            editable
            formatInput={toCssFont}
            getDisplay={fontDisplay}
          />
        </label>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 border-b border-border py-2">
          <span>亮/暗分类</span>
          <span className="text-right text-text-secondary">{scheme === 'light' ? '亮色（固定）' : '暗色（固定）'}</span>
        </div>
        <label className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 border-b border-border py-2">
          <span>圆角：{draft.radius}px</span>
          <input
            type="range"
            min={0}
            max={20}
            value={draft.radius}
            onChange={(e) => preview({ ...draft, radius: Number(e.target.value) })}
            className="my-auto"
            style={
              {
                '--range-progress': `${(draft.radius / 20) * 100}%`
              } as React.CSSProperties
            }
          />
        </label>
        <label className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 py-2">
          <span>间距：{draft.spacing}px</span>
          <input
            type="range"
            min={4}
            max={24}
            value={draft.spacing}
            onChange={(e) => preview({ ...draft, spacing: Number(e.target.value) })}
            style={
              {
                '--range-progress': `${((draft.spacing - 4) / 20) * 100}%`
              } as React.CSSProperties
            }
          />
        </label>
      </div>

      {message && <p className="mt-2 text-xs text-text-secondary">{message}</p>}
    </div>
  )
}
