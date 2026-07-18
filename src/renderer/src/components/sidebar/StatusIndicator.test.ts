import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StatusIndicator, { type Status } from './StatusIndicator'

function renderMarkup(status: Status): string {
  return renderToStaticMarkup(React.createElement(StatusIndicator, { status }))
}

function renderDotClassNames(status: Status): string[] {
  const markup = renderMarkup(status)
  const dotClassName = markup.match(/<span class="([^"]*rounded-full[^"]*)"/)?.[1]

  expect(dotClassName).toBeDefined()

  return dotClassName!.split(/\s+/)
}

describe('StatusIndicator', () => {
  it('renders working with the configured loading indicator', () => {
    const markup = renderMarkup('working')

    expect(markup).toContain('data-slot="loading-indicator"')
    expect(markup).toContain('data-loader-style="drawing"')
    expect(markup).toContain('text-yellow-500')
  })

  it('renders permission as an amber attention dot', () => {
    const classNames = renderDotClassNames('permission')

    expect(classNames).toContain('bg-amber-500')
    expect(classNames).not.toContain('bg-red-500')
  })

  it('renders active as full emerald dot', () => {
    const classNames = renderDotClassNames('active')

    expect(classNames).toContain('bg-emerald-500')
  })

  it('renders done as an emerald dot', () => {
    const classNames = renderDotClassNames('done')

    expect(classNames).toContain('bg-emerald-500')
  })
})
