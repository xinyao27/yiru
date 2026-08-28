import type { Editor } from '@tiptap/react'
import { useEffect, useSyncExternalStore } from 'react'
import { useAppStore } from '~renderer/store/state'

import { scrollToAnchorInEditor } from './markdown-anchor-scroll'
import {
  classifyHtmlSuperscriptLinkAction,
  type RichMarkdownHtmlSuperscriptLinkContext
} from './rich-markdown/html-superscript-link-context'
import { getLinkBubblePosition } from './rich-markdown/link-bubble'
import type { LinkBubbleState } from './rich-markdown/link-bubble'
import { copyRichMarkdownLink } from './rich-markdown/link-clipboard'

/**
 * Extracts link-editing action handlers from the editor component to reduce
 * file size. State lives in the parent (declared before useEditor so the
 * editor callbacks can reference the setters).
 */
export function useLinkBubble(
  editor: Editor | null,
  rootRef: React.RefObject<HTMLElement | null>,
  linkBubble: LinkBubbleState | null,
  setLinkBubble: (v: LinkBubbleState | null) => void,
  setIsEditingLink: (v: boolean) => void,
  linkContext: {
    sourceFilePath: string
    worktreeId: string
    worktreeRoot: string | null
    runtimeEnvironmentId?: string | null
    htmlSuperscriptLinkContext: RichMarkdownHtmlSuperscriptLinkContext
  }
): {
  handleLinkSave: (href: string) => void
  handleLinkRemove: () => void
  handleLinkEditCancel: () => void
  handleLinkOpen: () => void
  handleLinkCopy: () => void
  toggleLinkFromToolbar: () => void
} {
  const citationContextSnapshot = useSyncExternalStore(
    linkContext.htmlSuperscriptLinkContext.subscribe,
    linkContext.htmlSuperscriptLinkContext.getSnapshot,
    linkContext.htmlSuperscriptLinkContext.getSnapshot
  )
  useEffect(() => {
    if (!linkBubble) {
      return
    }
    const openEnabled = classifyHtmlSuperscriptLinkAction(linkBubble.href, citationContextSnapshot)
    if (openEnabled !== linkBubble.openEnabled) {
      setLinkBubble({ ...linkBubble, openEnabled })
    }
  }, [citationContextSnapshot, linkBubble, setLinkBubble])
  const startLinkEdit = () => {
    if (!editor) {
      return
    }
    const pos = getLinkBubblePosition(editor, rootRef.current)
    if (pos) {
      const href = editor.isActive('link')
        ? (editor.getAttributes('link').href as string) || ''
        : ''
      setLinkBubble({
        kind: 'markdown',
        href,
        openEnabled: Boolean(href),
        copyEnabled: Boolean(href),
        ...pos
      })
      setIsEditingLink(true)
    }
  }

  const handleLinkSave = (href: string) => {
    if (!editor) {
      return
    }

    if (href) {
      if (editor.isActive('link')) {
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
      } else {
        const { from, to } = editor.state.selection
        if (from === to) {
          // No selection: insert URL as both the link text and href.
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'text',
              text: href,
              marks: [{ type: 'link', attrs: { href } }]
            })
            .run()
        } else {
          editor.chain().focus().setLink({ href }).run()
        }
      }
    } else if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.commands.focus()
    }
    setIsEditingLink(false)
  }

  const handleLinkRemove = () => {
    if (!editor) {
      return
    }
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setLinkBubble(null)
    setIsEditingLink(false)
  }

  const handleLinkEditCancel = () => {
    setIsEditingLink(false)
    if (!linkBubble?.href) {
      setLinkBubble(null)
    }
    editor?.commands.focus()
  }

  const activateMarkdownLink = useAppStore((s) => s.activateMarkdownLink)

  const handleLinkOpen = () => {
    if (
      !linkBubble?.href ||
      !linkBubble.openEnabled ||
      !classifyHtmlSuperscriptLinkAction(linkBubble.href, citationContextSnapshot)
    ) {
      return
    }
    if (linkBubble.href.startsWith('#')) {
      scrollToAnchorInEditor(rootRef.current, linkBubble.href.slice(1))
      return
    }
    void activateMarkdownLink(linkBubble.href, {
      sourceFilePath: linkContext.sourceFilePath,
      worktreeId: linkContext.worktreeId,
      worktreeRoot: linkContext.worktreeRoot,
      runtimeEnvironmentId: linkContext.runtimeEnvironmentId,
      sourceOwner: citationContextSnapshot.sourceOwner
    })
  }

  const handleLinkCopy = () => {
    if (!linkBubble?.href || !linkBubble.copyEnabled) {
      return
    }
    void copyRichMarkdownLink(linkBubble.href)
  }

  const toggleLinkFromToolbar = () => {
    if (!editor) {
      return
    }
    if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      setLinkBubble(null)
    } else {
      startLinkEdit()
    }
  }

  return {
    handleLinkSave,
    handleLinkRemove,
    handleLinkEditCancel,
    handleLinkOpen,
    handleLinkCopy,
    toggleLinkFromToolbar
  }
}
