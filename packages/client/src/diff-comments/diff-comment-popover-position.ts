/** Pure geometry for placing a diff-comment popover relative to its line. */
const POPOVER_VIEWPORT_MARGIN_PX = 8

export type ResolveDiffCommentPopoverTopArgs = {
  // Top of the popover when it opens just below the anchor line — the value
  // getDiffCommentPopoverTop returns — in offset-parent coordinates.
  belowTop: number
  lineHeight: number
  popoverHeight: number
  // Visible height of the popover's offset parent (the editor body), which is
  // the region an overflow ancestor clips the popover against.
  viewportHeight: number
  margin?: number
}

// Why: the popover anchors below the selected line by default, but near the
// bottom of the viewport that downward box is clipped by the editor pane's
// overflow container. Flip it above the line when it doesn't fit below; if it
// fits neither way (popover taller than the viewport) clamp it inside the
// visible area so the footer actions stay reachable.
export function resolveDiffCommentPopoverTop({
  belowTop,
  lineHeight,
  popoverHeight,
  viewportHeight,
  margin = POPOVER_VIEWPORT_MARGIN_PX
}: ResolveDiffCommentPopoverTopArgs): number {
  // Geometry not measured yet (first paint): keep the default below position.
  if (popoverHeight <= 0 || viewportHeight <= 0) {
    return belowTop
  }
  if (belowTop + popoverHeight + margin <= viewportHeight) {
    return belowTop
  }
  const aboveTop = belowTop - lineHeight - popoverHeight
  if (aboveTop >= margin) {
    return aboveTop
  }
  // Neither side fits cleanly: clamp within the viewport, keeping the top edge
  // visible so the label and textarea stay reachable.
  const maxTop = viewportHeight - popoverHeight - margin
  return Math.max(margin, Math.min(belowTop, maxTop))
}
