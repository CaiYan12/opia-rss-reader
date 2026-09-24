import type { JuyaStyleKey, JuyaTemplate } from './templateTypes'
import { folioTemplate } from './templates/folio'
import { y2kTemplate } from './templates/y2k'
import { popTemplate } from './templates/pop'
import { newsprint90sTemplate } from './templates/newsprint90s'
import { dreamcoreTemplate } from './templates/dreamcore'
import { nocturneTemplate } from './templates/nocturne'
import { editorialTemplate } from './templates/editorial'
import { wabiTemplate } from './templates/wabi'
import './juya.css'

/** 风格 → 模板注册表（内置、只读）。调用方先用 resolveJuyaVariant 解析当前变体，
 *  再以 variant.styleId 取模板、以 variant.id 作为 data-juya-variant 传入。 */
export const JUYA_TEMPLATES: Record<JuyaStyleKey, JuyaTemplate> = {
  folio: folioTemplate,
  y2k: y2kTemplate,
  pop: popTemplate,
  newsprint90s: newsprint90sTemplate,
  dreamcore: dreamcoreTemplate,
  nocturne: nocturneTemplate,
  editorial: editorialTemplate,
  wabi: wabiTemplate
}
