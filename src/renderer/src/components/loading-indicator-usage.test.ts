import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER_SOURCE_ROOT = join(process.cwd(), 'src', 'renderer', 'src')
const CANONICAL_LOADER_FILES = new Set([
  join(RENDERER_SOURCE_ROOT, 'components', 'loading-indicator.tsx'),
  join(RENDERER_SOURCE_ROOT, 'assets', 'loading-indicator.css')
])
const SOURCE_EXTENSIONS = new Set(['.css', '.ts', '.tsx'])
const LEGACY_SPINNER_PATTERNS = [
  /\banimate-spin\b/,
  /\[animation:[^\]]*\bspin_/,
  /\banimation\s*:[^;\n]*\b[\w-]*spin\b/,
  /@keyframes\s+[\w-]*spin\b/
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(path)
    }
    const extension = entry.name.slice(entry.name.lastIndexOf('.'))
    const isTest = entry.name.includes('.test.') || entry.name.includes('.spec.')
    return SOURCE_EXTENSIONS.has(extension) && !isTest ? [path] : []
  })
}

describe('canonical loading indicator usage', () => {
  it('does not leave one-off spinning loaders in renderer production code', () => {
    // Why: the original migration missed conditional refresh icons and CSS rings;
    // keep every future loading state on the user-configured component boundary.
    const offenders = sourceFiles(RENDERER_SOURCE_ROOT)
      .filter((path) => !CANONICAL_LOADER_FILES.has(path))
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            LEGACY_SPINNER_PATTERNS.some((pattern) => pattern.test(line))
              ? [`${relative(process.cwd(), path)}:${index + 1}`]
              : []
          )
      )

    expect(offenders).toEqual([])
  })
})
