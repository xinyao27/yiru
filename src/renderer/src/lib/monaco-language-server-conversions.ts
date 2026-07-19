import * as monaco from 'monaco-editor'
import type {
  LspDefinition,
  LspHover,
  LspLocation,
  LspLocationLink,
  LspMarkedString,
  LspMarkupContent,
  LspDocumentation,
  LspPosition,
  LspRange
} from './language-server-protocol'

export function toLspPosition(position: monaco.Position): LspPosition {
  return { line: position.lineNumber - 1, character: position.column - 1 }
}

export function toMonacoRange(range: LspRange): monaco.Range {
  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1
  )
}

export function toMonacoHover(hover: LspHover | null): monaco.languages.Hover | null {
  if (!hover) {
    return null
  }
  const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents]
  return {
    contents: contents.map(toMarkdownString),
    range: hover.range ? toMonacoRange(hover.range) : undefined
  }
}

export function normalizeDefinitions(
  definition: LspDefinition | LspDefinition[] | null
): { uri: string; range: LspRange }[] {
  if (!definition) {
    return []
  }
  const definitions = Array.isArray(definition) ? definition : [definition]
  return definitions.map((entry) =>
    isLocationLink(entry)
      ? { uri: entry.targetUri, range: entry.targetSelectionRange ?? entry.targetRange }
      : { uri: entry.uri, range: entry.range }
  )
}

export function toMonacoDocumentation(
  content: LspDocumentation | undefined
): string | monaco.IMarkdownString | undefined {
  if (content === undefined || typeof content === 'string') {
    return content
  }
  return content.kind === 'markdown' ? { value: content.value } : content.value
}

function toMarkdownString(content: LspMarkedString | LspMarkupContent): monaco.IMarkdownString {
  if (typeof content === 'string') {
    return { value: content }
  }
  if ('kind' in content) {
    return {
      value: content.kind === 'markdown' ? content.value : escapeMarkdown(content.value)
    }
  }
  return { value: `\`\`\`${content.language}\n${content.value}\n\`\`\`` }
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()<>#+\-.!|~])/g, '\\$1')
}

function isLocationLink(location: LspLocation | LspLocationLink): location is LspLocationLink {
  return 'targetUri' in location
}
