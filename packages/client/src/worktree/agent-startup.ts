import { repoIsRemote } from '@yiru/runtime-protocol/workbench/agent/launch-remote'
import { isTuiAgent } from '@yiru/runtime-protocol/workbench/tui-agent/config'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@yiru/runtime-protocol/workbench/tui-agent/launch-defaults'
import type { Worktree } from '@yiru/runtime-protocol/workbench/types'

import { getAgentLaunchPlatformForRepo } from '../agent/launch-platform'
import { buildAgentStartupPlan } from '../agent/tui-startup'
import { CLIENT_PLATFORM } from '../new-workspace/workspace-creation'
import { getLocalProjectExecutionRuntimeContext } from '../preflight/context'
import { readProjectCatalogRuntimeState } from '../project-catalog/runtime-state'
import { useAppStore } from '../store/state'
import { tuiAgentToAgentKind } from '../telemetry/client'
import type { WorktreeStartupPayload } from './activation-types'

export function buildCreatedAgentReopenStartup(
  worktree: Worktree
): WorktreeStartupPayload | undefined {
  const agent = worktree.createdWithAgent
  if (!isTuiAgent(agent)) {
    return undefined
  }
  const state = useAppStore.getState()
  const runtimeState = readProjectCatalogRuntimeState()
  const repo = runtimeState.repos.find((entry) => entry.id === worktree.repoId)
  const launchPlatform = repo
    ? getAgentLaunchPlatformForRepo(
        getLocalProjectExecutionRuntimeContext(runtimeState, worktree.id)
      )
    : CLIENT_PLATFORM
  const startupPlan = buildAgentStartupPlan({
    agent,
    prompt: '',
    cmdOverrides: state.settings?.agentCmdOverrides ?? {},
    agentArgs: resolveTuiAgentLaunchArgs(agent, state.settings?.agentDefaultArgs),
    agentEnv: resolveTuiAgentLaunchEnv(agent, state.settings?.agentDefaultEnv),
    platform: launchPlatform,
    isRemote: repo ? repoIsRemote(repo) : false,
    allowEmptyPromptLaunch: true
  })
  if (!startupPlan) {
    return undefined
  }
  return {
    command: startupPlan.launchCommand,
    ...(startupPlan.env ? { env: startupPlan.env } : {}),
    launchConfig: startupPlan.launchConfig,
    launchAgent: agent,
    ...(startupPlan.sessionOptions ? { sessionOptions: startupPlan.sessionOptions } : {}),
    ...(startupPlan.startupCommandDelivery
      ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
      : {}),
    telemetry: {
      agent_kind: tuiAgentToAgentKind(agent),
      launch_source: 'sidebar',
      request_kind: 'resume'
    }
  }
}
