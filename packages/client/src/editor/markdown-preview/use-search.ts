/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: match state mirrors CSS Highlight ranges owned outside React. */
import { useEffect, useRef, useState } from 'react'
import type { RefCallback, RefObject } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import {
  applyMarkdownPreviewSearchHighlights,
  clearMarkdownPreviewSearchHighlights,
  setActiveMarkdownPreviewSearchMatch
} from './search'

type UseMarkdownPreviewSearchOptions = {
  bodyRef: RefObject<HTMLDivElement | null>
  renderedContent: string
}

export type MarkdownPreviewSearch = {
  activeMatchIndex: number
  closeSearch: () => void
  inputRef: RefObject<HTMLInputElement | null>
  isSearchOpen: boolean
  matchCount: number
  moveToMatch: (direction: 1 | -1) => void
  openSearch: () => void
  query: string
  setQuery: (query: string) => void
  setSearchInputElement: RefCallback<HTMLInputElement>
}

export function useMarkdownPreviewSearch({
  bodyRef,
  renderedContent
}: UseMarkdownPreviewSearchOptions): MarkdownPreviewSearch {
  const inputRef = useRef<HTMLInputElement>(null)
  const matchesRef = useRef<Range[]>([])
  const searchInstanceRef = useRef<object>({})
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [searchRevision, setSearchRevision] = useState(0)
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1)

  const setSearchInputElement = (input: HTMLInputElement | null): void => {
    inputRef.current = input
    if (input) {
      input.focus()
      input.select()
    }
  }
  const moveToMatch = (direction: 1 | -1): void => {
    if (matchesRef.current.length === 0) {
      return
    }
    setActiveMatchIndex((current) => {
      const base = current >= 0 ? current : direction === 1 ? -1 : 0
      return (base + direction + matchesRef.current.length) % matchesRef.current.length
    })
  }
  const openSearch = useEventCallback(() => {
    if (isSearchOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else {
      setIsSearchOpen(true)
    }
  })
  const closeSearch = useEventCallback(() => {
    setIsSearchOpen(false)
    setQuery('')
    setActiveMatchIndex(-1)
  })

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    const instanceId = searchInstanceRef.current
    if (!isSearchOpen) {
      matchesRef.current = []
      setMatchCount(0)
      clearMarkdownPreviewSearchHighlights(instanceId)
      return
    }
    const matches = applyMarkdownPreviewSearchHighlights(instanceId, body, query)
    matchesRef.current = matches
    setMatchCount(matches.length)
    setSearchRevision((revision) => revision + 1)
    setActiveMatchIndex((current) =>
      matches.length === 0 ? -1 : current >= 0 && current < matches.length ? current : 0
    )
    return () => clearMarkdownPreviewSearchHighlights(instanceId)
  }, [bodyRef, isSearchOpen, query, renderedContent])

  useEffect(() => {
    setActiveMarkdownPreviewSearchMatch(
      searchInstanceRef.current,
      matchesRef.current,
      activeMatchIndex
    )
  }, [activeMatchIndex, matchCount, searchRevision])

  return {
    activeMatchIndex,
    closeSearch,
    inputRef,
    isSearchOpen,
    matchCount,
    moveToMatch,
    openSearch,
    query,
    setQuery,
    setSearchInputElement
  }
}
