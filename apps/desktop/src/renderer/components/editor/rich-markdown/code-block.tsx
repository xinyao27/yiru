import { Copy, Check } from '@phosphor-icons/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'

import MermaidBlock from '../mermaid-block'

/**
 * Common languages shown in the selector. The user can also type a language
 * name directly in the markdown fence (```rust) and it will be preserved —
 * this list is just for quick picking in the UI.
 */
const LANGUAGES = [
  {
    value: '',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.13822cdfda', 'Plain text')
    }
  },
  {
    value: 'bash',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.4227cf50fe', 'Bash')
    }
  },
  { value: 'c', label: 'C' },
  {
    value: 'cpp',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.4daed43ae3', 'C++')
    }
  },
  {
    value: 'css',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.026653f21f', 'CSS')
    }
  },
  {
    value: 'diff',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.bf6ee5caaa', 'Diff')
    }
  },
  {
    value: 'go',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.edfcc64182', 'Go')
    }
  },
  {
    value: 'graphql',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.706fd85738', 'GraphQL')
    }
  },
  {
    value: 'html',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.8c4a3fa02d', 'HTML')
    }
  },
  {
    value: 'java',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.36536ad539', 'Java')
    }
  },
  {
    value: 'javascript',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.a209c57063', 'JavaScript')
    }
  },
  {
    value: 'json',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.78eba32de4', 'JSON')
    }
  },
  {
    value: 'kotlin',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.bcb236e2d8', 'Kotlin')
    }
  },
  {
    value: 'markdown',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.983b9576b4', 'Markdown')
    }
  },
  {
    value: 'mermaid',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.89d6cc14fb', 'Mermaid')
    }
  },
  {
    value: 'python',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.2391f9cda9', 'Python')
    }
  },
  {
    value: 'ruby',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.96182a2f64', 'Ruby')
    }
  },
  {
    value: 'rust',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.e72e6b03f4', 'Rust')
    }
  },
  {
    value: 'scss',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.5af8251002', 'SCSS')
    }
  },
  {
    value: 'shell',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.d01f55be57', 'Shell')
    }
  },
  {
    value: 'sql',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.3009f722b9', 'SQL')
    }
  },
  {
    value: 'swift',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.9e384d48dc', 'Swift')
    }
  },
  {
    value: 'typescript',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.88d777bc07', 'TypeScript')
    }
  },
  {
    value: 'xml',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.5ef5605cb7', 'XML')
    }
  },
  {
    value: 'yaml',
    get label() {
      return translate('auto.components.editor.RichMarkdownCodeBlock.74eab1d9b2', 'YAML')
    }
  }
]

export function RichMarkdownCodeBlock({
  node,
  updateAttributes
}: NodeViewProps): React.JSX.Element {
  useTranslation()
  const language = (node.attrs.language as string) || ''
  const [copied, setCopied] = useState(false)
  const copiedResetTimerRef = useRef<number | null>(null)
  // Why: clipboard IPC can resolve after the node view unmounts; avoid
  // starting a reset timer that will outlive the component.
  const isMountedRef = useRef(false)
  const settings = useAppStore((s) => s.settings)
  const isDark =
    settings?.theme === 'dark' ||
    (settings?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const isMermaid = language === 'mermaid'

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

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({ language: e.target.value })
    },
    [updateAttributes]
  )

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const text = node.textContent
      void window.api.ui
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
    },
    [clearCopiedResetTimer, node]
  )

  return (
    <NodeViewWrapper
      // Why: `rich-markdown-code-block-wrapper` stays a stable hook for the
      // syntax-highlight color rules in rich-markdown-content.css — the hljs
      // spans are injected by CodeBlockLowlight's decoration plugin, not JSX.
      className="group rich-markdown-code-block-wrapper relative my-[0.75em] border border-[color-mix(in_srgb,var(--foreground)_6%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]"
    >
      {/* Why: TipTap NodeView keeps an in-flow native select (contentEditable=false)
          so language changes do not open a portaled Select that steals ProseMirror focus. */}
      <select
        className="text-muted-foreground focus-visible:border-ring absolute top-1.5 right-1.5 z-[1] cursor-pointer border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--background)_80%,transparent)] px-1 py-px font-mono text-[11px] outline-none"
        contentEditable={false}
        value={language}
        onChange={onChange}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.value} value={lang.value}>
            {lang.label}
          </option>
        ))}
        {/* If the document has a language not in our list, show it as-is */}
        {language && !LANGUAGES.some((l) => l.value === language) ? (
          <option value={language}>{language}</option>
        ) : null}
      </select>
      <Button
        variant="quiet"
        size="xs"
        ref={setCopyButtonRef}
        type="button"
        className="absolute top-1.5 right-[115px] z-[1] flex h-auto items-center justify-center border-0 bg-transparent p-0.5 opacity-0 transition-opacity duration-150 ease-linear group-hover:opacity-100"
        contentEditable={false}
        onClick={handleCopy}
        aria-label={translate(
          'auto.components.editor.RichMarkdownCodeBlock.c72beafc0f',
          'Copy code'
        )}
        title={translate('auto.components.editor.RichMarkdownCodeBlock.c72beafc0f', 'Copy code')}
      >
        {copied ? (
          <>
            <Check size={14} />
            <span className="code-block-copy-label ml-[3px] font-sans text-[11px]">
              {translate('auto.components.editor.RichMarkdownCodeBlock.232d9ed853', 'Copied')}
            </span>
          </>
        ) : (
          <Copy size={14} />
        )}
      </Button>
      <NodeViewContent<'pre'> as="pre" />
      {/* Why: mermaid diagrams render as a live SVG preview below the editable
          source so users can see the result while editing. The code block stays
          editable — the diagram is read-only output. This preview also goes
          through MermaidBlock's sanitized SVG path, so it must opt out of
          Mermaid HTML labels just like markdown preview to keep labels visible. */}
      {isMermaid && node.textContent.trim() && (
        <div
          contentEditable={false}
          className="border-t border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] px-[18px] py-3"
        >
          <MermaidBlock content={node.textContent.trim()} isDark={isDark} htmlLabels={false} />
        </div>
      )}
    </NodeViewWrapper>
  )
}
