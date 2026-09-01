import type { RuntimeSkill } from '@yiru/runtime-protocol/contract'
import { parse } from 'yaml'

import type { Host } from '../hosts/contract'
import type { HostRegistry } from '../hosts/registry'
import type { ProjectStore } from '../projects/store'

const SKILL_LIMIT = 500

type SkillRoot = {
  host: Host
  path: string
  projectId: string | null
  sourceLabel: string
}

export class SkillCatalogService {
  private readonly hosts: HostRegistry
  private readonly projects: ProjectStore

  constructor(projects: ProjectStore, hosts: HostRegistry) {
    this.projects = projects
    this.hosts = hosts
  }

  async list(projectId?: string): Promise<{ skills: RuntimeSkill[]; truncated: boolean }> {
    const roots = await this.roots(projectId)
    const collected: RuntimeSkill[] = []
    for (const root of roots) {
      const files = await discoverSkillFiles(root)
      for (const file of files) {
        if (collected.length > SKILL_LIMIT) {
          break
        }
        const skill = await readSkill(root, file)
        if (skill) {
          collected.push(skill)
        }
      }
    }
    const deduplicated = [
      ...new Map(collected.map((skill) => [skill.id, skill])).values()
    ].toSorted((left, right) => left.name.localeCompare(right.name))
    return {
      skills: deduplicated.slice(0, SKILL_LIMIT),
      truncated: deduplicated.length > SKILL_LIMIT
    }
  }

  private async roots(projectId?: string): Promise<SkillRoot[]> {
    const local = this.hosts.get('local')
    const localHome = await this.hosts.homeDirectory(local.id)
    if (!localHome) {
      throw new Error('host_home_unavailable')
    }
    const roots: SkillRoot[] = [
      {
        host: local,
        path: local.join(localHome, '.codex', 'skills'),
        projectId: null,
        sourceLabel: 'Codex'
      },
      {
        host: local,
        path: local.join(localHome, '.agents', 'skills'),
        projectId: null,
        sourceLabel: 'Agent skills'
      }
    ]
    const projects = projectId ? [this.projects.get(projectId)] : this.projects.list()
    for (const project of projects) {
      const host = this.hosts.get(project.executionHostId)
      roots.push({
        host,
        path: host.join(project.path, 'skills'),
        projectId: project.id,
        sourceLabel: project.displayName
      })
    }
    return roots
  }
}

async function discoverSkillFiles(root: SkillRoot): Promise<string[]> {
  if (!(await root.host.fileExists(root.path))) {
    return []
  }
  if (root.host.kind === 'local') {
    const glob = new Bun.Glob('**/SKILL.md')
    const files: string[] = []
    for await (const path of glob.scan({
      cwd: root.path,
      dot: true,
      followSymlinks: false,
      onlyFiles: true
    })) {
      files.push(root.host.join(root.path, path))
      if (files.length > SKILL_LIMIT) {
        break
      }
    }
    return files
  }
  const result = await root.host.exec({
    args: [root.path, '-maxdepth', '5', '-type', 'f', '-name', 'SKILL.md', '-print'],
    command: 'find',
    timeoutMs: 15_000
  })
  return result.exitCode === 0
    ? result.stdout
        .split('\n')
        .map((path) => path.trim())
        .filter(Boolean)
        .slice(0, SKILL_LIMIT + 1)
    : []
}

async function readSkill(root: SkillRoot, path: string): Promise<RuntimeSkill | null> {
  const text = await root.host.readText(path, 64 * 1_024)
  if (!text) {
    return null
  }
  const metadata = readFrontmatter(text)
  const folderName = root.host.basename(root.host.dirname(path))
  const name = readMetadataString(metadata, 'name') ?? folderName
  return {
    description: readMetadataString(metadata, 'description'),
    id: `${root.host.id}:${path}`,
    name,
    path,
    projectId: root.projectId,
    sourceLabel: root.sourceLabel
  }
}

function readFrontmatter(text: string): unknown {
  if (!text.startsWith('---\n')) {
    return null
  }
  const end = text.indexOf('\n---', 4)
  if (end === -1) {
    return null
  }
  try {
    return parse(text.slice(4, end))
  } catch {
    return null
  }
}

function readMetadataString(metadata: unknown, key: string): string | null {
  const value =
    typeof metadata === 'object' && metadata !== null ? Reflect.get(metadata, key) : null
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1_000) : null
}
