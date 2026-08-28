import { describe, expect, it } from 'vitest'
import { getStableTabOrder } from '../../src/renderer/components/tabContentOrder'

describe('getStableTabOrder', () => {
  it('preserves content DOM order when visual tab order changes', () => {
    const first = [
      { id: 'tab-1', kind: 'home' },
      { id: 'tab-2', kind: 'reader' },
      { id: 'tab-3', kind: 'settings' }
    ]
    const reordered = [first[2], first[0], first[1]]

    const order = getStableTabOrder(first, [])
    const next = getStableTabOrder(reordered, order.map((tab) => tab.id))

    expect(next.map((tab) => tab.id)).toEqual(['tab-1', 'tab-2', 'tab-3'])
  })

  it('removes closed tabs and appends newly created tabs', () => {
    const tabs = [
      { id: 'tab-3', kind: 'settings' },
      { id: 'tab-4', kind: 'home' },
      { id: 'tab-5', kind: 'reader' }
    ]

    const next = getStableTabOrder(tabs, ['tab-1', 'tab-3', 'tab-2'])

    expect(next.map((tab) => tab.id)).toEqual(['tab-3', 'tab-4', 'tab-5'])
  })
})
