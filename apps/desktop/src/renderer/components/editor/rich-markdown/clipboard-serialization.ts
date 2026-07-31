import type { Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

export function serializeRichMarkdownSliceForClipboard(
  view: EditorView,
  slice: Slice
): { html: string } {
  return { html: view.serializeForClipboard(slice).dom.innerHTML }
}
