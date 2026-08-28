export const APP_TITLE = 'Opia RSS Reader'

export function formatWindowTitle(pageTitle: string): string {
  return pageTitle ? `${APP_TITLE} - ${pageTitle}` : APP_TITLE
}
