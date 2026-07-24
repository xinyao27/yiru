import { File, Folder } from '@phosphor-icons/react'
import { useCallback, useRef } from 'react'

import { Input } from '@/components/ui/input'

export type InlineInput = {
  parentPath: string
  type: 'file' | 'folder' | 'rename'
  depth: number
  existingName?: string
  existingPath?: string
}

export function InlineInputRow({
  depth,
  inlineInput,
  onSubmit,
  onCancel
}: {
  depth: number
  inlineInput: InlineInput
  onSubmit: (value: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submitted = useRef(false)
  // Why: menu focus restoration can briefly steal focus before the user types.
  const focusSettled = useRef(false)
  const focusFrame = useRef<number | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refocusFrame = useRef<number | null>(null)
  const inlineInputKey = [
    inlineInput.type,
    inlineInput.parentPath,
    inlineInput.depth,
    inlineInput.existingPath ?? '',
    inlineInput.existingName ?? ''
  ].join('\0')

  const cancelRefocusFrame = useCallback((): void => {
    if (refocusFrame.current !== null) {
      cancelAnimationFrame(refocusFrame.current)
      refocusFrame.current = null
    }
  }, [])

  const scheduleInputRefocus = useCallback((): void => {
    cancelRefocusFrame()
    refocusFrame.current = requestAnimationFrame(() => {
      refocusFrame.current = null
      inputRef.current?.focus()
    })
  }, [cancelRefocusFrame])

  const clearInlineInputTimers = useCallback(() => {
    if (focusFrame.current !== null) {
      cancelAnimationFrame(focusFrame.current)
      focusFrame.current = null
    }
    cancelRefocusFrame()
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current)
      blurTimeout.current = null
    }
    if (settleTimer.current) {
      clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
  }, [cancelRefocusFrame])

  const setInputRef = useCallback(
    (element: HTMLInputElement | null): void => {
      inputRef.current = element
      clearInlineInputTimers()
      if (!element) {
        return
      }

      submitted.current = false
      focusSettled.current = false
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = null
        if (inputRef.current !== element) {
          return
        }
        element.focus()
        if (inlineInput.type === 'rename' && inlineInput.existingName) {
          const dotIndex = inlineInput.existingName.lastIndexOf('.')
          if (dotIndex > 0) {
            element.setSelectionRange(0, dotIndex)
          } else {
            element.select()
          }
        }
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null
          focusSettled.current = true
        }, 200)
      })
    },
    [clearInlineInputTimers, inlineInput.existingName, inlineInput.type]
  )

  const clearBlurTimeout = useCallback(() => {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current)
      blurTimeout.current = null
    }
  }, [])

  const submit = useCallback(
    (value: string) => {
      if (submitted.current) {
        return
      }
      submitted.current = true
      clearBlurTimeout()
      onSubmit(value)
    },
    [onSubmit, clearBlurTimeout]
  )

  return (
    <div
      className="flex h-[26px] w-full items-center gap-1 px-2"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="size-3 shrink-0" />
      {inlineInput.type === 'folder' ? (
        <Folder className="text-muted-foreground size-3 shrink-0" />
      ) : (
        <File className="text-muted-foreground size-3 shrink-0" />
      )}
      <Input
        key={inlineInputKey}
        ref={setInputRef}
        size="inline-edit"
        className="border-ring flex-1"
        defaultValue={inlineInput.type === 'rename' ? inlineInput.existingName : ''}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submit(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            clearBlurTimeout()
            submitted.current = true
            onCancel()
          }
        }}
        onFocus={clearBlurTimeout}
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof HTMLElement &&
            (event.relatedTarget.closest('[data-slot="context-menu-trigger"]') ||
              event.relatedTarget.closest('[data-slot="dropdown-menu-trigger"]'))
          ) {
            scheduleInputRefocus()
            return
          }
          if (!focusSettled.current) {
            scheduleInputRefocus()
            return
          }
          const value = event.currentTarget.value
          blurTimeout.current = setTimeout(() => {
            blurTimeout.current = null
            submit(value)
          }, 150)
        }}
      />
    </div>
  )
}
