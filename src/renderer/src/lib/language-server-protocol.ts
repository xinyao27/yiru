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

export type LspTextDocumentSyncOptions = {
  openClose?: boolean
  change?: number
}

export type LspServerCapabilities = {
  textDocumentSync?: number | LspTextDocumentSyncOptions
  hoverProvider?: boolean | Record<string, unknown>
  definitionProvider?: boolean | Record<string, unknown>
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
