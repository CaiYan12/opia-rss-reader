import { useLayoutEffect, useRef, useState } from 'react'

/* ---- 颜色数学：hex <-> rgb <-> hsv ---- */

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number): string => v.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) [rp, gp, bp] = [c, x, 0]
  else if (h < 120) [rp, gp, bp] = [x, c, 0]
  else if (h < 180) [rp, gp, bp] = [0, c, x]
  else if (h < 240) [rp, gp, bp] = [0, x, c]
  else if (h < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return [
    Math.round((rp + m) * 255),
    Math.round((gp + m) * 255),
    Math.round((bp + m) * 255)
  ]
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

const PICKER_W = 232
const PICKER_H = 250

/** 自绘弹出式取色器：SV 面板 + 色相条 + hex 输入，全部主题 token 样式，
 *  出入场复用 .menu-pop 动画（data-closing 由父级驱动）。 */
export function ColorPicker({
  x,
  top,
  bottom,
  value,
  closing,
  onChange
}: {
  x: number
  top: number
  bottom: number
  value: string
  closing: boolean
  onChange: (hex: string) => void
}): JSX.Element {
  const [hsv, setHsv] = useState<[number, number, number]>(() => rgbToHsv(...hexToRgb(value)))
  const [hexText, setHexText] = useState(value)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // 首帧用估计尺寸定位，渲染后立即实测重算（useLayoutEffect 在 paint 前执行，
  // 中间位置用户不可见）。不能只用估计值：html 基准 14px 下实际高度约 172px，
  // 与估计 250px 相差 ~78px——翻转上方时会悬在离色块很远处。
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  }, [])

  const commit = (h: number, s: number, v: number): void => {
    setHsv([h, s, v])
    const hex = rgbToHex(...hsvToRgb(h, s, v))
    setHexText(hex)
    onChange(hex)
  }

  const dragSv = (e: React.PointerEvent<HTMLDivElement>): void => {
    const rect = svRef.current?.getBoundingClientRect()
    if (!rect) return
    const s = clamp01((e.clientX - rect.left) / rect.width)
    const v = 1 - clamp01((e.clientY - rect.top) / rect.height)
    commit(hsv[0], s, v)
  }

  const dragHue = (e: React.PointerEvent<HTMLDivElement>): void => {
    const rect = hueRef.current?.getBoundingClientRect()
    if (!rect) return
    commit(clamp01((e.clientX - rect.left) / rect.width) * 360, hsv[1], hsv[2])
  }

  const onHex = (t: string): void => {
    setHexText(t)
    const m = /^#?([0-9a-f]{6})$/i.exec(t.trim())
    if (m) {
      const hex = `#${m[1].toLowerCase()}`
      setHsv(rgbToHsv(...hexToRgb(hex)))
      onChange(hex)
    }
  }

  // 视口内钳制：优先色块下方 4px 紧贴；放不下翻转上方，同样紧贴（实测尺寸，非估计）
  const pw = size?.w ?? PICKER_W
  const ph = size?.h ?? PICKER_H
  const left = Math.min(Math.max(8, x), window.innerWidth - pw - 8)
  const posTop =
    bottom + 4 + ph <= window.innerHeight - 8 ? bottom + 4 : Math.max(8, top - ph - 4)

  const [h, s, v] = hsv

  return (
    <div
      ref={rootRef}
      data-color-picker
      data-closing={closing}
      style={{ position: 'fixed', left, top: posTop }}
      className="menu-pop z-50 rounded-card border border-border bg-card p-3 shadow-lg"
    >
      {/* SV 面板（渐变端点为 HSV 模型固有绝对色，非 UI 主题色） */}
      <div
        ref={svRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragSv(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) dragSv(e)
        }}
        className="relative h-28 w-[208px] cursor-crosshair rounded-card border border-border"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`
        }}
      >
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
          style={{
            left: `${s * 100}%`,
            top: `${(1 - v) * 100}%`,
            boxShadow: '0 0 0 1px var(--t-border)'
          }}
        />
      </div>

      {/* 色相条 */}
      <div
        ref={hueRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragHue(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) dragHue(e)
        }}
        className="relative mt-2 h-3 w-[208px] cursor-pointer rounded-full border border-border"
        style={{
          background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card shadow-sm"
          style={{ left: `${(h / 360) * 100}%` }}
        />
      </div>

      {/* hex 输入 + 当前色预览 */}
      <div className="mt-2 flex items-center gap-2">
        <input
          value={hexText}
          onChange={(e) => onHex(e.target.value)}
          spellCheck={false}
          className="w-0 flex-1 rounded-card border border-border bg-surface px-2 py-1 text-xs text-text"
        />
        <span
          className="h-5 w-8 shrink-0 rounded-card border border-border"
          style={{ backgroundColor: value }}
        />
      </div>
    </div>
  )
}
