import type * as monaco from 'monaco-editor'

import type { LanguageServerSettings } from '../../../shared/language-server'

export type LanguageServerDocumentAttachment = {
  model: monaco.editor.ITextModel
  filePath: string
  worktreeId: string
  runtimeEnvironmentId?: string | null
  connectionId: string | null | undefined
  readOnly: boolean
  settings: LanguageServerSettings | undefined
}
