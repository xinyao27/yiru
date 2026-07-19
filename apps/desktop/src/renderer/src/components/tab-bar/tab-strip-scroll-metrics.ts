import { cn } from '@/lib/class-names'

export type TabStripScrollMetrics = {
  hasOverflow: boolean
  canScrollStart: boolean
  canScrollEnd: boolean
}

const OVERFLOW_EPSILON_PX = 1

export function computeTabStripScrollMetrics(
  el: Pick<HTMLElement, 'scrollWidth' | 'clientWidth' | 'scrollLeft'>
): TabStripScrollMetrics {
  const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
  const hasOverflow = maxScrollLeft > OVERFLOW_EPSILON_PX

  return {
    hasOverflow,
    canScrollStart: hasOverflow && el.scrollLeft > OVERFLOW_EPSILON_PX,
    canScrollEnd: hasOverflow && el.scrollLeft < maxScrollLeft - OVERFLOW_EPSILON_PX
  }
}

export function getTabStripScrollMaskClassName(
  metrics: Pick<TabStripScrollMetrics, 'canScrollStart' | 'canScrollEnd' | 'hasOverflow'>
): string {
  if (!metrics.hasOverflow) {
    return ''
  }

  return cn(
    metrics.canScrollStart && 'terminal-tab-strip--fade-start',
    metrics.canScrollEnd && 'terminal-tab-strip--fade-end'
  )
}

export function sameTabStripScrollMetrics(
  left: TabStripScrollMetrics,
  right: TabStripScrollMetrics
): boolean {
  return (
    left.hasOverflow === right.hasOverflow &&
    left.canScrollStart === right.canScrollStart &&
    left.canScrollEnd === right.canScrollEnd
  )
}
