import { describe, expect, it } from 'vitest'
import { getSourceMenuPosition } from '../../src/renderer/components/sourceMenuPosition'

describe('source menu position', () => {
  it('keeps the menu left aligned with the tab when there is enough room', () => {
    expect(getSourceMenuPosition({ left: 6, bottom: 110 }, 800)).toEqual({
      left: 6,
      top: 112
    })
  })

  it('shifts the fixed-width menu left when the tab is near the viewport edge', () => {
    expect(getSourceMenuPosition({ left: 650, bottom: 110 }, 800)).toEqual({
      left: 532,
      top: 112
    })
  })

  it('fits the menu inside a narrow viewport with an edge gutter', () => {
    expect(getSourceMenuPosition({ left: 120, bottom: 110 }, 220)).toEqual({
      left: 8,
      top: 112
    })
  })
})
