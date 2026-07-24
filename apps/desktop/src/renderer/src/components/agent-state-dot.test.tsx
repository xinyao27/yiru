import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'

import { AgentStateDot } from './agent-state-dot'

describe('AgentStateDot', () => {
  it.each([
    ['permission', 'Needs attention'],
    ['waiting', 'Waiting for input']
  ] as const)('uses an amber question glyph for %s', (state, label) => {
    const markup = renderToStaticMarkup(<AgentStateDot state={state} />)

    expect(markup).toContain(`aria-label="${label}"`)
    expect(markup).toContain('<svg')
    expect(markup).toContain('text-amber-500')
    expect(markup).not.toContain('bg-amber-500')
  })
})
