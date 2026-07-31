import {
  canonicalizeSkillInstallSource,
  canonicalizeSkillUpdateNames,
  type SkillManageOperation,
  type SkillManageScope
} from '~shared/skill-freshness'

export type SkillCliRequest =
  | { operation: 'update'; names: readonly string[] }
  | {
      operation: 'install'
      source: string
      skillNames?: readonly string[]
      scope: SkillManageScope
    }
  | { operation: 'remove'; names: readonly string[]; scope: SkillManageScope }

export type SkillCliInvocation = {
  operation: SkillManageOperation
  scope: SkillManageScope
  /** Skill names the run must converge. Empty when an install targets a whole
   *  source, where the CLI decides which skills the source contributes. */
  names: string[]
  source?: string
  /** argv for `npx`, including the `--yes` that skips the install prompt. */
  args: string[]
}

export type SkillCliInvocationResult =
  | { ok: true; invocation: SkillCliInvocation }
  | { ok: false; reason: 'invalid-names' | 'invalid-source' }

// Why: `-g` is the CLI's own global switch; without it the command writes into
// the spawn cwd, which is exactly how a project-scoped install is expressed.
function scopeArgs(scope: SkillManageScope): string[] {
  return scope.kind === 'global' ? ['-g'] : []
}

/**
 * Turns a manage request into the exact `npx skills …` argv, rejecting anything
 * whose names or source fall outside the shell-safe grammar.
 */
export function buildSkillCliInvocation(request: SkillCliRequest): SkillCliInvocationResult {
  switch (request.operation) {
    case 'update': {
      const names = canonicalizeSkillUpdateNames(request.names)
      if (!names) {
        return { ok: false, reason: 'invalid-names' }
      }
      return {
        ok: true,
        invocation: {
          operation: 'update',
          scope: { kind: 'global' },
          names,
          args: ['--yes', 'skills', 'update', ...names, '--global', '-y']
        }
      }
    }
    case 'install': {
      const source = canonicalizeSkillInstallSource(request.source)
      if (!source) {
        return { ok: false, reason: 'invalid-source' }
      }
      const requestedNames = request.skillNames ?? []
      const names = requestedNames.length === 0 ? [] : canonicalizeSkillUpdateNames(requestedNames)
      if (!names) {
        return { ok: false, reason: 'invalid-names' }
      }
      return {
        ok: true,
        invocation: {
          operation: 'install',
          scope: request.scope,
          names,
          source,
          args: [
            '--yes',
            'skills',
            'add',
            source,
            ...(names.length > 0 ? ['--skill', ...names] : []),
            ...scopeArgs(request.scope),
            '-y'
          ]
        }
      }
    }
    case 'remove': {
      const names = canonicalizeSkillUpdateNames(request.names)
      if (!names) {
        return { ok: false, reason: 'invalid-names' }
      }
      return {
        ok: true,
        invocation: {
          operation: 'remove',
          scope: request.scope,
          names,
          args: ['--yes', 'skills', 'remove', ...names, ...scopeArgs(request.scope), '-y']
        }
      }
    }
  }
}
