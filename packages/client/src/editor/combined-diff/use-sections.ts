/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: entry changes reset virtualized section measurements and stale async generations before paint. */
import type { GitBranchChangeEntry, GitStatusEntry } from '@yiru/runtime-protocol/workbench/types'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import type { DiffSection } from '../diff-section/types'
import type { OpenFile } from '../state'
import { getInitialCombinedDiffSectionLoadIndices } from './initial-section-load'
import { createCombinedDiffLoadScheduler } from './load-scheduler'
import { resolveCombinedDiffModel, type CombinedDiffModel } from './model'
import { loadCombinedDiffSection } from './section-load'
import { resolveInitialCombinedDiffSectionState } from './section-state'
import { combinedDiffPreferences, deleteCombinedDiffViewState } from './view-state'
import { getRetainedResolvedSnapshotEntries } from './view-state'

export type CombinedDiffSections = {
  loadedIndicesRef: MutableRefObject<Set<number>>
  model: CombinedDiffModel
  retrySection: (index: number) => void
  sections: DiffSection[]
  sectionsRef: MutableRefObject<DiffSection[]>
  setAllSectionsCollapsed: (collapsed: boolean) => void
  setSections: Dispatch<SetStateAction<DiffSection[]>>
  sideBySide: boolean
  toggleSection: (index: number) => void
  toggleSideBySide: () => void
}

type UseCombinedDiffSectionsOptions = {
  defaultView?: string
  file: OpenFile
  gitStatusEntries: GitStatusEntry[]
  liveBranchEntries: GitBranchChangeEntry[]
  viewStateKey: string
}

export function useCombinedDiffSections({
  defaultView,
  file,
  gitStatusEntries,
  liveBranchEntries,
  viewStateKey
}: UseCombinedDiffSectionsOptions): CombinedDiffSections {
  const [sections, setSections] = useState<DiffSection[]>([])
  const [sideBySide, setSideBySide] = useState(() =>
    combinedDiffPreferences.getSideBySide(defaultView)
  )
  const [, setGeneration] = useState(0)
  const loadedIndicesRef = useRef<Set<number>>(new Set())
  const loadingIndicesRef = useRef<Set<number>>(new Set())
  const sectionsRef = useRef<DiffSection[]>([])
  const generationRef = useRef(0)
  const loadSectionRef = useRef<(index: number) => Promise<void>>(async () => {})
  const loadSchedulerRef = useRef(
    createCombinedDiffLoadScheduler({ loadSection: (index) => loadSectionRef.current(index) })
  )
  sectionsRef.current = sections

  const model = resolveCombinedDiffModel({
    file,
    gitStatusEntries,
    liveBranchEntries,
    retainedResolvedEntries: getRetainedResolvedSnapshotEntries(sectionsRef.current)
  })

  useEffect(() => {
    if (defaultView !== undefined && !combinedDiffPreferences.hasSideBySide()) {
      setSideBySide(defaultView === 'side-by-side')
    }
  }, [defaultView])

  useLayoutEffect(() => {
    const initial = resolveInitialCombinedDiffSectionState({
      combinedMode: model.combinedMode,
      entries: model.entries,
      entrySignature: model.entrySignature,
      gitStatusEntries,
      hasUncommittedEntriesSnapshot: model.hasUncommittedEntriesSnapshot,
      shouldAutoReloadFromGitStatus: model.shouldAutoReloadFromGitStatus,
      viewStateKey
    })
    setSections(initial.sections)
    if (initial.sideBySide !== undefined) {
      setSideBySide(initial.sideBySide)
    }
    loadedIndicesRef.current = initial.loadedIndices
    loadingIndicesRef.current.clear()
    if (initial.sideBySide !== undefined) {
      return
    }
    loadSchedulerRef.current.reset()
    generationRef.current += 1
    setGeneration((generation) => generation + 1)
  }, [
    gitStatusEntries,
    model.combinedMode,
    model.entries,
    model.entrySignature,
    model.hasUncommittedEntriesSnapshot,
    model.shouldAutoReloadFromGitStatus,
    viewStateKey
  ])

  const loadSectionNow = async (index: number): Promise<void> => {
    if (loadedIndicesRef.current.has(index) || loadingIndicesRef.current.has(index)) {
      return
    }
    loadingIndicesRef.current.add(index)
    const generation = generationRef.current
    const entry = model.entries[index]
    if (!entry) {
      loadingIndicesRef.current.delete(index)
      return
    }
    const loadedSection = await loadCombinedDiffSection({
      branchCompare: model.branchCompare,
      commitCompare: model.commitCompare,
      entry,
      file,
      isAllMode: model.isAllMode,
      isBranchMode: model.isBranchMode,
      isCommitMode: model.isCommitMode
    })
    loadingIndicesRef.current.delete(index)
    if (generationRef.current !== generation) {
      return
    }
    loadedIndicesRef.current.add(index)
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...loadedSection, loading: false } : section
      )
    )
  }
  loadSectionRef.current = loadSectionNow

  useEffect(() => {
    const scheduler = loadSchedulerRef.current
    scheduler.reset()
    return () => scheduler.dispose()
  }, [])

  const requestSectionLoad = useEventCallback((index: number) => {
    if (!sectionsRef.current[index]?.collapsed) {
      loadSchedulerRef.current.request(index)
    }
  })

  useEffect(() => {
    const current = sectionsRef.current
    for (let index = 0; index < current.length; index += 1) {
      if (current[index]?.loading && loadedIndicesRef.current.has(index)) {
        loadedIndicesRef.current.delete(index)
      }
    }
    const initialIndices = getInitialCombinedDiffSectionLoadIndices({
      sectionCount: current.length,
      loadedIndices: loadedIndicesRef.current
    })
    for (const index of initialIndices) {
      requestSectionLoad(index)
    }
  }, [model.entrySignature, requestSectionLoad, sections.length])

  const retrySection = (index: number): void => {
    const collapsed = sectionsRef.current[index]?.collapsed ?? false
    loadedIndicesRef.current.delete(index)
    loadingIndicesRef.current.delete(index)
    deleteCombinedDiffViewState(viewStateKey)
    generationRef.current += 1
    setGeneration((generation) => generation + 1)
    setSections((current) =>
      current.map((section, sectionIndex) =>
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
    if (!collapsed) {
      loadSchedulerRef.current.rerequest(index)
    }
  }

  const toggleSection = (index: number): void => {
    const shouldLoad = sectionsRef.current[index]?.collapsed ?? false
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, collapsed: !section.collapsed } : section
      )
    )
    if (shouldLoad) {
      loadSchedulerRef.current.request(index)
    }
  }

  const setAllSectionsCollapsed = (collapsed: boolean): void => {
    combinedDiffPreferences.setCollapsed(collapsed)
    setSections((current) => current.map((section) => ({ ...section, collapsed })))
    if (!collapsed) {
      const initialIndices = getInitialCombinedDiffSectionLoadIndices({
        sectionCount: sectionsRef.current.length,
        loadedIndices: loadedIndicesRef.current
      })
      for (const index of initialIndices) {
        loadSchedulerRef.current.request(index)
      }
    }
  }

  const toggleSideBySide = (): void => {
    setSideBySide((current) => {
      const next = !current
      combinedDiffPreferences.setSideBySide(next)
      return next
    })
  }

  return {
    loadedIndicesRef,
    model,
    retrySection,
    sections,
    sectionsRef,
    setAllSectionsCollapsed,
    setSections,
    sideBySide,
    toggleSection,
    toggleSideBySide
  }
}
