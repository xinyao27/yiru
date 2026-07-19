import * as monaco from 'monaco-editor'

import type { LspDiagnostic, LspPublishDiagnosticsParams } from './language-server-protocol'
import type { MonacoLanguageServerSession } from './monaco-language-server-session'

const MAX_DIAGNOSTICS = 10_000

export class MonacoLanguageServerDiagnostics {
  private readonly owners = new WeakMap<MonacoLanguageServerSession, string>()
  private readonly markedModels = new Map<
    MonacoLanguageServerSession,
    Set<monaco.editor.ITextModel>
  >()
  private nextOwnerId = 1

  publish(session: MonacoLanguageServerSession, params: LspPublishDiagnosticsParams): void {
    if (!params || typeof params.uri !== 'string' || !Array.isArray(params.diagnostics)) {
      return
    }
    const model = session.getDocumentModel(params.uri)
    if (!model || model.isDisposed()) {
      return
    }
    if (Number.isInteger(params.version) && params.version !== model.getVersionId()) {
      return
    }
    const markers = params.diagnostics.slice(0, MAX_DIAGNOSTICS).flatMap((diagnostic) => {
      try {
        return [toMarker(model, diagnostic)]
      } catch {
        return []
      }
    })
    monaco.editor.setModelMarkers(model, this.ownerFor(session), markers)
    if (markers.length === 0) {
      this.markedModels.get(session)?.delete(model)
      return
    }
    const models = this.markedModels.get(session) ?? new Set()
    models.add(model)
    this.markedModels.set(session, models)
  }

  clearModel(session: MonacoLanguageServerSession, model: monaco.editor.ITextModel): void {
    if (!model.isDisposed()) {
      monaco.editor.setModelMarkers(model, this.ownerFor(session), [])
    }
    this.markedModels.get(session)?.delete(model)
  }

  clearSession(session: MonacoLanguageServerSession): void {
    const owner = this.ownerFor(session)
    for (const model of this.markedModels.get(session) ?? []) {
      if (!model.isDisposed()) {
        monaco.editor.setModelMarkers(model, owner, [])
      }
    }
    this.markedModels.delete(session)
  }

  private ownerFor(session: MonacoLanguageServerSession): string {
    const existing = this.owners.get(session)
    if (existing) {
      return existing
    }
    const owner = `yiru-language-server-${this.nextOwnerId++}`
    this.owners.set(session, owner)
    return owner
  }
}

function toMarker(
  model: monaco.editor.ITextModel,
  diagnostic: LspDiagnostic
): monaco.editor.IMarkerData {
  const range = model.validateRange(
    new monaco.Range(
      diagnostic.range.start.line + 1,
      diagnostic.range.start.character + 1,
      diagnostic.range.end.line + 1,
      diagnostic.range.end.character + 1
    )
  )
  return {
    severity: toMarkerSeverity(diagnostic.severity),
    message: typeof diagnostic.message === 'string' ? diagnostic.message : '',
    source: diagnostic.source,
    code: toMarkerCode(diagnostic),
    tags: toMarkerTags(diagnostic.tags),
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn
  }
}

function toMarkerSeverity(severity: number | undefined): monaco.MarkerSeverity {
  if (severity === 1) {
    return monaco.MarkerSeverity.Error
  }
  if (severity === 2) {
    return monaco.MarkerSeverity.Warning
  }
  if (severity === 3) {
    return monaco.MarkerSeverity.Info
  }
  return severity === 4 ? monaco.MarkerSeverity.Hint : monaco.MarkerSeverity.Error
}

function toMarkerCode(
  diagnostic: LspDiagnostic
): string | { value: string; target: monaco.Uri } | undefined {
  if (diagnostic.code === undefined) {
    return undefined
  }
  const value = String(diagnostic.code)
  const href = diagnostic.codeDescription?.href
  if (!href) {
    return value
  }
  try {
    const target = monaco.Uri.parse(href)
    return target.scheme === 'http' || target.scheme === 'https' ? { value, target } : value
  } catch {
    return value
  }
}

function toMarkerTags(tags: number[] | undefined): monaco.MarkerTag[] | undefined {
  const converted = tags?.flatMap((tag) => {
    if (tag === 1) {
      return [monaco.MarkerTag.Unnecessary]
    }
    if (tag === 2) {
      return [monaco.MarkerTag.Deprecated]
    }
    return []
  })
  return converted && converted.length > 0 ? converted : undefined
}
