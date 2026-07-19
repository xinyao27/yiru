import type * as Monaco from 'monaco-editor'
import { InMemoryClipboardMetadataManager } from 'monaco-editor/esm/vs/editor/browser/controller/editContext/clipboardUtils.js'
import { PasteAction } from 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'

import {
  YIRU_CONTEXT_MENU_PASTE_NAME,
  YIRU_CONTEXT_MENU_PASTE_PRIORITY,
  runYiruContextMenuPaste
} from './monaco-context-menu-paste'

let installed = false

/**
 * Make Monaco's context-menu / command-palette Paste read the clipboard through
 * Yiru's trusted IPC bridge instead of the sandbox-blocked navigator.clipboard.
 * Idempotent and safe to call once during Monaco setup.
 */
export function installMonacoContextMenuPaste(monaco: typeof Monaco): void {
  // Why: PasteAction is `undefined` only when the browser reports no paste
  // support at all; nothing to override in that case.
  if (installed || !PasteAction) {
    return
  }
  installed = true

  // Why: a higher priority than Monaco's built-in 'code-editor' implementation
  // (10000) lets us run first; returning a Promise (truthy, non-boolean) halts
  // MultiCommand iteration so the blocked default never runs. Returning `false`
  // falls through to the default for read-only/unfocused/non-editor cases.
  PasteAction.addImplementation(
    YIRU_CONTEXT_MENU_PASTE_PRIORITY,
    YIRU_CONTEXT_MENU_PASTE_NAME,
    () =>
      runYiruContextMenuPaste({
        getFocusedEditor: () =>
          monaco.editor.getEditors().find((candidate) => candidate.hasTextFocus()) ?? null,
        readClipboardText: (options) => window.api.ui.readClipboardText(options),
        getClipboardMetadata: (text) => InMemoryClipboardMetadataManager.INSTANCE.get(text),
        emptySelectionClipboardOptionId: monaco.editor.EditorOption.emptySelectionClipboard,
        readOnlyOptionId: monaco.editor.EditorOption.readOnly,
        onTooLarge: () => {
          toast.error(
            translate(
              'auto.components.editor.MonacoEditor.largePasteTooLarge',
              'Paste is too large.'
            )
          )
        }
      })
  )
}
