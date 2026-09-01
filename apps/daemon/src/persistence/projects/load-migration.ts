import { isPathInsideOrEqual } from '@yiru/runtime-protocol/model/platform'
import { createProjectGroup } from '@yiru/runtime-protocol/workbench/project-groups'
import { isFolderRepo } from '@yiru/runtime-protocol/workbench/repo-kind'
import type { PersistedState } from '@yiru/runtime-protocol/workbench/types'
import { createNestedProjectGroupResolver } from '~main/project-groups/nested-repo-import'

export function adaptFlatFolderScanProjectGroups(state: PersistedState): boolean {
  // Why: older folder imports persisted a real parent path but kept all repos flat.
  const groups = state.projectGroups ?? []
  const repos = state.repos
  if (groups.length === 0 || repos.length === 0) {
    return false
  }

  let changed = false
  let maxOrder = -1
  for (const group of groups) {
    maxOrder = Math.max(maxOrder, group.tabOrder)
  }

  const childGroupIds = new Set(
    groups.flatMap((group) => (group.parentGroupId ? [group.parentGroupId] : []))
  )
  const initialGroupCount = groups.length
  for (let groupIndex = 0; groupIndex < initialGroupCount; groupIndex += 1) {
    const rootGroup = groups[groupIndex]
    if (
      !rootGroup ||
      rootGroup.createdFrom !== 'folder-scan' ||
      !rootGroup.parentPath ||
      rootGroup.parentGroupId ||
      childGroupIds.has(rootGroup.id)
    ) {
      continue
    }
    const rootPath = rootGroup.parentPath
    const repoCandidates = repos.filter(
      (repo) =>
        !isFolderRepo(repo) &&
        repo.projectGroupId === rootGroup.id &&
        isPathInsideOrEqual(rootPath, repo.path)
    )
    if (repoCandidates.length < 2) {
      continue
    }

    const resolver = createNestedProjectGroupResolver({
      parentPath: rootPath,
      groupName: rootGroup.name,
      mode: 'group',
      repoPaths: repoCandidates.map((repo) => repo.path),
      createGroup: (input) => {
        if (!input.parentGroupId) {
          return rootGroup
        }
        maxOrder += 1
        const group = createProjectGroup({ ...input, tabOrder: maxOrder })
        groups.push(group)
        changed = true
        return group
      }
    })
    const nextOrderByGroupId = new Map<string, number>()
    for (const repo of repoCandidates) {
      const group = resolver.getGroupForRepo(repo.path)
      if (!group) {
        continue
      }
      const nextOrder = nextOrderByGroupId.get(group.id) ?? 0
      nextOrderByGroupId.set(group.id, nextOrder + 1)
      if (repo.projectGroupId !== group.id || repo.projectGroupOrder !== nextOrder) {
        repo.projectGroupId = group.id
        repo.projectGroupOrder = nextOrder
        changed = true
      }
    }
  }
  return changed
}
