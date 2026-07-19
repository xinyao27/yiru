import type { IPosition, IRange, editor } from 'monaco-editor'

export type ImportModuleSpecifier = {
  value: string
  range: IRange
}

const QUOTED_VALUE_PATTERN = /(['"])((?:\\.|(?!\1).)*)\1/g

export function getImportModuleSpecifierAtPosition(
  model: editor.ITextModel,
  position: IPosition
): ImportModuleSpecifier | null {
  const line = model.getLineContent(position.lineNumber)
  QUOTED_VALUE_PATTERN.lastIndex = 0
  for (const match of line.matchAll(QUOTED_VALUE_PATTERN)) {
    const quoteIndex = match.index ?? -1
    const value = match[2]
    const valueStartIndex = quoteIndex + 1
    const valueEndIndex = valueStartIndex + value.length
    const positionIndex = position.column - 1
    if (positionIndex < valueStartIndex || positionIndex > valueEndIndex) {
      continue
    }
    if (!isModuleSpecifierPrefix(line.slice(0, quoteIndex))) {
      continue
    }
    return {
      value: unescapeModuleSpecifier(value),
      range: {
        startLineNumber: position.lineNumber,
        startColumn: valueStartIndex + 1,
        endLineNumber: position.lineNumber,
        endColumn: valueEndIndex + 1
      }
    }
  }
  return null
}

export function isRelativeModuleSpecifier(value: string): boolean {
  return value === '.' || value === '..' || value.startsWith('./') || value.startsWith('../')
}

function isModuleSpecifierPrefix(prefix: string): boolean {
  return (
    /\bfrom\s*$/.test(prefix) ||
    /\b(?:import|require)\s*\(\s*$/.test(prefix) ||
    /^\s*@?import\s*$/.test(prefix)
  )
}

function unescapeModuleSpecifier(value: string): string {
  return value.replace(/\\(['"\\])/g, '$1')
}
