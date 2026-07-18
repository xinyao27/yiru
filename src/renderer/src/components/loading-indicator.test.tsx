import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LOADER_STYLES } from '../../../shared/loader-style'
import {
  LoadingIndicator,
  LoadingIndicatorPreview,
  LoadingIndicatorStyleProvider
} from './loading-indicator'

describe('LoadingIndicator', () => {
  it.each(LOADER_STYLES)('renders the %s preview', (loaderStyle) => {
    const markup = renderToStaticMarkup(
      <LoadingIndicatorPreview loaderStyle={loaderStyle} className="size-7" />
    )

    expect(markup).toContain(`data-loader-style="${loaderStyle}"`)
    expect(markup).toContain('data-slot="loading-indicator"')
  })

  it('uses the style supplied by the app-level provider', () => {
    const markup = renderToStaticMarkup(
      <LoadingIndicatorStyleProvider loaderStyle="flipbook">
        <LoadingIndicator />
      </LoadingIndicatorStyleProvider>
    )

    expect(markup).toContain('data-loader-style="flipbook"')
  })

  it('does not rotate the wrapper when migrating an old spinner callsite', () => {
    const markup = renderToStaticMarkup(
      <LoadingIndicatorPreview loaderStyle="square" className="size-3 animate-spin" />
    )

    expect(markup).not.toContain('animate-spin')
  })
})
