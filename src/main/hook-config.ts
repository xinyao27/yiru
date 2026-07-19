import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDefaultRepoHookSettings } from '../shared/constants'
import { resolveHookCommandSourcePolicy } from '../shared/hook-command-source-policy'
import { parseYiruYaml } from '../shared/yiru-yaml'
import type {
  HookCommandSourcePolicy,
  YiruHooks,
  Repo,
  SetupDecision,
  SetupRunPolicy,
  WorktreeDefaultTabsLaunch
} from '../shared/types'

export { parseYiruYaml }

/**
 * Load hooks from yiru.yaml in the given repo root.
 */
export function loadHooks(repoPath: string): YiruHooks | null {
  const yamlPath = join(repoPath, 'yiru.yaml')
  if (!existsSync(yamlPath)) {
    return null
  }

  try {
    const content = readFileSync(yamlPath, 'utf-8')
    return parseYiruYaml(content)
  } catch {
    return null
  }
}

/**
 * Check whether a yiru.yaml exists for a repo.
 */
export function hasHooksFile(repoPath: string): boolean {
  return existsSync(join(repoPath, 'yiru.yaml'))
}

// Why: when a newer Yiru release adds a top-level key to `yiru.yaml`, older
// versions that don't recognise it will
// return `null` from `parseYiruYaml` and show a confusing "could not be parsed"
// error.  Detecting well-formed but unrecognised keys lets the UI suggest an
// update instead of implying the file is broken.
const RECOGNIZED_YIRU_YAML_KEYS = new Set(['scripts', 'defaultTabs', 'environmentRecipes'])

/**
 * Return true when `yiru.yaml` contains at least one top-level key that this
 * version of Yiru does not handle.
 */
export function hasUnrecognizedYiruYamlKeys(repoPath: string): boolean {
  try {
    const content = readFileSync(join(repoPath, 'yiru.yaml'), 'utf-8')
    for (const line of iterateLfScriptLines(content)) {
      // Why: bare `key:` at end-of-line (no trailing space) is valid YAML for
      // a mapping with a block value on the next line. Match both forms so
      // newer keys like `futureFeature:\n  nested` are still detected.
      const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(\s|$)/)
      if (m != null && !RECOGNIZED_YIRU_YAML_KEYS.has(m[1])) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

function getEffectiveHookScript(
  yamlScript: string | undefined,
  localScript: string | undefined,
  policy: HookCommandSourcePolicy
): string | undefined {
  const shared = yamlScript?.trim()
  const local = localScript?.trim()

  if (policy === 'local-only') {
    return local || undefined
  }

  if (policy === 'run-both') {
    return [shared, local].filter(Boolean).join('\n') || undefined
  }

  return shared || undefined
}

export function getEffectiveHooksFromConfig(
  repo: Repo,
  yamlHooks: YiruHooks | null
): YiruHooks | null {
  const localSetup = repo.hookSettings?.scripts.setup
  const localArchive = repo.hookSettings?.scripts.archive
  const rawPolicy = repo.hookSettings?.commandSourcePolicy
  const setupPolicy = resolveHookCommandSourcePolicy(rawPolicy, {
    hasLocalScript: Boolean(localSetup?.trim())
  })
  const archivePolicy = resolveHookCommandSourcePolicy(rawPolicy, {
    hasLocalScript: Boolean(localArchive?.trim())
  })
  const setup = getEffectiveHookScript(yamlHooks?.scripts.setup, localSetup, setupPolicy)
  const archive = getEffectiveHookScript(yamlHooks?.scripts.archive, localArchive, archivePolicy)

  if (!setup && !archive) {
    return null
  }

  // Why: committed `yiru.yaml` and local Settings commands can intentionally
  // coexist, but the source policy defines whether the committed file is an
  // authoritative boundary, local settings are authoritative, or both run.
  return {
    scripts: {
      ...(setup ? { setup } : {}),
      ...(archive ? { archive } : {})
    }
  }
}

export function getEffectiveHooks(repo: Repo, worktreePath?: string): YiruHooks | null {
  const hooksRoot = worktreePath ?? repo.path
  return getEffectiveHooksFromConfig(repo, loadHooks(hooksRoot))
}

export function getEffectiveSetupRunPolicy(repo: Repo): SetupRunPolicy {
  return repo.hookSettings?.setupRunPolicy ?? getDefaultRepoHookSettings().setupRunPolicy!
}

export function shouldRunSetupForCreate(repo: Repo, decision: SetupDecision = 'inherit'): boolean {
  if (decision === 'run') {
    return true
  }
  if (decision === 'skip') {
    return false
  }

  const policy = getEffectiveSetupRunPolicy(repo)
  if (policy === 'ask') {
    throw new Error('Setup decision required for this repository')
  }

  return policy === 'run-by-default'
}

export function getDefaultTabCommandTrustContent(hooks: YiruHooks | null): string {
  const commands = (hooks?.defaultTabs ?? [])
    .map((tab, index) => {
      const command = tab.command?.trim()
      if (!command) {
        return null
      }
      const label = tab.title ? ` ${tab.title}` : ''
      return `# defaultTabs[${index + 1}]${label}\n${command}`
    })
    .filter((entry): entry is string => entry !== null)
  return [hooks?.scripts.setup?.trim(), ...commands].filter(Boolean).join('\n\n')
}

export function getDefaultTabsLaunch(
  hooks: YiruHooks | null,
  repo: Repo,
  decision: SetupDecision = 'inherit'
): WorktreeDefaultTabsLaunch | undefined {
  const tabs = hooks?.defaultTabs ?? []
  if (tabs.length === 0) {
    return undefined
  }
  const hasCommands = tabs.some((tab) => Boolean(tab.command?.trim()))
  const sharedCommandPolicy = resolveHookCommandSourcePolicy(
    repo.hookSettings?.commandSourcePolicy,
    {
      hasLocalScript: Boolean(repo.hookSettings?.scripts.setup?.trim())
    }
  )
  // Why: default tab commands come from committed `yiru.yaml`; a repo set to
  // local-only may still use shared titles/colors, but must not execute them.
  const canRunSharedCommands = sharedCommandPolicy !== 'local-only'
  const runCommands =
    hasCommands && canRunSharedCommands ? shouldRunSetupForCreate(repo, decision) : false
  return { tabs, runCommands }
}

export function getSetupCommandSource(
  repo: Repo,
  worktreePath?: string
): { source: 'yaml' | 'local' | 'both'; command: string } | null {
  const hooksRoot = worktreePath ?? repo.path
  const yamlHooks = loadHooks(hooksRoot)
  const yamlSetup = yamlHooks?.scripts.setup?.trim()
  const localSetup = repo.hookSettings?.scripts.setup?.trim()
  const rawPolicy = repo.hookSettings?.commandSourcePolicy
  const policy = resolveHookCommandSourcePolicy(rawPolicy, {
    hasLocalScript: Boolean(localSetup)
  })

  if (policy === 'local-only') {
    return localSetup ? { source: 'local', command: localSetup } : null
  }

  if (policy === 'run-both' && yamlSetup && localSetup) {
    return { source: 'both', command: `${yamlSetup}\n${localSetup}` }
  }

  if (yamlSetup) {
    return { source: 'yaml', command: yamlSetup }
  }

  return null
}

function* iterateLfScriptLines(script: string): Generator<string> {
  let lineStart = 0
  for (let index = 0; index < script.length; index++) {
    if (script.charCodeAt(index) !== 10) {
      continue
    }
    const lineEnd = index > lineStart && script.charCodeAt(index - 1) === 13 ? index - 1 : index
    yield script.slice(lineStart, lineEnd)
    lineStart = index + 1
  }
  if (lineStart <= script.length) {
    yield script.slice(lineStart)
  }
}
