import type { HookCheckResult } from '~renderer/runtime/hooks-client'
import { resolveHookCommandSourcePolicy } from '~shared/hook-command-source-policy'
import type { Repo } from '~shared/types'

export function hasEffectiveSetupCommand(repo: Repo, hooksResult: HookCheckResult): boolean {
  const localSetup = repo.hookSettings?.scripts?.setup?.trim()
  const sharedSetup = hooksResult.hooks?.scripts?.setup?.trim()
  const rawPolicy = repo.hookSettings?.commandSourcePolicy
  const sourcePolicy = resolveHookCommandSourcePolicy(rawPolicy, {
    hasLocalScript: Boolean(localSetup)
  })

  if (sourcePolicy === 'local-only') {
    return Boolean(localSetup)
  }

  if (sourcePolicy === 'run-both') {
    return Boolean(sharedSetup || localSetup)
  }

  return Boolean(sharedSetup)
}
