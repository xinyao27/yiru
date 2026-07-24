import type { FileTree } from '@pierre/trees'
import { useLayoutEffect } from 'react'

import type { PierreFileTreeData } from './pierre-file-tree-data'

export function usePierreFileTreeFlash({
  flashingPath,
  model,
  treeData
}: {
  flashingPath: string | null
  model: FileTree
  treeData: PierreFileTreeData
}): void {
  useLayoutEffect(() => {
    const shadowRoot = model.getFileTreeContainer()?.shadowRoot
    if (!shadowRoot) {
      return
    }
    const updateMarker = (): void => {
      shadowRoot.querySelector('[data-yiru-flashing="true"]')?.removeAttribute('data-yiru-flashing')
      const canonicalPath = flashingPath
        ? treeData.canonicalPathByAbsolutePath.get(flashingPath)
        : null
      if (!canonicalPath) {
        return
      }
      for (const row of shadowRoot.querySelectorAll<HTMLElement>('[data-type="item"]')) {
        if (row.dataset.itemPath === canonicalPath) {
          row.dataset.yiruFlashing = 'true'
          break
        }
      }
    }
    updateMarker()
    // Why: reveal can scroll a virtual row into the Shadow DOM after React's
    // effect runs, so keep the marker in sync with row mount/unmount changes.
    const observer = new MutationObserver(updateMarker)
    observer.observe(shadowRoot, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      shadowRoot.querySelector('[data-yiru-flashing="true"]')?.removeAttribute('data-yiru-flashing')
    }
  }, [flashingPath, model, treeData.canonicalPathByAbsolutePath])
}
