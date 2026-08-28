export type NestedRepoDirectoryEntry = {
  name: string
  isDirectory: boolean
  isSymlink?: boolean
}

export type NestedRepoScanFilesystem = {
  readDirectory: (dirPath: string) => Promise<NestedRepoDirectoryEntry[]>
  readTextFile?: (filePath: string) => Promise<string>
  joinPath: (parentPath: string, childName: string) => string
  basename: (path: string) => string
  hasGitMarker: (path: string) => Promise<boolean> | boolean
  isSelectedPathGitRepo: (path: string) => Promise<boolean> | boolean
}

export type NestedRepoIgnoreRule = {
  pattern: string
  negate: boolean
  basenameOnly: boolean
  baseSegments: string[]
}

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '.cache',
  'vendor',
  '__pycache__',
  '.turbo',
  '.parcel-cache'
])

const VCS_METADATA_DIRS = new Set(['.git', '.svn', '.hg', '.jj', '.sl', '.repo', 'CVS'])

function shouldSkipDirectory(name: string, depth: number): boolean {
  return (
    VCS_METADATA_DIRS.has(name) || SKIPPED_DIRS.has(name) || (depth > 0 && name.startsWith('.'))
  )
}

function globSegmentMatches(pattern: string, value: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return pattern === value
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`^${escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`)
  return regex.test(value)
}

function pathSegmentsMatch(patternSegments: string[], candidateSegments: string[]): boolean {
  const matchFrom = (patternIndex: number, candidateIndex: number): boolean => {
    if (patternIndex >= patternSegments.length) {
      return candidateIndex >= candidateSegments.length
    }
    const pattern = patternSegments[patternIndex]
    if (pattern === '**') {
      return (
        matchFrom(patternIndex + 1, candidateIndex) ||
        (candidateIndex < candidateSegments.length && matchFrom(patternIndex, candidateIndex + 1))
      )
    }
    return (
      candidateIndex < candidateSegments.length &&
      globSegmentMatches(pattern, candidateSegments[candidateIndex] ?? '') &&
      matchFrom(patternIndex + 1, candidateIndex + 1)
    )
  }
  return matchFrom(0, 0)
}

function parseGitignoreRules(content: string, baseSegments: string[]): NestedRepoIgnoreRule[] {
  return content
    .split(/\r?\n/)
    .map((rawLine) => rawLine.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const negate = line.startsWith('!')
      const unprefixed = negate ? line.slice(1) : line
      const anchored = unprefixed.startsWith('/')
      const pattern = unprefixed.replace(/^\/+/, '').replace(/\/+$/, '')
      return {
        pattern,
        negate,
        basenameOnly: !anchored && !pattern.includes('/'),
        baseSegments
      }
    })
    .filter((rule) => rule.pattern.length > 0)
}

export function isNestedRepoPathIgnored(
  name: string,
  segments: string[],
  rules: NestedRepoIgnoreRule[]
): boolean {
  let ignored = false
  for (const rule of rules) {
    if (segments.length <= rule.baseSegments.length) {
      continue
    }
    const relativeSegments = segments.slice(rule.baseSegments.length)
    const patternSegments = rule.pattern.split('/')
    const matches = rule.basenameOnly
      ? relativeSegments.some((segment) => globSegmentMatches(rule.pattern, segment))
      : pathSegmentsMatch(patternSegments, relativeSegments)
    if (matches) {
      ignored = !rule.negate
    }
  }
  return ignored || shouldSkipDirectory(name, segments.length - 1)
}

export async function readNestedRepoIgnoreRules(args: {
  folderPath: string
  entries: NestedRepoDirectoryEntry[]
  filesystem: NestedRepoScanFilesystem
  baseSegments: string[]
}): Promise<NestedRepoIgnoreRule[]> {
  if (!args.filesystem.readTextFile || !args.entries.some((entry) => entry.name === '.gitignore')) {
    return []
  }
  try {
    const content = await args.filesystem.readTextFile(
      args.filesystem.joinPath(args.folderPath, '.gitignore')
    )
    return parseGitignoreRules(content, args.baseSegments)
  } catch {
    return []
  }
}
