import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'

import StatusIndicator from './status-indicator'

describe('StatusIndicator', () => {
  it('uses an amber question glyph for permission status', () => {
    const markup = renderToStaticMarkup(<StatusIndicator status="permission" />)

    expect(markup).toContain('title="Needs permission"')
    expect(markup).toContain('<svg')
    expect(markup).toContain('text-amber-500')
    expect(markup).not.toContain('bg-amber-500')
  })
})
