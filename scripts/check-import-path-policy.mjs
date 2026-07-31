#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/**
 * Fails when an import does not use the alias its target requires.
 *
 * Why: aliases only stay useful if nothing drifts back to `../../../..`. Typecheck
 * accepts either spelling, so without this gate the deep relative paths creep
 * back one file at a time. It also enforces the one-way process boundary, which
 * used to rely on a deep relative path merely *looking* alarming.
 */

const GIT_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: import.meta.dirname,
  encoding: 'utf8'
}).trim()

// Alias targets: only areas something imports into get an alias.
const DESKTOP_AREAS = [
  ['apps/desktop/src/renderer', '~renderer'],
  ['apps/desktop/src/shared', '~shared'],
  ['apps/desktop/src/main', '~main'],
  ['apps/desktop/src/preload', '~preload']
]
// Why: relay/ and cli/ are leaf executables nothing imports into, so they get no
// alias — but code inside them still crosses into shared/ and main/.
const DESKTOP_SOURCE_AREAS = [
  ...DESKTOP_AREAS,
  ['apps/desktop/src/relay', '~relay'],
  ['apps/desktop/src/cli', '~cli']
]
const MOBILE_AREA = 'apps/mobile/src'
const MOBILE_SOURCES = ['apps/mobile/src', 'apps/mobile/app']

const RETIRED_PREFIXES = ['@/', '@renderer/']
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.json']
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g
const SKIP_SPECIFIER = /\?|\.(css|svg|png|jpe?g|gif|webp|woff2?|ttf|json|ts|tsx|mjs|cjs)$/

function areaOf(repoRelative, areas) {
  for (const [root, alias] of areas) {
    if (repoRelative === root || repoRelative.startsWith(`${root}/`)) {
      return { root, alias }
    }
  }
  return null
}

function resolves(absoluteNoExt) {
  if (fs.existsSync(absoluteNoExt) && fs.statSync(absoluteNoExt).isFile()) {
    return true
  }
  return (
    RESOLVE_EXTENSIONS.some((extension) => fs.existsSync(`${absoluteNoExt}${extension}`)) ||
    RESOLVE_EXTENSIONS.some((extension) =>
      fs.existsSync(path.join(absoluteNoExt, `index${extension}`))
    )
  )
}

export function findImportPolicyViolations(gitRoot, files) {
  const violations = []
  for (const file of files) {
    let source
    try {
      source = fs.readFileSync(path.join(gitRoot, file), 'utf8')
    } catch {
      continue
    }
    const sourceArea = areaOf(file, DESKTOP_SOURCE_AREAS)
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[2]

      const retired = RETIRED_PREFIXES.find((prefix) => specifier.startsWith(prefix))
      if (retired) {
        violations.push(`${file}: '${specifier}' uses the retired '${retired}' alias`)
        continue
      }
      if (specifier.startsWith('~main/') && sourceArea?.alias === '~renderer') {
        violations.push(
          `${file}: '${specifier}' — renderer must reach the main process through the preload contract`
        )
        continue
      }
      if (!specifier.startsWith('.') || SKIP_SPECIFIER.test(specifier)) {
        continue
      }

      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
      if (!resolves(path.join(gitRoot, target))) {
        continue
      }
      const ups = (specifier.match(/\.\.\//g) || []).length

      const targetArea = areaOf(target, DESKTOP_AREAS)
      if (targetArea && sourceArea) {
        if (targetArea.root !== sourceArea.root) {
          violations.push(
            `${file}: '${specifier}' crosses into ${targetArea.alias}/ — use the alias`
          )
        } else if (ups >= 2) {
          violations.push(
            `${file}: '${specifier}' climbs ${ups} levels inside ${targetArea.alias}/ — use the alias`
          )
        }
        continue
      }
      if (
        MOBILE_SOURCES.some((root) => file === root || file.startsWith(`${root}/`)) &&
        (target === MOBILE_AREA || target.startsWith(`${MOBILE_AREA}/`)) &&
        ups >= 2
      ) {
        violations.push(`${file}: '${specifier}' climbs ${ups} levels — use '~/'`)
      }
    }
  }
  return violations
}

function main() {
  const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], {
    cwd: GIT_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
    .split('\n')
    .filter(Boolean)

  const violations = findImportPolicyViolations(GIT_ROOT, files)
  if (violations.length > 0) {
    console.error(`import path policy failed — ${violations.length} violation(s):`)
    for (const violation of violations.slice(0, 50)) {
      console.error(`  ${violation}`)
    }
    if (violations.length > 50) {
      console.error(`  … ${violations.length - 50} more`)
    }
    console.error('\nSee AGENTS.md section 4 for the alias rules.')
    process.exitCode = 1
    return
  }
  console.log(`import path policy OK — ${files.length} file(s) scanned.`)
}

main()
