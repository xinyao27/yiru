import type { TabGroupLayoutNode } from '~shared/types'

import { RuntimeSessionGetMergedMobileSessionPublicationEpoch } from './get-merged-mobile-session-publication-epoch'

export abstract class RuntimeSessionPruneMobileSessionTabGroupLayout extends RuntimeSessionGetMergedMobileSessionPublicationEpoch {
  protected pruneMobileSessionTabGroupLayout(
    layout: TabGroupLayoutNode | null | undefined,
    validGroupIds: ReadonlySet<string>
  ): TabGroupLayoutNode | null {
    if (!layout) {
      return null
    }
    if (layout.type === 'leaf') {
      return validGroupIds.has(layout.groupId) ? layout : null
    }
    const first = this.pruneMobileSessionTabGroupLayout(layout.first, validGroupIds)
    const second = this.pruneMobileSessionTabGroupLayout(layout.second, validGroupIds)
    if (first && second) {
      return { ...layout, first, second }
    }
    return first ?? second
  }

  /**
   * Transforms an internal mobile session tab snapshot into a sanitized client payload,
   * resolving launch agent ownership and normalizing titles.
   */
}
