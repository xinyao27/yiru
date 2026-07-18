import { describe, expect, it } from 'vite-plus/test'
import { formatGrabPayloadAsText } from './grab-confirmation-sheet'
import type { BrowserGrabPayload } from '../../../../shared/browser-grab-types'

function makeTestPayload(overrides?: Partial<BrowserGrabPayload>): BrowserGrabPayload {
  return {
    page: {
      sanitizedUrl: 'https://example.com/pricing',
      title: 'Pricing - Example',
      viewportWidth: 1280,
      viewportHeight: 720,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 2,
      capturedAt: '2026-04-10T00:00:00.000Z'
    },
    target: {
      tagName: 'button',
      selector: 'main section:nth-of-type(2) button',
      textSnippet: 'Start free trial',
      htmlSnippet: '<button type="button">Start free trial</button>',
      attributes: { type: 'button' },
      accessibility: {
        role: 'button',
        accessibleName: 'Start free trial',
        ariaLabel: null,
        ariaLabelledBy: null
      },
      rectViewport: { x: 400, y: 300, width: 148, height: 44 },
      rectPage: { x: 400, y: 300, width: 148, height: 44 },
      computedStyles: {} as BrowserGrabPayload['target']['computedStyles']
    },
    nearbyText: ['Pro', '$29/month', 'Unlimited projects'],
    ancestorPath: ['section', 'main', 'body'],
    screenshot: null,
    ...overrides
  }
}

describe('formatGrabPayloadAsText', () => {
  it('formats a complete payload with all sections', () => {
    const text = formatGrabPayloadAsText(makeTestPayload())

    expect(text).toContain('Attached browser context from https://example.com/pricing')
    expect(text).toContain('Selected element:')
    expect(text).toContain('button')
    expect(text).toContain('Accessible name: "Start free trial"')
    expect(text).toContain('Selector: main section:nth-of-type(2) button')
    expect(text).toContain('148x44')
    expect(text).toContain('Nearby context:')
    expect(text).toContain('- Pro')
    expect(text).toContain('- $29/month')
    expect(text).toContain('HTML:')
    expect(text).toContain('<button type="button">Start free trial</button>')
  })

  it('omits nearby context section when empty', () => {
    const text = formatGrabPayloadAsText(makeTestPayload({ nearbyText: [] }))
    expect(text).not.toContain('Nearby context:')
  })

  it('omits text content section when empty', () => {
    const payload = makeTestPayload()
    payload.target.textSnippet = ''
    const text = formatGrabPayloadAsText(payload)
    expect(text).not.toContain('Text content:')
  })

  it('includes ancestor path', () => {
    const text = formatGrabPayloadAsText(makeTestPayload())
    expect(text).toContain('Ancestor path: section > main > body')
  })

  it('handles payload with no accessible name', () => {
    const payload = makeTestPayload()
    payload.target.accessibility.accessibleName = null
    const text = formatGrabPayloadAsText(payload)
    expect(text).not.toContain('Accessible name:')
  })
})
