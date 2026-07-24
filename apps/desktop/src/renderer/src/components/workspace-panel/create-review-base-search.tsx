import { useEffect } from 'react'

import {
  getRuntimeRepoBaseRefDefault,
  searchRuntimeRepoBaseRefDetails
} from '@/runtime/runtime-repo-client'

import { normalizeCreateReviewBaseSearchResults, stripBaseRef } from './create-review-base-ref'
import type { CreateReviewDialogFieldState } from './create-review-dialog-field-state'
import type { UseCreatePullRequestDialogFieldsOptions } from './create-review-dialog-field-types'

export function useCreateReviewBaseSearch(
  options: UseCreatePullRequestDialogFieldsOptions,
  state: CreateReviewDialogFieldState
): void {
  const { open, repoId, settings } = options
  const { base, baseQuery, setBase, setBaseResults, setBaseSearchError } = state

  useEffect(() => {
    if (!open || base) {
      return
    }
    let stale = false
    void getRuntimeRepoBaseRefDefault(settings, repoId)
      .then((result) => {
        if (!stale && result.defaultBaseRef) {
          setBase(stripBaseRef(result.defaultBaseRef))
        }
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [base, open, repoId, settings, setBase])

  useEffect(() => {
    if (!open || baseQuery.trim().length < 2) {
      setBaseResults([])
      setBaseSearchError(null)
      return
    }
    let stale = false
    const timer = window.setTimeout(() => {
      void searchRuntimeRepoBaseRefDetails(settings, repoId, baseQuery.trim(), 20)
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
  }, [baseQuery, open, repoId, settings, setBaseResults, setBaseSearchError])
}
