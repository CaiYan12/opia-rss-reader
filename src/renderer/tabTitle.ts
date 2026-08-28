import type { Tab } from './stores/useAppStore'

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** 当前标签在 TabStrip 与原生窗口标题中共用的可见页面标题。 */
export function getTabTitle(tab: Tab): string {
  switch (tab.kind) {
    case 'home':
      return '主页'
    case 'reader':
      return tab.article.title
    case 'browser':
      return tab.title || hostnameOf(tab.url)
    case 'settings':
      return '设置'
  }
}
