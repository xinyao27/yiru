import React from 'react'

import { formatMarkdownReviewCardQuote } from '../markdown-review-notes'

export type MarkdownPreviewPositionNode = {
  tagName?: string
  position?: {
    start?: { line?: number }
    end?: { line?: number }
  }
  children?: MarkdownPreviewPositionNode[]
}

export function isMarkdownAnnotationNavigationClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return !target.closest(
    'a,button,input,textarea,select,summary,[contenteditable="true"],.markdown-annotation-controls'
  )
}

export function getMarkdownPreviewBlockRange(
  node: MarkdownPreviewPositionNode | undefined
): { startLine: number; endLine: number } | null {
  const startLine = node?.position?.start?.line
  const endLine = node?.position?.end?.line
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return null
  }
  if (typeof startLine !== 'number' || typeof endLine !== 'number' || startLine < 1) {
    return null
  }
  return { startLine, endLine: Math.max(startLine, endLine) }
}

export function getMarkdownPreviewAnnotationQuote(node: React.ReactNode): string | undefined {
  return formatMarkdownReviewCardQuote(getMarkdownPreviewReactText(node))
}

export function hasMarkdownPreviewNestedBlock(
  node: MarkdownPreviewPositionNode | undefined
): boolean {
  const blockTags = new Set(['p', 'pre', 'table', 'blockquote', 'ul', 'ol'])
  return Boolean(node?.children?.some((child) => child.tagName && blockTags.has(child.tagName)))
}

function getMarkdownPreviewReactText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (!node || typeof node === 'boolean') {
    return ''
  }
  if (Array.isArray(node)) {
    return node.map(getMarkdownPreviewReactText).join(' ')
  }
  if (!React.isValidElement(node)) {
    return ''
  }
  const props = node.props as { alt?: unknown; children?: React.ReactNode }
  if (typeof props.alt === 'string' && props.alt.trim()) {
    return props.alt
  }
  return getMarkdownPreviewReactText(props.children)
}
