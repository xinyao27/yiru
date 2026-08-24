import { repoIsRemote } from '~shared/agent/launch-remote'
import { isTuiAgent } from '~shared/tui-agent/config'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '~shared/tui-agent/launch-defaults'
import type { Worktree } from '~shared/types'

import { useAppStore } from '../store'
import { getAgentLaunchPlatformForRepo } from './agent-launch-platform'
import { getLocalProjectExecutionRuntimeContext } from './local-preflight-context'
import { CLIENT_PLATFORM } from './new-workspace'
import { tuiAgentToAgentKind } from './telemetry'
import { buildAgentStartupPlan } from './tui-agent-startup'
import type { WorktreeStartupPayload } from './worktree-activation-types'

export function buildCreatedAgentReopenStartup(
  worktree: Worktree
): WorktreeStartupPayload | undefined {
  const agent = worktree.createdWithAgent
  if (!isTuiAgent(agent)) {
    return undefined
  }
  const state = useAppStore.getState()
  const repo = state.repos.find((entry) => entry.id === worktree.repoId)
  const launchPlatform = repo
    ? getAgentLaunchPlatformForRepo(getLocalProjectExecutionRuntimeContext(state, worktree.id))
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
