import { useEditor, type Editor } from '@tiptap/react'

import { createRichMarkdownEditorConfig, type EditorConfigParams } from './editor-config'
import { createRichMarkdownExtensions } from './extensions'

export function useRichMarkdownEditorInstance(params: EditorConfigParams): Editor | null {
  const extensions = (() =>
    createRichMarkdownExtensions({
      codec: params.codec,
      includePlaceholder: true,
      htmlSuperscriptLinks: true,
      htmlSuperscriptLinkContext: params.htmlSuperscriptLinkContext
    }))()
  const editor = useEditor(
    (() => ({
      extensions,
      ...createRichMarkdownEditorConfig(params)
    }))()
  )
  params.editorRef.current = editor ?? null
  return editor
}
