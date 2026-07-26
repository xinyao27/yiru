import { afterEach, describe, expect, it } from 'vite-plus/test'

import {
  collectRendererMemoryProfileCounts,
  registerRendererMemoryProfileContributor,
  summarizeStateCollectionSizes
} from './renderer-memory-profile'

const unregisters: (() => void)[] = []

afterEach(() => {
  while (unregisters.length > 0) {
    unregisters.pop()?.()
  }
})

describe('renderer memory profiles', () => {
  it('namespaces finite counts and contains throwing contributors', () => {
    unregisters.push(
      registerRendererMemoryProfileContributor('store', () => ({
        worktrees: 40,
        bad: Number.NaN
      })),
      registerRendererMemoryProfileContributor('broken', () => {
        throw new Error('boom')
      })
    )

    expect(collectRendererMemoryProfileCounts()).toEqual({
      'store.worktrees': 40,
      'broken.error': 1
    })
  })

  it('bounds runaway contributor output', () => {
    unregisters.push(
      registerRendererMemoryProfileContributor('runaway', () =>
        Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`key${index}`, index]))
      )
    )

    expect(Object.keys(collectRendererMemoryProfileCounts())).toHaveLength(32)
  })

  it('summarizes only the largest top-level collections', () => {
    expect(
      summarizeStateCollectionSizes(
        { worktrees: Array(10), tabs: new Set([1, 2, 3]), meta: { a: 1 }, count: 9 },
        2
      )
    ).toEqual({ worktrees: 10, tabs: 3 })
  })
})
