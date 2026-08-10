import { handleNotebookRunPythonCell } from '~main/runtime/rpc/methods/notebook'
import {
  handleMarkdownReadTab,
  handleMarkdownSaveTab
} from '~main/runtime/rpc/methods/session-tabs-handlers'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: markdown and notebook both execute against one open document's
// content (a session tab's markdown text, a notebook cell's code) rather
// than raw filesystem paths (files.ts) or a live agent session.
export const editorDocumentsRuntimeHandlers = {
  markdown: {
    readTab: runtimeImplementation.markdown.readTab.handler(
      wireRuntimeMethod('markdown.readTab', handleMarkdownReadTab)
    ),
    saveTab: runtimeImplementation.markdown.saveTab.handler(
      wireRuntimeMethod('markdown.saveTab', handleMarkdownSaveTab)
    )
  },
  notebook: {
    runPythonCell: runtimeImplementation.notebook.runPythonCell.handler(
      wireRuntimeMethod('notebook.runPythonCell', handleNotebookRunPythonCell)
    )
  }
} as const
