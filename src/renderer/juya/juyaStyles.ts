import type { JuyaStyleId } from '../../shared/types'

/** 橘鸦定制阅读风格注册表（渲染进程内置、只读，不进 ThemeService/ThemeEditor 体系）。
 *  八种风格 × 亮暗双变体 = 16 个条目；用户仅能选择，不可编辑（见 docs/PLAN-20260828.md Q11）。
 *  2026-09-24 重设计：card 被 folio 取代，新增 nocturne/editorial/wabi。 */

export type JuyaStyleVariantId =
  | 'folio-light'
  | 'folio-dark'
  | 'y2k-light'
  | 'y2k-dark'
  | 'pop-light'
  | 'pop-dark'
  | 'newsprint90s-light'
  | 'newsprint90s-dark'
  | 'dreamcore-light'
  | 'dreamcore-dark'
  | 'nocturne-light'
  | 'nocturne-dark'
  | 'editorial-light'
  | 'editorial-dark'
  | 'wabi-light'
  | 'wabi-dark'

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
    id: 'folio-light',
    styleId: 'folio',
    name: '纸感精读式',
    colorScheme: 'light',
    focusColor: '#b3452e',
    background: 'css-svg'
  },
  {
    id: 'folio-dark',
    styleId: 'folio',
    name: '纸感精读式',
    colorScheme: 'dark',
    focusColor: '#e0956f',
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
  },
  {
    id: 'nocturne-light',
    styleId: 'nocturne',
    name: '暗夜精修式',
    colorScheme: 'light',
    focusColor: '#4f5ed8',
    background: 'css-svg'
  },
  {
    id: 'nocturne-dark',
    styleId: 'nocturne',
    name: '暗夜精修式',
    colorScheme: 'dark',
    focusColor: '#8b97ff',
    background: 'css-svg'
  },
  {
    id: 'editorial-light',
    styleId: 'editorial',
    name: '杂志编辑式',
    colorScheme: 'light',
    focusColor: '#8a2f2b',
    background: 'css-svg'
  },
  {
    id: 'editorial-dark',
    styleId: 'editorial',
    name: '杂志编辑式',
    colorScheme: 'dark',
    focusColor: '#d08a7d',
    background: 'css-svg'
  },
  {
    id: 'wabi-light',
    styleId: 'wabi',
    name: '侘寂日杂式',
    colorScheme: 'light',
    focusColor: '#a5654a',
    background: 'css-svg'
  },
  {
    id: 'wabi-dark',
    styleId: 'wabi',
    name: '侘寂日杂式',
    colorScheme: 'dark',
    focusColor: '#c99a7d',
    background: 'css-svg'
  }
]

/** 按亮暗隔离规则取某侧可选风格（亮侧只列 light 变体，暗侧只列 dark 变体）。 */
export function juyaStylesForScheme(scheme: 'light' | 'dark'): JuyaStyleMeta[] {
  return JUYA_STYLES.filter((s) => s.colorScheme === scheme)
}
