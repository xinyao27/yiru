import HighlightJs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cmake from 'highlight.js/lib/languages/cmake'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import less from 'highlight.js/lib/languages/less'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

import { detectMobileFileLanguage } from './file-language'
import { MobileSyntaxEmitter, type MobileSyntaxNode } from './file-syntax-emitter'

export type MobileSyntaxTokenKind =
  | 'plain'
  | 'comment'
  | 'keyword'
  | 'string'
  | 'number'
  | 'type'
  | 'function'
  | 'variable'
  | 'meta'

export type MobileSyntaxSegment = {
  text: string
  kind: MobileSyntaxTokenKind
}

export type MobileHighlightedDiffLine<TLine> = TLine & {
  segments: MobileSyntaxSegment[]
  highlighted: boolean
}

const highlighter = HighlightJs.newInstance()
highlighter.configure({ __emitter: MobileSyntaxEmitter, classPrefix: 'hljs-' })
highlighter.registerLanguage('bash', bash)
highlighter.registerLanguage('c', c)
highlighter.registerLanguage('cmake', cmake)
highlighter.registerLanguage('cpp', cpp)
highlighter.registerLanguage('csharp', csharp)
highlighter.registerLanguage('css', css)
highlighter.registerLanguage('dockerfile', dockerfile)
highlighter.registerLanguage('go', go)
highlighter.registerLanguage('graphql', graphql)
highlighter.registerLanguage('ini', ini)
highlighter.registerLanguage('java', java)
highlighter.registerLanguage('javascript', javascript)
highlighter.registerLanguage('json', json)
highlighter.registerLanguage('kotlin', kotlin)
highlighter.registerLanguage('less', less)
highlighter.registerLanguage('lua', lua)
highlighter.registerLanguage('makefile', makefile)
highlighter.registerLanguage('markdown', markdown)
highlighter.registerLanguage('php', php)
highlighter.registerLanguage('plaintext', plaintext)
highlighter.registerLanguage('powershell', powershell)
highlighter.registerLanguage('python', python)
highlighter.registerLanguage('r', r)
highlighter.registerLanguage('ruby', ruby)
highlighter.registerLanguage('rust', rust)
highlighter.registerLanguage('scss', scss)
highlighter.registerLanguage('sql', sql)
highlighter.registerLanguage('swift', swift)
highlighter.registerLanguage('typescript', typescript)
highlighter.registerLanguage('xml', xml)
highlighter.registerLanguage('yaml', yaml)
const MAX_FILE_HIGHLIGHT_CHARS = 48_000
const MAX_FILE_HIGHLIGHT_SEGMENTS = 3_000
const MAX_DIFF_HIGHLIGHT_CHARS = 24_000
const MAX_DIFF_HIGHLIGHT_LINES = 500
const MAX_DIFF_HIGHLIGHT_SEGMENTS = 4_000
const MAX_DIFF_LINE_HIGHLIGHT_SEGMENTS = 96

const LANGUAGE_ALIASES: Record<string, string> = {
  javascriptreact: 'javascript',
  jsx: 'javascript',
  typescriptreact: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  fish: 'bash',
  yml: 'yaml'
}

export function resolveMobileSyntaxLanguage(filePath: string, preferredLanguage?: string): string {
  const detected = detectMobileFileLanguage(filePath, preferredLanguage)
  const normalized = LANGUAGE_ALIASES[detected] ?? detected
  return highlighter.getLanguage(normalized) ? normalized : 'plaintext'
}

export function highlightMobileCode(
  code: string,
  language: string,
  maxHighlightChars = MAX_FILE_HIGHLIGHT_CHARS,
  maxHighlightSegments = MAX_FILE_HIGHLIGHT_SEGMENTS
): { segments: MobileSyntaxSegment[]; highlighted: boolean } {
  if (code.length === 0) {
    return { segments: [{ text: '', kind: 'plain' }], highlighted: false }
  }

  const normalizedLanguage = LANGUAGE_ALIASES[language] ?? language
  if (!highlighter.getLanguage(normalizedLanguage) || normalizedLanguage === 'plaintext') {
    return { segments: [{ text: code, kind: 'plain' }], highlighted: false }
  }

  const highlightLength = getHighlightBoundary(code, maxHighlightChars)
  const highlightedCode = code.slice(0, highlightLength)
  try {
    const result = highlighter.highlight(highlightedCode, {
      language: normalizedLanguage,
      ignoreIllegals: true
    })
    if (!(result._emitter instanceof MobileSyntaxEmitter)) {
      return { segments: [{ text: code, kind: 'plain' }], highlighted: false }
    }
    const segments = mergeAdjacentSegments(
      flattenSyntaxNodes(result._emitter.root.children, 'plain')
    )
    if (segments.length > maxHighlightSegments) {
      return { segments: [{ text: code, kind: 'plain' }], highlighted: false }
    }
    if (highlightLength < code.length) {
      appendSegment(segments, { text: code.slice(highlightLength), kind: 'plain' })
    }
    return { segments, highlighted: true }
  } catch {
    return { segments: [{ text: code, kind: 'plain' }], highlighted: false }
  }
}

export function highlightMobileDiffLines<TLine extends { text: string }>(
  lines: TLine[],
  language: string
): MobileHighlightedDiffLine<TLine>[] {
  let attemptedChars = 0
  let attemptedLines = 0
  let highlightedSegments = 0
  let exhaustedHighlightBudget = false

  return lines.map((line) => {
    const canHighlight =
      !exhaustedHighlightBudget &&
      attemptedLines < MAX_DIFF_HIGHLIGHT_LINES &&
      attemptedChars + line.text.length <= MAX_DIFF_HIGHLIGHT_CHARS &&
      highlightedSegments < MAX_DIFF_HIGHLIGHT_SEGMENTS
    if (!canHighlight) {
      return plainHighlightedLine(line)
    }

    attemptedLines += 1
    attemptedChars += line.text.length
    if (line.text.trim().length === 0) {
      return plainHighlightedLine(line)
    }
    const result = highlightMobileCode(
      line.text,
      language,
      Math.min(MAX_FILE_HIGHLIGHT_CHARS, 8_000),
      MAX_DIFF_LINE_HIGHLIGHT_SEGMENTS
    )
    if (
      !result.highlighted ||
      highlightedSegments + result.segments.length > MAX_DIFF_HIGHLIGHT_SEGMENTS
    ) {
      exhaustedHighlightBudget = true
      return plainHighlightedLine(line)
    }

    highlightedSegments += result.segments.length
    return { ...line, ...result }
  })
}

export function buildPlainMobileDiffSyntaxLines<TLine extends { text: string }>(
  lines: TLine[]
): MobileHighlightedDiffLine<TLine>[] {
  return lines.map((line) => plainHighlightedLine(line))
}

function getHighlightBoundary(code: string, maxHighlightChars: number): number {
  if (code.length <= maxHighlightChars) {
    return code.length
  }
  const boundary = code.lastIndexOf('\n', maxHighlightChars)
  return boundary > 0 ? boundary + 1 : maxHighlightChars
}

function flattenSyntaxNodes(
  nodes: MobileSyntaxNode[],
  inheritedKind: MobileSyntaxTokenKind
): MobileSyntaxSegment[] {
  const segments: MobileSyntaxSegment[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      appendSegment(segments, { text: node.value ?? '', kind: inheritedKind })
      continue
    }
    if (node.type !== 'element') {
      continue
    }
    const kind = tokenKindForClasses(node.properties?.className) ?? inheritedKind
    for (const segment of flattenSyntaxNodes(node.children ?? [], kind)) {
      appendSegment(segments, segment)
    }
  }
  return segments
}

function tokenKindForClasses(className: unknown): MobileSyntaxTokenKind | null {
  const classes = Array.isArray(className)
    ? className.filter((value): value is string => typeof value === 'string')
    : typeof className === 'string'
      ? className.split(/\s+/)
      : []

  const tokens = new Set(classes.map((value) => value.replace(/^hljs-/, '')))
  if (hasAny(tokens, ['comment', 'quote'])) {
    return 'comment'
  }
  if (hasAny(tokens, ['keyword', 'selector-tag', 'tag', 'name'])) {
    return 'keyword'
  }
  if (hasAny(tokens, ['string', 'regexp', 'symbol', 'bullet'])) {
    return 'string'
  }
  if (hasAny(tokens, ['number', 'literal'])) {
    return 'number'
  }
  if (hasAny(tokens, ['type', 'built_in', 'class', 'title.class'])) {
    return 'type'
  }
  if (hasAny(tokens, ['title.function', 'function', 'title'])) {
    return 'function'
  }
  if (hasAny(tokens, ['attr', 'attribute', 'property', 'variable', 'params'])) {
    return 'variable'
  }
  if (hasAny(tokens, ['meta', 'doctag', 'subst', 'section'])) {
    return 'meta'
  }
  return null
}

function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => values.has(candidate))
}

function mergeAdjacentSegments(segments: MobileSyntaxSegment[]): MobileSyntaxSegment[] {
  const merged: MobileSyntaxSegment[] = []
  for (const segment of segments) {
    appendSegment(merged, segment)
  }
  return merged
}

function appendSegment(segments: MobileSyntaxSegment[], segment: MobileSyntaxSegment): void {
  if (!segment.text) {
    return
  }
  const previous = segments.at(-1)
  if (previous?.kind === segment.kind) {
    previous.text += segment.text
    return
  }
  segments.push({ ...segment })
}

function plainHighlightedLine<TLine extends { text: string }>(
  line: TLine
): MobileHighlightedDiffLine<TLine> {
  return {
    ...line,
    segments: [{ text: line.text, kind: 'plain' }],
    highlighted: false
  }
}
