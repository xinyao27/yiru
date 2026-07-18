import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vite-plus/test'
import { RepoColorPicker } from './repo-color-picker'

describe('RepoColorPicker', () => {
  it('renders a normalized custom color trigger', () => {
    const html = renderToStaticMarkup(
      <RepoColorPicker value="#ABCDEF" onChange={vi.fn()} label="Custom repo color" />
    )

    expect(html).toContain('aria-label="Custom repo color"')
    expect(html).toContain('#abcdef')
  })
})
