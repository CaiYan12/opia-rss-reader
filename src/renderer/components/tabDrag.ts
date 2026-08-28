/**
 * Convert a viewport pointer position into the dragged tab's local transform.
 * The scroller's scroll offset must be added because the absolute child moves
 * with the scrolled content while the pointer stays in viewport coordinates.
 */
export function getDragX(
  clientX: number,
  scrollerLeft: number,
  grabOffset: number,
  scrollLeft: number
): number {
  return clientX - scrollerLeft - grabOffset + scrollLeft
}

/** Whether a pointer coordinate is still inside the renderer viewport. */
export function isPointerInsideWindow(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return clientX >= 0 && clientY >= 0 && clientX < viewportWidth && clientY < viewportHeight
}

export function getEdgeScrollDelta(
  leftDistance: number,
  rightDistance: number,
  edgeZone: number,
  maxSpeed: number
): number {
  let delta = 0
  if (leftDistance < edgeZone) delta = -((edgeZone - leftDistance) / edgeZone) * maxSpeed
  else if (rightDistance < edgeZone) delta = ((edgeZone - rightDistance) / edgeZone) * maxSpeed
  return Math.max(-maxSpeed, Math.min(maxSpeed, delta))
}

/**
 * Return the visual shift for a non-dragged tab while the dragged tab leaves a gap.
 * insertionBoundary is the boundary index in the original tab array.
 */
export function getTabShift(
  tabIndex: number,
  dragIndex: number,
  insertionBoundary: number,
  tabWidth: number
): number {
  if (dragIndex < insertionBoundary && tabIndex > dragIndex && tabIndex < insertionBoundary) {
    return -tabWidth
  }
  if (dragIndex > insertionBoundary && tabIndex >= insertionBoundary && tabIndex < dragIndex) {
    return tabWidth
  }
  return 0
}

type PointerCaptureTarget = Pick<HTMLElement, 'hasPointerCapture' | 'releasePointerCapture'>

export function releasePointerCapture(target: PointerCaptureTarget | null, pointerId: number): void {
  if (target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
}
