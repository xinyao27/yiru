import { afterEach, describe, expect, it } from 'vite-plus/test'

import {
  clearCrashBreadcrumbsForTest,
  getCrashBreadcrumbSnapshot,
  recordCrashBreadcrumb
} from './crash-breadcrumb-store'

afterEach(clearCrashBreadcrumbsForTest)

describe('crash breadcrumb retention', () => {
  it('retains renderer heap high-water profiles outside the rolling ring', () => {
    recordCrashBreadcrumb('renderer_memory_highwater', {
      rendererSurface: 'main',
      thresholdPct: 60,
      'store.worktrees': 100
    })
    recordCrashBreadcrumb('renderer_memory_highwater', {
      rendererSurface: 'main',
      thresholdPct: 80,
      'store.worktrees': 200
    })
    for (let index = 0; index < 40; index += 1) {
      recordCrashBreadcrumb('ordinary', { index })
    }

    const snapshot = getCrashBreadcrumbSnapshot()
    expect(snapshot).toHaveLength(30)
    expect(snapshot.filter((entry) => entry.name === 'renderer_memory_highwater')).toHaveLength(2)
    expect(snapshot.filter((entry) => entry.name === 'ordinary')).toHaveLength(28)
  })
})
