import { useEffect, useRef } from 'react'
import {
  getRuntimeRepoBaseRefDefault,
  searchRuntimeRepoBaseRefDetails
} from '~renderer/runtime/repo-client'

import { normalizeCreateReviewBaseSearchResults, stripBaseRef } from './create-review-base-ref'
import type { CreateReviewDialogFieldState } from './create-review-dialog-field-state'
import type { UseCreatePullRequestDialogFieldsOptions } from './create-review-dialog-field-types'

export function useCreateReviewBaseSearch(
  options: UseCreatePullRequestDialogFieldsOptions,
  state: CreateReviewDialogFieldState
): void {
  const { open, repoId, settings } = options
  const {
    base,
    baseQuery,
    baseResults,
    baseSearchError,
    setBase,
    setBaseResults,
    setBaseSearchError
  } = state
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const runtimeEnvironmentId = settings?.activeRuntimeEnvironmentId ?? null

  useEffect(() => {
    if (!open || base) {
      return
    }
    let stale = false
    void getRuntimeRepoBaseRefDefault(settingsRef.current, repoId)
      .then((result) => {
        if (!stale && result.defaultBaseRef) {
          setBase(stripBaseRef(result.defaultBaseRef))
        }
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [base, open, repoId, runtimeEnvironmentId, setBase])

  useEffect(() => {
    if (!open || baseQuery.trim().length < 2) {
      if (baseResults.length > 0) {
        setBaseResults([])
      }
      if (baseSearchError !== null) {
        setBaseSearchError(null)
      }
      return
    }
    let stale = false
    const timer = window.setTimeout(() => {
      void searchRuntimeRepoBaseRefDetails(settingsRef.current, repoId, baseQuery.trim(), 20)
        .then((results) => {
          if (!stale) {
            setBaseResults(normalizeCreateReviewBaseSearchResults(results))
            setBaseSearchError(null)
          }
        })
        .catch(() => {
          if (!stale) {
            setBaseResults([])
            setBaseSearchError('Branch discovery failed.')
          }
        })
    }, 200)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [
    baseQuery,
    baseResults.length,
    baseSearchError,
    open,
    repoId,
    runtimeEnvironmentId,
    setBaseResults,
    setBaseSearchError
  ])
}
