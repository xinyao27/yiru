export type LspPosition = {
  line: number
  character: number
}

export type LspRange = {
  start: LspPosition
  end: LspPosition
}

export type LspMarkupContent = {
  kind: 'plaintext' | 'markdown'
  value: string
}

export type LspMarkedString = string | { language: string; value: string }
export type LspDocumentation = string | LspMarkupContent

export type LspHover = {
  contents: LspMarkupContent | LspMarkedString | LspMarkedString[]
  range?: LspRange
}

export type LspLocation = {
  uri: string
  range: LspRange
}

export type LspLocationLink = {
  targetUri: string
  targetRange: LspRange
  targetSelectionRange: LspRange
}

export type LspDefinition = LspLocation | LspLocationLink

export type LspTextEdit = {
  range: LspRange
  newText: string
}

export type LspInsertReplaceEdit = {
  insert: LspRange
  replace: LspRange
  newText: string
}

export type LspCompletionItem = {
  label: string
  labelDetails?: { detail?: string; description?: string }
  kind?: number
  tags?: number[]
  detail?: string
  documentation?: LspDocumentation
  deprecated?: boolean
  preselect?: boolean
  sortText?: string
  filterText?: string
  insertText?: string
  insertTextFormat?: number
  textEdit?: LspTextEdit | LspInsertReplaceEdit
  commitCharacters?: string[]
}

export type LspVersionedTextDocumentIdentifier = {
  uri: string
  version: number | null
}

export type LspTextDocumentEdit = {
  textDocument: LspVersionedTextDocumentIdentifier
  edits: LspTextEdit[]
}

export type LspResourceOperation = {
  kind: 'create' | 'rename' | 'delete'
  uri?: string
  oldUri?: string
  newUri?: string
}

export type LspWorkspaceEdit = {
  changes?: Record<string, LspTextEdit[]>
  documentChanges?: (LspTextDocumentEdit | LspResourceOperation)[]
}

export type LspCommand = {
  title: string
  command: string
  arguments?: unknown[]
}

export type LspCodeAction = {
  title: string
  kind?: string
  diagnostics?: LspDiagnostic[]
  isPreferred?: boolean
  disabled?: { reason: string }
  edit?: LspWorkspaceEdit
  command?: LspCommand
  data?: unknown
}

export type LspCodeActionResult = (LspCodeAction | LspCommand)[] | null

export type LspPrepareRenameResult =
  | LspRange
  | { range: LspRange; placeholder?: string }
  | { defaultBehavior: true }
  | null

export type LspCompletionList = {
  isIncomplete: boolean
  items: LspCompletionItem[]
}

export type LspCompletionResult = LspCompletionItem[] | LspCompletionList | null

export type LspParameterInformation = {
  label: string | [number, number]
  documentation?: LspDocumentation
}

export type LspSignatureInformation = {
  label: string
  documentation?: LspDocumentation
  parameters?: LspParameterInformation[]
  activeParameter?: number
}

export type LspSignatureHelp = {
  signatures: LspSignatureInformation[]
  activeSignature?: number
  activeParameter?: number
}

export type LspDiagnostic = {
  range: LspRange
  severity?: number
  code?: string | number
  codeDescription?: { href: string }
  source?: string
  message: string
  tags?: number[]
  data?: unknown
}

export type LspPublishDiagnosticsParams = {
  uri: string
  version?: number
  diagnostics: LspDiagnostic[]
}

export type LspDocumentSymbol = {
  name: string
  detail?: string
  kind: number
  tags?: number[]
  deprecated?: boolean
  range: LspRange
  selectionRange: LspRange
  children?: LspDocumentSymbol[]
}

export type LspSymbolInformation = {
  name: string
  kind: number
  tags?: number[]
  deprecated?: boolean
  location: LspLocation
  containerName?: string
}

export type LspTextDocumentSyncOptions = {
  openClose?: boolean
  change?: number
}

export type LspCompletionOptions = {
  triggerCharacters?: string[]
  resolveProvider?: boolean
}

export type LspSignatureHelpOptions = {
  triggerCharacters?: string[]
  retriggerCharacters?: string[]
}

export type LspRenameOptions = {
  prepareProvider?: boolean
}

export type LspCodeActionOptions = {
  codeActionKinds?: string[]
  resolveProvider?: boolean
}

export type LspServerCapabilities = {
  textDocumentSync?: number | LspTextDocumentSyncOptions
  hoverProvider?: boolean | Record<string, unknown>
  definitionProvider?: boolean | Record<string, unknown>
  completionProvider?: boolean | LspCompletionOptions
  signatureHelpProvider?: boolean | LspSignatureHelpOptions
  referencesProvider?: boolean | Record<string, unknown>
  documentSymbolProvider?: boolean | Record<string, unknown>
  renameProvider?: boolean | LspRenameOptions
  codeActionProvider?: boolean | LspCodeActionOptions
  documentFormattingProvider?: boolean | Record<string, unknown>
  documentRangeFormattingProvider?: boolean | Record<string, unknown>
}

export type LspInitializeResult = {
  capabilities: LspServerCapabilities
  serverInfo?: {
    name: string
    version?: string
  }
}

export type LspLogMessageParams = {
  type?: number
  message: string
}
