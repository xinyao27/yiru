import type * as monaco from 'monaco-editor'
import type { Disposable } from 'vscode-jsonrpc/browser'
import type { LspPosition, LspServerCapabilities } from './language-server-protocol'

type DocumentState = {
  refs: number
  uri: string | null
  opening: Promise<void>
  subscriptions: Disposable[]
}

type DocumentRegistryOptions = {
  resolveUri: (filePath: string) => Promise<string>
  notify: (method: string, params: unknown) => Promise<void>
  getCapabilities: () => LspServerCapabilities
}

export class MonacoLanguageServerDocuments {
  private readonly documents = new Map<monaco.editor.ITextModel, DocumentState>()
  private disposed = false

  constructor(private readonly options: DocumentRegistryOptions) {}

  async attach(model: monaco.editor.ITextModel, filePath: string): Promise<Disposable> {
    const existing = this.documents.get(model)
    if (existing) {
      existing.refs++
      await existing.opening
      return { dispose: () => this.release(model) }
    }
    const state: DocumentState = {
      refs: 1,
      uri: null,
      opening: Promise.resolve(),
      subscriptions: []
    }
    this.documents.set(model, state)
    state.opening = this.open(model, filePath, state)
    try {
      await state.opening
    } catch (error) {
      if (this.documents.get(model) === state) {
        state.refs = 0
        this.close(model, state)
        this.documents.delete(model)
      }
      throw error
    }
    return { dispose: () => this.release(model) }
  }

  getUri(model: monaco.editor.ITextModel): string | null {
    return this.documents.get(model)?.uri ?? null
  }

  getModel(uri: string): monaco.editor.ITextModel | null {
    for (const [model, state] of this.documents) {
      if (state.uri === uri) {
        return model
      }
    }
    return null
  }

  async reopen(): Promise<void> {
    for (const [model, state] of this.documents) {
      if (state.uri && state.refs > 0 && !model.isDisposed()) {
        await this.notifyOpen(model, state.uri)
      }
    }
  }

  hasDocuments(): boolean {
    return this.documents.size > 0
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    for (const [model, state] of this.documents) {
      this.close(model, state)
    }
    this.documents.clear()
  }

  private async open(
    model: monaco.editor.ITextModel,
    filePath: string,
    state: DocumentState
  ): Promise<void> {
    const uri = await this.options.resolveUri(filePath)
    if (this.disposed || state.refs === 0) {
      this.documents.delete(model)
      return
    }
    state.uri = uri
    await this.notifyOpen(model, uri)
    state.subscriptions.push(
      model.onDidChangeContent((event) => this.sendChange(model, state, event)),
      model.onWillDispose(() => {
        state.refs = 0
        this.release(model)
      })
    )
  }

  private notifyOpen(model: monaco.editor.ITextModel, uri: string): Promise<void> {
    return this.options.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: model.getLanguageId(),
        version: model.getVersionId(),
        text: model.getValue()
      }
    })
  }

  private sendChange(
    model: monaco.editor.ITextModel,
    state: DocumentState,
    event: monaco.editor.IModelContentChangedEvent
  ): void {
    if (!state.uri) {
      return
    }
    const syncKind = getSyncKind(this.options.getCapabilities())
    if (syncKind === 0) {
      return
    }
    const contentChanges =
      syncKind === 1
        ? [{ text: model.getValue() }]
        : event.changes.map((change) => ({
            range: {
              start: toLspPosition(change.range.startLineNumber, change.range.startColumn),
              end: toLspPosition(change.range.endLineNumber, change.range.endColumn)
            },
            rangeLength: change.rangeLength,
            text: change.text
          }))
    void this.options
      .notify('textDocument/didChange', {
        textDocument: { uri: state.uri, version: model.getVersionId() },
        contentChanges
      })
      .catch(() => {})
  }

  private release(model: monaco.editor.ITextModel): void {
    const state = this.documents.get(model)
    if (!state) {
      return
    }
    state.refs = Math.max(0, state.refs - 1)
    if (state.refs > 0) {
      return
    }
    this.close(model, state)
    this.documents.delete(model)
  }

  private close(_model: monaco.editor.ITextModel, state: DocumentState): void {
    for (const subscription of state.subscriptions.splice(0)) {
      subscription.dispose()
    }
    if (state.uri) {
      void this.options
        .notify('textDocument/didClose', {
          textDocument: { uri: state.uri }
        })
        .catch(() => {})
    }
  }
}

function getSyncKind(capabilities: LspServerCapabilities): number {
  const sync = capabilities.textDocumentSync
  return typeof sync === 'number' ? sync : (sync?.change ?? 0)
}

function toLspPosition(lineNumber: number, column: number): LspPosition {
  return { line: lineNumber - 1, character: column - 1 }
}
