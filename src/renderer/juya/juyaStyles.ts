import type { JuyaStyleId } from '../../shared/types'

/** 橘鸦定制阅读风格注册表（渲染进程内置、只读，不进 ThemeService/ThemeEditor 体系）。
 *  五种风格 × 亮暗双变体 = 10 个条目；用户仅能选择，不可编辑（见 docs/PLAN-20260828.md Q11）。 */

export type JuyaStyleVariantId =
  | 'card-light'
  | 'card-dark'
  | 'y2k-light'
  | 'y2k-dark'
  | 'pop-light'
  | 'pop-dark'
  | 'newsprint90s-light'
  | 'newsprint90s-dark'
  | 'dreamcore-light'
  | 'dreamcore-dark'

export interface JuyaStyleMeta {
  /** 变体唯一 id：`${styleId}-${colorScheme}` */
  id: JuyaStyleVariantId
  /** 所属风格（不含 'off'） */
  styleId: Exclude<JuyaStyleId, 'off'>
  /** 展示名（设置下拉用） */
  name: string
  colorScheme: 'light' | 'dark'
  /** 模板内 :focus-visible 焦点色（风格自有，不取全局 --t-accent） */
  focusColor: string
  /** 背景材质：首版固定 css-svg（纯 CSS + 内联 SVG），禁止位图 */
  background: 'css-svg'
  /** 未来图片资源背景扩展位（首版不实现；注册接口预留，见计划 Q15a） */
  backgroundImageAsset?: string
}

export const JUYA_STYLES: JuyaStyleMeta[] = [
  {
    id: 'card-light',
    styleId: 'card',
    name: '卡片主题式',
    colorScheme: 'light',
    focusColor: '#c1502e',
    background: 'css-svg'
  },
  {
    id: 'card-dark',
    styleId: 'card',
    name: '卡片主题式',
    colorScheme: 'dark',
    focusColor: '#f0a080',
    background: 'css-svg'
  },
  {
    id: 'y2k-light',
    styleId: 'y2k',
    name: '千禧网页式',
    colorScheme: 'light',
    focusColor: '#0050c8',
    background: 'css-svg'
  },
  {
    id: 'y2k-dark',
    styleId: 'y2k',
    name: '千禧网页式',
    colorScheme: 'dark',
    focusColor: '#7db8ff',
    background: 'css-svg'
  },
  {
    id: 'pop-light',
    styleId: 'pop',
    name: '波普艺术式',
    colorScheme: 'light',
    focusColor: '#d81b60',
    background: 'css-svg'
  },
  {
    id: 'pop-dark',
    styleId: 'pop',
    name: '波普艺术式',
    colorScheme: 'dark',
    focusColor: '#ff80ab',
    background: 'css-svg'
  },
  {
    id: 'newsprint90s-light',
    styleId: 'newsprint90s',
    name: '90 年代报刊式',
    colorScheme: 'light',
    focusColor: '#8b1a1a',
    background: 'css-svg'
  },
  {
    id: 'newsprint90s-dark',
    styleId: 'newsprint90s',
    name: '90 年代报刊式',
    colorScheme: 'dark',
    focusColor: '#e8b4b4',
    background: 'css-svg'
  },
  {
    id: 'dreamcore-light',
    styleId: 'dreamcore',
    name: '蒸汽梦核式',
    colorScheme: 'light',
    focusColor: '#7c4dff',
    background: 'css-svg'
  },
  {
    id: 'dreamcore-dark',
    styleId: 'dreamcore',
    name: '蒸汽梦核式',
    colorScheme: 'dark',
    focusColor: '#b388ff',
    background: 'css-svg'
  }
]

/** 按亮暗隔离规则取某侧可选风格（亮侧只列 light 变体，暗侧只列 dark 变体）。 */
export function juyaStylesForScheme(scheme: 'light' | 'dark'): JuyaStyleMeta[] {
  return JUYA_STYLES.filter((s) => s.colorScheme === scheme)
}
