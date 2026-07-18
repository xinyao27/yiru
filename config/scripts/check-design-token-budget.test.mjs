import { describe, expect, it } from 'vite-plus/test'
import { diffThemeTokens, readInlineThemeTokens } from './check-design-token-budget.mjs'

describe('design token budget check', () => {
  it('reads every declaration regardless of line layout', () => {
    expect(
      readInlineThemeTokens(
        '@theme inline { --color-background: var(--background); --color-task-only: red; }'
      )
    ).toEqual(new Set(['--color-background', '--color-task-only']))
  })

  it('reports additions and removals from the expected vocabulary', () => {
    expect(
      diffThemeTokens(
        new Set(['--color-background', '--color-task-only']),
        new Set(['--color-background', '--color-foreground'])
      )
    ).toEqual({
      added: ['--color-task-only'],
      missing: ['--color-foreground']
    })
  })
})
