import * as monaco from 'monaco-editor'

import type {
  LspCompletionItem,
  LspCompletionResult,
  LspInsertReplaceEdit,
  LspSignatureHelp,
  LspTextEdit
} from './language-server-protocol'
import { toMonacoDocumentation, toMonacoRange } from './monaco-language-server-conversions'

const MAX_COMPLETION_ITEMS = 10_000

const COMPLETION_KINDS: Record<number, monaco.languages.CompletionItemKind> = {
  1: monaco.languages.CompletionItemKind.Text,
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  4: monaco.languages.CompletionItemKind.Constructor,
  5: monaco.languages.CompletionItemKind.Field,
  6: monaco.languages.CompletionItemKind.Variable,
  7: monaco.languages.CompletionItemKind.Class,
  8: monaco.languages.CompletionItemKind.Interface,
  9: monaco.languages.CompletionItemKind.Module,
  10: monaco.languages.CompletionItemKind.Property,
  11: monaco.languages.CompletionItemKind.Unit,
  12: monaco.languages.CompletionItemKind.Value,
  13: monaco.languages.CompletionItemKind.Enum,
  14: monaco.languages.CompletionItemKind.Keyword,
  15: monaco.languages.CompletionItemKind.Snippet,
  16: monaco.languages.CompletionItemKind.Color,
  17: monaco.languages.CompletionItemKind.File,
  18: monaco.languages.CompletionItemKind.Reference,
  19: monaco.languages.CompletionItemKind.Folder,
  20: monaco.languages.CompletionItemKind.EnumMember,
  21: monaco.languages.CompletionItemKind.Constant,
  22: monaco.languages.CompletionItemKind.Struct,
  23: monaco.languages.CompletionItemKind.Event,
  24: monaco.languages.CompletionItemKind.Operator,
  25: monaco.languages.CompletionItemKind.TypeParameter
}

export function toMonacoCompletionList(
  result: LspCompletionResult,
  model: monaco.editor.ITextModel,
  position: monaco.Position
): monaco.languages.CompletionList {
  const list = Array.isArray(result) ? { isIncomplete: false, items: result } : result
  if (!list || !Array.isArray(list.items)) {
    return { suggestions: [] }
  }
  const word = model.getWordUntilPosition(position)
  const defaultRange = new monaco.Range(
    position.lineNumber,
    word.startColumn,
    position.lineNumber,
    position.column
  )
  return {
    incomplete: list.isIncomplete === true,
    suggestions: list.items.slice(0, MAX_COMPLETION_ITEMS).flatMap((item) => {
      const converted = toCompletionItem(item, model, position, defaultRange)
      return converted ? [converted] : []
    })
  }
}

export function toMonacoSignatureHelp(
  help: LspSignatureHelp | null
): monaco.languages.SignatureHelp | null {
  if (!help || !Array.isArray(help.signatures) || help.signatures.length === 0) {
    return null
  }
  const signatures = help.signatures
    .filter((signature) => typeof signature.label === 'string')
    .map((signature) => ({
      label: signature.label,
      documentation: toMonacoDocumentation(signature.documentation),
      parameters: Array.isArray(signature.parameters)
        ? signature.parameters.map((parameter) => ({
            label: normalizeParameterLabel(parameter.label, signature.label.length),
            documentation: toMonacoDocumentation(parameter.documentation)
          }))
        : [],
      ...(Number.isInteger(signature.activeParameter)
        ? { activeParameter: Math.max(0, signature.activeParameter ?? 0) }
        : {})
    }))
  if (signatures.length === 0) {
    return null
  }
  const activeSignature = clampIndex(help.activeSignature, signatures.length)
  return {
    signatures,
    activeSignature,
    activeParameter: clampIndex(
      help.activeParameter,
      signatures[activeSignature]?.parameters.length ?? 0
    )
  }
}

function toCompletionItem(
  item: LspCompletionItem,
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  defaultRange: monaco.Range
): monaco.languages.CompletionItem | null {
  if (!item || typeof item.label !== 'string') {
    return null
  }
  // Why: Stage 2 accepts only the completion's primary edit; additional edits,
  // commands, and lazy resolve stay behind the controlled-edits stage.
  const edit = item.textEdit
  const insertText = edit?.newText ?? item.insertText ?? item.label
  const range = edit ? completionRange(edit, model, position, defaultRange) : defaultRange
  return {
    label: item.labelDetails
      ? {
          label: item.label,
          detail: item.labelDetails.detail,
          description: item.labelDetails.description
        }
      : item.label,
    kind: COMPLETION_KINDS[item.kind ?? 1] ?? monaco.languages.CompletionItemKind.Text,
    ...(item.deprecated === true || item.tags?.includes(1)
      ? { tags: [monaco.languages.CompletionItemTag.Deprecated] }
      : {}),
    detail: item.detail,
    documentation: toMonacoDocumentation(item.documentation),
    sortText: item.sortText,
    filterText: item.filterText,
    preselect: item.preselect,
    insertText,
    ...(item.insertTextFormat === 2
      ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }
      : {}),
    range,
    commitCharacters: item.commitCharacters?.filter((character) => character.length === 1)
  }
}

function completionRange(
  edit: LspTextEdit | LspInsertReplaceEdit,
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  fallback: monaco.Range
): monaco.IRange | monaco.languages.CompletionItemRanges {
  if ('insert' in edit) {
    const insert = model.validateRange(toMonacoRange(edit.insert))
    const replace = model.validateRange(toMonacoRange(edit.replace))
    return insert.containsPosition(position) && replace.containsPosition(position)
      ? { insert, replace }
      : fallback
  }
  const range = model.validateRange(toMonacoRange(edit.range))
  return range.containsPosition(position) ? range : fallback
}

function normalizeParameterLabel(
  label: string | [number, number],
  signatureLength: number
): string | [number, number] {
  if (Array.isArray(label)) {
    const start = Math.min(Math.max(0, label[0] ?? 0), signatureLength)
    const end = Math.min(Math.max(start, label[1] ?? start), signatureLength)
    return [start, end]
  }
  return typeof label === 'string' ? label : ''
}

function clampIndex(value: number | undefined, length: number): number {
  if (!Number.isInteger(value) || length <= 0) {
    return 0
  }
  return Math.min(Math.max(0, value ?? 0), length - 1)
}
