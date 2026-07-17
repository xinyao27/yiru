import { describe, expect, it } from 'vitest'
import {
  computeTabStripScrollMetrics,
  getTabStripScrollMaskClassName
} from './tab-strip-scroll-metrics'

describe('computeTabStripScrollMetrics', () => {
  it('reports no overflow when all tabs fit', () => {
    expect(
      computeTabStripScrollMetrics({
        scrollWidth: 400,
        clientWidth: 400,
        scrollLeft: 0
      })
    ).toEqual({
      hasOverflow: false,
      canScrollStart: false,
      canScrollEnd: false
    })
  })

  it('tracks thumb size and offset while scrolled', () => {
    expect(
      computeTabStripScrollMetrics({
        scrollWidth: 800,
        clientWidth: 400,
        scrollLeft: 200
      })
    ).toEqual({
      hasOverflow: true,
      canScrollStart: true,
      canScrollEnd: true
    })
  })

  it('marks the start and end scroll edges', () => {
    expect(
      computeTabStripScrollMetrics({
        scrollWidth: 800,
        clientWidth: 400,
        scrollLeft: 0
      }).canScrollStart
    ).toBe(false)
    expect(
      computeTabStripScrollMetrics({
        scrollWidth: 800,
        clientWidth: 400,
        scrollLeft: 0
      }).canScrollEnd
    ).toBe(true)

    expect(
      computeTabStripScrollMetrics({
        scrollWidth: 800,
        clientWidth: 400,
        scrollLeft: 400
      }).canScrollStart
    ).toBe(true)
    expect(
      computeTabStripScrollMetrics({
        scrollWidth: 800,
        clientWidth: 400,
        scrollLeft: 400
      }).canScrollEnd
    ).toBe(false)
  })
})

describe('getTabStripScrollMaskClassName', () => {
  it('returns no classes when the strip does not overflow', () => {
    expect(
      getTabStripScrollMaskClassName({
        hasOverflow: false,
        canScrollStart: false,
        canScrollEnd: false
      })
    ).toBe('')
  })

  it('returns both fade classes when more tabs exist on both sides', () => {
    expect(
      getTabStripScrollMaskClassName({
        hasOverflow: true,
        canScrollStart: true,
        canScrollEnd: true
      })
    ).toBe('terminal-tab-strip--fade-start terminal-tab-strip--fade-end')
  })
})
