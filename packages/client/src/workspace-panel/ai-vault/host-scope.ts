import {
  ALL_EXECUTION_HOSTS_SCOPE,
  getExecutionHostLabel,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId,
  type ExecutionHostScope
} from '@yiru/runtime-protocol/model/workspace'
import type { PublicKnownRuntimeEnvironment } from '@yiru/runtime-protocol/workbench/runtime-environments'
import { useEffect, useRef, useState } from 'react'
import { getAiVaultResumeWorkspaceExecutionHostId } from '~renderer/workspace-panel/ai-vault/resume-target'

import type { AiVaultSessionResumeTargetState } from './session-resume'

export type AiVaultHostScopeOption = {
  id: ExecutionHostScope
  label: string
}

export function useAiVaultExecutionHostScope(args: {
  activeWorktreeId: string | null
  resumeTargetState: AiVaultSessionResumeTargetState
  availableExecutionHostScopes?: readonly ExecutionHostScope[]
}): {
  executionHostScope: ExecutionHostScope
  activeExecutionHostScope: ExecutionHostId | null
  onExecutionHostScopeChange: (scope: ExecutionHostScope) => void
} {
  const userChangedHostScopeRef = useRef(false)
  const activeExecutionHostId = (() =>
    getAiVaultResumeWorkspaceExecutionHostId(args.resumeTargetState, args.activeWorktreeId))()
  const activeExecutionHost = parseExecutionHostId(activeExecutionHostId)
  const activeExecutionHostScope: ExecutionHostId | null =
    activeExecutionHost?.kind === 'runtime' ? activeExecutionHost.id : null
  const defaultExecutionHostScope: ExecutionHostScope =
    activeExecutionHostScope ?? LOCAL_EXECUTION_HOST_ID
  const [executionHostScope, setExecutionHostScope] =
    useState<ExecutionHostScope>(defaultExecutionHostScope)

  useEffect(() => {
    // Why: preserve an explicit user choice (e.g. "All") across incidental
    // rerenders, but reset to the new default once that choice no longer
    // applies to the active worktree's host.
    const allowedScopes = new Set<ExecutionHostScope>([
      LOCAL_EXECUTION_HOST_ID,
      ALL_EXECUTION_HOSTS_SCOPE,
      ...(activeExecutionHostScope ? [activeExecutionHostScope] : []),
      ...(args.availableExecutionHostScopes ?? [])
    ])
    if (!allowedScopes.has(executionHostScope)) {
      setExecutionHostScope(defaultExecutionHostScope)
      userChangedHostScopeRef.current = false
      return
    }
    if (!userChangedHostScopeRef.current && executionHostScope !== defaultExecutionHostScope) {
      setExecutionHostScope(defaultExecutionHostScope)
    }
  }, [
    activeExecutionHostScope,
    args.availableExecutionHostScopes,
    defaultExecutionHostScope,
    executionHostScope
  ])

  const handleExecutionHostScopeChange = (nextScope: ExecutionHostScope) => {
    userChangedHostScopeRef.current = nextScope !== defaultExecutionHostScope
    setExecutionHostScope(nextScope)
  }

  return {
    executionHostScope,
    activeExecutionHostScope,
    onExecutionHostScopeChange: handleExecutionHostScopeChange
  }
}

export function buildRuntimeAiVaultHostScopeOptions(
  runtimeEnvironments: readonly Pick<PublicKnownRuntimeEnvironment, 'id' | 'name'>[]
): AiVaultHostScopeOption[] {
  return runtimeEnvironments.map((environment) => {
    const id = toRuntimeExecutionHostId(environment.id)
    const label = environment.name.trim() || getExecutionHostLabel(id)
    return { id, label }
  })
}

export function buildAiVaultHostScopeOptions(args: {
  activeExecutionHostScope: ExecutionHostId | null
  runtimeHostOptions: readonly AiVaultHostScopeOption[]
}): AiVaultHostScopeOption[] {
  const options: AiVaultHostScopeOption[] = []
  const seen = new Set<ExecutionHostScope>()
  const add = (option: AiVaultHostScopeOption): void => {
    if (seen.has(option.id)) {
      return
    }
    seen.add(option.id)
    options.push(option)
  }
  const activeHost = args.activeExecutionHostScope
    ? parseExecutionHostId(args.activeExecutionHostScope)
    : null

  add({ id: LOCAL_EXECUTION_HOST_ID, label: getExecutionHostLabel(LOCAL_EXECUTION_HOST_ID) })
  for (const option of args.runtimeHostOptions) {
    add(option)
  }
  if (activeHost?.kind === 'runtime') {
    add({ id: activeHost.id, label: getExecutionHostLabel(activeHost.id) })
  }
  add({ id: ALL_EXECUTION_HOSTS_SCOPE, label: getExecutionHostLabel(ALL_EXECUTION_HOSTS_SCOPE) })

  return options
}
