import { execFile } from 'node:child_process'
import { posix as pathPosix } from 'node:path'

import {
  applySkillLockIndex,
  emptySkillLockIndex,
  type SkillLockIndex
} from '~shared/skill-lockfile'
import { summarizeSkillMarkdown } from '~shared/skill-metadata'
import type { SkillDiscoveryResult, SkillDiscoverySource } from '~shared/skills'

import { buildEncodedWslBashCommand, quoteBashString } from '../wsl-bash-command'
import { discoverClaudePluginSkillSourcesInWsl } from './claude-plugin-skill-sources-wsl'
import {
  buildSkillDiscoverySources,
  sourceKindForSkill,
  sourceLabelForSkill,
  stablePathId,
  type SkillScanRoot
} from './skill-discovery-sources'
import { classifySkillPlacementTopology } from './skill-installation-topology'
import { readSkillLockIndexInWsl } from './skill-lockfile-wsl'
import {
  groupSkillPlacements,
  skillContentDigest,
  type SkillPlacementCandidate
} from './skill-placement-grouping'

const MAX_MARKDOWN_BYTES = 256 * 1024
const MAX_PACKAGE_FILES = 200
const WSL_SCAN_TIMEOUT_MS = 10_000
const WSL_SCAN_MAX_BUFFER_BYTES = 128 * 1024 * 1024

export function buildWslSkillDiscoveryCommand(roots: readonly SkillScanRoot[]): string {
  const lines = [
    'set -u',
    'set -o pipefail',
    'scan_root() {',
    '  root_index=$1',
    '  root_path=$2',
    '  max_depth=$3',
    '  if [ ! -d "$root_path" ]; then',
    `    printf '%s\\0%s\\0%s\\0%s\\0' R "$root_index" 0 ''`,
    '    return',
    '  fi',
    // The distro resolves its own roots: the shared agent-skills home is where
    // provider aliases land, and a root that resolves elsewhere aliases
    // everything under it.
    `  root_resolved=$(realpath -- "$root_path" 2>/dev/null || printf '%s' "$root_path")`,
    `  printf '%s\\0%s\\0%s\\0%s\\0' R "$root_index" 1 "$root_resolved"`,
    `  while IFS= read -r -d '' skill_file; do`,
    `    directory_path=\${skill_file%/*}`,
    `    resolved_directory=$(realpath -- "$directory_path" 2>/dev/null || printf '%s' "$directory_path")`,
    `    if [ -L "$directory_path" ]; then directory_linked=1; else directory_linked=0; fi`,
    `    parent_directory=\${resolved_directory%/*}`,
    `    if [ -r "$resolved_directory" ] && [ -w "$resolved_directory" ] && [ -w "\${parent_directory:-/}" ]; then writable=1; else writable=0; fi`,
    `    updated_at=$(stat -c '%Y' -- "$skill_file" 2>/dev/null || true)`,
    `    encoded_markdown=$(head -c ${MAX_MARKDOWN_BYTES} -- "$skill_file" 2>/dev/null | base64 | tr -d '\\n') || continue`,
    '    file_count=0',
    `    while IFS= read -r -d '' package_file; do`,
    '      file_count=$((file_count + 1))',
    `      [ "$file_count" -ge ${MAX_PACKAGE_FILES} ] && break`,
    `    done < <(find -L "$directory_path" -type f -print0 2>/dev/null)`,
    `    printf '%s\\0%s\\0%s\\0%s\\0%s\\0%s\\0%s\\0%s\\0' S "$root_index" "$skill_file" "$resolved_directory" "$directory_linked" "$writable" "$updated_at" "$file_count"`,
    `    printf '%s' "$encoded_markdown"`,
    `    printf '\\0'`,
    `  done < <(find -L "$root_path" -mindepth 1 -maxdepth "$max_depth" -type f -name 'SKILL.md' -print0 2>/dev/null)`,
    '}'
  ]
  roots.forEach((root, index) => {
    const maxDepth = root.sourceKind === 'plugin' ? 10 : 5
    lines.push(`scan_root ${index} ${quoteBashString(root.path)} ${maxDepth}`)
  })
  return buildEncodedWslBashCommand(lines.join('\n'))
}

function executeWslSkillDiscovery(distro: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'wsl.exe',
      ['-d', distro, '--', 'bash', '-c', command],
      {
        encoding: 'utf8',
        maxBuffer: WSL_SCAN_MAX_BUFFER_BYTES,
        timeout: WSL_SCAN_TIMEOUT_MS,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        resolve(stdout)
      }
    )
  })
}

function readProtocolField(fields: string[], index: number): string {
  const value = fields[index]
  if (value === undefined) {
    throw new Error('WSL skill discovery returned an incomplete response.')
  }
  return value
}

type ScannedRoot = { exists: boolean; resolvedPath: string }

type SkillRecord = {
  skillFilePath: string
  resolvedDirectoryPath: string
  directoryIsLinked: boolean
  writable: boolean
  updatedAtSeconds: number
  fileCount: number
  markdown: Buffer
}

function buildWslPlacementCandidate(
  root: SkillScanRoot,
  record: SkillRecord,
  context: { canonicalRootPath: string; rootIsLinked: boolean }
): SkillPlacementCandidate {
  const directoryPath = pathPosix.dirname(record.skillFilePath)
  const summary = summarizeSkillMarkdown(record.markdown.toString('utf8'))
  const folderName = pathPosix.basename(directoryPath)
  const sourceKind = sourceKindForSkill(root, record.skillFilePath, pathPosix)
  return {
    placement: {
      id: stablePathId(directoryPath),
      rootId: root.id,
      rootPath: root.path,
      rootLabel: root.label,
      owner: root.owner,
      // Copy: `root.providers` is shared across every skill and source from this
      // root, so a later union must not mutate the aliased array.
      providers: [...root.providers],
      sourceKind,
      sourceLabel: sourceLabelForSkill(root, sourceKind),
      directoryPath,
      skillFilePath: record.skillFilePath,
      linkTargetPath:
        record.resolvedDirectoryPath === directoryPath ? null : record.resolvedDirectoryPath,
      topology: classifySkillPlacementTopology({
        rootId: root.id,
        sourceKind: root.sourceKind,
        directoryIsLinked: record.directoryIsLinked,
        rootIsLinked: context.rootIsLinked,
        resolvedParentPath: pathPosix.dirname(record.resolvedDirectoryPath),
        canonicalRootPath: context.canonicalRootPath,
        writable: record.writable
      }),
      fileCount: Number.isFinite(record.fileCount) ? record.fileCount : 0,
      updatedAt: Number.isFinite(record.updatedAtSeconds) ? record.updatedAtSeconds * 1000 : null
    },
    folderName,
    name: summary.name ?? folderName,
    description: summary.description,
    scopeKey: root.scopeKey,
    contentDigest: skillContentDigest(record.markdown)
  }
}

export function parseWslSkillDiscoveryOutput(
  output: string,
  roots: readonly SkillScanRoot[],
  scannedAt = Date.now(),
  lockIndex: SkillLockIndex = emptySkillLockIndex()
): SkillDiscoveryResult {
  const fields = output.split('\0')
  const scannedRoots = new Map<number, ScannedRoot>()
  const pending: { root: SkillScanRoot; record: SkillRecord }[] = []
  let index = 0
  while (index < fields.length && fields[index]) {
    const recordKind = fields[index++]
    const rootIndex = Number.parseInt(readProtocolField(fields, index++), 10)
    const root = roots[rootIndex]
    if (!root) {
      throw new Error('WSL skill discovery returned an unknown source.')
    }
    if (recordKind === 'R') {
      const exists = readProtocolField(fields, index++) === '1'
      scannedRoots.set(rootIndex, { exists, resolvedPath: readProtocolField(fields, index++) })
      continue
    }
    if (recordKind !== 'S') {
      throw new Error('WSL skill discovery returned an invalid response.')
    }
    pending.push({
      root,
      record: {
        skillFilePath: readProtocolField(fields, index++),
        resolvedDirectoryPath: readProtocolField(fields, index++),
        directoryIsLinked: readProtocolField(fields, index++) === '1',
        writable: readProtocolField(fields, index++) === '1',
        updatedAtSeconds: Number.parseInt(readProtocolField(fields, index++), 10),
        fileCount: Number.parseInt(readProtocolField(fields, index++), 10),
        markdown: Buffer.from(readProtocolField(fields, index++), 'base64')
      }
    })
  }

  const canonicalRootPath =
    roots
      .map((root, rootIndex) => ({ root, scanned: scannedRoots.get(rootIndex) }))
      .find(({ root }) => root.id === 'home-agents')?.scanned?.resolvedPath ?? ''
  const rootResolvedPaths = new Map(
    roots.map((root, rootIndex) => [
      root.id,
      scannedRoots.get(rootIndex)?.resolvedPath ?? root.path
    ])
  )
  const skills = applySkillLockIndex(
    groupSkillPlacements(
      pending.map(({ root, record }) =>
        buildWslPlacementCandidate(root, record, {
          canonicalRootPath,
          // Why: the distro owns path identity, so "this root is a link" is a
          // realpath comparison there rather than an ancestor walk here.
          rootIsLinked: rootResolvedPaths.get(root.id) !== root.path
        })
      )
    ),
    lockIndex
  )

  const sources: SkillDiscoverySource[] = roots.map((root, rootIndex) => {
    const exists = scannedRoots.get(rootIndex)?.exists ?? false
    return {
      id: root.id,
      label: root.label,
      path: root.path,
      sourceKind: root.sourceKind,
      providers: [...root.providers],
      owner: root.owner,
      exists,
      skippedReason: exists ? undefined : 'missing'
    }
  })
  return {
    skills,
    sources: sources.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    ),
    scannedAt
  }
}

export async function discoverSkillsInWsl(args: {
  distro: string
  homeDir: string
  cwd: string
}): Promise<SkillDiscoveryResult> {
  // Plugin roots are resolved (in JS) from metadata this first wsl.exe call
  // reads, then fed to the scan's own wsl.exe call below — two sequential
  // process boots. That is a deliberate one-time-per-pane cost (the renderer
  // caches per pane); folding both into one invocation would require porting
  // the plugin-install resolution into bash, which is not worth the risk.
  //
  // Why: plugin-metadata enrichment is optional. A failed/timed-out read must
  // degrade to zero plugin roots (matching the native readMetadataFile path),
  // not abort the mandatory native/home/repo/bundled scan.
  let pluginRoots: SkillScanRoot[] = []
  try {
    pluginRoots = await discoverClaudePluginSkillSourcesInWsl(args)
  } catch {
    pluginRoots = []
  }
  const roots = [
    ...buildSkillDiscoverySources({
      homeDir: args.homeDir,
      cwd: args.cwd,
      repos: [],
      pathApi: pathPosix
    }),
    ...pluginRoots
  ]
  // Why: UNC traversal applies Windows casing and symlink rules. The distro
  // must own enumeration, metadata reads, and canonical path identity.
  const [output, lockIndex] = await Promise.all([
    executeWslSkillDiscovery(args.distro, buildWslSkillDiscoveryCommand(roots)),
    readSkillLockIndexInWsl(args).catch(() => emptySkillLockIndex())
  ])
  return parseWslSkillDiscoveryOutput(output, roots, Date.now(), lockIndex)
}
