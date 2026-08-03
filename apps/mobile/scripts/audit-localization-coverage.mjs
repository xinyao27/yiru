import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Why: the string-classification AST pass is the localization contract itself, not
// per-client policy — reuse it so mobile and desktop can never disagree about what
// counts as user-visible copy. Only the roots, areas, and baseline live here.
import { collectLocalizationCandidates } from '../../../scripts/collect-localization-candidates.mjs'

const MOBILE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])
const SKIP_DIRECTORY_NAMES = new Set(['.expo', 'assets', 'dist', 'node_modules', 'ios', 'android'])
// Why: Expo routes live in app/, features in src/; both ship user-visible copy.
const DEFAULT_SOURCE_ROOTS = ['src', 'app']
const DEFAULT_BASELINE_PATH = path.join('config', 'localization-coverage-baseline.json')

async function collectSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORY_NAMES.has(entry.name)) {
        files.push(...(await collectSourceFiles(fullPath)))
      }
      continue
    }
    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(fullPath)
    }
  }

  return files
}

function areaForFile(relativePath) {
  const parts = relativePath.split('/')
  if (parts[0] === 'src') {
    return `src/${parts[1] ?? 'root'}`
  }
  return parts.length > 1 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? 'root')
}

function signature(candidate) {
  return JSON.stringify({
    filePath: candidate.filePath,
    kind: candidate.kind,
    text: candidate.text,
    dynamic: candidate.dynamic
  })
}

function countBySignature(candidates) {
  const counts = new Map()
  for (const candidate of candidates) {
    const key = signature(candidate)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function findNewCandidates(candidates, baseline) {
  const allowed = new Map(
    baseline.map((entry) => [
      JSON.stringify({
        filePath: entry.filePath,
        kind: entry.kind,
        text: entry.text,
        dynamic: entry.dynamic
      }),
      entry.count
    ])
  )
  const seen = countBySignature(candidates)
  const added = []

  for (const candidate of candidates) {
    const key = signature(candidate)
    const seenCount = seen.get(key) ?? 0
    if (seenCount > (allowed.get(key) ?? 0)) {
      added.push(candidate)
      seen.set(key, seenCount - 1)
    }
  }

  return added
}

function formatCandidates(candidates) {
  return candidates
    .map(
      (candidate) =>
        `${candidate.filePath}:${candidate.line}:${candidate.column} ${candidate.kind}: ${JSON.stringify(candidate.text)}`
    )
    .join('\n')
}

function parseArgs(argv) {
  const options = { baselinePath: DEFAULT_BASELINE_PATH, check: false, write: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--check') {
      options.check = true
    } else if (arg === '--write-baseline') {
      options.write = true
    } else if (arg === '--baseline') {
      options.baselinePath = argv[index + 1] ?? options.baselinePath
      index += 1
    }
  }
  return options
}

async function collectAll() {
  const candidates = []
  for (const sourceRoot of DEFAULT_SOURCE_ROOTS) {
    const absoluteRoot = path.join(MOBILE_ROOT, sourceRoot)
    for (const filePath of await collectSourceFiles(absoluteRoot)) {
      candidates.push(
        ...collectLocalizationCandidates(
          filePath,
          await fs.readFile(filePath, 'utf8'),
          MOBILE_ROOT,
          areaForFile
        )
      )
    }
  }
  return candidates.sort((left, right) =>
    left.filePath === right.filePath
      ? left.start - right.start
      : left.filePath.localeCompare(right.filePath)
  )
}

function buildBaseline(candidates) {
  const counts = new Map()
  for (const candidate of candidates) {
    const key = signature(candidate)
    const entry = counts.get(key) ?? {
      filePath: candidate.filePath,
      kind: candidate.kind,
      text: candidate.text,
      dynamic: candidate.dynamic,
      count: 0
    }
    entry.count += 1
    counts.set(key, entry)
  }
  return [...counts.values()]
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const baselineAbsolutePath = path.join(MOBILE_ROOT, options.baselinePath)
  const candidates = await collectAll()

  if (options.write) {
    const baseline = buildBaseline(candidates)
    await fs.writeFile(baselineAbsolutePath, `${JSON.stringify(baseline, null, 2)}\n`)
    console.log(`Wrote ${baseline.length} baseline entries for ${candidates.length} candidates.`)
    return 0
  }

  if (options.check) {
    const baseline = JSON.parse(await fs.readFile(baselineAbsolutePath, 'utf8'))
    const added = findNewCandidates(candidates, baseline)
    if (added.length > 0) {
      console.error('New unlocalized mobile strings were found.')
      console.error('Wrap them with translate() from ~/i18n/translate before landing.')
      console.error('')
      console.error(formatCandidates(added))
      return 1
    }
    console.log(
      `Localization coverage check passed with ${candidates.length} baselined mobile candidates.`
    )
    return 0
  }

  const areas = new Map()
  for (const candidate of candidates) {
    areas.set(candidate.area, (areas.get(candidate.area) ?? 0) + 1)
  }
  const summary = [...areas.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([area, count]) => `${area}: ${count}`)
    .join('\n')
  process.stdout.write(`${candidates.length} localization candidates.\n${summary}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
