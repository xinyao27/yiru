// Pure auto-scroll logic for the native chat message list. The component owns
// the DOM ref and the imperative scroll; this module owns only the decisions —
// "are we near the bottom?", "should we stick on new content?", and "show the
// jump affordance?".

/** The three scroll-container geometry values used by the policy. */
export type ScrollGeometry = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** Pixels from the bottom within which we treat the view as "at the bottom" and
 *  keep it pinned as content arrives. A small slack absorbs sub-pixel rounding
 *  and the height jitter of a streaming last message. */
export const NATIVE_CHAT_BOTTOM_THRESHOLD_PX = 48

/** Distance in px from the bottom edge of the scroll range. */
export function distanceFromBottom(geometry: ScrollGeometry): number {
  return Math.max(0, geometry.scrollHeight - geometry.clientHeight - geometry.scrollTop)
}

/** True when the viewport is close enough to the bottom that new content should
 *  keep it pinned (auto-scroll "attached"). */
export function isNearBottom(geometry: ScrollGeometry): boolean {
  return distanceFromBottom(geometry) <= NATIVE_CHAT_BOTTOM_THRESHOLD_PX
}

/** Whether the "jump to latest" affordance should show: only when the user has
 *  detached (scrolled up) and there is actually scrollable content below. */
export function shouldShowJumpToLatest(
  isStuckToBottom: boolean,
  geometry: ScrollGeometry
): boolean {
  if (isStuckToBottom) {
    return false
  }
  return distanceFromBottom(geometry) > NATIVE_CHAT_BOTTOM_THRESHOLD_PX
}
