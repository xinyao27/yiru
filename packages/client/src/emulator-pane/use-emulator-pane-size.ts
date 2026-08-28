import { useRef, useSyncExternalStore } from 'react'

import type { PaneSize } from './emulator-device-frame-layout'

export function useEmulatorPaneSize() {
  const paneRef = useRef<HTMLDivElement | null>(null)
  const cachedSizeRef = useRef<PaneSize | null>(null)

  // Why: paneSize is a DOM measurement, not something React owns — useState
  // can't seed it correctly since paneRef.current is still null on first
  // render. useSyncExternalStore re-reads the layout once the node commits.
  const getSnapshot = (): PaneSize | null => {
    const node = paneRef.current
    if (!node) {
      return null
    }
    const rect = node.getBoundingClientRect()
    const width = Math.floor(rect.width)
    const height = Math.floor(rect.height)
    const cached = cachedSizeRef.current
    if (cached && cached.width === width && cached.height === height) {
      return cached
    }
    const next = { width, height }
    cachedSizeRef.current = next
    return next
  }

  const subscribe = (onStoreChange: () => void): (() => void) => {
    const node = paneRef.current
    if (!node) {
      return () => {}
    }
    let frameId: number | null = null
    const scheduleUpdate = (): void => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      frameId = requestAnimationFrame(() => {
        frameId = null
        onStoreChange()
      })
    }
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', scheduleUpdate)
      return () => {
        if (frameId !== null) {
          cancelAnimationFrame(frameId)
        }
        window.removeEventListener('resize', scheduleUpdate)
      }
    }
    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(node)
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      observer.disconnect()
    }
  }

  const paneSize = useSyncExternalStore(subscribe, getSnapshot)

  return { paneRef, paneSize }
}
