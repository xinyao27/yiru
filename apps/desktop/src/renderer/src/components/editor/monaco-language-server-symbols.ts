import * as monaco from 'monaco-editor'

import type { LspDocumentSymbol, LspSymbolInformation } from './language-server-protocol'
import { toMonacoRange } from './monaco-language-server-conversions'

const MAX_SYMBOL_DEPTH = 32
const MAX_SYMBOLS = 10_000

type SymbolBudget = { remaining: number }

export function toMonacoDocumentSymbols(
  symbols: LspDocumentSymbol[] | LspSymbolInformation[] | null,
  model: monaco.editor.ITextModel,
  documentUri: string
): monaco.languages.DocumentSymbol[] {
  if (!Array.isArray(symbols)) {
    return []
  }
  const budget: SymbolBudget = { remaining: MAX_SYMBOLS }
  return symbols.flatMap((symbol) => {
    try {
      const converted = isSymbolInformation(symbol)
        ? convertSymbolInformation(symbol, model, documentUri, budget)
        : convertDocumentSymbol(symbol, model, budget, 0)
      return converted ? [converted] : []
    } catch {
      return []
    }
  })
}

function convertDocumentSymbol(
  symbol: LspDocumentSymbol,
  model: monaco.editor.ITextModel,
  budget: SymbolBudget,
  depth: number
): monaco.languages.DocumentSymbol | null {
  if (budget.remaining-- <= 0 || depth > MAX_SYMBOL_DEPTH || typeof symbol?.name !== 'string') {
    return null
  }
  const range = model.validateRange(toMonacoRange(symbol.range))
  const selectionRange = model.validateRange(toMonacoRange(symbol.selectionRange))
  const children = Array.isArray(symbol.children)
    ? symbol.children.flatMap((child) => {
        const converted = convertDocumentSymbol(child, model, budget, depth + 1)
        return converted ? [converted] : []
      })
    : undefined
  return {
    name: symbol.name,
    detail: symbol.detail ?? '',
    kind: toSymbolKind(symbol.kind),
    tags: toSymbolTags(symbol.tags, symbol.deprecated),
    range,
    selectionRange,
    ...(children && children.length > 0 ? { children } : {})
  }
}

function convertSymbolInformation(
  symbol: LspSymbolInformation,
  model: monaco.editor.ITextModel,
  documentUri: string,
  budget: SymbolBudget
): monaco.languages.DocumentSymbol | null {
  if (
    budget.remaining-- <= 0 ||
    typeof symbol?.name !== 'string' ||
    symbol.location?.uri !== documentUri
  ) {
    return null
  }
  const range = model.validateRange(toMonacoRange(symbol.location.range))
  return {
    name: symbol.name,
    detail: '',
    kind: toSymbolKind(symbol.kind),
    tags: toSymbolTags(symbol.tags, symbol.deprecated),
    containerName: symbol.containerName,
    range,
    selectionRange: range
  }
}

function isSymbolInformation(
  symbol: LspDocumentSymbol | LspSymbolInformation
): symbol is LspSymbolInformation {
  return Boolean(symbol && typeof symbol === 'object' && 'location' in symbol)
}

function toSymbolKind(kind: number): monaco.languages.SymbolKind {
  if (Number.isInteger(kind) && kind >= 1 && kind <= 26) {
    return kind - 1
  }
  return monaco.languages.SymbolKind.Variable
}

function toSymbolTags(tags: number[] | undefined, deprecated: boolean | undefined) {
  return deprecated === true || tags?.includes(1) ? [monaco.languages.SymbolTag.Deprecated] : []
}
