import type { DiffComment } from '@yiru/runtime-protocol/workbench/types'
import { useRef } from 'react'

import type { DiffCodeViewNotice } from '../diff-code-view/notices'
import type { DiffCodeViewFile } from '../diff-code-view/view'
import type { DiffSection } from '../diff-section/types'
import { areCombinedDiffNoticesEqual, resolveCombinedDiffNotice } from './view-state'

type UseCombinedDiffCodeViewFilesOptions = {
  comments: DiffComment[]
  isBranchMode: boolean
  sections: DiffSection[]
  sideBySide: boolean
}

export function useCombinedDiffCodeViewFiles({
  comments,
  isBranchMode,
  sections,
  sideBySide
}: UseCombinedDiffCodeViewFilesOptions): DiffCodeViewFile[] {
  // Why: stable notice identities prevent each loaded row from re-versioning
  // every still-loading row and causing quadratic CodeView relayout.
  const noticeCacheRef = useRef(new Map<string, DiffCodeViewNotice>())
  const commentsByPath = new Map<string, DiffComment[]>()
  for (const comment of comments) {
    const fileComments = commentsByPath.get(comment.filePath)
    if (fileComments) {
      fileComments.push(comment)
    } else {
      commentsByPath.set(comment.filePath, [comment])
    }
  }

  return sections.map((section) => ({
    source: {
      key: section.key,
      path: section.path,
      oldPath: section.oldPath,
      status: section.status,
      originalContent: section.originalContent,
      modifiedContent: section.modifiedContent
    },
    collapsed: section.collapsed,
    // Why: staged and committed sides have no working-tree file this view may edit.
    editable: section.area === 'unstaged',
    comments: commentsByPath.get(section.path),
    notice: getMemoizedNotice(noticeCacheRef.current, section, {
      isBranchMode,
      sideBySide
    })
  }))
}

function getMemoizedNotice(
  cache: Map<string, DiffCodeViewNotice>,
  section: DiffSection,
  context: { isBranchMode: boolean; sideBySide: boolean }
): DiffCodeViewNotice | undefined {
  const next = resolveCombinedDiffNotice(section, context)
  const cached = cache.get(section.key)
  if (!next) {
    cache.delete(section.key)
    return undefined
  }
  if (cached && areCombinedDiffNoticesEqual(cached, next)) {
    return cached
  }
  cache.set(section.key, next)
  return next
}
