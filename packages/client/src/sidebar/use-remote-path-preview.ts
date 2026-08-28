import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, RefObject } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import {
  filterEntries,
  isPathMode,
  isRemoteFileBrowserPathResolveTextTooLarge,
  joinPath,
  parentPath,
  parsePathInput,
  resolveSegmentStep,
  shouldDeferRemoteFileBrowserPasteResolve,
  type DirEntry
} from './remote-file-browser-state'
import type { RemoteDirectoryBrowseResult } from './use-remote-directory'

const PATH_DEBOUNCE_MS = 300

export type RemotePathPreview = {
  resolvedPath: string
  entries: DirEntry[]
  filter: string
  error: string | null
  loading: boolean
}

export function useRemotePathPreview({
  clearFileHint,
  fetchListing,
  homePathRef,
  resolvedPath
}: {
  resolvedPath: string
  fetchListing: (path: string) => Promise<RemoteDirectoryBrowseResult>
  homePathRef: RefObject<string | null>
  clearFileHint: () => void
}) {
  const [filter, setFilter] = useState('')
  const [preview, setPreview] = useState<RemotePathPreview | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const generationRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const committedPrefixRef = useRef('')

  const cancelTimers = useEventCallback(() => {
    for (const timerRef of [debounceTimerRef, pasteTimerRef]) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  })
  const invalidatePreview = useEventCallback(() => {
    generationRef.current++
  })
  const resetInput = () => {
    setFilter('')
    setPreview(null)
    generationRef.current++
    committedPrefixRef.current = ''
    cancelTimers()
  }
  const resolveBasePath = async (
    base: 'root' | 'home' | 'cwd',
    generation: number
  ): Promise<string | null> => {
    if (base === 'root') {
      return '/'
    }
    if (base === 'cwd') {
      return resolvedPath
    }
    if (homePathRef.current) {
      return homePathRef.current
    }
    setPreview({
      resolvedPath,
      entries: [],
      filter: '',
      error: null,
      loading: true
    })
    try {
      const home = await fetchListing('~')
      if (generation !== generationRef.current) {
        return null
      }
      homePathRef.current = home.resolvedPath
      return home.resolvedPath
    } catch (caught) {
      if (generation === generationRef.current) {
        setPreview({
          resolvedPath,
          entries: [],
          filter: '',
          error: caught instanceof Error ? caught.message : String(caught),
          loading: false
        })
      }
      return null
    }
  }
  const resolvePathInput = async (raw: string): Promise<void> => {
    const parsed = parsePathInput(raw)
    if (parsed.mode !== 'path') {
      return
    }
    const generation = ++generationRef.current
    if (parsed.invalid) {
      setPreview({
        resolvedPath,
        entries: [],
        filter: '',
        error: parsed.invalid,
        loading: false
      })
      return
    }
    const basePath = await resolveBasePath(parsed.base, generation)
    if (!basePath || generation !== generationRef.current) {
      return
    }
    setPreview((current) => ({
      resolvedPath: current?.resolvedPath ?? basePath,
      entries: current?.entries ?? [],
      filter: current?.filter ?? '',
      error: null,
      loading: true
    }))
    let currentPath = basePath
    try {
      for (const segment of parsed.committedSegments) {
        const listing = await fetchListing(currentPath)
        if (generation !== generationRef.current) {
          return
        }
        const outcome = resolveSegmentStep(segment, currentPath, listing.entries)
        if (outcome.type === 'error') {
          setPreview({
            resolvedPath: currentPath,
            entries: listing.entries,
            filter: '',
            error: outcome.message,
            loading: false
          })
          return
        }
        if (outcome.type === 'stay') {
          currentPath = segment === '..' ? parentPath(currentPath) : currentPath
        } else {
          currentPath = joinPath(currentPath, outcome.name)
        }
      }
      const listing = await fetchListing(currentPath)
      if (generation !== generationRef.current) {
        return
      }
      committedPrefixRef.current = committedPrefix(raw)
      setPreview({
        resolvedPath: listing.resolvedPath,
        entries: listing.entries,
        filter: parsed.trailingFilter,
        error: null,
        loading: false
      })
    } catch (caught) {
      if (generation === generationRef.current) {
        setPreview({
          resolvedPath: currentPath,
          entries: [],
          filter: '',
          error: caught instanceof Error ? caught.message : String(caught),
          loading: false
        })
      }
    }
  }
  const handleInputChange = (raw: string) => {
    clearFileHint()
    setFilter(raw)
    if (isRemoteFileBrowserPathResolveTextTooLarge(raw) || !isPathMode(raw)) {
      if (preview) {
        setPreview(null)
        generationRef.current++
      }
      cancelTimers()
      return
    }
    const parsed = parsePathInput(raw)
    if (
      parsed.mode === 'path' &&
      preview &&
      !preview.error &&
      !parsed.invalid &&
      committedPrefix(raw) === committedPrefixRef.current
    ) {
      setPreview({ ...preview, filter: parsed.trailingFilter })
      return
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      void resolvePathInput(raw)
    }, PATH_DEBOUNCE_MS)
  }
  const handleInputPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (
      event.defaultPrevented ||
      shouldDeferRemoteFileBrowserPasteResolve(event.clipboardData.getData('text/plain'))
    ) {
      return
    }
    if (pasteTimerRef.current) {
      clearTimeout(pasteTimerRef.current)
    }
    pasteTimerRef.current = setTimeout(() => {
      pasteTimerRef.current = null
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      const value = inputRef.current?.value ?? ''
      if (!isRemoteFileBrowserPathResolveTextTooLarge(value) && isPathMode(value)) {
        void resolvePathInput(value)
      }
    }, 0)
  }
  const previewEntries = (() => (preview ? filterEntries(preview.entries, preview.filter) : []))()

  useEffect(() => {
    return () => {
      invalidatePreview()
      cancelTimers()
    }
  }, [cancelTimers, invalidatePreview])

  return {
    filter,
    handleInputChange,
    handleInputPaste,
    inputRef,
    preview,
    previewEntries,
    resetInput
  }
}

function committedPrefix(raw: string): string {
  const index = raw.lastIndexOf('/')
  return index === -1 ? '' : raw.slice(0, index + 1)
}
