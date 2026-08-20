import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

/** 主题化下拉选择：原生 <select> 的弹出菜单无法随主题着色，故自绘。
 *  触发器与菜单全部使用主题 token，与 TabStrip 源切换下拉同款风格。
 *  editable=true 时为 combobox：触发器为输入框，输入即过滤选项，
 *  Enter/失焦提交输入文本为自定义值（经 formatInput 格式化）。 */
const CLOSE_MS = 180 // 与 index.css .menu-pop 的 transition 时长一致
const MENU_MAX_H = 280 // 菜单最大高度，超出内部滚动（全局 webkit-scrollbar 样式）

export function Select({
  value,
  onChange,
  options,
  className = '',
  getOptionStyle,
  editable = false,
  formatInput,
  getDisplay
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  /** 可选：为选项/触发器标签提供内联样式（如字体下拉按字体本身预览渲染） */
  getOptionStyle?: (option: SelectOption) => CSSProperties
  /** 可编辑 combobox：触发器为输入框，可输入自定义值，输入时过滤选项 */
  editable?: boolean
  /** 提交输入文本为值时的格式化（如裸字体名 → CSS font-family 引号形式） */
  formatInput?: (text: string) => string
  /** 触发器关闭态的显示文本（默认选项 label，无匹配时 value 原样） */
  getDisplay?: (value: string) => string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 展开方向：下方视口空间不足以容纳菜单（含 8px 间距）且上方更宽裕时向上展开 */
  const place = (): void => {
    const r = rootRef.current?.getBoundingClientRect()
    if (!r) return
    const spaceBelow = window.innerHeight - r.bottom
    setDropUp(spaceBelow < MENU_MAX_H + 8 && r.top > spaceBelow)
  }

  const close = (): void => {
    if (closing) return
    setClosing(true)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, CLOSE_MS)
  }

  const toggle = (): void => {
    // closing 期间再点 = 中断退出、重新展开
    if (open && !closing) {
      close()
      return
    }
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setClosing(false)
    place()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        close()
        inputRef.current?.blur()
      }
    }
    // 打开期间重算展开方向：滚动/缩放改变触发器相对视口位置时翻转
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing])

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const current = options.find((o) => o.value === value)
  const display = getDisplay ? getDisplay(value) : (current?.label ?? value)

  // 可编辑：按输入文本过滤（匹配 label 或 value，不区分大小写；空输入 = 全部）
  const q = query.trim().toLowerCase()
  const filtered =
    !editable || !q
      ? options
      : options.filter(
          (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
        )

  /** 提交输入文本：命中选项用选项值，否则经 formatInput 格式化为自定义值 */
  const commitQuery = (): void => {
    const text = query.trim()
    if (!text) return
    const hit = options.find((o) => o.label === text || o.value === text)
    const next = hit ? hit.value : (formatInput ? formatInput(text) : text)
    if (next !== value) onChange(next)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {editable ? (
        <div className="relative">
          <input
            ref={inputRef}
            value={open ? query : display}
            placeholder={open ? '输入过滤，或直接输入字体名' : ''}
            onFocus={() => {
              if (!open) {
                setQuery('')
                place()
                setOpen(true)
              }
            }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitQuery()
                close()
                inputRef.current?.blur()
              }
            }}
            onBlur={() => {
              if (open && !closing) {
                commitQuery()
                close()
              }
            }}
            className="w-full rounded-card border border-border bg-surface px-2.5 py-1.5 pr-7 text-left text-sm text-text transition-colors hover:bg-chip"
          />
          <ChevronDown
            size={14}
            className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary transition-transform ${
              open && !closing ? 'rotate-180' : ''
            }`}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-between gap-2 rounded-card border border-border bg-surface px-2.5 py-1.5 text-left text-sm text-text transition-colors hover:bg-chip"
        >
          <span className="truncate" style={current ? getOptionStyle?.(current) : undefined}>
            {current?.label ?? value}
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-text-secondary transition-transform ${open && !closing ? 'rotate-180' : ''}`}
          />
        </button>
      )}
      {open && (
        <div
          data-closing={closing}
          data-dropup={dropUp}
          style={{ maxHeight: MENU_MAX_H }}
          className={`menu-pop absolute left-0 right-0 z-50 overflow-y-auto rounded-card border border-border bg-card py-1 shadow-lg ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {filtered.length === 0 && (
            <div className="px-2.5 py-2 text-sm text-text-secondary">
              {editable ? '无匹配选项，回车使用输入的字体名' : '无选项'}
            </div>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              // 阻止 mousedown 默认行为：可编辑模式下避免 input 先失焦提交半成品输入
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.value)
                setQuery('')
                close()
                inputRef.current?.blur()
              }}
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-chip ${
                o.value === value ? 'text-accent' : 'text-text'
              }`}
            >
              <span className="truncate" style={getOptionStyle?.(o)}>{o.label}</span>
              {o.value === value && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
