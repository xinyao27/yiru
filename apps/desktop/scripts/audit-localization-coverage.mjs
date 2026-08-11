import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// Why: the string-classification AST pass is the localization contract itself, not
// desktop-specific policy — it is shared with mobile so the two clients can never
// disagree about what counts as user-visible copy. Only the renderer roots, the
// area grouping, and the allowlist live here.
import {
  collectLocalizationCandidates,
  toRepoRelativePath
} from '../../../scripts/collect-localization-candidates.mjs'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])
const SKIP_PATH_PARTS = new Set(['.git', 'dist', 'node_modules', 'out', 'assets'])

function isSkippedFile(root, filePath) {
  const relative = toRepoRelativePath(root, filePath)
  if (relative.endsWith('.d.ts')) {
    return true
  }
  return relative.split('/').some((part) => SKIP_PATH_PARTS.has(part))
}

async function collectSourceFiles(root, dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_PATH_PARTS.has(entry.name)) {
        files.push(...(await collectSourceFiles(root, fullPath)))
      }
      continue
    }
    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !isSkippedFile(root, fullPath)
    ) {
      files.push(fullPath)
    }
  }

  return files
}

function areaForFile(relativePath) {
  const rendererPrefix = '../../packages/client/src/'
  if (!relativePath.startsWith(rendererPrefix)) {
    return relativePath.split('/').slice(0, 2).join('/')
  }

  const withoutPrefix = relativePath.slice(rendererPrefix.length)
  const parts = withoutPrefix.split('/')
  if (parts[0] === 'components' && parts[1]) {
    return `renderer/${parts[1]}`
  }
  return `renderer/${parts[0] ?? 'root'}`
}

function groupByArea(reports) {
  const groups = new Map()
  for (const report of reports) {
    const group = groups.get(report.area) ?? { area: report.area, count: 0, files: new Map() }
    group.count += 1
    group.files.set(report.filePath, (group.files.get(report.filePath) ?? 0) + 1)
    groups.set(report.area, group)
  }
  return [...groups.values()].sort((left, right) => right.count - left.count)
}

function formatReports(_root, reports) {
  return reports
    .map(
      (report) =>
        `${report.filePath}:${report.line}:${report.column} ${report.kind}: ${JSON.stringify(report.text)}`
    )
    .join('\n')
}

function formatMarkdownReport(reports) {
  const groups = groupByArea(reports)
  const lines = [
    '# Localization Candidate Inventory',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total candidates: ${reports.length}`,
    '',
    '## Area Summary',
    ''
  ]

  for (const group of groups) {
    lines.push(`- ${group.area}: ${group.count} candidates across ${group.files.size} files`)
  }

  lines.push('', '## Candidates', '')
  for (const group of groups) {
    lines.push(`### ${group.area}`, '')
    for (const report of reports.filter((entry) => entry.area === group.area)) {
      lines.push(
        `- \`${report.filePath}:${report.line}:${report.column}\` ${report.kind}: ${JSON.stringify(report.text)}`
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

function parseArgs(argv) {
  const options = {
    allowlistPath: path.join('config', 'localization-coverage-allowlist.json'),
    check: false,
    format: 'summary',
    outputPath: null,
    sourceRoot: path.join('..', '..', 'packages', 'client', 'src')
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') {
      options.format = 'json'
    } else if (arg === '--markdown') {
      options.format = 'markdown'
    } else if (arg === '--check') {
      options.check = true
    } else if (arg === '--allowlist') {
      options.allowlistPath = argv[index + 1] ?? options.allowlistPath
      index += 1
    } else if (arg === '--output') {
      options.outputPath = argv[index + 1] ?? null
      index += 1
    } else if (arg === '--source-root') {
      options.sourceRoot = argv[index + 1] ?? options.sourceRoot
      index += 1
    }
  }

  return options
}

function candidateSignature(candidate) {
  return JSON.stringify({
    filePath: candidate.filePath,
    kind: candidate.kind,
    text: candidate.text,
    dynamic: candidate.dynamic
  })
}

function countBySignature(reports) {
  const counts = new Map()
  for (const report of reports) {
    const signature = candidateSignature(report)
    counts.set(signature, (counts.get(signature) ?? 0) + 1)
  }
  return counts
}

async function readAllowlist(root, allowlistPath) {
  const absolutePath = path.resolve(root, allowlistPath)
  const raw = await fs.readFile(absolutePath, 'utf8')
  return JSON.parse(raw)
}

function findNewCandidates(reports, allowlist) {
  const allowedCounts = new Map(
    allowlist.map((entry) => [
      JSON.stringify({
        filePath: entry.filePath,
        kind: entry.kind,
        text: entry.text,
        dynamic: entry.dynamic
      }),
      entry.count
    ])
  )
  const seenCounts = countBySignature(reports)
  const newCandidates = []

  for (const report of reports) {
    const signature = candidateSignature(report)
    const seenCount = seenCounts.get(signature) ?? 0
    const allowedCount = allowedCounts.get(signature) ?? 0
    if (seenCount > allowedCount) {
      newCandidates.push(report)
      seenCounts.set(signature, seenCount - 1)
    }
  }

  return newCandidates
}

export async function main(root = process.cwd(), argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const absoluteSourceRoot = path.resolve(root, options.sourceRoot)
  const files = await collectSourceFiles(root, absoluteSourceRoot)
  const reports = []

  for (const filePath of files) {
    const sourceText = await fs.readFile(filePath, 'utf8')
    reports.push(...collectLocalizationCandidates(filePath, sourceText, root, areaForFile))
  }

  if (options.check) {
    const allowlist = await readAllowlist(root, options.allowlistPath)
    const newCandidates = findNewCandidates(reports, allowlist)
    if (newCandidates.length > 0) {
      console.error('New unlocalized renderer strings were found.')
      console.error('Localize them or add a reviewed exclusion to the localization allowlist.')
      console.error('')
      console.error(formatReports(root, newCandidates))
      return 1
    }
    console.log(`Localization coverage check passed with ${reports.length} allowlisted candidates.`)
    return 0
  }

  const output =
    options.format === 'json'
      ? `${JSON.stringify(reports, null, 2)}\n`
      : options.format === 'markdown'
        ? `${formatMarkdownReport(reports)}\n`
        : `${reports.length} localization candidates in ${files.length} files.\n${groupByArea(
            reports
          )
            .map((group) => `${group.area}: ${group.count}`)
            .join('\n')}\n`

  if (options.outputPath) {
    await fs.mkdir(path.dirname(path.resolve(root, options.outputPath)), { recursive: true })
    await fs.writeFile(path.resolve(root, options.outputPath), output)
  } else {
    process.stdout.write(output)
  }

  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
