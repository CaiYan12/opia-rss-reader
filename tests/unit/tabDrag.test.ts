import { describe, expect, it } from 'vitest'
import {
  getDragX,
  getEdgeScrollDelta,
  getTabShift,
  isPointerInsideWindow,
  releasePointerCapture
} from '../../src/renderer/components/tabDrag'

describe('tab drag geometry', () => {
  it('keeps the dragged tab under the pointer while the scroller moves', () => {
    expect(getDragX(980, 100, 50, 120)).toBe(950)
  })

  it('rejects pointer releases outside the renderer viewport', () => {
    expect(isPointerInsideWindow(799, 599, 800, 600)).toBe(true)
    expect(isPointerInsideWindow(800, 599, 800, 600)).toBe(false)
    expect(isPointerInsideWindow(799, 600, 800, 600)).toBe(false)
    expect(isPointerInsideWindow(-1, 300, 800, 600)).toBe(false)
  })

  it('caps edge scrolling when the captured pointer moves beyond the viewport', () => {
    expect(getEdgeScrollDelta(-100, 200, 48, 24)).toBe(-24)
    expect(getEdgeScrollDelta(200, -100, 48, 24)).toBe(24)
  })

  it('releases an active pointer capture during drag cleanup', () => {
    const target = {
      hasPointerCapture: () => true,
      releasePointerCapture: (pointerId: number) => {
        expect(pointerId).toBe(7)
      }
    }
    releasePointerCapture(target, 7)
  })

  it('shifts tabs between the original slot and the insertion boundary', () => {
    expect(getTabShift(1, 3, 1, 140)).toBe(140)
    expect(getTabShift(2, 3, 1, 140)).toBe(140)
    expect(getTabShift(0, 3, 1, 140)).toBe(0)
    expect(getTabShift(2, 1, 4, 140)).toBe(-140)
    expect(getTabShift(3, 1, 4, 140)).toBe(-140)
    expect(getTabShift(1, 1, 2, 140)).toBe(0)
  })
})
