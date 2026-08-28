import type { GitLabWorkItem } from '@yiru/runtime-protocol/workbench/types'
import { useEffect, useState } from 'react'

import { parseGitLabMergeRequestLink } from './gitlab-links'
import {
  listGitLabMRsForSource,
  lookupGitLabWorkItemByPathForSource
} from './gitlab-work-item-source-lookup'
import {
  getGitlabSearchRequest,
  getVisibleGitlabItems,
  gitlabSearchRequestsEqual,
  type SmartWorkspaceGitlabSearchRequest
} from './smart-workspace-gitlab-search'
import type { MrStateFilter } from './smart-workspace-localized-options'
import {
  isSmartWorkspaceSourceQueryWithinLimit,
  type SmartNameMode
} from './smart-workspace-source-results'
import type { SmartWorkspaceSearchTarget } from './use-smart-github-search'

const RESULT_LIMIT = 12

type UseSmartGitlabSearchOptions = {
  debouncedQuery: string
  disabled: boolean
  hasGitlabHandler: boolean
  isAvailable: boolean
  mode: SmartNameMode
  mrStateFilter: MrStateFilter
  repoBackedSearchTargets: SmartWorkspaceSearchTarget[]
  repoBackedSourcesDisabled: boolean
  textOnly: boolean
}

export function useSmartGitlabSearch({
  debouncedQuery,
  disabled,
  hasGitlabHandler,
  isAvailable,
  mode,
  mrStateFilter,
  repoBackedSearchTargets,
  repoBackedSourcesDisabled,
  textOnly
}: UseSmartGitlabSearchOptions): { isLoading: boolean; items: GitLabWorkItem[] } {
  const [items, setItems] = useState<GitLabWorkItem[]>([])
  const [resultTag, setResultTag] = useState<SmartWorkspaceGitlabSearchRequest | null>(null)
  const isQueryWithinLimit = isSmartWorkspaceSourceQueryWithinLimit(debouncedQuery)
  const parsedLink = (() => {
    const link = isQueryWithinLimit ? parseGitLabMergeRequestLink(debouncedQuery) : null
    return link?.type === 'mr' ? link : null
  })()
  const request = getGitlabSearchRequest({
    shouldQueryGitlab:
      isQueryWithinLimit &&
      !repoBackedSourcesDisabled &&
      !textOnly &&
      isAvailable &&
      repoBackedSearchTargets.length > 0 &&
      (mode === 'smart' || mode === 'gitlab'),
    disabled,
    hasGitlabHandler,
    query: debouncedQuery.trim(),
    targetRepoIds: repoBackedSearchTargets.map((target) => target.repo.id),
    parsedLink,
    mrStateFilter
  })
  const isLoading = request !== null && !gitlabSearchRequestsEqual(request, resultTag)
  const visibleItems = getVisibleGitlabItems({
    items,
    currentRequest: request,
    resultRequest: resultTag
  })

  useEffect(() => {
    if (!request) {
      return
    }
    let isStale = false
    const commitItems = (nextItems: GitLabWorkItem[]): void => {
      if (!isStale) {
        setItems(nextItems)
        setResultTag(request)
      }
    }
    if (request.kind === 'paste-lookup') {
      void Promise.all(
        repoBackedSearchTargets.map((target) =>
          lookupGitLabWorkItemByPathForSource({
            repoPath: target.repo.path,
            repoId: target.repo.id,
            sourceContext: target.gitlabSourceContext,
            host: request.host,
            path: request.path,
            iid: request.iid,
            type: 'mr'
          }).catch(() => null)
        )
      )
        .then((results) =>
          commitItems(results.filter((item): item is GitLabWorkItem => item !== null))
        )
        .catch(() => commitItems([]))
      return () => {
        isStale = true
      }
    }
    void Promise.all(
      repoBackedSearchTargets.map((target) =>
        listGitLabMRsForSource({
          repoPath: target.repo.path,
          repoId: target.repo.id,
          sourceContext: target.gitlabSourceContext,
          state: request.mrStateFilter,
          page: 1,
          perPage: RESULT_LIMIT,
          query: request.query || undefined
        }).catch(() => ({ items: [], hasMore: false }))
      )
    )
      .then((results) =>
        commitItems(
          results
            .flatMap((result) => result.items)
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
            .slice(0, RESULT_LIMIT)
        )
      )
      .catch(() => commitItems([]))
    return () => {
      isStale = true
    }
  }, [repoBackedSearchTargets, request])

  return { isLoading, items: visibleItems }
}
