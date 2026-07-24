export const VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT = 'yiru-record-virtualized-scroll-anchor'

/** Captures the visible anchor in the same tick as a non-view row mutation. */
export function requestVirtualizedScrollAnchorRecord(scrollElementSelector: string): void {
  if (typeof document === 'undefined') {
    return
  }
  document
    .querySelector(scrollElementSelector)
    ?.dispatchEvent(new Event(VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT))
}
