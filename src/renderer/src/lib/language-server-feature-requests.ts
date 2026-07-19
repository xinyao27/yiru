import type * as monaco from 'monaco-editor'
import type {
  LspCompletionResult,
  LspDefinition,
  LspDocumentSymbol,
  LspHover,
  LspLocation,
  LspPosition,
  LspServerCapabilities,
  LspSignatureHelp,
  LspSymbolInformation
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
}
