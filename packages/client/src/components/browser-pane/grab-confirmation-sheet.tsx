import type { BrowserGrabPayload } from '~shared/browser/grab-types'

// ---------------------------------------------------------------------------
// Grab payload → human-readable prompt context
// ---------------------------------------------------------------------------

export function formatGrabPayloadAsText(payload: BrowserGrabPayload): string {
  const lines: string[] = []

  lines.push(`Attached browser context from ${payload.page.sanitizedUrl}`)
  lines.push('')

  // Selected element summary
  lines.push('Selected element:')
  lines.push(payload.target.tagName)
  if (payload.target.accessibility.accessibleName) {
    lines.push(`Accessible name: "${payload.target.accessibility.accessibleName}"`)
  }
  if (payload.target.accessibility.role) {
    lines.push(`Role: ${payload.target.accessibility.role}`)
  }
  lines.push(`Selector: ${payload.target.selector}`)
  if (payload.target.sourceFile) {
    lines.push(`Source: ${payload.target.sourceFile}`)
  }
  if (payload.target.reactComponents) {
    lines.push(`React: ${payload.target.reactComponents}`)
  }
  const { rectViewport } = payload.target
  lines.push(`Dimensions: ${Math.round(rectViewport.width)}x${Math.round(rectViewport.height)}`)
  lines.push('')

  // Text snippet
  if (payload.target.textSnippet) {
    lines.push('Text content:')
    lines.push(payload.target.textSnippet)
    lines.push('')
  }

  // Nearby context
  if (payload.nearbyText.length > 0) {
    lines.push('Nearby context:')
    for (const text of payload.nearbyText) {
      lines.push(`- ${text}`)
    }
    lines.push('')
  }

  // Computed styles
  const styles = payload.target.computedStyles
  const styleLines: string[] = []
  if (styles.display && styles.display !== 'inline') {
    styleLines.push(`display: ${styles.display}`)
  }
  if (styles.position && styles.position !== 'static') {
    styleLines.push(`position: ${styles.position}`)
  }
  if (styles.fontSize) {
    styleLines.push(`font-size: ${styles.fontSize}`)
  }
  if (styles.color) {
    styleLines.push(`color: ${styles.color}`)
  }
  if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
    styleLines.push(`background: ${styles.backgroundColor}`)
  }
  if (styleLines.length > 0) {
    lines.push('Computed styles:')
    for (const sl of styleLines) {
      lines.push(`  ${sl}`)
    }
    lines.push('')
  }

  // HTML snippet
  if (payload.target.htmlSnippet) {
    lines.push('HTML:')
    lines.push(payload.target.htmlSnippet)
    lines.push('')
  }

  // Ancestor path
  if (payload.ancestorPath.length > 0) {
    lines.push(`Ancestor path: ${payload.ancestorPath.join(' > ')}`)
  }
  if (payload.target.fullPath) {
    lines.push(`Full DOM path: ${payload.target.fullPath}`)
  }

  return lines.join('\n').trimEnd()
}
