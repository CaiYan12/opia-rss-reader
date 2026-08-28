export interface SourceMenuPosition {
  left: number
  top: number
}

/** 下拉菜单按单个标签的最大宽度展开；窄窗口时由视口宽度继续收窄。 */
export const SOURCE_MENU_MAX_WIDTH = 260

const SOURCE_MENU_EDGE_GUTTER = 8
const SOURCE_MENU_OFFSET = 2

export function getSourceMenuPosition(
  tabRect: Pick<DOMRect, 'left' | 'bottom'>,
  viewportWidth: number
): SourceMenuPosition {
  const availableWidth = Math.max(0, viewportWidth - SOURCE_MENU_EDGE_GUTTER * 2)
  const menuWidth = Math.min(SOURCE_MENU_MAX_WIDTH, availableWidth)
  const maxLeft = Math.max(
    SOURCE_MENU_EDGE_GUTTER,
    viewportWidth - menuWidth - SOURCE_MENU_EDGE_GUTTER
  )

  return {
    // 有空间时保留标签原始 left；只有超出右侧可用范围才向左收敛。
    left: Math.min(Math.max(tabRect.left, 0), maxLeft),
    top: tabRect.bottom + SOURCE_MENU_OFFSET
  }
}
