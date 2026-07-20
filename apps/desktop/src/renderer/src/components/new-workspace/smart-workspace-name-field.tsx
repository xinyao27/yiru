import type { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import {
  TextAa as CaseSensitive,
  GitBranch,
  GitMerge,
  GitPullRequest,
  MagnifyingGlass as Search
} from '@phosphor-icons/react'
/* eslint-disable max-lines -- Why: the smart name field owns source tabs,
search orchestration, and result rendering so the unified create flow stays
in one predictable form control instead of splitting state across fragments. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { LoadingIndicator } from '@/components/loading-indicator'
import {
  ArrowSquareOut as ExternalLink,
  GitBranch as GitBranchPlus,
  X
} from '@/components/regular-icons'
import { Button } from '@/components/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import {
  normalizeGitHubLinkQuery,
  parseGitHubPullRequestLink,
  type RepoSlug
} from '@/lib/github-links'
import {
  lookupGitHubWorkItemByOwnerRepoForSource,
  lookupGitHubWorkItemForSource
} from '@/lib/github-work-item-source-lookup'
import { parseGitLabMergeRequestLink } from '@/lib/gitlab-links'
import {
  listGitLabMRsForSource,
  lookupGitLabWorkItemByPathForSource
} from '@/lib/gitlab-work-item-source-lookup'
import { getLocalPreflightContext, localPreflightContextKey } from '@/lib/local-preflight-context'
import { getRepoOwnerRoutedSettings } from '@/lib/repo-runtime-owner'
import { lookupSmartGitHubSubmitItem } from '@/lib/smart-github-submit'
import {
  getRuntimeRepoBaseRefDefault,
  searchRuntimeRepoBaseRefDetails
} from '@/runtime/runtime-repo-client'
import { useAppStore } from '@/store'

import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import {
  buildProjectSourceContextFromRepo,
  type ProjectSourceContext
} from '../../../../shared/project-source-context'
import type { BaseRefSearchResult, GitHubWorkItem, GitLabWorkItem } from '../../../../shared/types'
import { resolveSmartWorkspaceCommandValue } from './smart-workspace-command-value'
import {
  getMrStateFilters,
  getSmartWorkspaceNameModes,
  type MrStateFilter
} from './smart-workspace-localized-options'
import { isComposerFieldToFieldFocus } from './smart-workspace-source-popover-focus'
import {
  buildSmartWorkspaceSourceRows,
  getBranchSearchRequest,
  getSmartWorkspaceEmptyHint,
  getVisibleBranchResults,
  isSmartWorkspaceSourceQueryWithinLimit,
  type SmartNameMode,
  type SmartWorkspaceSourceRow
} from './smart-workspace-source-results'

type RepoOption = ReturnType<typeof useAppStore.getState>['repos'][number]
const EMPTY_REPO_SEARCH_REPOS: readonly RepoOption[] = []

type SmartWorkspaceNameFieldProps = {
  repos: RepoOption[]
  repoId: string
  onRepoChange: (repoId: string) => void
  value: string
  onValueChange: (value: string) => void
  onGitHubItemSelect: (item: GitHubWorkItem) => void
  /** Optional so callers that pre-date GitLab support don't need to wire
   *  it. When omitted, GitLab paste-URL detection is silently skipped. */
  onGitLabItemSelect?: (item: GitLabWorkItem) => void
  onBranchSelect: (refName: string, localBranchName: string) => void
  selectedSource: SmartWorkspaceNameSelection | null
  onClearSelectedSource: () => void
  githubSourceContext?: ProjectSourceContext | null
  inputRef?: React.RefObject<HTMLInputElement | null>
  onPlainEnter?: () => void
  disabled?: boolean
  disabledPlaceholder?: string
  textOnly?: boolean
  branchesEnabled?: boolean
  repoBackedSourcesDisabled?: boolean
  repoBackedSearchRepos?: readonly RepoOption[]
  allowCrossRepoProjectAdd?: boolean
  crossRepoSwitchTarget?: 'project' | 'project-source'
  onActiveSourceModeChange?: (mode: SmartNameMode) => void
}

export type SmartWorkspaceNameSelection = {
  kind: 'github-pr' | 'gitlab-mr' | 'branch'
  label: string
  url?: string
}

const SEARCH_DEBOUNCE_MS = 200
const RESULT_LIMIT = 12

export function canUseGitLabSmartSource({
  localGitlabAvailable,
  repoBackedSourcesDisabled,
  sourceHostId
}: {
  localGitlabAvailable: boolean
  repoBackedSourcesDisabled: boolean
  sourceHostId: ExecutionHostId | null | undefined
}): boolean {
  if (repoBackedSourcesDisabled) {
    return false
  }
  const parsedHost = parseExecutionHostId(sourceHostId)
  return parsedHost?.kind === 'ssh' || parsedHost?.kind === 'runtime' || localGitlabAvailable
}

type RowEntry = SmartWorkspaceSourceRow

const ROW_ITEM_CLASS_NAME = 'gap-2 px-3 py-2 text-xs'

function isTypedTextSourceRow(row: RowEntry): boolean {
  return row.kind === 'use-name' || row.kind === 'create-branch'
}

function getRowItemClassName(row: RowEntry, options?: { pinnedAction?: boolean }): string {
  return cn(
    ROW_ITEM_CLASS_NAME,
    options?.pinnedAction && isTypedTextSourceRow(row) && 'bg-muted/35'
  )
}

export default function SmartWorkspaceNameField({
  repos,
  repoId,
  onRepoChange,
  value,
  onValueChange,
  onGitHubItemSelect,
  onGitLabItemSelect,
  onBranchSelect,
  selectedSource,
  onClearSelectedSource,
  githubSourceContext: githubSourceContextOverride,
  inputRef,
  onPlainEnter,
  disabled = false,
  disabledPlaceholder,
  textOnly = false,
  branchesEnabled = true,
  repoBackedSourcesDisabled = false,
  repoBackedSearchRepos = EMPTY_REPO_SEARCH_REPOS,
  allowCrossRepoProjectAdd = true,
  crossRepoSwitchTarget = 'project',
  onActiveSourceModeChange
}: SmartWorkspaceNameFieldProps): React.JSX.Element {
  // Why: tab/filter labels use the lightweight translate() helper; subscribing
  // here makes them refresh even when language changes don't remount the field.
  useTranslation()
  const {
    addRepo,
    fetchWorkItems,
    fetchWorkItemsAcrossRepos,
    getCachedWorkItems,
    preflightStatus,
    preflightStatusChecked,
    preflightStatusContextKey,
    expectedPreflightContextKey,
    refreshPreflightStatus,
    settings
  } = useAppStore(
    useShallow((s) => ({
      addRepo: s.addRepo,
      fetchWorkItems: s.fetchWorkItems,
      fetchWorkItemsAcrossRepos: s.fetchWorkItemsAcrossRepos,
      getCachedWorkItems: s.getCachedWorkItems,
      preflightStatus: s.preflightStatus,
      preflightStatusChecked: s.preflightStatusChecked,
      preflightStatusContextKey: s.preflightStatusContextKey,
      expectedPreflightContextKey: localPreflightContextKey(getLocalPreflightContext(s)),
      refreshPreflightStatus: s.refreshPreflightStatus,
      settings: s.settings
    }))
  )
  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.id === repoId) ?? null,
    [repoId, repos]
  )
  const selectedRepoOwnerSettings = useMemo(
    () => getRepoOwnerRoutedSettings(settings, selectedRepo),
    [selectedRepo, settings]
  )
  const selectedRepoHostId = selectedRepo ? getRepoExecutionHostId(selectedRepo) : undefined
  const githubSourceContext = useMemo(() => {
    if (githubSourceContextOverride?.provider === 'github') {
      return githubSourceContextOverride
    }
    return selectedRepo
      ? buildProjectSourceContextFromRepo({
          provider: 'github',
          projectId: selectedRepo.id,
          repo: selectedRepo
        })
      : null
  }, [githubSourceContextOverride, selectedRepo])
  const gitlabSourceContext = useMemo(
    () =>
      selectedRepo
        ? buildProjectSourceContextFromRepo({
            provider: 'gitlab',
            projectId: selectedRepo.id,
            repo: selectedRepo
          })
        : null,
    [selectedRepo]
  )
  const repoBackedSearchTargets = useMemo(
    () =>
      (repoBackedSearchRepos.length > 0
        ? repoBackedSearchRepos
        : selectedRepo
          ? [selectedRepo]
          : []
      ).map((repo) => ({
        repo,
        githubSourceContext:
          repo.id === selectedRepo?.id && githubSourceContext?.provider === 'github'
            ? githubSourceContext
            : buildProjectSourceContextFromRepo({
                provider: 'github',
                projectId: repo.id,
                repo
              }),
        gitlabSourceContext:
          repo.id === selectedRepo?.id && gitlabSourceContext?.provider === 'gitlab'
            ? gitlabSourceContext
            : buildProjectSourceContextFromRepo({
                provider: 'gitlab',
                projectId: repo.id,
                repo
              })
      })),
    [githubSourceContext, gitlabSourceContext, repoBackedSearchRepos, selectedRepo]
  )
  const [mode, setMode] = useState<SmartNameMode>(textOnly ? 'text' : 'smart')
  const [mrStateFilter, setMrStateFilter] = useState<MrStateFilter>('opened')
  const [open, setOpen] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState(value)
  const [githubItems, setGithubItems] = useState<GitHubWorkItem[]>([])
  const [gitlabItems, setGitlabItems] = useState<GitLabWorkItem[]>([])
  const [branches, setBranches] = useState<BaseRefSearchResult[]>([])
  const [branchDefaultBaseRef, setBranchDefaultBaseRef] = useState<string | null>(null)
  const [branchResultsSource, setBranchResultsSource] = useState<{
    repoId: string
    query: string
  } | null>(null)
  const [githubLoading, setGithubLoading] = useState(false)
  const [gitlabLoading, setGitlabLoading] = useState(false)
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [commandValue, setCommandValue] = useState('')
  const localInputRef = useRef<HTMLInputElement | null>(null)
  const focusedSelectedSourceKeyRef = useRef<string | null>(null)
  const tabsListRef = useRef<HTMLDivElement | null>(null)
  const repoSlugCacheRef = useRef<Map<string, RepoSlug | null>>(new Map())
  const handledCrossRepoUrlRef = useRef<string | null>(null)
  const localInputFocusFrameRef = useRef<number | null>(null)
  // Why: dialog autofocus and other programmatic .focus() calls can look
  // user-initiated in Electron, so gate the source popover until the user
  // actually interacts with this field or tabs from another composer control.
  const deferSourcePopoverUntilInteractionRef = useRef(true)
  const [crossRepoPrompt, setCrossRepoPrompt] = useState<{
    link: NonNullable<ReturnType<typeof parseGitHubPullRequestLink>>
    matchingRepo: RepoOption | null
  } | null>(null)

  useEffect(() => {
    onActiveSourceModeChange?.(mode)
  }, [mode, onActiveSourceModeChange])
  const preflightStatusCurrent = preflightStatusContextKey === expectedPreflightContextKey
  const localGitlabAvailable = preflightStatusCurrent && preflightStatus?.glab?.installed === true
  const gitlabSourceAvailable = repoBackedSearchTargets.some((target) =>
    canUseGitLabSmartSource({
      localGitlabAvailable,
      repoBackedSourcesDisabled,
      sourceHostId: target.gitlabSourceContext?.hostId
    })
  )
  const availableModes = getSmartWorkspaceNameModes().filter((item) => {
    if (textOnly) {
      return item.id === 'text'
    }
    if (item.id === 'github') {
      return !repoBackedSourcesDisabled
    }
    if (item.id === 'gitlab') {
      return gitlabSourceAvailable
    }
    if (item.id === 'branches') {
      return branchesEnabled && !repoBackedSourcesDisabled
    }
    return true
  })
  const mrStateFilters = getMrStateFilters()

  useEffect(() => {
    if (availableModes.some((item) => item.id === mode)) {
      return
    }
    setMode(availableModes[0]?.id ?? 'text')
  }, [availableModes, mode])

  useEffect(() => {
    if (!repoBackedSourcesDisabled) {
      return
    }
    setGithubItems([])
    setGitlabItems([])
    setBranches([])
    setBranchDefaultBaseRef(null)
    setGithubLoading(false)
    setGitlabLoading(false)
    setBranchesLoading(false)
    setBranchResultsSource(null)
    setCrossRepoPrompt(null)
  }, [repoBackedSourcesDisabled])

  const selectedSourceFocusKey = selectedSource
    ? `${selectedSource.kind}:${selectedSource.label}:${selectedSource.url ?? ''}`
    : null
  const setSelectedSourceNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        focusedSelectedSourceKeyRef.current = null
        return
      }
      if (
        !selectedSourceFocusKey ||
        focusedSelectedSourceKeyRef.current === selectedSourceFocusKey
      ) {
        return
      }
      focusedSelectedSourceKeyRef.current = selectedSourceFocusKey
      // Why: after Enter accepts a source row, the input unmounts. Move focus
      // to the pill immediately so the next Enter advances to Agent.
      node.focus({ preventScroll: true })
    },
    [selectedSourceFocusKey]
  )

  const cancelLocalInputFocusFrame = useCallback((): void => {
    if (localInputFocusFrameRef.current === null) {
      return
    }
    cancelAnimationFrame(localInputFocusFrameRef.current)
    localInputFocusFrameRef.current = null
  }, [])

  const markSourcePopoverUserEngaged = useCallback((): void => {
    deferSourcePopoverUntilInteractionRef.current = false
  }, [])

  const tryOpenSourcePopover = useCallback((): void => {
    if (disabled || mode === 'text' || deferSourcePopoverUntilInteractionRef.current) {
      return
    }
    setOpen(true)
  }, [disabled, mode])

  const handleSourcePopoverOpenChange = useCallback(
    (next: boolean, eventDetails: PopoverPrimitive.Root.ChangeEventDetails): void => {
      // Why: the input is a PopoverAnchor, not a PopoverTrigger, so Base UI
      // treats clicks/focus on it (and the mode tabs) as outside presses.
      // Cancel those closes to keep results open — replaces the old
      // onPointerDownOutside/onFocusOutside handlers on the content.
      if (
        !next &&
        (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out')
      ) {
        const target = eventDetails.event.target as Node | null
        if (
          target &&
          (localInputRef.current?.contains(target) || tabsListRef.current?.contains(target))
        ) {
          eventDetails.cancel()
          return
        }
      }
      if (disabled || selectedSource) {
        setOpen(false)
        return
      }
      if (next && deferSourcePopoverUntilInteractionRef.current) {
        return
      }
      setOpen(next)
    },
    [disabled, selectedSource]
  )

  const setInputNode = useCallback(
    (node: HTMLInputElement | null) => {
      if (node === null) {
        cancelLocalInputFocusFrame()
      }
      localInputRef.current = node
      if (inputRef) {
        inputRef.current = node
      }
    },
    [cancelLocalInputFocusFrame, inputRef]
  )

  useEffect(() => {
    if (disabled || textOnly) {
      return
    }
    if (!preflightStatusChecked || !preflightStatusCurrent) {
      void refreshPreflightStatus()
    }
  }, [disabled, preflightStatusChecked, preflightStatusCurrent, refreshPreflightStatus, textOnly])

  useEffect(() => {
    if (textOnly) {
      if (mode !== 'text') {
        setMode('text')
      }
      setOpen(false)
      return
    }
    if (mode === 'gitlab' && gitlabSourceAvailable) {
      return
    }
    if (mode !== 'gitlab') {
      return
    }
    setMode('smart')
    setGitlabItems([])
    setGitlabLoading(false)
    setCommandValue('')
  }, [gitlabSourceAvailable, mode, textOnly])

  useEffect(() => {
    if (!disabled) {
      return
    }
    setOpen(false)
    setGithubItems([])
    setGitlabItems([])
    setBranches([])
    setBranchResultsSource(null)
    setGithubLoading(false)
    setGitlabLoading(false)
    setBranchesLoading(false)
    setCommandValue('')
    setCrossRepoPrompt(null)
  }, [disabled])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(value), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [value])

  const sourceQueryWithinLimit = useMemo(
    () => isSmartWorkspaceSourceQueryWithinLimit(debouncedQuery),
    [debouncedQuery]
  )
  const normalizedGhQuery = useMemo(
    () => normalizeGitHubLinkQuery(sourceQueryWithinLimit ? debouncedQuery : ''),
    [debouncedQuery, sourceQueryWithinLimit]
  )
  const parsedGhLink = useMemo(
    () => (sourceQueryWithinLimit ? parseGitHubPullRequestLink(debouncedQuery) : null),
    [debouncedQuery, sourceQueryWithinLimit]
  )
  const shouldQueryGithub =
    sourceQueryWithinLimit &&
    !repoBackedSourcesDisabled &&
    !textOnly &&
    repoBackedSearchTargets.length > 0 &&
    (mode === 'smart' || mode === 'github')

  useEffect(() => {
    if (disabled || !shouldQueryGithub) {
      setGithubItems([])
      setGithubLoading(false)
      return
    }
    let stale = false
    const directNumber = normalizedGhQuery.directNumber
    const directLink = parsedGhLink
    const searchTargetForRepo = (repo: RepoOption) =>
      repoBackedSearchTargets.find((target) => target.repo.id === repo.id) ?? {
        repo,
        githubSourceContext: buildProjectSourceContextFromRepo({
          provider: 'github' as const,
          projectId: repo.id,
          repo
        })
      }
    if (directLink !== null && handledCrossRepoUrlRef.current !== debouncedQuery.trim()) {
      setGithubLoading(true)
      const directLookup = async (): Promise<{
        items: GitHubWorkItem[]
        prompt: {
          link: NonNullable<ReturnType<typeof parseGitHubPullRequestLink>>
          matchingRepo: RepoOption | null
        } | null
      }> => {
        if (crossRepoSwitchTarget === 'project-source') {
          const matchingRepo = await findMatchingRepoForSlug(
            repoBackedSearchTargets.map((target) => target.repo),
            directLink.slug,
            repoSlugCacheRef.current
          )
          handledCrossRepoUrlRef.current = debouncedQuery.trim()
          if (!matchingRepo) {
            return { items: [], prompt: null }
          }
          const target = searchTargetForRepo(matchingRepo)
          const item = await lookupGitHubWorkItemByOwnerRepoForSource({
            repoPath: target.repo.path,
            repoId: target.repo.id,
            sourceContext: target.githubSourceContext,
            owner: directLink.slug.owner,
            repo: directLink.slug.repo,
            number: directLink.number,
            type: directLink.type
          })
          return {
            items: item ? [{ ...item, repoId: target.repo.id } as GitHubWorkItem] : [],
            prompt: null
          }
        }
        if (!selectedRepo?.path) {
          return { items: [], prompt: null }
        }
        const selectedSlug = await getRepoSlugCached(selectedRepo, repoSlugCacheRef.current)
        if (!selectedSlug || sameSlug(selectedSlug, directLink.slug)) {
          handledCrossRepoUrlRef.current = debouncedQuery.trim()
          const item = await lookupSmartGitHubSubmitItem({
            repoPath: selectedRepo.path,
            repoId: selectedRepo.id,
            sourceContext: githubSourceContext,
            intent: {
              kind: 'link',
              owner: directLink.slug.owner,
              repo: directLink.slug.repo,
              number: directLink.number,
              type: directLink.type
            },
            workItem: lookupGitHubWorkItemForSource,
            workItemByOwnerRepo: lookupGitHubWorkItemByOwnerRepoForSource
          })
          return { items: item ? [item] : [], prompt: null }
        }
        const matchingRepo = await findMatchingRepoForSlug(
          repos,
          directLink.slug,
          repoSlugCacheRef.current
        )
        return { items: [], prompt: { link: directLink, matchingRepo } }
      }
      void directLookup()
        .then((result) => {
          if (stale) {
            return
          }
          setGithubItems(result.items)
          if (result.prompt) {
            setOpen(false)
            setCrossRepoPrompt(result.prompt)
          }
        })
        .catch(() => {
          if (!stale) {
            setGithubItems([])
          }
        })
        .finally(() => {
          if (!stale) {
            setGithubLoading(false)
          }
        })
      return () => {
        stale = true
      }
    }
    if (directNumber !== null) {
      setGithubLoading(true)
      const intent =
        directLink !== null
          ? {
              kind: 'link' as const,
              owner: directLink.slug.owner,
              repo: directLink.slug.repo,
              number: directLink.number,
              type: directLink.type
            }
          : { kind: 'hash-number' as const, number: directNumber }
      const request = Promise.all(
        repoBackedSearchTargets.map((target) =>
          lookupSmartGitHubSubmitItem({
            repoPath: target.repo.path,
            repoId: target.repo.id,
            sourceContext: target.githubSourceContext,
            intent,
            workItem: lookupGitHubWorkItemForSource,
            workItemByOwnerRepo: lookupGitHubWorkItemByOwnerRepoForSource
          }).catch(() => null)
        )
      ).then((items) =>
        items
          .filter((item): item is GitHubWorkItem => item !== null)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .slice(0, RESULT_LIMIT)
      )
      void request
        .then((items) => {
          if (!stale) {
            setGithubItems(items)
          }
        })
        .catch(() => {
          if (!stale) {
            setGithubItems([])
          }
        })
        .finally(() => {
          if (!stale) {
            setGithubLoading(false)
          }
        })
      return () => {
        stale = true
      }
    }

    const trimmed = normalizedGhQuery.query.trim()
    const query = trimmed ? normalizedGhQuery.query : ''
    if (repoBackedSearchTargets.length === 1) {
      const target = repoBackedSearchTargets[0]
      const cached = getCachedWorkItems(
        target.repo.id,
        RESULT_LIMIT,
        query,
        target.repo.path,
        target.githubSourceContext
      )
      if (cached) {
        setGithubItems(cached.slice(0, RESULT_LIMIT))
        setGithubLoading(false)
      } else {
        setGithubLoading(true)
      }
      void fetchWorkItems(target.repo.id, target.repo.path, RESULT_LIMIT, query, {
        sourceContext: target.githubSourceContext
      })
        .then((items) => {
          if (!stale) {
            setGithubItems(items.slice(0, RESULT_LIMIT))
          }
        })
        .catch(() => {
          if (!stale) {
            setGithubItems([])
          }
        })
        .finally(() => {
          if (!stale) {
            setGithubLoading(false)
          }
        })
    } else {
      setGithubLoading(true)
      void fetchWorkItemsAcrossRepos(
        repoBackedSearchTargets.map((target) => ({
          repoId: target.repo.id,
          path: target.repo.path,
          executionHostId: target.repo.executionHostId,
          sourceContext: target.githubSourceContext
        })),
        RESULT_LIMIT,
        RESULT_LIMIT,
        query
      )
        .then((result) => {
          if (!stale) {
            setGithubItems(result.items)
          }
        })
        .catch(() => {
          if (!stale) {
            setGithubItems([])
          }
        })
        .finally(() => {
          if (!stale) {
            setGithubLoading(false)
          }
        })
    }
    return () => {
      stale = true
    }
  }, [
    debouncedQuery,
    disabled,
    fetchWorkItems,
    fetchWorkItemsAcrossRepos,
    getCachedWorkItems,
    normalizedGhQuery,
    parsedGhLink,
    repos,
    repoBackedSearchTargets,
    githubSourceContext,
    selectedRepo,
    crossRepoSwitchTarget,
    shouldQueryGithub
  ])

  const branchSearchRequest = useMemo(
    () =>
      getBranchSearchRequest({
        disabled,
        branchesEnabled: branchesEnabled && !repoBackedSourcesDisabled,
        textOnly,
        mode,
        selectedRepoId: selectedRepo?.id ?? null,
        query: debouncedQuery,
        limit: RESULT_LIMIT
      }),
    [
      branchesEnabled,
      debouncedQuery,
      disabled,
      mode,
      repoBackedSourcesDisabled,
      selectedRepo?.id,
      textOnly
    ]
  )

  useEffect(() => {
    if (!branchSearchRequest) {
      setBranches([])
      setBranchDefaultBaseRef(null)
      setBranchResultsSource(null)
      setBranchesLoading(false)
      return
    }
    let stale = false
    setBranches([])
    setBranchDefaultBaseRef(null)
    setBranchResultsSource(null)
    setBranchesLoading(true)
    const defaultBaseRefRequest =
      branchSearchRequest.query.length === 0
        ? getRuntimeRepoBaseRefDefault(
            selectedRepoOwnerSettings,
            branchSearchRequest.repoId,
            selectedRepoHostId
          ).then(({ defaultBaseRef }) => defaultBaseRef)
        : Promise.resolve(null)
    void Promise.all([
      searchRuntimeRepoBaseRefDetails(
        selectedRepoOwnerSettings,
        branchSearchRequest.repoId,
        branchSearchRequest.query,
        branchSearchRequest.limit,
        selectedRepoHostId
      ),
      defaultBaseRefRequest.catch(() => null)
    ])
      .then(([results, defaultBaseRef]) => {
        if (!stale) {
          setBranches(results)
          setBranchDefaultBaseRef(defaultBaseRef)
          setBranchResultsSource({
            repoId: branchSearchRequest.repoId,
            query: branchSearchRequest.query
          })
        }
      })
      .catch(() => {
        if (!stale) {
          setBranches([])
          setBranchDefaultBaseRef(null)
          setBranchResultsSource(null)
        }
      })
      .finally(() => {
        if (!stale) {
          setBranchesLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [branchSearchRequest, selectedRepoHostId, selectedRepoOwnerSettings])

  // Why: GitLab paste-URL flow. Watches the debounced query for a GitLab
  // issue/MR URL (parseGitLabMergeRequestLink already filters non-GitLab URLs
  // via the project-internal `/-/` separator) and resolves it to a
  // GitLabWorkItem via the IPC. Skipped silently when the host hook
  // hasn't supplied an onGitLabItemSelect handler.
  const parsedGlLink = useMemo(() => {
    const link = sourceQueryWithinLimit ? parseGitLabMergeRequestLink(debouncedQuery) : null
    return link?.type === 'mr' ? link : null
  }, [debouncedQuery, sourceQueryWithinLimit])
  const shouldQueryGitlab =
    sourceQueryWithinLimit &&
    !repoBackedSourcesDisabled &&
    !textOnly &&
    gitlabSourceAvailable &&
    repoBackedSearchTargets.length > 0 &&
    (mode === 'smart' || mode === 'gitlab')
  useEffect(() => {
    if (!shouldQueryGitlab || disabled || !onGitLabItemSelect) {
      // Why: don't clobber list-mode items here — the listMRs effect below
      // is the sole writer when the user is in 'gitlab' mode without a URL.
      if (!shouldQueryGitlab || (parsedGlLink === null && mode !== 'gitlab')) {
        setGitlabItems([])
      }
      setGitlabLoading(false)
      return
    }
    if (parsedGlLink === null) {
      // Same reason: only clear when leaving the gitlab/smart context.
      if (mode !== 'gitlab') {
        setGitlabItems([])
      }
      setGitlabLoading(false)
      return
    }
    let stale = false
    setGitlabLoading(true)
    void Promise.all(
      repoBackedSearchTargets.map((target) =>
        lookupGitLabWorkItemByPathForSource({
          repoPath: target.repo.path,
          repoId: target.repo.id,
          sourceContext: target.gitlabSourceContext,
          // Why: self-hosted GitLab URLs must resolve against their pasted
          // hostname; gitlab.com is only one possible GitLab instance.
          host: parsedGlLink.slug.host,
          path: parsedGlLink.slug.path,
          iid: parsedGlLink.number,
          type: 'mr'
        }).catch(() => null)
      )
    )
      .then((items) => {
        if (stale) {
          return
        }
        setGitlabItems(items.filter((item): item is GitLabWorkItem => item !== null))
      })
      .catch(() => {
        if (!stale) {
          setGitlabItems([])
        }
      })
      .finally(() => {
        if (!stale) {
          setGitlabLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [disabled, mode, onGitLabItemSelect, parsedGlLink, repoBackedSearchTargets, shouldQueryGitlab])

  // Why: when the user is on the GitLab tab (or in 'smart' mix) and
  // hasn't pasted a URL, surface the project's MRs filtered by the
  // current state chip. Default 'opened' matches gitlab.com's default
  // MR list view. Smart mode includes GitLab MRs alongside GitHub
  // items so the unified picker actually surfaces both providers.
  useEffect(() => {
    if (!shouldQueryGitlab || disabled || !onGitLabItemSelect) {
      if (!shouldQueryGitlab) {
        setGitlabItems([])
        setGitlabLoading(false)
      }
      return
    }
    if (repoBackedSearchTargets.length === 0) {
      setGitlabItems([])
      setGitlabLoading(false)
      return
    }
    if (parsedGlLink !== null) {
      // Why: paste-URL effect owns the list while a URL is in the input.
      return
    }
    let stale = false
    setGitlabLoading(true)
    // Why: thread the typed query through so the GitLab API filters MRs by
    // name/number (mirrors the GitHub effect). shouldQueryGitlab already
    // gates on sourceQueryWithinLimit, so an oversized query never reaches here.
    const trimmedQuery = debouncedQuery.trim() || undefined
    void Promise.all(
      repoBackedSearchTargets.map((target) =>
        listGitLabMRsForSource({
          repoPath: target.repo.path,
          repoId: target.repo.id,
          sourceContext: target.gitlabSourceContext,
          state: mrStateFilter,
          page: 1,
          perPage: RESULT_LIMIT,
          query: trimmedQuery
        }).catch(() => ({ items: [], hasMore: false }))
      )
    )
      .then((results) => {
        if (stale) {
          return
        }
        setGitlabItems(
          results
            .flatMap((result) => result.items)
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
            .slice(0, RESULT_LIMIT)
        )
      })
      .catch(() => {
        if (!stale) {
          setGitlabItems([])
        }
      })
      .finally(() => {
        if (!stale) {
          setGitlabLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [
    debouncedQuery,
    disabled,
    mode,
    mrStateFilter,
    onGitLabItemSelect,
    parsedGlLink,
    repoBackedSearchTargets,
    shouldQueryGitlab
  ])

  const rows = useMemo<RowEntry[]>(
    () =>
      buildSmartWorkspaceSourceRows({
        branches: getVisibleBranchResults({
          branches,
          defaultBaseRef: branchDefaultBaseRef,
          mode,
          resultRepoId: branchResultsSource?.repoId ?? null,
          resultQuery: branchResultsSource?.query ?? null,
          selectedRepoId: selectedRepo?.id ?? null,
          value
        }),
        githubItems,
        gitlabAvailable: gitlabSourceAvailable,
        gitlabItems,
        mode,
        resultLimit: RESULT_LIMIT,
        value
      }),
    [
      branches,
      branchDefaultBaseRef,
      branchResultsSource,
      githubItems,
      gitlabSourceAvailable,
      gitlabItems,
      mode,
      selectedRepo?.id,
      value
    ]
  )
  const { typedTextActionRow, searchResultRows } = useMemo(() => {
    const typedTextRow = rows.find(isTypedTextSourceRow) ?? null
    return {
      typedTextActionRow: typedTextRow,
      searchResultRows: typedTextRow ? rows.filter((row) => row !== typedTextRow) : rows
    }
  }, [rows])

  // Why: source rows (GitHub/GitLab/branches) are driven by debouncedQuery,
  // so they're stale until the user pauses typing for SEARCH_DEBOUNCE_MS.
  // We don't want to filter them out (causes flicker as results appear and
  // disappear with each keystroke), but we do need to prevent cmdk's Enter
  // handler from auto-selecting a stale source row. Two cases:
  //   - Smart/Branches: a typed-text row (use-name / create-branch) exists
  //     and is pinned at the top — force the highlight onto it so Enter
  //     commits the typed text instead of a stale issue/PR/branch.
  //   - GitHub/GitLab: no typed-text fallback row, so clear the highlight
  //     entirely; the input's Enter handler falls through to onPlainEnter.
  const valueWithinSourceLimit = isSmartWorkspaceSourceQueryWithinLimit(value)
  const debouncedQueryWithinSourceLimit = isSmartWorkspaceSourceQueryWithinLimit(debouncedQuery)
  const trimmedValue = valueWithinSourceLimit ? value.trim() : ''
  const trimmedDebouncedQuery = debouncedQueryWithinSourceLimit ? debouncedQuery.trim() : ''
  const isQueryStale = trimmedValue.length > 0 && trimmedDebouncedQuery !== trimmedValue

  const sourceIntent = useMemo<'github' | 'gitlab' | null>(() => {
    if (!isSmartWorkspaceSourceQueryWithinLimit(value)) {
      return null
    }
    const trimmed = value.trim()
    if (/^#\d+$/.test(trimmed) || parseGitHubPullRequestLink(trimmed)?.type === 'pr') {
      return 'github'
    }
    return parseGitLabMergeRequestLink(trimmed)?.type === 'mr' ? 'gitlab' : null
  }, [value])

  const resolvedCommandValue = resolveSmartWorkspaceCommandValue({
    currentValue: commandValue,
    rows,
    isQueryStale,
    sourceIntent
  })

  const loading = githubLoading || gitlabLoading || branchesLoading
  const ActiveInputIcon = mode === 'text' ? CaseSensitive : loading ? LoadingIndicator : Search

  const handleSelect = useCallback(
    (row: RowEntry) => {
      if (row.kind === 'use-name' || row.kind === 'create-branch') {
        // Why: "create new branch" has no existing ref to base from, so
        // it follows the same path as a typed name — the workspace's branch
        // is derived from `name` and `baseBranch` stays unset (default base).
        onValueChange(row.name)
      } else if (row.kind === 'github') {
        onGitHubItemSelect(row.item)
      } else if (row.kind === 'gitlab') {
        // Why: optional handler — guarded so the surface degrades to a
        // no-op for hosts that haven't wired GitLab support yet.
        onGitLabItemSelect?.(row.item)
      } else if (row.kind === 'branch') {
        onBranchSelect(row.refName, row.localBranchName)
      }
      setOpen(false)
    },
    [onBranchSelect, onGitHubItemSelect, onGitLabItemSelect, onValueChange]
  )

  const acceptGitHubLink = useCallback(
    async (targetRepo: RepoOption): Promise<void> => {
      if (!crossRepoPrompt) {
        return
      }
      handledCrossRepoUrlRef.current = debouncedQuery.trim()
      setGithubLoading(true)
      try {
        const sourceContext = buildProjectSourceContextFromRepo({
          provider: 'github',
          projectId: targetRepo.id,
          repo: targetRepo
        })
        const item = await lookupGitHubWorkItemByOwnerRepoForSource({
          repoPath: targetRepo.path,
          repoId: targetRepo.id,
          sourceContext,
          owner: crossRepoPrompt.link.slug.owner,
          repo: crossRepoPrompt.link.slug.repo,
          number: crossRepoPrompt.link.number,
          type: crossRepoPrompt.link.type
        })
        if (!item) {
          return
        }
        onRepoChange(targetRepo.id)
        onGitHubItemSelect({ ...item, repoId: targetRepo.id } as GitHubWorkItem)
        setOpen(false)
        setCrossRepoPrompt(null)
      } finally {
        setGithubLoading(false)
      }
    },
    [crossRepoPrompt, debouncedQuery, onGitHubItemSelect, onRepoChange]
  )

  const handleUseCurrentRepo = useCallback(async (): Promise<void> => {
    if (!selectedRepo) {
      return
    }
    setCrossRepoPrompt(null)
    await acceptGitHubLink(selectedRepo)
  }, [acceptGitHubLink, selectedRepo])

  const handleAddMatchingRepo = useCallback(async (): Promise<void> => {
    if (!crossRepoPrompt || !allowCrossRepoProjectAdd) {
      return
    }
    const added = await addRepo()
    if (!added) {
      return
    }
    repoSlugCacheRef.current.delete(added.id)
    const slug = await getRepoSlugCached(added, repoSlugCacheRef.current)
    if (slug && sameSlug(slug, crossRepoPrompt.link.slug)) {
      await acceptGitHubLink(added)
    }
  }, [acceptGitHubLink, addRepo, allowCrossRepoProjectAdd, crossRepoPrompt])

  const dismissCrossRepoPrompt = useCallback((): void => {
    handledCrossRepoUrlRef.current = debouncedQuery.trim()
    setCrossRepoPrompt(null)
  }, [debouncedQuery])

  const smartPlaceholder = repoBackedSourcesDisabled
    ? translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.placeholderWorkspaceName',
        'Type a workspace name'
      )
    : branchesEnabled
      ? 'Type a name, #1234, branch, GitHub PR or GitLab MR URL'
      : 'Type a name, #1234, GitHub PR or GitLab MR URL'
  const crossRepoSwitchIsProjectSource = crossRepoSwitchTarget === 'project-source'
  const crossRepoSwitchTitle = crossRepoSwitchIsProjectSource
    ? translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.switchProjectSourceTitle',
        'Switch project source?'
      )
    : translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.4bd98f1091',
        'Switch project?'
      )
  const crossRepoSwitchDescriptionSuffix = crossRepoSwitchIsProjectSource
    ? translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.differentProjectSource',
        ', which is different from the selected project source.'
      )
    : translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.9ef1a7c4b0',
        ', which is different from the selected project.'
      )
  const crossRepoSwitchFallbackLabel = crossRepoSwitchIsProjectSource
    ? translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.currentProjectSource',
        'current project source'
      )
    : translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.fda67f0b61',
        'current project'
      )

  const placeholder = disabled
    ? (disabledPlaceholder ??
      translate('auto.components.new.workspace.SmartWorkspaceNameField.unavailable', 'Unavailable'))
    : mode === 'smart'
      ? smartPlaceholder
      : mode === 'github'
        ? translate(
            'auto.components.new.workspace.SmartWorkspaceNameField.searchGitHub',
            'Search GitHub PRs'
          )
        : mode === 'gitlab'
          ? translate(
              'auto.components.new.workspace.SmartWorkspaceNameField.searchGitLab',
              'Search GitLab MRs'
            )
          : mode === 'branches'
            ? translate(
                'auto.components.new.workspace.SmartWorkspaceNameField.searchBranches',
                'Search branches'
              )
            : translate(
                'auto.components.new.workspace.SmartWorkspaceNameField.workspaceName',
                'Workspace name'
              )

  return (
    <div className="min-w-0 space-y-1.5">
      {textOnly ? null : (
        <div className="border-border/40 flex min-w-0 items-center gap-2 border-b">
          <Tabs
            value={mode}
            onValueChange={(next) => {
              const nextMode = next as SmartNameMode
              onActiveSourceModeChange?.(nextMode)
              setMode(nextMode)
              if (!disabled && nextMode !== 'text' && selectedSource === null) {
                markSourcePopoverUserEngaged()
                setOpen(true)
              } else {
                setOpen(false)
              }
              cancelLocalInputFocusFrame()
              localInputFocusFrameRef.current = requestAnimationFrame(() => {
                localInputFocusFrameRef.current = null
                localInputRef.current?.focus({ preventScroll: true })
              })
            }}
            className="min-w-0 flex-1 gap-0"
          >
            <TabsList
              ref={tabsListRef}
              variant="line"
              className="h-7 w-full justify-start gap-4 px-0"
              onFocusCapture={(event) => {
                // Why: Radix Tabs uses roving focus and re-applies tabindex=0 to
                // the active trigger on every render, so we can't keep it out of
                // the natural Tab order via props or a MutationObserver (race
                // with React commits). Instead, intercept focus on entry into
                // the tabs list so forward Tab goes straight to the input.
                const previous = event.relatedTarget as HTMLElement | null
                const list = tabsListRef.current
                const input = localInputRef.current
                if (!list || !input) {
                  return
                }
                if (!previous || previous === input || list.contains(previous)) {
                  return
                }
                event.stopPropagation()
                input.focus({ preventScroll: true })
              }}
            >
              {availableModes.map(({ id, label, Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  tabIndex={-1}
                  data-smart-name-mode={id}
                  className="flex-none gap-1.5 px-0 text-xs"
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      <Popover
        open={!disabled && open && mode !== 'text' && selectedSource === null}
        onOpenChange={handleSourcePopoverOpenChange}
      >
        <Command
          value={resolvedCommandValue}
          onValueChange={setCommandValue}
          shouldFilter={false}
          className="overflow-visible bg-transparent"
        >
          <PopoverAnchor>
            <div className="relative min-w-0">
              {selectedSource ? (
                // Why: min-w-0 + w-full lets the pill shrink to its flex
                // parent; without them the inner truncate's intrinsic
                // min-content (long PR title) propagates up and pushes the
                // dialog wider than its max-w.
                <div
                  ref={setSelectedSourceNode}
                  data-workspace-source-pill="true"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (
                      event.currentTarget !== event.target ||
                      event.key !== 'Enter' ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return
                    }
                    event.preventDefault()
                    onPlainEnter?.()
                  }}
                  className="border-input focus-within:border-ring focus-within:ring-ring/50 flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-transparent px-2.5 text-sm shadow-xs outline-none focus-within:ring-[3px]"
                >
                  <SelectionIcon kind={selectedSource.kind} />
                  <span className="text-foreground min-w-0 flex-1 truncate leading-none font-medium">
                    {selectedSource.label}
                  </span>
                  {selectedSource.url ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => void window.api.shell.openUrl(selectedSource.url!)}
                            className="text-muted-foreground hover:text-foreground size-6 shrink-0 rounded-sm"
                            aria-label={translate(
                              'auto.components.new.workspace.SmartWorkspaceNameField.2c69728c2a',
                              'Open link in browser'
                            )}
                          >
                            <ExternalLink className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent side="top" sideOffset={6}>
                        {translate(
                          'auto.components.new.workspace.SmartWorkspaceNameField.370a1faf67',
                          'Open in browser'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={onClearSelectedSource}
                          className="text-muted-foreground hover:text-foreground size-6 shrink-0 rounded-sm"
                          aria-label={translate(
                            'auto.components.new.workspace.SmartWorkspaceNameField.7199ff19c7',
                            'Clear selected source'
                          )}
                        >
                          <X className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent side="top" sideOffset={6}>
                      {translate(
                        'auto.components.new.workspace.SmartWorkspaceNameField.0c9e668e3a',
                        'Clear'
                      )}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <>
                  <ActiveInputIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <Input
                    ref={setInputNode}
                    data-workspace-name-input="true"
                    value={value}
                    onPointerDown={() => {
                      if (!disabled && mode !== 'text') {
                        markSourcePopoverUserEngaged()
                        setOpen(true)
                      }
                    }}
                    onChange={(event) => {
                      onValueChange(event.target.value)
                      if (!disabled && mode !== 'text') {
                        markSourcePopoverUserEngaged()
                        setOpen(true)
                      }
                    }}
                    onFocus={(event) => {
                      // Why: only open when focus moves from another composer
                      // control (Tab/Shift+Tab). Dialog autofocus comes from
                      // outside the composer root and stays suppressed until
                      // click/type/tab-within-composer engagement above.
                      if (!isComposerFieldToFieldFocus(event)) {
                        return
                      }
                      markSourcePopoverUserEngaged()
                      tryOpenSourcePopover()
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Tab' && event.shiftKey) {
                        const activeTrigger = tabsListRef.current?.querySelector<HTMLElement>(
                          `[data-smart-name-mode="${mode}"]`
                        )
                        if (activeTrigger) {
                          event.preventDefault()
                          activeTrigger.focus()
                          return
                        }
                      }
                      if (
                        event.key === 'Enter' &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey
                      ) {
                        if (open && rows.length > 0) {
                          const row = rows.find((entry) => entry.value === resolvedCommandValue)
                          if (row) {
                            event.preventDefault()
                            handleSelect(row)
                            return
                          }
                          // No highlighted row (e.g., stale results in
                          // GitHub/GitLab modes where the highlight was
                          // cleared to avoid auto-selecting a stale source).
                          // Fall through to onPlainEnter so the keypress
                          // doesn't feel inert.
                        }
                        onPlainEnter?.()
                      }
                      if (event.key === 'Escape' && open) {
                        event.stopPropagation()
                        setOpen(false)
                      }
                    }}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="h-9 pl-8 text-sm"
                  />
                </>
              )}
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="popover-scroll-content flex w-[var(--radix-popover-trigger-width)] flex-col p-0"
            // Why: this popover lives inside the create-workspace dialog; a
            // taller result list can cover the submit footer while typing.
            style={{ maxHeight: 'min(var(--radix-popover-content-available-height,7rem),7rem)' }}
            // Why: outside-press/focus-out cancellation now lives on the Popover
            // root's onOpenChange (see handleSourcePopoverOpenChange).
            initialFocus={false}
          >
            {mode === 'gitlab' ? (
              // Why: GitLab MR-state filter — Open / Merged / Closed / All —
              // mirrors the gitlab.com merge-requests page tab strip so users
              // arriving from the web UI find a familiar control.
              <div
                className="border-border/40 flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
                onMouseDown={(e) => e.preventDefault()}
              >
                {mrStateFilters.map(({ id, label }) => (
                  <Button
                    key={id}
                    type="button"
                    variant={mrStateFilter === id ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setMrStateFilter(id)}
                    className="h-6 px-2 text-xs"
                  >
                    {label}
                  </Button>
                ))}
              </div>
            ) : null}
            <CommandList className="scrollbar-sleek !max-h-none min-h-0 flex-1">
              {typedTextActionRow ? (
                <div
                  className="border-border/40 bg-popover sticky top-0 z-10 border-b p-1"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <CommandItem
                    key={typedTextActionRow.value}
                    value={typedTextActionRow.value}
                    onSelect={() => handleSelect(typedTextActionRow)}
                    className={getRowItemClassName(typedTextActionRow, { pinnedAction: true })}
                  >
                    <RowIcon row={typedTextActionRow} />
                    <RowLabel row={typedTextActionRow} />
                  </CommandItem>
                </div>
              ) : null}
              {loading && searchResultRows.length === 0 ? (
                <div className="space-y-1 p-1">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="bg-muted/40 h-8 animate-pulse rounded" />
                  ))}
                </div>
              ) : searchResultRows.length === 0 && !typedTextActionRow ? (
                <div className="text-muted-foreground px-3 py-6 text-center text-xs">
                  {getSmartWorkspaceEmptyHint(mode)}
                </div>
              ) : searchResultRows.length > 0 ? (
                <CommandGroup className="p-1">
                  {searchResultRows.map((row) => (
                    <CommandItem
                      key={row.value}
                      value={row.value}
                      onSelect={() => handleSelect(row)}
                      className={getRowItemClassName(row)}
                    >
                      <RowIcon row={row} />
                      <RowLabel row={row} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </PopoverContent>
        </Command>
      </Popover>
      <Dialog
        open={crossRepoPrompt !== null}
        onOpenChange={(next) => !next && dismissCrossRepoPrompt()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{crossRepoSwitchTitle}</DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.new.workspace.SmartWorkspaceNameField.ad188067ae',
                'The GitHub URL points to'
              )}{' '}
              {crossRepoPrompt?.link.slug.owner}/{crossRepoPrompt?.link.slug.repo}
              {crossRepoSwitchDescriptionSuffix}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={dismissCrossRepoPrompt}>
              {translate(
                'auto.components.new.workspace.SmartWorkspaceNameField.6859e2896c',
                'Cancel'
              )}
            </Button>
            <Button variant="outline" onClick={() => void handleUseCurrentRepo()}>
              {translate(
                'auto.components.new.workspace.SmartWorkspaceNameField.eadf877af5',
                'Keep'
              )}{' '}
              {selectedRepo?.displayName ?? crossRepoSwitchFallbackLabel}
            </Button>
            {crossRepoPrompt?.matchingRepo ? (
              <Button onClick={() => void acceptGitHubLink(crossRepoPrompt.matchingRepo!)}>
                {translate(
                  'auto.components.new.workspace.SmartWorkspaceNameField.a76fcb4fa0',
                  'Switch to'
                )}{' '}
                {crossRepoPrompt.matchingRepo.displayName}
              </Button>
            ) : allowCrossRepoProjectAdd ? (
              <Button onClick={() => void handleAddMatchingRepo()}>
                {translate(
                  'auto.components.new.workspace.SmartWorkspaceNameField.e57c53727c',
                  'Add project...'
                )}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RowIcon({ row }: { row: RowEntry }): React.JSX.Element {
  if (row.kind === 'use-name') {
    return <CaseSensitive className="text-muted-foreground size-3.5 shrink-0" />
  }
  if (row.kind === 'create-branch') {
    return <GitBranchPlus className="text-muted-foreground size-3.5 shrink-0" />
  }
  if (row.kind === 'github') {
    return <GitPullRequest className="text-muted-foreground size-3.5 shrink-0" />
  }
  if (row.kind === 'gitlab') {
    return <GitMerge className="text-muted-foreground size-3.5 shrink-0" />
  }
  if (row.kind === 'branch') {
    return <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
  }
  return <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
}

function SelectionIcon({ kind }: { kind: SmartWorkspaceNameSelection['kind'] }): React.JSX.Element {
  if (kind === 'github-pr') {
    return <GitPullRequest className="text-muted-foreground size-3.5 shrink-0" />
  }
  if (kind === 'gitlab-mr') {
    return <GitMerge className="text-muted-foreground size-3.5 shrink-0" />
  }
  return <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
}

function RowLabel({ row }: { row: RowEntry }): React.JSX.Element {
  if (row.kind === 'use-name') {
    return (
      <span className="min-w-0 truncate">
        {translate('auto.components.new.workspace.SmartWorkspaceNameField.b1a7d679ba', 'Use')}{' '}
        <span className="text-foreground font-medium">
          {translate('auto.components.new.workspace.SmartWorkspaceNameField.34ca97bce3', '"')}
          {row.name}
          {translate('auto.components.new.workspace.SmartWorkspaceNameField.766083a596', '"')}
        </span>{' '}
        {translate(
          'auto.components.new.workspace.SmartWorkspaceNameField.a44229ce4d',
          'as workspace name'
        )}
      </span>
    )
  }
  if (row.kind === 'create-branch') {
    return (
      <span className="min-w-0 truncate">
        {translate(
          'auto.components.new.workspace.SmartWorkspaceNameField.2a0d535f69',
          'Create new branch'
        )}{' '}
        <span className="text-foreground font-mono text-[11px] font-medium">{row.name}</span>
      </span>
    )
  }
  if (row.kind === 'github') {
    return (
      <span className="min-w-0 truncate">
        <span className="text-foreground font-medium">#{row.item.number}</span> {row.item.title}
      </span>
    )
  }
  if (row.kind === 'gitlab') {
    // Why: GitLab uses `!N` for MRs and `#N` for issues — show the
    // appropriate prefix so the row is unambiguous to users coming from
    // gitlab.com's UI.
    const prefix = row.item.type === 'mr' ? '!' : '#'
    return (
      <span className="min-w-0 truncate">
        <span className="text-foreground font-medium">
          {prefix}
          {row.item.number}
        </span>{' '}
        {row.item.title}
      </span>
    )
  }
  return <span className="min-w-0 truncate font-mono text-[11px]">{row.refName}</span>
}

function sameSlug(left: RepoSlug, right: RepoSlug): boolean {
  return (
    left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.repo.toLowerCase() === right.repo.toLowerCase()
  )
}

async function getRepoSlugCached(
  repo: RepoOption,
  cache: Map<string, RepoSlug | null>
): Promise<RepoSlug | null> {
  const cacheKey = repo.id
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null
  }
  try {
    const slug = await window.api.gh.repoSlug({ repoPath: repo.path, repoId: repo.id })
    cache.set(cacheKey, slug)
    return slug
  } catch {
    cache.set(cacheKey, null)
    return null
  }
}

async function findMatchingRepoForSlug(
  repos: RepoOption[],
  slug: RepoSlug,
  cache: Map<string, RepoSlug | null>
): Promise<RepoOption | null> {
  for (const repo of repos) {
    const candidate = await getRepoSlugCached(repo, cache)
    if (candidate && sameSlug(candidate, slug)) {
      return repo
    }
  }
  return null
}
