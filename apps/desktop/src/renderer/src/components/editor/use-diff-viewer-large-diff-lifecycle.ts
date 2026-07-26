import { useEffect, useMemo, useRef } from 'react'

import { monaco } from '@/components/editor/monaco-setup'

import {
  disposeUnattachedDiffViewerMonacoModels,
  getDiffViewerMonacoModelPaths
} from './diff-monaco-model-disposal'

type DiffViewerLargeDiffLifecycleInput = {
  limited: boolean
  modelKey: string
  originalModelKey?: string
  modifiedModelKey?: string
  // Why: the caller already knows when it enters fallback (it supplies
  // onEnterFallback below), so it also owns the generation counter that
  // rotates Monaco paths — this hook receives the current generation as a
  // plain value instead of keeping its own local counter to bump.
  fallbackGeneration: number
  onEnterFallback: () => void
}

export function useDiffViewerLargeDiffLifecycle({
  limited,
  modelKey,
  originalModelKey,
  modifiedModelKey,
  fallbackGeneration,
  onEnterFallback
}: DiffViewerLargeDiffLifecycleInput): {
  originalModelPath: string
  modifiedModelPath: string
} {
  const fallbackGenerationSuffix =
    fallbackGeneration === 0 ? '' : `:large-diff-generation:${fallbackGeneration}`
  const currentDiffModelPaths = useMemo(
    () =>
      getDiffViewerMonacoModelPaths({
        modelKey,
        originalModelKey,
        modifiedModelKey,
        generationSuffix: fallbackGenerationSuffix
      }),
    [modelKey, originalModelKey, modifiedModelKey, fallbackGenerationSuffix]
  )
  const currentDiffModelPathsRef = useRef(currentDiffModelPaths)
  currentDiffModelPathsRef.current = currentDiffModelPaths

  useEffect(() => {
    if (!limited) {
      return
    }
    const modelPathsToDispose = currentDiffModelPathsRef.current
    // Why: the caller bumps fallbackGeneration as part of entering fallback,
    // rotating below-limit Monaco paths so stale large models cannot be
    // reused when the same diff shrinks back down.
    onEnterFallback()
    // Why: ordinary tab switches keep models for fast return; the safety
    // fallback must instead release huge detached models after unmount cleanup.
    const disposeTimer = window.setTimeout(() => {
      disposeUnattachedDiffViewerMonacoModels(monaco, modelPathsToDispose)
    }, 0)
    return () => window.clearTimeout(disposeTimer)
  }, [limited, onEnterFallback])

  return currentDiffModelPaths
}
