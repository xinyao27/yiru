import {
  Check,
  Copy,
  ArrowsInLineVertical as CollapseSections,
  ArrowsOutLineVertical as ExpandSections,
  Chat as MessageSquare,
  Columns as SideBySideColumns,
  Sparkle as Sparkles,
  Trash as Trash2,
  TextAlignLeft as WrapText
} from '@phosphor-icons/react'
/* eslint-disable max-lines -- Why: combined diff behavior depends on one
component-level state machine that coordinates lazy loading, inline editing,
restore-on-remount caching, and scroll preservation. Splitting those pieces
across smaller files would make the lifecycle edges harder to reason about and
more error-prone than keeping the whole viewer flow together. */
/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: diff entry changes must reset list measurement and generation state in lockstep with external scroll restoration. */
import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '~renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import { getConnectionIdForFile } from '~renderer/lib/connection-context'
import { detectLanguage } from '~renderer/lib/language-detect'
import { joinPath } from '~renderer/lib/path'
import { writeRuntimeFile } from '~renderer/runtime/file-client'
import {
  getRuntimeGitBranchDiff,
  getRuntimeGitCommitDiff,
  getRuntimeGitDiff
} from '~renderer/runtime/git-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store'
import { findWorktreeById } from '~renderer/store/slices/worktree-helpers'
import { selectWorktreeDiffCommentsOrEmpty } from '~renderer/store/worktree-diff-comments-selector'
import type {
  DiffComment,
  GitBranchChangeEntry,
  GitDiffResult,
  GitStatusEntry
} from '~shared/types'

import { YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, type EditorPathMutationTarget } from '../autosave'
import type { DiffCodeViewNotice } from '../diff-code-view/notices'
import {
  DiffCodeView,
  type DiffCodeViewFile,
  type DiffCodeViewHandle
} from '../diff-code-view/view'
import { getDiffCommentLineLabel } from '../diff-comment-compat'
import { formatDiffComments } from '../diff-comments-format'
import { DiffNotesSendMenu } from '../diff-notes-send-menu'
import { DiffSectionHeader } from '../diff-section/header'
import type { DiffSection } from '../diff-section/types'
import { resolveEditorFontFamily } from '../font-family'
import { computeDiffEditorFontSize } from '../font-zoom'
import { getLargeDiffRenderLimit } from '../large-diff-render-limit'
import { getStoredTextDiffContent, getStoredTextDiffResult } from '../large-diff-section-content'
import { setWithLRU } from '../scroll-cache'
import type { OpenFile } from '../state'
import { getCombinedDiffCommitMessageBody } from './commit-message'
import {
  getCombinedBranchEntries,
  getCombinedUncommittedEntries,
  resolveCombinedUncommittedSnapshotEntries,
  shouldAutoReloadCombinedDiffFromGitStatus
} from './entries'
import { getInitialCombinedDiffSectionLoadIndices } from './initial-section-load'
import { createCombinedDiffLoadScheduler } from './load-scheduler'
import { combinedDiffSectionsMatchEntryMetadata } from './section-cache-match'
import { getCombinedDiffSectionConnectionId } from './section-connection'
import {
  COMBINED_DIFF_REVEAL_SECTION_EVENT,
  createCombinedDiffSectionIndexMap,
  getCombinedDiffEntrySectionKey,
  handleCombinedDiffSectionNavigation,
  type CombinedDiffEntry,
  type CombinedDiffRevealSectionRequest
} from './section-model'

type CachedCombinedDiffViewState = {
  entrySignature: string
  gitStatusSignature: string
  sections: DiffSection[]
  loadedIndices: number[]
  sideBySide: boolean
}

const combinedDiffViewStateCache = new Map<string, CachedCombinedDiffViewState>()

function buildCombinedGitStatusSignature(
  sections: readonly { path: string }[],
  gitStatusEntries: readonly GitStatusEntry[]
): string {
  const sectionPaths = new Set(sections.map((section) => section.path))
  const matching = gitStatusEntries.filter((entry) => sectionPaths.has(entry.path))
  return JSON.stringify(
    matching.map((entry) => ({
      path: entry.path,
      area: entry.area,
      status: entry.status,
      added: entry.added ?? null,
      removed: entry.removed ?? null
    }))
  )
}

function invalidateCombinedDiffCachesForRelativePath(relativePath: string): void {
  for (const [key, cached] of combinedDiffViewStateCache.entries()) {
    if (cached.sections.some((section) => section.path === relativePath)) {
      combinedDiffViewStateCache.delete(key)
    }
  }
}

function getRetainedResolvedSnapshotEntries(sections: readonly DiffSection[]): GitStatusEntry[] {
  return sections.flatMap((section) =>
    section.area === undefined
      ? []
      : [
          {
            path: section.path,
            status: section.status as GitStatusEntry['status'],
            area: section.area,
            oldPath: section.oldPath,
            added: section.added,
            removed: section.removed
          }
        ]
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener(YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, (event) => {
    const detail = (event as CustomEvent<EditorPathMutationTarget>).detail
    if (detail?.relativePath) {
      // Why: inactive combined-diff tabs are unmounted, so only a module-level
      // cache bust can prevent a remount from replaying stale section bodies.
      invalidateCombinedDiffCachesForRelativePath(detail.relativePath)
    }
  })
}
/** Maps a section that is not a renderable text diff onto its notice row. */
function resolveCombinedDiffNotice(
  section: DiffSection,
  context: { isBranchMode: boolean; sideBySide: boolean }
): DiffCodeViewNotice | undefined {
  if (section.loading) {
    return { kind: 'loading' }
  }
  if (section.error) {
    return { kind: 'error', message: section.error }
  }
  const renderLimit = section.largeDiffRenderLimit
  if (renderLimit?.limited) {
    return { kind: 'large-diff', renderLimit }
  }
  const result = section.diffResult
  if (result?.kind !== 'binary') {
    return undefined
  }
  if (result.isImage) {
    return {
      kind: 'image',
      originalContent: result.originalContent,
      modifiedContent: result.modifiedContent,
      mimeType: result.mimeType ?? '',
      sideBySide: context.sideBySide
    }
  }
  return {
    kind: 'binary',
    reason: context.isBranchMode
      ? translate(
          'auto.components.editor.DiffSectionBody.7ce8436458',
          'Text diff is unavailable for this file in branch compare.'
        )
      : translate(
          'auto.components.editor.DiffSectionBody.72f71f52eb',
          'Text diff is unavailable for this file.'
        )
  }
}

const EMPTY_GIT_STATUS_ENTRIES: GitStatusEntry[] = []
const EMPTY_GIT_BRANCH_ENTRIES: GitBranchChangeEntry[] = []
let combinedDiffCollapsedPreference: boolean | null = null
let combinedDiffSideBySidePreference: boolean | null = null
// Why: local Electron IPC has no RPC timeout; a hung git diff should turn into
// a retryable row error instead of leaving the editor in "Loading..." forever.
const COMBINED_DIFF_SECTION_LOAD_TIMEOUT_MS = 30_000

class CombinedDiffSectionLoadTimeoutError extends Error {
  constructor() {
    super('Diff did not finish loading.')
    this.name = 'CombinedDiffSectionLoadTimeoutError'
  }
}

function withDiffSectionLoadTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: number | null = null

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new CombinedDiffSectionLoadTimeoutError())
    }, COMBINED_DIFF_SECTION_LOAD_TIMEOUT_MS)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  })
}

function getDiffSectionLoadErrorMessage(error: unknown): string {
  if (error instanceof CombinedDiffSectionLoadTimeoutError) {
    return 'Diff did not finish loading.'
  }
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'Unable to load diff.'
}

function getInitialCombinedDiffSideBySide(diffDefaultView: string | undefined): boolean {
  return combinedDiffSideBySidePreference ?? diffDefaultView === 'side-by-side'
}

export default function CombinedDiffViewer({
  file,
  viewStateKey
}: {
  file: OpenFile
  viewStateKey: string
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const gitStatusEntries = useAppStore(
    (s) => s.gitStatusByWorktree[file.worktreeId] ?? EMPTY_GIT_STATUS_ENTRIES
  )
  const liveBranchEntries = useAppStore(
    (s) => s.gitBranchChangesByWorktree[file.worktreeId] ?? EMPTY_GIT_BRANCH_ENTRIES
  )
  const branchSummary = useAppStore((s) => s.gitBranchCompareSummaryByWorktree[file.worktreeId])
  const openAllDiffs = useAppStore((s) => s.openAllDiffs)
  const openFile = useAppStore((s) => s.openFile)
  const openBranchDiff = useAppStore((s) => s.openBranchDiff)
  const openCommitDiff = useAppStore((s) => s.openCommitDiff)
  const openConflictReview = useAppStore((s) => s.openConflictReview)
  const openBranchAllDiffs = useAppStore((s) => s.openBranchAllDiffs)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const clearDiffComments = useAppStore((s) => s.clearDiffComments)
  const diffCommentsForWorktree = useAppStore((s) =>
    selectWorktreeDiffCommentsOrEmpty(s, file.worktreeId)
  )
  const activeGroupId = useAppStore((s) => s.activeGroupIdByWorktree[file.worktreeId])
  const isDark =
    settings?.theme === 'dark' ||
    (settings?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const diffCommentCount = diffCommentsForWorktree.length
  const diffCommentsPrompt = React.useMemo(
    () => formatDiffComments(diffCommentsForWorktree),
    [diffCommentsForWorktree]
  )
  const previewDiffComments = React.useMemo(
    () =>
      [...diffCommentsForWorktree]
        .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.lineNumber - b.lineNumber)
        .slice(0, 4),
    [diffCommentsForWorktree]
  )

  const [sections, setSections] = useState<DiffSection[]>([])
  const [sideBySide, setSideBySide] = useState(() =>
    getInitialCombinedDiffSideBySide(settings?.diffDefaultView)
  )
  const [clearNotesDialogOpen, setClearNotesDialogOpen] = useState(false)
  const [isClearingNotes, setIsClearingNotes] = useState(false)
  const clearNotesDialogVisible = clearNotesDialogOpen && (diffCommentCount > 0 || isClearingNotes)
  if (clearNotesDialogOpen && !clearNotesDialogVisible) {
    // Why: notes may be cleared outside this dialog; keep the modal closed in
    // the same render instead of showing an empty confirmation for one frame.
    setClearNotesDialogOpen(false)
  }
  const [notesCopied, setNotesCopied] = useState(false)
  const mountedRef = useRef(true)
  // Why: copy feedback is created by the copy action, so the same handler owns
  // its reset timer instead of repairing copied state after render.
  const notesCopiedResetTimerRef = useRef<number | null>(null)
  // Why: clipboard IPC can resolve after the combined diff unmounts; skip
  // copied feedback instead of starting a reset timer on a stale viewer.
  const notesCopyMountedRef = useRef(false)
  // Why: bumping this state re-renders the surface after a reload; the ref
  // DiffSectionItem components when the entry list changes. A separate ref
  // (`generationRef`) is kept in sync for stale-async-result detection inside
  // `loadSection`, where reading state would capture a stale closure value.
  const [, setGeneration] = useState(0)
  const codeViewRef = useRef<DiffCodeViewHandle | null>(null)
  const loadedIndicesRef = useRef<Set<number>>(new Set())
  const loadingIndicesRef = useRef<Set<number>>(new Set())
  const sectionsRef = useRef<DiffSection[]>([])
  const generationRef = useRef(0)
  const loadSectionRef = useRef<(index: number) => Promise<void>>(async () => {})
  const retrySectionRef = useRef<(index: number) => void>(() => {})
  const clearNotesCopiedResetTimer = useCallback((): void => {
    if (notesCopiedResetTimerRef.current !== null) {
      window.clearTimeout(notesCopiedResetTimerRef.current)
      notesCopiedResetTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const loadSchedulerRef = useRef(
    createCombinedDiffLoadScheduler({
      loadSection: (index) => loadSectionRef.current(index)
    })
  )
  sectionsRef.current = sections

  // Why: Settings should seed combined diffs until the user picks a toolbar
  // mode in this session. After that, commit-to-commit navigation follows the
  // last toolbar choice instead of snapping back to the global default.
  useEffect(() => {
    if (settings?.diffDefaultView !== undefined && combinedDiffSideBySidePreference === null) {
      setSideBySide(settings.diffDefaultView === 'side-by-side')
    }
  }, [settings?.diffDefaultView])

  const isBranchMode = file.diffSource === 'combined-branch'
  const isCommitMode = file.diffSource === 'combined-commit'
  const isAllMode = file.diffSource === 'combined-all'
  const branchCompare =
    file.branchCompare?.baseOid && file.branchCompare.headOid && file.branchCompare.mergeBase
      ? file.branchCompare
      : null
  const commitCompare = file.commitCompare?.commitOid ? file.commitCompare : null

  // Why: prefer the snapshot taken at tab-open time so a commit that changes
  // gitStatusByWorktree does not rebuild all sections and lose loaded content.
  // The snapshot is already area-filtered by openAllDiffs; conflict filtering
  // is applied here via snapshotEntries. The live path (getCombinedUncommittedEntries)
  // adds its own area + conflict filtering as a fallback for tabs opened before
  // the snapshot field existed.
  const snapshotEntries = React.useMemo(
    () => file.uncommittedEntriesSnapshot?.filter((e) => e.conflictStatus !== 'unresolved'),
    [file.uncommittedEntriesSnapshot]
  )
  const uncommittedEntries = React.useMemo(() => {
    if (!snapshotEntries) {
      return getCombinedUncommittedEntries(gitStatusEntries, file.combinedAreaFilter)
    }
    // Why: row load state changes must not rebuild the snapshot entry list;
    // the ref is only consulted when live Git status changes.
    return resolveCombinedUncommittedSnapshotEntries(
      snapshotEntries,
      gitStatusEntries,
      getRetainedResolvedSnapshotEntries(sectionsRef.current)
    )
  }, [snapshotEntries, gitStatusEntries, file.combinedAreaFilter])
  const branchEntries = React.useMemo<GitBranchChangeEntry[]>(() => {
    return getCombinedBranchEntries(file.branchEntriesSnapshot, liveBranchEntries)
  }, [file.branchEntriesSnapshot, liveBranchEntries])
  const renderableBranchEntries = React.useMemo(
    () => (branchCompare ? branchEntries : []),
    [branchCompare, branchEntries]
  )
  const commitEntries = React.useMemo<GitBranchChangeEntry[]>(
    () => file.commitEntriesSnapshot ?? [],
    [file.commitEntriesSnapshot]
  )
  const allEntries = React.useMemo(
    () => [...uncommittedEntries, ...renderableBranchEntries],
    [renderableBranchEntries, uncommittedEntries]
  )
  const entries = isAllMode
    ? allEntries
    : isBranchMode
      ? renderableBranchEntries
      : isCommitMode
        ? commitEntries
        : uncommittedEntries
  const combinedMode = isAllMode
    ? 'all'
    : isBranchMode
      ? 'branch'
      : isCommitMode
        ? 'commit'
        : 'uncommitted'
  const hasUncommittedEntriesSnapshot = file.uncommittedEntriesSnapshot !== undefined
  const shouldAutoReloadFromGitStatus = shouldAutoReloadCombinedDiffFromGitStatus({
    mode: combinedMode,
    hasUncommittedEntriesSnapshot
  })
  const entrySignature = React.useMemo(
    () =>
      JSON.stringify({
        mode: file.diffSource,
        areaFilter: file.combinedAreaFilter ?? null,
        compareVersion: file.branchCompare?.compareVersion ?? null,
        commitVersion: file.commitCompare?.compareVersion ?? null,
        compare:
          isBranchMode && branchCompare
            ? {
                baseOid: branchCompare.baseOid,
                headOid: branchCompare.headOid,
                mergeBase: branchCompare.mergeBase
              }
            : null,
        commit:
          isCommitMode && commitCompare
            ? {
                commitOid: commitCompare.commitOid,
                parentOid: commitCompare.parentOid ?? null
              }
            : null,
        entries: entries.map((entry) => ({
          path: entry.path,
          status: entry.status,
          oldPath: entry.oldPath ?? null,
          area: 'area' in entry ? entry.area : null,
          added: 'added' in entry ? (entry.added ?? null) : null,
          removed: 'removed' in entry ? (entry.removed ?? null) : null
        }))
      }),
    [
      branchCompare,
      commitCompare,
      entries,
      file.branchCompare?.compareVersion,
      file.combinedAreaFilter,
      file.commitCompare?.compareVersion,
      file.diffSource,
      isBranchMode,
      isCommitMode
    ]
  )

  // Why: switching tabs or worktrees unmounts this viewer through the shared
  // editor surface above it. Cache the rendered combined-diff state by the
  // visible pane key so remounting can restore loaded sections and scroll
  // position before the remounted surface paints at the top.
  useLayoutEffect(() => {
    const cached = combinedDiffViewStateCache.get(viewStateKey)
    const canRestoreSnapshotSectionsByKey =
      hasUncommittedEntriesSnapshot &&
      cached !== undefined &&
      combinedDiffSectionsMatchEntryMetadata({
        entries,
        sections: cached.sections,
        mode: combinedMode
      })
    const canRestoreCachedSections =
      cached &&
      (cached.entrySignature === entrySignature || canRestoreSnapshotSectionsByKey) &&
      (!shouldAutoReloadFromGitStatus ||
        (cached.gitStatusSignature ?? '') ===
          buildCombinedGitStatusSignature(cached.sections, gitStatusEntries)) &&
      (cached.sections.length > 0 || entries.length === 0)
    if (canRestoreCachedSections && cached) {
      const collapsedPreference = combinedDiffCollapsedPreference
      const restoredSections =
        collapsedPreference === null
          ? cached.sections
          : cached.sections.map((section) => ({
              ...section,
              collapsed: collapsedPreference
            }))
      setSections(restoredSections)
      setSideBySide(combinedDiffSideBySidePreference ?? cached.sideBySide)
      loadedIndicesRef.current = new Set(
        cached.loadedIndices.filter((index) => !restoredSections[index]?.loading)
      )
      loadingIndicesRef.current.clear()
      return
    }

    setSections(
      entries.map((entry) => ({
        key: getCombinedDiffEntrySectionKey(combinedMode, entry),
        path: entry.path,
        status: entry.status,
        area: 'area' in entry ? entry.area : undefined,
        oldPath: entry.oldPath,
        added: 'added' in entry ? entry.added : undefined,
        removed: 'removed' in entry ? entry.removed : undefined,
        originalContent: '',
        modifiedContent: '',
        // Why: opening the panel used to mount a Monaco diff editor per section
        // before the user had asked for any of them. Start as a file list; the
        // header's expand-all and each row's disclosure load on demand, and the
        // session-sticky preference still wins once the user states one.
        collapsed: combinedDiffCollapsedPreference ?? true,
        loading: true,
        error: undefined,
        dirty: false,
        diffResult: null,
        largeDiffRenderLimit: null
      }))
    )
    loadedIndicesRef.current.clear()
    loadingIndicesRef.current.clear()
    loadSchedulerRef.current.reset()
    generationRef.current += 1
    setGeneration((prev) => prev + 1)
  }, [
    entries,
    entrySignature,
    gitStatusEntries,
    hasUncommittedEntriesSnapshot,
    shouldAutoReloadFromGitStatus,
    combinedMode,
    viewStateKey
  ])

  const loadSectionNow = useCallback(
    async (index: number) => {
      if (loadedIndicesRef.current.has(index) || loadingIndicesRef.current.has(index)) {
        return
      }
      loadingIndicesRef.current.add(index)

      const gen = generationRef.current
      const entries = isAllMode
        ? allEntries
        : isBranchMode
          ? renderableBranchEntries
          : isCommitMode
            ? commitEntries
            : uncommittedEntries
      const entry = entries[index]
      if (!entry) {
        loadingIndicesRef.current.delete(index)
        return
      }

      let result: GitDiffResult
      let error: string | undefined
      try {
        const connectionId = getCombinedDiffSectionConnectionId(
          file.worktreeId,
          file.filePath,
          entry.path
        )
        const state = useAppStore.getState()
        const fileSettings = settingsForRuntimeOwner(state.settings, file.runtimeEnvironmentId)
        if ((isBranchMode || (isAllMode && !('area' in entry))) && branchCompare) {
          result = await withDiffSectionLoadTimeout(
            getRuntimeGitBranchDiff(
              {
                settings: fileSettings,
                worktreeId: file.worktreeId,
                worktreePath: file.filePath,
                connectionId
              },
              {
                compare: {
                  baseRef: branchCompare.baseRef,
                  baseOid: branchCompare.baseOid!,
                  headOid: branchCompare.headOid!,
                  mergeBase: branchCompare.mergeBase!
                },
                filePath: entry.path,
                oldPath: entry.oldPath
              }
            )
          )
        } else if (isCommitMode && commitCompare) {
          result = await withDiffSectionLoadTimeout(
            getRuntimeGitCommitDiff(
              {
                settings: fileSettings,
                worktreeId: file.worktreeId,
                worktreePath: file.filePath,
                connectionId
              },
              {
                commitOid: commitCompare.commitOid,
                parentOid: commitCompare.parentOid,
                filePath: entry.path,
                oldPath: entry.oldPath
              }
            )
          )
        } else {
          result = await withDiffSectionLoadTimeout(
            getRuntimeGitDiff(
              {
                settings: fileSettings,
                worktreeId: file.worktreeId,
                worktreePath: file.filePath,
                connectionId
              },
              {
                filePath: entry.path,
                staged: 'area' in entry && entry.area === 'staged'
              }
            )
          )
        }
      } catch (err) {
        error = getDiffSectionLoadErrorMessage(err)
        result = {
          kind: 'text',
          originalContent: '',
          modifiedContent: '',
          originalIsBinary: false,
          modifiedIsBinary: false
        } as GitDiffResult
      }

      const largeDiffRenderLimit =
        !error && result.kind === 'text'
          ? (result.largeDiffRenderLimit ??
            getLargeDiffRenderLimit({
              originalContent: result.originalContent,
              modifiedContent: result.modifiedContent
            }))
          : null

      loadingIndicesRef.current.delete(index)
      if (generationRef.current !== gen) {
        return
      }
      const storedContent = getStoredTextDiffContent(result, largeDiffRenderLimit)
      const storedResult = getStoredTextDiffResult(result, largeDiffRenderLimit)
      loadedIndicesRef.current.add(index)
      setSections((prev) => {
        return prev.map((s, i) =>
          i === index
            ? {
                ...s,
                diffResult: storedResult,
                originalContent: storedContent.originalContent,
                modifiedContent: storedContent.modifiedContent,
                loading: false,
                error,
                largeDiffRenderLimit
              }
            : s
        )
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      branchCompare?.baseOid,
      branchCompare?.headOid,
      branchCompare?.mergeBase,
      allEntries,
      commitCompare?.commitOid,
      commitCompare?.parentOid,
      commitEntries,
      file.filePath,
      file.runtimeEnvironmentId,
      isAllMode,
      isBranchMode,
      isCommitMode,
      renderableBranchEntries,
      uncommittedEntries
    ]
  )
  loadSectionRef.current = loadSectionNow

  useEffect(() => {
    // Why: React StrictMode replays effect cleanup during development. Resetting
    // here revives the scheduler for the replayed mount instead of leaving all
    // later visibility requests ignored.
    const scheduler = loadSchedulerRef.current
    scheduler.reset()
    return () => scheduler.dispose()
  }, [])

  // Progressive loading: queue diff content when a section becomes visible.
  const loadSection = useCallback((index: number) => {
    if (sectionsRef.current[index]?.collapsed) {
      return
    }
    loadSchedulerRef.current.request(index)
  }, [])

  useEffect(() => {
    // Why: VS Code's multi-diff resolves an initial resource model before
    // virtualizing editors. Queue the first rows deterministically so the
    // visible viewport is not dependent on IntersectionObserver delivery.
    const currentSections = sectionsRef.current
    for (let index = 0; index < currentSections.length; index += 1) {
      if (currentSections[index]?.loading && loadedIndicesRef.current.has(index)) {
        loadedIndicesRef.current.delete(index)
      }
    }

    const initialIndices = getInitialCombinedDiffSectionLoadIndices({
      sectionCount: currentSections.length,
      loadedIndices: loadedIndicesRef.current
    })

    for (const index of initialIndices) {
      if (!currentSections[index]?.collapsed) {
        loadSection(index)
      }
    }
  }, [entrySignature, loadSection, sections.length])

  const invalidateCombinedDiffViewStateCache = useCallback((): void => {
    combinedDiffViewStateCache.delete(viewStateKey)
  }, [viewStateKey])

  const retrySection = useCallback(
    (index: number) => {
      const collapsed = sectionsRef.current[index]?.collapsed ?? false
      loadedIndicesRef.current.delete(index)
      loadingIndicesRef.current.delete(index)
      invalidateCombinedDiffViewStateCache()
      generationRef.current += 1
      setGeneration((prev) => prev + 1)
      setSections((prev) =>
        prev.map((section, sectionIndex) =>
          sectionIndex === index
            ? {
                ...section,
                loading: !collapsed,
                error: undefined,
                diffResult: null,
                originalContent: '',
                modifiedContent: '',
                largeDiffRenderLimit: null,
                contentGeneration: (section.contentGeneration ?? 0) + 1
              }
            : section
        )
      )
      if (collapsed) {
        return
      }
      loadSchedulerRef.current.rerequest(index)
    },
    [invalidateCombinedDiffViewStateCache]
  )
  retrySectionRef.current = retrySection

  // Why: this is handed to CodeView, which diffs its options on every render,
  // so an inline arrow here would churn the whole surface.
  const renderSectionHeaderTrailingContent = useCallback(
    (section: DiffSection): ReactNode => {
      const hasFileNotes = diffCommentsForWorktree.some(
        (comment) => comment.filePath === section.path
      )
      return hasFileNotes ? (
        <DiffNotesSendMenu
          worktreeId={file.worktreeId}
          groupId={activeGroupId ?? file.worktreeId}
          comments={diffCommentsForWorktree}
          filePath={section.path}
          showFileScope
          triggerClassName="p-0.5 can-hover:opacity-0 group-hover:opacity-100"
        />
      ) : null
    },
    [activeGroupId, diffCommentsForWorktree, file.worktreeId]
  )

  const toggleSection = useCallback((index: number) => {
    const shouldLoadAfterExpand = sectionsRef.current[index]?.collapsed ?? false
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, collapsed: !s.collapsed } : s)))
    if (shouldLoadAfterExpand) {
      loadSchedulerRef.current.request(index)
    }
  }, [])
  const sectionIndexByKey = React.useMemo(
    () => createCombinedDiffSectionIndexMap(sections),
    [sections]
  )
  const sectionIndexByKeyRef = useRef(sectionIndexByKey)
  sectionIndexByKeyRef.current = sectionIndexByKey
  const requestCombinedDiffSectionReload = useCallback((index: number): void => {
    const section = sectionsRef.current[index]
    if (!section || section.dirty) {
      return
    }
    retrySectionRef.current(index)
  }, [])
  const revealSection = useCallback(
    (entry: CombinedDiffEntry) => {
      const navigatedIndex = handleCombinedDiffSectionNavigation({
        mode: combinedMode,
        entry,
        sections: sectionsRef.current,
        sectionIndexByKey,
        toggleSection,
        scrollToIndex: (index) => {
          const key = sectionsRef.current[index]?.key
          if (key) {
            codeViewRef.current?.scrollToFile(key)
          }
        }
      })
      if (navigatedIndex !== null) {
        // Why: revealing a section is the user's explicit "show me this diff"
        // affordance. Re-selecting an already-loaded row must refetch in case
        // the file or git index changed while the section stayed mounted.
        requestCombinedDiffSectionReload(navigatedIndex)
      }
    },
    [requestCombinedDiffSectionReload, sectionIndexByKey, toggleSection, combinedMode]
  )

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<CombinedDiffRevealSectionRequest>).detail
      if (!detail || detail.worktreeId !== file.worktreeId) {
        return
      }
      revealSection(detail.entry)
    }
    window.addEventListener(COMBINED_DIFF_REVEAL_SECTION_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(COMBINED_DIFF_REVEAL_SECTION_EVENT, handler as EventListener)
  }, [file.worktreeId, revealSection])

  const combinedGitStatusSignature = React.useMemo(() => {
    if (!shouldAutoReloadFromGitStatus) {
      return ''
    }
    return buildCombinedGitStatusSignature(sections, gitStatusEntries)
  }, [gitStatusEntries, sections, shouldAutoReloadFromGitStatus])
  const prevCombinedGitStatusSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    if (!shouldAutoReloadFromGitStatus) {
      prevCombinedGitStatusSignatureRef.current = null
      return
    }
    if (prevCombinedGitStatusSignatureRef.current === null) {
      prevCombinedGitStatusSignatureRef.current = combinedGitStatusSignature
      return
    }
    if (prevCombinedGitStatusSignatureRef.current === combinedGitStatusSignature) {
      return
    }
    prevCombinedGitStatusSignatureRef.current = combinedGitStatusSignature
    for (const index of loadedIndicesRef.current) {
      requestCombinedDiffSectionReload(index)
    }
  }, [combinedGitStatusSignature, requestCombinedDiffSectionReload, shouldAutoReloadFromGitStatus])

  useEffect(() => {
    if (combinedMode !== 'all' && combinedMode !== 'uncommitted') {
      return
    }
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<EditorPathMutationTarget>).detail
      if (!detail || detail.worktreeId !== file.worktreeId) {
        return
      }
      const hasRuntimeOwnerFilter = Object.prototype.hasOwnProperty.call(
        detail,
        'runtimeEnvironmentId'
      )
      const targetRuntimeOwner = detail.runtimeEnvironmentId?.trim() || null
      const fileRuntimeOwner = file.runtimeEnvironmentId?.trim() || null
      if (hasRuntimeOwnerFilter && targetRuntimeOwner !== fileRuntimeOwner) {
        return
      }
      for (const area of ['unstaged', 'staged', 'untracked'] as const) {
        const key = getCombinedDiffEntrySectionKey('uncommitted', {
          path: detail.relativePath,
          status: 'modified',
          area
        })
        const index = sectionIndexByKeyRef.current.get(key)
        if (index !== undefined) {
          requestCombinedDiffSectionReload(index)
        }
      }
    }
    window.addEventListener(YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(YIRU_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, handler as EventListener)
  }, [file.runtimeEnvironmentId, file.worktreeId, requestCombinedDiffSectionReload, combinedMode])

  const setAllSectionsCollapsed = useCallback((collapsed: boolean) => {
    combinedDiffCollapsedPreference = collapsed
    setSections((prev) => prev.map((section) => ({ ...section, collapsed })))
    if (!collapsed) {
      const initialIndices = getInitialCombinedDiffSectionLoadIndices({
        sectionCount: sectionsRef.current.length,
        loadedIndices: loadedIndicesRef.current
      })
      for (const index of initialIndices) {
        loadSchedulerRef.current.request(index)
      }
    }
  }, [])

  const toggleSideBySide = useCallback(() => {
    setSideBySide((prev) => {
      const next = !prev
      combinedDiffSideBySidePreference = next
      return next
    })
  }, [])

  const toggleDiffWordWrap = useCallback(() => {
    void updateSettings({ diffWordWrap: settings?.diffWordWrap !== true })
  }, [settings?.diffWordWrap, updateSettings])

  const openSection = useCallback(
    (index: number) => {
      const section = sectionsRef.current[index]
      if (!section) {
        return
      }

      const language = detectLanguage(section.path)
      const entry: GitBranchChangeEntry = {
        path: section.path,
        status: section.status as GitBranchChangeEntry['status'],
        oldPath: section.oldPath,
        added: section.added,
        removed: section.removed
      }

      const isBranchEntry = section.area === undefined

      if ((isBranchMode || (isAllMode && isBranchEntry)) && branchCompare) {
        openBranchDiff(file.worktreeId, file.filePath, entry, branchCompare, language)
        return
      }

      if (isCommitMode && commitCompare) {
        openCommitDiff(file.worktreeId, file.filePath, entry, commitCompare, language)
        return
      }

      openFile({
        filePath: joinPath(file.filePath, section.path),
        relativePath: section.path,
        worktreeId: file.worktreeId,
        runtimeEnvironmentId: file.runtimeEnvironmentId,
        language,
        mode: 'edit'
      })
    },
    [
      branchCompare,
      commitCompare,
      file.filePath,
      file.runtimeEnvironmentId,
      file.worktreeId,
      isAllMode,
      isBranchMode,
      isCommitMode,
      openBranchDiff,
      openCommitDiff,
      openFile
    ]
  )

  const handleSectionSave = useCallback(
    async (index: number, content: string) => {
      const section = sections[index]
      if (!section || content === section.modifiedContent) {
        return
      }
      const absolutePath = joinPath(file.filePath, section.path)
      try {
        const connectionId = getConnectionIdForFile(file.worktreeId, absolutePath) ?? undefined
        const state = useAppStore.getState()
        const worktree = file.worktreeId
          ? findWorktreeById(state.worktreesByRepo, file.worktreeId)
          : null
        await writeRuntimeFile(
          {
            settings: settingsForRuntimeOwner(state.settings, file.runtimeEnvironmentId),
            worktreeId: file.worktreeId,
            worktreePath: worktree?.path ?? null,
            connectionId
          },
          absolutePath,
          content
        )
        setSections((prev) =>
          prev.map((s, i) => {
            if (i !== index) {
              return s
            }

            if (s.diffResult?.kind !== 'text') {
              return {
                ...s,
                modifiedContent: content,
                dirty: false,
                largeDiffRenderLimit: s.largeDiffRenderLimit
              }
            }

            const nextDiffResult = { ...s.diffResult, modifiedContent: content }
            const nextLargeDiffRenderLimit = getLargeDiffRenderLimit({
              originalContent: s.originalContent,
              modifiedContent: content
            })
            const storedContent = getStoredTextDiffContent(nextDiffResult, nextLargeDiffRenderLimit)

            return {
              ...s,
              modifiedContent: storedContent.modifiedContent,
              originalContent: storedContent.originalContent,
              dirty: false,
              diffResult: getStoredTextDiffResult(nextDiffResult, nextLargeDiffRenderLimit),
              largeDiffRenderLimit: nextLargeDiffRenderLimit
            }
          })
        )
      } catch (err) {
        console.error('Save failed:', err)
      }
    },
    [file.filePath, file.runtimeEnvironmentId, file.worktreeId, sections]
  )

  const handleSectionSaveRef = useRef(handleSectionSave)
  handleSectionSaveRef.current = handleSectionSave

  useEffect(() => {
    if (sections.length === 0 && entries.length > 0) {
      return
    }
    setWithLRU(combinedDiffViewStateCache, viewStateKey, {
      entrySignature,
      gitStatusSignature: combinedGitStatusSignature,
      sections,
      loadedIndices: Array.from(loadedIndicesRef.current).filter(
        (index) => !sections[index]?.loading
      ),
      sideBySide
    })
  }, [
    combinedGitStatusSignature,
    entries.length,
    entrySignature,
    sections,
    sideBySide,
    viewStateKey
  ])

  const commentsByPath = useMemo(() => {
    const map = new Map<string, DiffComment[]>()
    for (const comment of diffCommentsForWorktree) {
      const existing = map.get(comment.filePath)
      if (existing) {
        existing.push(comment)
      } else {
        map.set(comment.filePath, [comment])
      }
    }
    return map
  }, [diffCommentsForWorktree])
  const codeViewFiles = useMemo<DiffCodeViewFile[]>(
    () =>
      sections.map((section) => ({
        source: {
          key: section.key,
          path: section.path,
          oldPath: section.oldPath,
          status: section.status,
          originalContent: section.originalContent,
          modifiedContent: section.modifiedContent
        },
        collapsed: section.collapsed,
        // Why: only the working tree is writable — a staged or committed side
        // has no file on disk this surface may edit.
        editable: section.area === 'unstaged',
        comments: commentsByPath.get(section.path),
        notice: resolveCombinedDiffNotice(section, { isBranchMode, sideBySide })
      })),
    [commentsByPath, isBranchMode, sections, sideBySide]
  )
  const codeViewRender = useMemo(
    () => ({
      isDark,
      sideBySide,
      // Why: a section is one row in a shared scroller, so sideways scrolling
      // inside it would fight the list. Wrapping keeps one scroll axis.
      wordWrap: true,
      disableFileHeader: false
    }),
    [isDark, sideBySide]
  )
  const codeViewFont = useMemo(
    () => ({
      fontSize: computeDiffEditorFontSize(settings?.terminalFontSize ?? 13, editorFontZoomLevel),
      fontFamily: resolveEditorFontFamily(settings)
    }),
    [editorFontZoomLevel, settings]
  )
  const renderCombinedDiffHeader = useCallback(
    (codeViewFile: DiffCodeViewFile) => {
      const index = sectionIndexByKeyRef.current.get(codeViewFile.source.key)
      const section = index === undefined ? undefined : sectionsRef.current[index]
      if (index === undefined || !section) {
        return null
      }
      return (
        <DiffSectionHeader
          path={section.path}
          dirty={section.dirty}
          collapsed={section.collapsed}
          added={section.added ?? 0}
          removed={section.removed ?? 0}
          onToggle={() => toggleSection(index)}
          onOpenSection={(event) => {
            event.stopPropagation()
            openSection(index)
          }}
          openSectionTitle={
            isAllMode || isBranchMode || isCommitMode ? 'Open diff' : 'Open in editor'
          }
          trailingContent={renderSectionHeaderTrailingContent(section)}
        />
      )
    },
    [
      isAllMode,
      isBranchMode,
      isCommitMode,
      openSection,
      renderSectionHeaderTrailingContent,
      toggleSection
    ]
  )
  const handleFileEditComplete = useCallback((fileKey: string, contents: string) => {
    const index = sectionIndexByKeyRef.current.get(fileKey)
    if (index !== undefined) {
      void handleSectionSaveRef.current(index, contents)
    }
  }, [])
  const handleRetryFile = useCallback((fileKey: string) => {
    const index = sectionIndexByKeyRef.current.get(fileKey)
    if (index !== undefined) {
      retrySectionRef.current(index)
    }
  }, [])

  const openAlternateDiff = useCallback(() => {
    if (!file.combinedAlternate) {
      return
    }

    if (file.combinedAlternate.source === 'combined-all') {
      openAllDiffs(file.worktreeId, file.filePath)
      return
    }

    if (branchSummary && branchSummary.status === 'ready') {
      openBranchAllDiffs(file.worktreeId, file.filePath, branchSummary, {
        source: 'combined-all'
      })
    }
  }, [branchSummary, file, openAllDiffs, openBranchAllDiffs])

  const handleCopyNotes = useCallback(async (): Promise<void> => {
    if (diffCommentCount === 0) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(diffCommentsPrompt)
      if (!notesCopyMountedRef.current) {
        return
      }
      clearNotesCopiedResetTimer()
      setNotesCopied(true)
      notesCopiedResetTimerRef.current = window.setTimeout(() => {
        setNotesCopied(false)
        notesCopiedResetTimerRef.current = null
      }, 1500)
    } catch {
      // Why: clipboard writes can fail while the app is not focused; this
      // mirrors the sidebar notes action and keeps the popover non-blocking.
    }
  }, [clearNotesCopiedResetTimer, diffCommentCount, diffCommentsPrompt])

  const handleConfirmClearNotes = useCallback(async (): Promise<void> => {
    if (diffCommentCount === 0 || isClearingNotes) {
      return
    }
    setIsClearingNotes(true)
    try {
      const ok = await clearDiffComments(file.worktreeId)
      if (!mountedRef.current) {
        return
      }
      if (ok) {
        setClearNotesDialogOpen(false)
      } else {
        toast.error(
          translate(
            'auto.components.editor.CombinedDiffViewer.45cf23b418',
            'Failed to clear notes.'
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsClearingNotes(false)
      }
    }
  }, [clearDiffComments, diffCommentCount, file.worktreeId, isClearingNotes])

  const commitBody = getCombinedDiffCommitMessageBody(
    commitCompare?.message,
    commitCompare?.subject
  )
  const diffLayoutLabel = sideBySide
    ? translate('auto.components.editor.combined.diff.viewer.604195710f', 'Show inline diff')
    : translate('auto.components.editor.combined.diff.viewer.5b6c3f9596', 'Show side-by-side diff')
  const isDiffWordWrapEnabled = settings?.diffWordWrap === true
  const diffWordWrapLabel = isDiffWordWrapEnabled
    ? translate('auto.components.editor.combined.diff.viewer.7b47fe46c8', 'Turn word wrap off')
    : translate('auto.components.editor.combined.diff.viewer.820b3e0422', 'Turn word wrap on')
  const commitHeader =
    isCommitMode && commitCompare ? (
      <div className="border-border bg-background border-b px-4 py-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {commitCompare.subject && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      className="text-foreground truncate text-sm font-semibold"
                      title={commitCompare.subject}
                    >
                      {commitCompare.subject}
                    </div>
                  }
                />
                <TooltipContent side="bottom" sideOffset={6} className="max-w-96">
                  {commitCompare.subject}
                </TooltipContent>
              </Tooltip>
            )}
            {commitBody && (
              <div className="text-muted-foreground scrollbar-sleek mt-1 max-h-24 overflow-auto text-xs leading-5 whitespace-pre-wrap">
                {commitBody}
              </div>
            )}
          </div>
          <span className="text-muted-foreground shrink-0 font-mono text-[11px] leading-5">
            {commitCompare.compareRef}
          </span>
        </div>
      </div>
    ) : null

  if (sections.length === 0 && (file.skippedConflicts?.length ?? 0) > 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {commitHeader}
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-md space-y-3">
            <div className="text-foreground text-sm font-medium">
              {translate(
                'auto.components.editor.CombinedDiffViewer.820ec01f24',
                'Conflicted files are reviewed separately'
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              {translate(
                'auto.components.editor.CombinedDiffViewer.eb5f40e49c',
                'This diff view excludes unresolved conflicts because the normal two-way diff pipeline is not conflict-safe.'
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              {file.skippedConflicts!.map((entry) => entry.path).join(', ')}
            </div>
            <div className="flex justify-center">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  openConflictReview(
                    file.worktreeId,
                    file.filePath,
                    file.skippedConflicts!.map((entry) => ({
                      path: entry.path,
                      conflictKind: entry.conflictKind
                    })),
                    'combined-diff-exclusion'
                  )
                }
              >
                {translate(
                  'auto.components.editor.CombinedDiffViewer.39f8007549',
                  'Review conflicts'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (sections.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {commitHeader}
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          {translate(
            'auto.components.editor.CombinedDiffViewer.fd8892b120',
            'No changes to display'
          )}
        </div>
      </div>
    )
  }

  const skippedConflictNotice =
    (file.skippedConflicts?.length ?? 0) > 0 ? (
      <div className="border-border/60 bg-muted/20 mx-4 mt-3 border px-3 py-2 text-xs">
        <div className="text-foreground font-medium">
          {translate(
            'auto.components.editor.CombinedDiffViewer.820ec01f24',
            'Conflicted files are reviewed separately'
          )}
        </div>
        <div className="text-muted-foreground mt-1">
          {file.skippedConflicts!.length}{' '}
          {translate('auto.components.editor.CombinedDiffViewer.689b99f8ad', 'unresolved conflict')}
          {file.skippedConflicts!.length === 1 ? '' : 's'}{' '}
          {translate(
            'auto.components.editor.CombinedDiffViewer.39e73e7181',
            'were excluded from this diff view.'
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() =>
              openConflictReview(
                file.worktreeId,
                file.filePath,
                file.skippedConflicts!.map((entry) => ({
                  path: entry.path,
                  conflictKind: entry.conflictKind
                })),
                'combined-diff-exclusion'
              )
            }
          >
            {translate('auto.components.editor.CombinedDiffViewer.39f8007549', 'Review conflicts')}
          </Button>
        </div>
      </div>
    ) : null
  const allSectionsCollapsed = sections.every((section) => section.collapsed)
  const collapseAllLabel = allSectionsCollapsed
    ? translate('auto.components.editor.CombinedDiffViewer.19c45cfdc0', 'Expand All')
    : translate('auto.components.editor.CombinedDiffViewer.ea08dae15b', 'Collapse All')

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-border bg-background/50 flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-muted-foreground truncate text-xs">
              {sections.length}{' '}
              {translate('auto.components.editor.CombinedDiffViewer.7e7ca60816', 'changed files')}
              {(isAllMode || isBranchMode) && branchCompare
                ? translate(
                    'auto.components.editor.CombinedDiffViewer.6094135eec',
                    ' vs {{value0}}',
                    { value0: branchCompare.baseRef }
                  )
                : ''}
              {isCommitMode && commitCompare
                ? translate(
                    'auto.components.editor.CombinedDiffViewer.724a13568d',
                    ' in {{value0}}',
                    { value0: commitCompare.compareRef }
                  )
                : ''}
            </span>
            {diffCommentCount > 0 && (
              <div className="border-border/70 bg-muted/40 ml-1 flex shrink-0 items-center overflow-hidden border">
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="xs"
                        type="button"
                        className="text-foreground/80 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground border-0 pr-1.5 pl-2 text-[11px] leading-none transition-colors"
                        aria-label={translate(
                          'auto.components.editor.CombinedDiffViewer.8f68ad9ca9',
                          'Show {{value0}} AI {{value1}}',
                          {
                            value0: diffCommentCount,
                            value1: diffCommentCount === 1 ? 'note' : 'notes'
                          }
                        )}
                      >
                        <Sparkles className="size-3 text-violet-500 dark:text-violet-400" />
                        <span>
                          {translate(
                            'auto.components.editor.CombinedDiffViewer.bb84b4c374',
                            'AI notes'
                          )}
                        </span>
                        <span className="bg-background/80 text-muted-foreground px-1 text-[10px] tabular-nums">
                          {diffCommentCount}
                        </span>
                      </Button>
                    }
                  />
                  <PopoverContent align="start" side="bottom" sideOffset={6} className="w-80 p-0">
                    <DiffNotesPreviewPopover
                      comments={previewDiffComments}
                      totalCount={diffCommentCount}
                      copied={notesCopied}
                      onCopy={() => void handleCopyNotes()}
                      onClear={() => setClearNotesDialogOpen(true)}
                    />
                  </PopoverContent>
                </Popover>
                <DiffNotesSendMenu
                  worktreeId={file.worktreeId}
                  groupId={activeGroupId ?? file.worktreeId}
                  comments={diffCommentsForWorktree}
                  actionLabel="Send"
                  triggerClassName="h-6 gap-1 border-l border-border/70 px-2 text-[11px] font-medium leading-none text-foreground/80 hover:bg-accent hover:text-foreground"
                  iconClassName="size-3"
                />
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {file.combinedAlternate && (
              <Button
                variant="quiet"
                size="xs"
                className="h-auto border-0 p-0"
                onClick={openAlternateDiff}
              >
                {file.combinedAlternate.source === 'combined-branch'
                  ? translate(
                      'auto.components.editor.CombinedDiffViewer.3d909843bb',
                      'Open Branch Diff'
                    )
                  : translate(
                      'auto.components.editor.CombinedDiffViewer.982d14bfa5',
                      'Open All Changes'
                    )}
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex shrink-0">
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-xs"
                      aria-label={collapseAllLabel}
                      title={collapseAllLabel}
                      onClick={() => setAllSectionsCollapsed(!allSectionsCollapsed)}
                    >
                      {allSectionsCollapsed ? (
                        <ExpandSections className="size-3.5" />
                      ) : (
                        <CollapseSections className="size-3.5" />
                      )}
                    </Button>
                  </span>
                }
              />
              <TooltipContent side="bottom" sideOffset={6}>
                {collapseAllLabel}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex shrink-0">
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-xs"
                      className={cn(sideBySide ? 'bg-accent' : '')}
                      aria-label={diffLayoutLabel}
                      aria-pressed={sideBySide}
                      title={diffLayoutLabel}
                      onClick={toggleSideBySide}
                    >
                      <SideBySideColumns className="size-3.5" />
                    </Button>
                  </span>
                }
              />
              <TooltipContent side="bottom" sideOffset={6}>
                {diffLayoutLabel}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex shrink-0">
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-xs"
                      className={cn(isDiffWordWrapEnabled ? 'bg-accent' : '')}
                      aria-label={diffWordWrapLabel}
                      aria-pressed={isDiffWordWrapEnabled}
                      title={diffWordWrapLabel}
                      onClick={toggleDiffWordWrap}
                    >
                      <WrapText className="size-3.5" />
                    </Button>
                  </span>
                }
              />
              <TooltipContent side="bottom" sideOffset={6}>
                {diffWordWrapLabel}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {commitHeader}
        {skippedConflictNotice}
        <div className="relative min-h-0 min-w-0 flex-1">
          <DiffCodeView
            viewRef={codeViewRef}
            files={codeViewFiles}
            render={codeViewRender}
            font={codeViewFont}
            worktreeId={file.worktreeId}
            className="scrollbar-editor bg-background h-full min-h-0 overflow-x-hidden overflow-y-auto"
            scrollCacheKey={viewStateKey}
            renderFileHeader={renderCombinedDiffHeader}
            onRetryFile={handleRetryFile}
            onFileEditComplete={handleFileEditComplete}
          />
        </div>
      </div>
      <Dialog
        open={clearNotesDialogVisible}
        onOpenChange={(open) => {
          if (!open && !isClearingNotes) {
            setClearNotesDialogOpen(false)
          } else if (open) {
            setClearNotesDialogOpen(true)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {translate('auto.components.editor.CombinedDiffViewer.948a5fd6c8', 'Clear Notes')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {translate('auto.components.editor.CombinedDiffViewer.84898c548d', 'Clear')}
              {diffCommentCount}{' '}
              {diffCommentCount === 1
                ? translate('auto.components.editor.CombinedDiffViewer.8ab3248fd8', 'note')
                : translate('auto.components.editor.CombinedDiffViewer.0fb870a0fe', 'notes')}{' '}
              {translate(
                'auto.components.editor.CombinedDiffViewer.80a286d8f5',
                'from this worktree?'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearNotesDialogOpen(false)}
              disabled={isClearingNotes}
            >
              {translate('auto.components.editor.CombinedDiffViewer.0f806a2ab1', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmClearNotes()}
              disabled={isClearingNotes || diffCommentCount === 0}
            >
              <Trash2 className="size-4" />
              {translate('auto.components.editor.CombinedDiffViewer.948a5fd6c8', 'Clear Notes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DiffNotesPreviewPopover({
  comments,
  totalCount,
  copied,
  onCopy,
  onClear
}: {
  comments: DiffComment[]
  totalCount: number
  copied: boolean
  onCopy: () => void
  onClear: () => void
}): React.JSX.Element {
  const remainingCount = Math.max(0, totalCount - comments.length)

  return (
    <div className="text-xs">
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-foreground flex min-w-0 items-center gap-1.5 font-medium">
          <MessageSquare className="text-muted-foreground size-3.5 shrink-0" />
          <span>
            {translate('auto.components.editor.CombinedDiffViewer.bb84b4c374', 'AI notes')}
          </span>
          <span className="text-muted-foreground text-[11px] font-normal tabular-nums">
            {totalCount}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="quiet"
            size="xs"
            className="h-6"
            onClick={onCopy}
            disabled={totalCount === 0}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {translate('auto.components.editor.CombinedDiffViewer.88b70d0ef5', 'Copy')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-destructive h-6"
            onClick={onClear}
            disabled={totalCount === 0}
          >
            <Trash2 className="size-3" />
            {translate('auto.components.editor.CombinedDiffViewer.84898c548d', 'Clear')}
          </Button>
        </div>
      </div>
      <div className="scrollbar-sleek max-h-72 overflow-y-auto p-2">
        {comments.map((comment) => (
          <div key={comment.id} className="hover:bg-accent/50 px-2 py-1.5">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] leading-none">
              <span className="min-w-0 flex-1 truncate font-mono">{comment.filePath}</span>
              {comment.sentAt ? (
                <span className="bg-muted shrink-0 px-1 py-0.5 text-[10px] leading-none">
                  {translate('auto.components.editor.CombinedDiffViewer.1da745c551', 'Sent')}
                </span>
              ) : null}
              <span className="shrink-0 tabular-nums">
                {getDiffCommentLineLabel(comment, true)}
              </span>
            </div>
            <div className="text-foreground mt-1 max-h-10 overflow-hidden text-[12px] leading-snug break-words whitespace-pre-wrap">
              {comment.body}
            </div>
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="text-muted-foreground px-2 py-1 text-[11px]">
            {remainingCount}{' '}
            {translate('auto.components.editor.CombinedDiffViewer.e3b9a6ce02', 'more')}
            {remainingCount === 1
              ? translate('auto.components.editor.CombinedDiffViewer.8ab3248fd8', 'note')
              : translate('auto.components.editor.CombinedDiffViewer.0fb870a0fe', 'notes')}{' '}
            {translate('auto.components.editor.CombinedDiffViewer.35cc27aeb2', 'in Source Control')}
          </div>
        )}
      </div>
    </div>
  )
}
