import * as monaco from 'monaco-editor'
import type {
  LspCodeAction,
  LspCommand,
  LspDiagnostic,
  LspRange,
  LspTextEdit,
  LspWorkspaceEdit
} from './language-server-protocol'
import type { MonacoLanguageServerSession } from './monaco-language-server-session'
import { toMonacoRange } from './monaco-language-server-conversions'

const MAX_FORMATTING_EDITS = 1_000

export function workspaceEditFromAllowlistedCommand(
  action: LspCodeAction | LspCommand
): LspWorkspaceEdit | null {
  const command = isLspCommand(action) ? action : action.command
  if (command?.command !== 'clangd.applyFix' || command.arguments?.length !== 1) {
    return null
  }
  const edit = command.arguments[0]
  if (!isWorkspaceEdit(edit)) {
    return null
  }
  // Why: clangd wraps fix edits in a command, but executing the command would
  // bypass Yiru's policy. Extract only its edit argument into the safe pipeline.
  return edit
}

export function isLspCommand(action: LspCodeAction | LspCommand): action is LspCommand {
  return typeof action.command === 'string'
}

export function validateFormattingEdits(
  model: monaco.editor.ITextModel,
  edits: LspTextEdit[] | null
): monaco.languages.TextEdit[] | null {
  if (!edits) {
    return null
  }
  if (edits.length > MAX_FORMATTING_EDITS) {
    throw new Error('The language server returned too many formatting edits.')
  }
  return edits.map((edit) => {
    const range = toMonacoRange(edit.range)
    if (!monaco.Range.equalsRange(range, model.validateRange(range))) {
      throw new Error('The language server returned an invalid formatting range.')
    }
    return { range, text: edit.newText }
  })
}

export function wordRenameLocation(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): monaco.languages.RenameLocation | null {
  const word = model.getWordAtPosition(position)
  if (!word) {
    return null
  }
  return {
    range: new monaco.Range(
      position.lineNumber,
      word.startColumn,
      position.lineNumber,
      word.endColumn
    ),
    text: word.word
  }
}

export function toLspRange(range: monaco.IRange): LspRange {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
  }
}

export function getCodeActionDiagnostics(
  session: MonacoLanguageServerSession,
  uri: string,
  modelVersion: number,
  range: LspRange,
  markers: monaco.editor.IMarkerData[]
): LspDiagnostic[] {
  // Why: servers may attach opaque diagnostic data required to construct
  // fixes; Monaco markers cannot preserve that protocol payload.
  const published = session
    .getPublishedDiagnostics(uri, modelVersion)
    .filter((diagnostic) => lspRangesOverlap(diagnostic.range, range))
  return published.length > 0
    ? published.slice(0, 100)
    : markers.slice(0, 100).map(markerToDiagnostic)
}

function isWorkspaceEdit(value: unknown): value is LspWorkspaceEdit {
  return (
    value !== null &&
    typeof value === 'object' &&
    ('changes' in value || 'documentChanges' in value)
  )
}

function lspRangesOverlap(left: LspRange, right: LspRange): boolean {
  return (
    compareLspPositions(left.start, right.end) <= 0 &&
    compareLspPositions(right.start, left.end) <= 0
  )
}

function compareLspPositions(
  left: { line: number; character: number },
  right: { line: number; character: number }
): number {
  return left.line === right.line ? left.character - right.character : left.line - right.line
}

function markerToDiagnostic(marker: monaco.editor.IMarkerData): LspDiagnostic {
  const severity =
    marker.severity === monaco.MarkerSeverity.Error
      ? 1
      : marker.severity === monaco.MarkerSeverity.Warning
        ? 2
        : marker.severity === monaco.MarkerSeverity.Info
          ? 3
          : 4
  return {
    range: toLspRange(marker),
    severity,
    message: marker.message,
    source: marker.source,
    code: typeof marker.code === 'object' ? marker.code.value : marker.code
  }
}
