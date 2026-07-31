import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

/**
 * Fails when a source path written as a *string* no longer resolves to a file.
 *
 * Why: typecheck only validates real `import` specifiers. A path spelled out in
 * a build script, a CI job, a baseline list, an allowlist Set, or a Why comment
 * is invisible to it, so a rename silently breaks it. That failure mode has hit
 * this repo six times: the relay watcher entry, the max-lines baseline, the
 * ui-style-drift allowlists, the git-compatibility CI job, and two rounds of
 * stale comment paths.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..')

// Why: a path is only worth checking when it starts at a real tree root.
// Prompt fixtures and doc samples are full of things like 'src/foo.ts' or
// 'src/App.tsx'; requiring a known root segment drops those without an
// allowlist entry per fixture.
const CHECKED_ROOT = new RegExp(
  [
    '^src/(main|renderer|preload|shared|relay|cli|types)/',
    '^apps/(desktop|mobile)/',
    '^packages/[a-z0-9-]+/',
    '^config/',
    '^resources/',
    '^scripts/'
  ].join('|')
)

// Why: markdown targets are excluded on purpose. Roughly sixty comments point
// at design docs that were deleted long before this check existed; failing on
// them would bury the source-path regressions this is meant to catch. Doc rot
// is worth its own cleanup, not a permanently red gate.
const CHECKED_EXTENSION = /\.(ts|tsx|mjs|cjs|css)$/

const PATH_TOKEN =
  /(?:^|['"`\s(=,:])((?:src|apps|packages|config|resources|scripts)\/[A-Za-z0-9._@/-]+)/g

// Why: each entry is a string that looks like a repo path but never was one.
// Keep the reason attached — without it the next reader cannot tell an
// intentional sample from a reference someone forgot to update.
const ALLOWED_UNRESOLVED = new Map([
  ['packages/oauth/src/managed-usage.ts', 'upstream repository, not vendored here'],
  [
    'config/electron-vite.vm-serve.config.ts',
    'referenced by a CLI help string for a config the user supplies'
  ],
  ['src/shared/source-control-ai.ts', 'fake git status output inside an AI prompt example'],
  [
    'src/shared/source-control-ai-actions.ts',
    'fake git diff --stat output inside an AI prompt example'
  ],
  ['src/main/diagnostics.ts', 'mock review comment in the feature-wall PR animation']
])

const SEARCH_GLOBS = [
  'apps/*/config/**',
  'apps/*/scripts/**',
  'apps/*/src/**',
  'packages/*/src/**',
  'scripts/**',
  '.github/workflows/*',
  'package.json',
  'apps/*/package.json',
  'packages/*/package.json',
  '*.ts',
  '*.mjs',
  'AGENTS.md'
]

// Why: a string may be written relative to the repo root or to the app that
// owns it (the ui-style-drift allowlist uses app-relative paths, the max-lines
// baseline uses repo-relative ones). Accept a hit under any of them.
const RESOLUTION_BASES = ['', 'apps/desktop', 'apps/mobile']

function listSearchFiles(repoRoot) {
  const output = execFileSync('git', ['ls-files', '--', ...SEARCH_GLOBS], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return output.split('\n').filter(Boolean)
}

function resolvesToFile(repoRoot, candidate) {
  return RESOLUTION_BASES.some((base) => {
    const absolute = path.join(repoRoot, base, candidate)
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile()
  })
}

export function findUnresolvedSourcePaths(repoRoot, files) {
  const unresolved = []
  for (const file of files) {
    const absolute = path.join(repoRoot, file)
    if (!fs.existsSync(absolute)) {
      continue
    }
    const text = fs.readFileSync(absolute, 'utf8')
    const lines = text.split('\n')
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(PATH_TOKEN)) {
        const candidate = match[1]
        if (!CHECKED_EXTENSION.test(candidate)) {
          continue
        }
        if (!CHECKED_ROOT.test(candidate)) {
          continue
        }
        // Why: globs and template placeholders are patterns, not paths.
        if (/[*?{}$]/.test(candidate)) {
          continue
        }
        if (ALLOWED_UNRESOLVED.has(candidate)) {
          continue
        }
        if (resolvesToFile(repoRoot, candidate)) {
          continue
        }
        unresolved.push({ file, line: index + 1, candidate })
      }
    }
  }
  return unresolved
}

function main() {
  const files = listSearchFiles(REPO_ROOT)
  const unresolved = findUnresolvedSourcePaths(REPO_ROOT, files)
  if (unresolved.length === 0) {
    console.log(`source path references OK — ${files.length} file(s) scanned, every path resolves.`)
    return
  }

  console.error('Source path references point at files that do not exist.\n')
  for (const { file, line, candidate } of unresolved) {
    console.error(`${file}:${line}`)
    console.error(`  - ${candidate}`)
  }
  console.error(
    [
      '',
      'A renamed or moved file leaves these behind because they are strings,',
      'not imports, so typecheck cannot see them. Update each one to the new',
      'path. If a string only looks like a repo path (sample data, an upstream',
      'reference), add it to ALLOWED_UNRESOLVED with the reason.'
    ].join('\n')
  )
  process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
