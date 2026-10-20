/**
 * nocturne 刊头极光两层的**相位计算**（纯函数，零副作用）。
 * =============================================================================
 * 为什么单独抽一个模块：两层极光是**两条独立 CSS 动画**——
 *   前层 `jy-noct-aurora-near`：24s / ease-in-out / alternate，opacity 0.62 → 1
 *   后层 `jy-noct-aurora-far` ：31s / ease-in-out / alternate，opacity 1   → 0.52
 * 二者 duration 不同、关键帧方向相反（前层 from 暗、后层 from 亮）。
 * 若用同一个 `-Xs` 去 seek 两层，就等于把某一层钉死在固定帧上，
 * 采样到的「极端时刻」其实只有一层是极值 —— 本模块的职责就是从**各层自己的**
 * duration / 方向 / 关键帧端点算出各自的极端时刻，再组合成联合相位。
 *
 * `alternate` 的完整周期是 `2 × duration`：currentTime = 0 落在 `from`，
 * currentTime = duration 落在 `to`，再回到 from。故极端时刻只有两个：
 *   峰值 = to > from ? duration : 0
 *   谷值 = to > from ? 0 : duration
 *
 * 这里只做**线性**进度换算。ease-in-out 只改变中间过程的插值曲线，
 * 不影响端点位置 ⇒ 极端时刻的定位与缓动无关。逐帧真实 opacity 一律以
 * 浏览器 computed style 为准（探针脚本照此采集），本模块不预报中间值。
 *
 * 使用方：scripts/nocturne-aurora-phase-probe.mjs（seek + 栅格化）、
 *         tests/unit/juyaCssGuard.test.ts（相位采样结构守卫）。
 */

/** 与 juya.css 当前取值一致的缺省配置（守卫组会从 CSS 实读并比对，不靠这份字面量）。 */
export const DEFAULT_AURORA = {
  near: { duration: 24, from: 0.62, to: 1 },
  far: { duration: 31, from: 1, to: 0.52 }
}

/** alternate 动画的完整周期（秒）：正放 + 回放 */
export function cycleSeconds(layer) {
  return 2 * layer.duration
}

/** 把时间规约到 [0, duration] 的进度（0 = from 端，1 = to 端） */
function progressAt(timeSec, duration) {
  const cycle = 2 * duration
  const t = ((timeSec % cycle) + cycle) % cycle
  return { t, p: t <= duration ? t / duration : (cycle - t) / duration }
}

/** 某时刻的 opacity 端点插值（线性；仅用于端点判定，不预报缓动中间值） */
export function opacityAt(timeSec, layer) {
  const { t, p } = progressAt(timeSec, layer.duration)
  return { time: t, progress: p, opacity: layer.from + (layer.to - layer.from) * p }
}

/** 某层的两个极端时刻（峰值 / 谷值），由该层自身 duration 与关键帧方向决定 */
export function extremeTimes(layer) {
  const rising = layer.to > layer.from
  return {
    peak: rising ? layer.duration : 0,
    floor: rising ? 0 : layer.duration,
    peakOpacity: Math.max(layer.from, layer.to),
    floorOpacity: Math.min(layer.from, layer.to)
  }
}

/**
 * 组装联合相位采样表（≥ 5 个）。每条的 nearTime / farTime 分别按
 * **各自** duration 计算，因此数值天然不同（不存在「同一个 -Xs」）。
 *
 * 采样构成：
 *   · 4 个极端组合（近峰/谷 × 远峰/谷）—— 验收要看的「极端相位」；
 *   · 3 个交错中间相位（25% / 35% / 65% 周期进度）—— 覆盖缓动段与两层反向的中间态。
 */
export function buildPhaseSamples(config = DEFAULT_AURORA) {
  const near = config.near
  const far = config.far
  const nearEx = extremeTimes(near)
  const farEx = extremeTimes(far)

  const extremes = [
    ['近层亮峰 × 远层亮峰', nearEx.peak, farEx.peak],
    ['近层亮峰 × 远层暗谷', nearEx.peak, farEx.floor],
    ['近层暗谷 × 远层亮峰', nearEx.floor, farEx.peak],
    ['近层暗谷 × 远层暗谷', nearEx.floor, farEx.floor]
  ]

  const intermediates = [0.25, 0.35, 0.65].map((f) => [
    `交错相位 ${Math.round(f * 100)}%（各层按自身周期）`,
    Number((f * cycleSeconds(near)).toFixed(3)),
    Number((f * cycleSeconds(far)).toFixed(3))
  ])

  return [...extremes, ...intermediates].map(([label, nearTime, farTime]) => ({
    label,
    nearTime,
    farTime,
    nearOpacity: Number(opacityAt(nearTime, near).opacity.toFixed(4)),
    farOpacity: Number(opacityAt(farTime, far).opacity.toFixed(4))
  }))
}
