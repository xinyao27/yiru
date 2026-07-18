// @vitest-environment happy-dom
import { cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { DIFFS_TAG_NAME, parseDiffFromFile, resolveTheme } from '@pierre/diffs'
import { useFileDiffInstance } from '@pierre/diffs/react'
import { PierreDiffViewer } from './pierre-diff-viewer'
import { buildEditorFontFamily } from '@/lib/editor-font-family'
import { CURSOR_DARK_THEME_NAME } from '@/lib/cursor-theme-source'

afterEach(cleanup)

describe('Pierre diff activity lifecycle', () => {
  it('tolerates a repeated React ref detachment', () => {
    const fileDiff = parseDiffFromFile(
      { name: 'example.ts', contents: 'const value = 1\n' },
      { name: 'example.ts', contents: 'const value = 2\n' }
    )
    const hook = renderHook(() =>
      useFileDiffInstance({
        fileDiff,
        options: undefined,
        lineAnnotations: undefined,
        selectedLines: undefined,
        prerenderedHTML: undefined,
        hasGutterRenderUtility: false,
        hasCustomHeader: false,
        disableWorkerPool: true
      })
    )
    const container = document.createElement('diffs-container')

    hook.result.current.ref(container)
    hook.result.current.ref(null)

    // Why: nested React activities can detach an already-hidden diff ref again.
    expect(() => hook.result.current.ref(null)).not.toThrow()
  })

  it('uses the configured code font with the cross-platform monospace fallback chain', async () => {
    const view = render(
      <PierreDiffViewer
        modelKey="font.ts"
        originalContent="const value = 1\n"
        modifiedContent="const value = 2\n"
        filePath="/repo/font.ts"
        relativePath="font.ts"
        language="typescript"
        sideBySide
        isDark
        fontSize={13}
        fontFamily="Configured Test Mono"
      />
    )

    const host = await waitFor(() => {
      const node = view.container.querySelector<HTMLElement>(DIFFS_TAG_NAME)
      if (!node) {
        throw new Error('Pierre diff host not mounted')
      }
      return node
    })
    expect(host.style.getPropertyValue('--diffs-font-family')).toBe(
      buildEditorFontFamily('Configured Test Mono')
    )
  })

  it('keeps syntax colors from overriding the configured font typography', async () => {
    const theme = await resolveTheme(CURSOR_DARK_THEME_NAME)
    expect(theme.settings.filter((rule) => rule.settings.fontStyle)).toEqual([])
    expect(
      (
        Object.values(theme.semanticTokenColors ?? {}) as (string | { fontStyle?: string })[]
      ).filter((value) => typeof value !== 'string' && value.fontStyle)
    ).toEqual([])
  })

  it('mounts a commentable diff with one gutter utility API', () => {
    expect(() =>
      render(
        <PierreDiffViewer
          modelKey="example.ts"
          originalContent="const value = 1\n"
          modifiedContent="const value = 2\n"
          filePath="/repo/example.ts"
          relativePath="example.ts"
          language="typescript"
          sideBySide
          isDark
          fontSize={12}
          onAddLineComment={async () => true}
        />
      )
    ).not.toThrow()
  })
})
