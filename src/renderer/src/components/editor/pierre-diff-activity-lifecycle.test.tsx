// @vitest-environment happy-dom
import { cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseDiffFromFile } from '@pierre/diffs'
import { useFileDiffInstance } from '@pierre/diffs/react'
import { PierreDiffViewer } from './PierreDiffViewer'

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
