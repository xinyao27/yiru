import type { UpdateStatus } from '@yiru/runtime-protocol/workbench/types'
import type { KeyboardEvent } from 'react'
import { useRef, useState } from 'react'

export function useUpdateCardMotion(options: {
  statusState: UpdateStatus['state']
  prefersReducedMotion: boolean
  onDismiss: () => void
  onCollapse: () => void
}): {
  exiting: boolean
  cardRootRef: (node: HTMLDivElement | null) => void
  dismissWithAnimation: () => void
  collapseWithAnimation: () => void
  handleKeyDown: (event: KeyboardEvent) => void
} {
  const [exiting, setExiting] = useState(false)
  const dismissTimer = useRef<number | null>(null)
  const collapseTimer = useRef<number | null>(null)

  const clearTimers = () => {
    if (dismissTimer.current !== null) {
      window.clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }

  const cardRootRef = (node: HTMLDivElement | null) => {
    if (node === null) {
      clearTimers()
    }
  }

  const dismissWithAnimation = (): void => {
    if (options.prefersReducedMotion) {
      options.onDismiss()
      return
    }
    setExiting(true)
    if (dismissTimer.current !== null) {
      window.clearTimeout(dismissTimer.current)
    }
    dismissTimer.current = window.setTimeout(() => {
      dismissTimer.current = null
      options.onDismiss()
    }, 150)
  }

  const collapseWithAnimation = (): void => {
    if (options.prefersReducedMotion) {
      options.onCollapse()
      return
    }
    setExiting(true)
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current)
    }
    collapseTimer.current = window.setTimeout(() => {
      collapseTimer.current = null
      options.onCollapse()
      setExiting(false)
    }, 150)
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') {
      return
    }
    event.preventDefault()
    if (
      options.statusState === 'downloading' ||
      options.statusState === 'downloaded' ||
      options.statusState === 'error'
    ) {
      collapseWithAnimation()
    } else {
      dismissWithAnimation()
    }
  }

  return { exiting, cardRootRef, dismissWithAnimation, collapseWithAnimation, handleKeyDown }
}
