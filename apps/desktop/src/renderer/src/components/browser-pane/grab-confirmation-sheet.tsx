import { Copy, Image } from '@phosphor-icons/react'

import { ChatCentered as MessageSquarePlus, X } from '@/components/regular-icons'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { translate } from '@/i18n/i18n'

import type { BrowserGrabPayload } from '../../../../shared/browser-grab-types'

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

// ---------------------------------------------------------------------------
// Security: all page-derived strings are rendered as escaped plain text.
// No innerHTML, no markdown rendering, no auto-linking.
// ---------------------------------------------------------------------------

function EscapedText({ text, className }: { text: string; className?: string }): React.JSX.Element {
  return <span className={className}>{text}</span>
}

// ---------------------------------------------------------------------------
// Confirmation Sheet Component
// ---------------------------------------------------------------------------

export default function GrabConfirmationSheet({
  payload,
  onCopy,
  onCopyScreenshot,
  onAttach,
  onCancel
}: {
  payload: BrowserGrabPayload
  onCopy: () => void
  onCopyScreenshot: (() => void) | null
  onAttach: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { target, page, nearbyText } = payload

  return (
    <div className="bg-background absolute inset-0 z-20 flex flex-col">
      {/* Header */}
      <div className="border-border/70 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400">
            {translate('auto.components.browser.pane.GrabConfirmationSheet.f3575229df', 'Grab')}
          </div>
          <span className="text-muted-foreground text-sm">
            {translate(
              'auto.components.browser.pane.GrabConfirmationSheet.50f7114f99',
              'Review before attaching. Captured page context may include visible site content.'
            )}
          </span>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Screenshot preview — only render if dataUrl is a valid PNG data URI.
              Why: the design doc requires screenshots be image/png only. Validating
              the prefix prevents a crafted payload from injecting non-image URIs. */}
          {payload.screenshot?.dataUrl?.startsWith('data:image/png;base64,') ? (
            <div className="border-border/60 overflow-hidden rounded-lg border">
              <img
                src={payload.screenshot.dataUrl}
                alt={translate(
                  'auto.components.browser.pane.GrabConfirmationSheet.9c6ce0632a',
                  'Selected element screenshot'
                )}
                className="max-h-48 w-full bg-black/5 object-contain"
              />
            </div>
          ) : null}

          {/* Element summary */}
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {translate(
                'auto.components.browser.pane.GrabConfirmationSheet.a759d8f866',
                'Selected Element'
              )}
            </h3>
            <div className="border-border/60 bg-muted/20 rounded-lg border p-3 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-foreground font-mono font-semibold">
                  <EscapedText text={`<${target.tagName}>`} />
                </span>
                {target.accessibility.role ? (
                  <span className="text-muted-foreground text-xs">
                    {translate(
                      'auto.components.browser.pane.GrabConfirmationSheet.d053db279d',
                      'role='
                    )}
                    <EscapedText text={target.accessibility.role} />
                  </span>
                ) : null}
              </div>
              {target.accessibility.accessibleName ? (
                <div className="text-muted-foreground mt-1">
                  {translate('auto.components.browser.pane.GrabConfirmationSheet.eb98a0971a', '"')}
                  <EscapedText text={target.accessibility.accessibleName} />
                  {translate('auto.components.browser.pane.GrabConfirmationSheet.eb98a0971a', '"')}
                </div>
              ) : null}
              <div className="text-muted-foreground/70 mt-1 font-mono text-xs">
                <EscapedText text={target.selector} />
              </div>
              <div className="text-muted-foreground/60 mt-1 text-xs">
                {Math.round(target.rectViewport.width)}x{Math.round(target.rectViewport.height)}
              </div>
            </div>
          </div>

          {/* Page info */}
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {translate('auto.components.browser.pane.GrabConfirmationSheet.9098b118ab', 'Page')}
            </h3>
            <div className="border-border/60 bg-muted/20 rounded-lg border p-3 text-sm">
              <div className="text-foreground font-medium">
                <EscapedText
                  text={
                    page.title ||
                    translate(
                      'auto.components.browser.pane.GrabConfirmationSheet.405bb315da',
                      'Untitled'
                    )
                  }
                />
              </div>
              <div className="text-muted-foreground/70 mt-0.5 text-xs">
                <EscapedText text={page.sanitizedUrl} />
              </div>
            </div>
          </div>

          {/* HTML snippet */}
          {target.htmlSnippet ? (
            <div className="space-y-2">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {translate('auto.components.browser.pane.GrabConfirmationSheet.7d1480fbf1', 'HTML')}
              </h3>
              <pre className="border-border/60 bg-muted/20 text-foreground/80 scrollbar-sleek max-h-32 overflow-auto rounded-lg border p-3 font-mono text-xs">
                <EscapedText text={target.htmlSnippet} />
              </pre>
            </div>
          ) : null}

          {/* Nearby text */}
          {nearbyText.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {translate(
                  'auto.components.browser.pane.GrabConfirmationSheet.effd75e330',
                  'Nearby Context'
                )}
              </h3>
              <div className="border-border/60 bg-muted/20 rounded-lg border p-3">
                <ul className="text-muted-foreground list-inside list-disc space-y-0.5 text-sm">
                  {nearbyText.map((text, i) => (
                    <li key={i}>
                      <EscapedText text={text} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="border-border/70 flex items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {translate('auto.components.browser.pane.GrabConfirmationSheet.87d97bdd6d', 'Cancel')}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onCopy}>
          <Copy className="size-3.5" />
          {translate('auto.components.browser.pane.GrabConfirmationSheet.26fd87f4df', 'Copy')}
        </Button>
        {onCopyScreenshot ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onCopyScreenshot}>
            <Image className="size-3.5" />
            {translate(
              'auto.components.browser.pane.GrabConfirmationSheet.7095e98362',
              'Copy Screenshot'
            )}
          </Button>
        ) : null}
        <Button size="sm" className="gap-1.5" onClick={onAttach}>
          <MessageSquarePlus className="size-3.5" />
          {translate(
            'auto.components.browser.pane.GrabConfirmationSheet.314a0aaa5b',
            'Attach to AI'
          )}
        </Button>
      </div>
    </div>
  )
}
