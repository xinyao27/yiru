import type { editor } from 'monaco-editor'
import React, { useRef, useState, useCallback } from 'react'

import { translate } from '@/i18n/i18n'

import { setupContextualCopy } from './setup-contextual-copy'

export function useContextualCopySetup() {
  const [copyToast, setCopyToast] = useState<{ left: number; top: number } | null>(null)
  const copyToastTimeoutRef = useRef<number | null>(null)

  const setupCopy = useCallback(
    (
      editorInstance: editor.IStandaloneCodeEditor,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _monaco: any,
      filePath: string,
      propsRef: React.MutableRefObject<{
        relativePath: string
        language: string
        onSave?: (content: string) => void
      }>
    ) => {
      setupContextualCopy({
        editorInstance,
        filePath,
        setCopyToast,
        propsRef,
        copyToastTimeoutRef
      })
    },
    []
  )

  const toastNode = copyToast ? (
    <div
      className="bg-foreground text-background pointer-events-none fixed z-50 px-2 py-1 text-xs"
      style={{ left: copyToast.left, top: copyToast.top }}
    >
      {translate('auto.components.editor.useContextualCopySetup.059bfb0d94', 'Context copied')}
    </div>
  ) : null

  return { setupCopy, toastNode }
}
