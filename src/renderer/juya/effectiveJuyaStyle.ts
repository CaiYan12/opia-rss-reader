import type { Settings } from '../../shared/types'
import type { JuyaStyleMeta } from './juyaStyles'
import { JUYA_STYLES } from './juyaStyles'

/** 计算当前生效的橘鸦风格变体（含亮暗侧解析）。
 *  跟随通用三态逻辑：system 按系统亮暗取对应侧字段，固定模式取对应侧。
 *  返回 null = 关闭（回退通用样式）或源身份不符（调用方已判）。 */
export function resolveJuyaVariant(
  settings: Settings,
  systemDark: boolean
): JuyaStyleMeta | null {
  const scheme =
    settings.themeMode === 'system' ? (systemDark ? 'dark' : 'light') : settings.themeMode
  const styleId = scheme === 'light' ? settings.juyaLightStyleId : settings.juyaDarkStyleId
  if (styleId === 'off') return null
  return (
    JUYA_STYLES.find((s) => s.styleId === styleId && s.colorScheme === scheme) ?? null
  )
}
