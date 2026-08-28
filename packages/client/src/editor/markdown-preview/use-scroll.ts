import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { scrollTopCache, setWithLRU } from '../scroll-cache'
import { decodeMarkdownPreviewAnchor, getMarkdownPreviewAnchorScrollTop } from './navigation'

type UseMarkdownPreviewScrollOptions = {
  bodyRef: RefObject<HTMLDivElement | null>
  content: string
  initialAnchor: string | null
  renderedContent: string
  rootRef: RefObject<HTMLDivElement | null>
  scrollCacheKey: string
}

export function useMarkdownPreviewScroll({
  bodyRef,
  content,
  initialAnchor,
  renderedContent,
  rootRef,
  scrollCacheKey
}: UseMarkdownPreviewScrollOptions): {
  navigateToTableOfContentsItem: (id: string) => void
  scrollToAnchor: (anchor: string) => boolean
} {
  const lastAppliedInitialAnchorRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const container = rootRef.current
    if (!container) {
      return
    }
    let throttleTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = (): void => {
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer)
      }
      throttleTimer = setTimeout(() => {
        setWithLRU(scrollTopCache, scrollCacheKey, container.scrollTop)
        throttleTimer = null
      }, 150)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      // Why: StrictMode's empty remount must not overwrite a valid viewport snapshot.
      if (container.scrollHeight > container.clientHeight || container.scrollTop > 0) {
        setWithLRU(scrollTopCache, scrollCacheKey, container.scrollTop)
      }
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer)
      }
      container.removeEventListener('scroll', onScroll)
    }
  }, [rootRef, scrollCacheKey])

  useLayoutEffect(() => {
    const container = rootRef.current
    const targetScrollTop = scrollTopCache.get(scrollCacheKey)
    if (!container || targetScrollTop === undefined) {
      return
    }
    let frameId = 0
    let attempts = 0
    const tryRestore = (): void => {
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
      container.scrollTop = Math.min(targetScrollTop, maxScrollTop)
      if (Math.abs(container.scrollTop - targetScrollTop) <= 1 || maxScrollTop >= targetScrollTop) {
        return
      }
      attempts += 1
      if (attempts < 30) {
        frameId = window.requestAnimationFrame(tryRestore)
      }
    }
    tryRestore()
    return () => window.cancelAnimationFrame(frameId)
  }, [renderedContent, rootRef, scrollCacheKey])

  const scrollToAnchor = useEventCallback((rawAnchor: string): boolean => {
    const container = rootRef.current
    const body = bodyRef.current
    if (!container || !body) {
      return false
    }
    const decodedAnchor = decodeMarkdownPreviewAnchor(rawAnchor)
    const target = Array.from(body.querySelectorAll<HTMLElement>('[id]')).find(
      (candidate) => candidate.id === decodedAnchor
    )
    if (!target) {
      return false
    }
    container.scrollTo({ top: getMarkdownPreviewAnchorScrollTop(container, target) })
    target.focus({ preventScroll: true })
    return true
  })

  useLayoutEffect(() => {
    if (!initialAnchor || initialAnchor === lastAppliedInitialAnchorRef.current) {
      return
    }
    let frameId = 0
    let attempts = 0
    const tryRevealAnchor = (): void => {
      if (scrollToAnchor(initialAnchor)) {
        lastAppliedInitialAnchorRef.current = initialAnchor
        return
      }
      attempts += 1
      if (attempts < 30) {
        frameId = window.requestAnimationFrame(tryRevealAnchor)
      }
    }
    tryRevealAnchor()
    return () => window.cancelAnimationFrame(frameId)
  }, [content, initialAnchor, scrollToAnchor])

  return {
    navigateToTableOfContentsItem: (id) => {
      scrollToAnchor(id)
    },
    scrollToAnchor
  }
}
