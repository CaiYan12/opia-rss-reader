/**
 * Keep content panels in a stable DOM order while the visual tab strip is reordered.
 * Existing tabs retain their previous order; newly created tabs append to it.
 */
export function getStableTabOrder<T extends { id: string }>(tabs: T[], previousIds: string[]): T[] {
  const current = new Map(tabs.map((tab) => [tab.id, tab]))
  const ordered: T[] = []

  for (const id of previousIds) {
    const tab = current.get(id)
    if (tab) {
      ordered.push(tab)
      current.delete(id)
    }
  }

  for (const tab of tabs) {
    if (current.has(tab.id)) {
      ordered.push(tab)
      current.delete(tab.id)
    }
  }

  return ordered
}
