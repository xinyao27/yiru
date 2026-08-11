import { Copy, Check } from '@phosphor-icons/react'
import React, { useCallback, useRef, useState } from 'react'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'

type CodeBlockCopyButtonProps = React.HTMLAttributes<HTMLPreElement> & {
  children?: React.ReactNode
}

export default function CodeBlockCopyButton({
  children,
  ...props
}: CodeBlockCopyButtonProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copiedResetTimerRef = useRef<number | null>(null)
  // Why: clipboard IPC can resolve after this button unmounts; avoid starting
  // a reset timer that will outlive the component.
  const isMountedRef = useRef(false)

  const clearCopiedResetTimer = useCallback((): void => {
    if (copiedResetTimerRef.current !== null) {
      window.clearTimeout(copiedResetTimerRef.current)
      copiedResetTimerRef.current = null
    }
  }, [])

  const setCopyButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      isMountedRef.current = node !== null
      if (node === null) {
        clearCopiedResetTimer()
      }
    },
    [clearCopiedResetTimer]
  )

  const handleCopy = useCallback(() => {
    // Extract the text content from the nested <code> element rendered by
    // react-markdown inside <pre>. We walk the React children tree to grab the
    // raw string so clipboard receives plain text, not markup.
    let text = ''
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.props) {
        const inner = (child.props as { children?: React.ReactNode }).children
        text += typeof inner === 'string' ? inner : extractText(inner)
      } else if (typeof child === 'string') {
        text += child
      }
    })

    void shellClient.ui
      .writeClipboardText(text)
      .then(() => {
        if (!isMountedRef.current) {
          return
        }
        clearCopiedResetTimer()
        setCopied(true)
        copiedResetTimerRef.current = window.setTimeout(() => {
          copiedResetTimerRef.current = null
          setCopied(false)
        }, 1500)
      })
      .catch(() => {
        // Silently swallow clipboard write failures (e.g. permission denied).
      })
  }, [children, clearCopiedResetTimer])

  return (
    <div className="code-block-wrapper group relative">
      <pre {...props}>{children}</pre>
      <Button
        variant="ghost"
        size="xs"
        ref={setCopyButtonRef}
        type="button"
        className="code-block-copy-btn focus-visible:bg-accent text-muted-foreground can-hover:opacity-0 can-hover:group-hover:opacity-100 absolute top-2 right-2 h-auto border-0 p-1 opacity-100 transition-opacity duration-150"
        onClick={handleCopy}
        aria-label={translate('auto.components.editor.CodeBlockCopyButton.1f9f4def45', 'Copy code')}
        title={translate('auto.components.editor.CodeBlockCopyButton.1f9f4def45', 'Copy code')}
      >
        {copied ? (
          <>
            <Check size={14} />
            <span className="code-block-copy-label ml-[3px] font-sans text-[11px]">
              {translate('auto.components.editor.CodeBlockCopyButton.28921f5bf9', 'Copied')}
            </span>
          </>
        ) : (
          <Copy size={14} />
        )}
      </Button>
    </div>
  )
}

/** Recursively extract text from React children. */
function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join('')
  }
  if (React.isValidElement(node) && node.props) {
    return extractText((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}
