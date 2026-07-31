import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const MAIN_CSS_PATH = 'src/renderer/src/assets/main.css'
const EXPECTED_THEME_TOKENS = new Set([
  '--color-background',
  '--color-foreground',
  '--color-card',
  '--color-card-foreground',
  '--color-popover',
  '--color-popover-foreground',
  '--color-primary',
  '--color-primary-foreground',
  '--color-secondary',
  '--color-secondary-foreground',
  '--color-muted',
  '--color-muted-foreground',
  '--color-accent',
  '--color-accent-foreground',
  '--color-destructive',
  '--color-destructive-foreground',
  '--color-border',
  '--color-input',
  '--color-ring',
  '--color-chart-1',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
  '--color-sidebar',
  '--color-sidebar-foreground',
  '--color-sidebar-primary',
  '--color-sidebar-primary-foreground',
  '--color-sidebar-accent',
  '--color-sidebar-accent-foreground',
  '--color-sidebar-border',
  '--color-sidebar-ring',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--radius-2xl',
  '--radius-3xl',
  '--radius-4xl'
])

export function readInlineThemeTokens(css) {
  const markerIndex = css.indexOf('@theme inline')
  const openingBrace = css.indexOf('{', markerIndex)
  if (markerIndex === -1 || openingBrace === -1) {
    throw new Error('Could not find the @theme inline block')
  }

  let depth = 1
  let cursor = openingBrace + 1
  while (cursor < css.length && depth > 0) {
    if (css[cursor] === '{') {
      depth += 1
    }
    if (css[cursor] === '}') {
      depth -= 1
    }
    cursor += 1
  }
  if (depth !== 0) {
    throw new Error('The @theme inline block is not closed')
  }

  const block = css.slice(openingBrace + 1, cursor - 1)
  return new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]))
}

export function diffThemeTokens(actual, expected = EXPECTED_THEME_TOKENS) {
  return {
    added: [...actual].filter((token) => !expected.has(token)).sort(),
    missing: [...expected].filter((token) => !actual.has(token)).sort()
  }
}

export async function main(root = process.cwd()) {
  const css = await fs.readFile(path.join(root, MAIN_CSS_PATH), 'utf8')
  const { added, missing } = diffThemeTokens(readInlineThemeTokens(css))
  if (added.length === 0 && missing.length === 0) {
    return 0
  }

  console.error('The Tailwind theme must stay on the default shadcn token vocabulary.')
  for (const token of added) {
    console.error(`  Unexpected theme token: ${token}`)
  }
  for (const token of missing) {
    console.error(`  Missing shadcn token: ${token}`)
  }
  console.error('Use an existing role or Tailwind palette color; see docs/style-guide.md.')
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
