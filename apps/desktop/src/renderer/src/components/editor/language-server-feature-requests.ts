import type * as monaco from 'monaco-editor'

import type {
  LspCodeActionResult,
  LspCompletionResult,
  LspDefinition,
  LspDiagnostic,
  LspDocumentSymbol,
  LspHover,
  LspLocation,
  LspPosition,
  LspPrepareRenameResult,
  LspRange,
  LspServerCapabilities,
  LspSignatureHelp,
  LspSymbolInformation,
  LspTextEdit,
  LspWorkspaceEdit
} from './language-server-protocol'
import type { LanguageServerRequestRouter } from './language-server-request-router'

const REQUEST_TIMEOUT_MS = 10_000

export class LanguageServerFeatureRequests {
  constructor(
    private readonly getCapabilities: () => LspServerCapabilities,
    private readonly requests: LanguageServerRequestRouter
  ) {}

  supportsHover(): boolean {
    return Boolean(this.getCapabilities().hoverProvider)
  }

  supportsDefinition(): boolean {
    return Boolean(this.getCapabilities().definitionProvider)
  }

  supportsCompletion(): boolean {
    return Boolean(this.getCapabilities().completionProvider)
  }

  supportsSignatureHelp(): boolean {
    return Boolean(this.getCapabilities().signatureHelpProvider)
  }

  supportsReferences(): boolean {
    return Boolean(this.getCapabilities().referencesProvider)
  }

  supportsDocumentSymbols(): boolean {
    return Boolean(this.getCapabilities().documentSymbolProvider)
  }

  supportsRename(): boolean {
    return Boolean(this.getCapabilities().renameProvider)
  }

  supportsPrepareRename(): boolean {
    const provider = this.getCapabilities().renameProvider
    return provider !== null && typeof provider === 'object' && provider.prepareProvider === true
  }

  supportsCodeActions(): boolean {
    return Boolean(this.getCapabilities().codeActionProvider)
  }

  supportsDocumentFormatting(): boolean {
    return Boolean(this.getCapabilities().documentFormattingProvider)
  }

  supportsRangeFormatting(): boolean {
    return Boolean(this.getCapabilities().documentRangeFormattingProvider)
  }

  getCodeActionKinds(): string[] {
    const provider = this.getCapabilities().codeActionProvider
    return provider && typeof provider === 'object' && Array.isArray(provider.codeActionKinds)
      ? provider.codeActionKinds
      : []
  }

  getCompletionTriggerCharacters(): string[] {
    const provider = this.getCapabilities().completionProvider
    return provider && typeof provider === 'object' && Array.isArray(provider.triggerCharacters)
      ? provider.triggerCharacters
      : []
  }

  getSignatureTriggerCharacters(): { trigger: string[]; retrigger: string[] } {
    const provider = this.getCapabilities().signatureHelpProvider
    return provider && typeof provider === 'object'
      ? {
          trigger: Array.isArray(provider.triggerCharacters) ? provider.triggerCharacters : [],
          retrigger: Array.isArray(provider.retriggerCharacters) ? provider.retriggerCharacters : []
        }
      : { trigger: [], retrigger: [] }
  }

  hover(
    uri: string,
    position: LspPosition,
    token: monaco.CancellationToken
  ): Promise<LspHover | null> {
    return this.requests.withCancellation<LspHover | null>(
      'textDocument/hover',
      { textDocument: { uri }, position },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  definition(
    uri: string,
    position: LspPosition,
    token: monaco.CancellationToken
  ): Promise<LspDefinition | LspDefinition[] | null> {
    return this.requests.withCancellation<LspDefinition | LspDefinition[] | null>(
      'textDocument/definition',
      { textDocument: { uri }, position },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  completion(
    uri: string,
    position: LspPosition,
    context: { triggerKind: number; triggerCharacter?: string },
    token: monaco.CancellationToken
  ): Promise<LspCompletionResult> {
    return this.requests.withCancellation<LspCompletionResult>(
      'textDocument/completion',
      { textDocument: { uri }, position, context },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  signatureHelp(
    uri: string,
    position: LspPosition,
    context: { triggerKind: number; triggerCharacter?: string; isRetrigger: boolean },
    token: monaco.CancellationToken
  ): Promise<LspSignatureHelp | null> {
    return this.requests.withCancellation<LspSignatureHelp | null>(
      'textDocument/signatureHelp',
      { textDocument: { uri }, position, context },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  references(
    uri: string,
    position: LspPosition,
    includeDeclaration: boolean,
    token: monaco.CancellationToken
  ): Promise<LspLocation[] | null> {
    return this.requests.withCancellation<LspLocation[] | null>(
      'textDocument/references',
      { textDocument: { uri }, position, context: { includeDeclaration } },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  documentSymbols(
    uri: string,
    token: monaco.CancellationToken
  ): Promise<LspDocumentSymbol[] | LspSymbolInformation[] | null> {
    return this.requests.withCancellation<LspDocumentSymbol[] | LspSymbolInformation[] | null>(
      'textDocument/documentSymbol',
      { textDocument: { uri } },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  prepareRename(
    uri: string,
    position: LspPosition,
    token: monaco.CancellationToken
  ): Promise<LspPrepareRenameResult> {
    return this.requests.withCancellation<LspPrepareRenameResult>(
      'textDocument/prepareRename',
      { textDocument: { uri }, position },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  rename(
    uri: string,
    position: LspPosition,
    newName: string,
    token: monaco.CancellationToken
  ): Promise<LspWorkspaceEdit | null> {
    return this.requests.withCancellation<LspWorkspaceEdit | null>(
      'textDocument/rename',
      { textDocument: { uri }, position, newName },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  codeActions(
    uri: string,
    range: LspRange,
    diagnostics: LspDiagnostic[],
    only: string | undefined,
    triggerKind: number,
    token: monaco.CancellationToken
  ): Promise<LspCodeActionResult> {
    return this.requests.withCancellation<LspCodeActionResult>(
      'textDocument/codeAction',
      {
        textDocument: { uri },
        range,
        context: { diagnostics, ...(only ? { only: [only] } : {}), triggerKind }
      },
      token,
      REQUEST_TIMEOUT_MS
    )
  }

  formatting(
    uri: string,
    range: LspRange | null,
    options: { tabSize: number; insertSpaces: boolean },
    token: monaco.CancellationToken
  ): Promise<LspTextEdit[] | null> {
    return this.requests.withCancellation<LspTextEdit[] | null>(
      range ? 'textDocument/rangeFormatting' : 'textDocument/formatting',
      { textDocument: { uri }, ...(range ? { range } : {}), options },
      token,
      REQUEST_TIMEOUT_MS
    )
  }
}
