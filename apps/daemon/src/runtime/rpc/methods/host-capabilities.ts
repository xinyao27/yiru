import type { AgentTrustInput } from '@yiru/runtime-protocol/contract'
import { markAgentWorkspaceTrusted } from '~main/agent-trust-presets'
import { isWslAvailable, listWslDistros } from '~main/hosts/capabilities'
import { isGitBashAvailable } from '~main/platform/git-bash'
import { isPwshAvailable } from '~main/platform/pwsh'

import type { RpcContext } from '../core'

export async function handleHostPlatform(
  _params: void,
  _context: RpcContext
): Promise<{ platform: NodeJS.Platform }> {
  return { platform: process.platform }
}

export async function handleHostWslIsAvailable(
  _params: void,
  _context: RpcContext
): Promise<boolean> {
  return isWslAvailable()
}

export async function handleHostWslListDistros(
  _params: void,
  _context: RpcContext
): Promise<string[]> {
  return listWslDistros()
}

export async function handleHostPwshIsAvailable(
  _params: void,
  _context: RpcContext
): Promise<boolean> {
  return isPwshAvailable()
}

export async function handleHostGitBashIsAvailable(
  _params: void,
  _context: RpcContext
): Promise<boolean> {
  return isGitBashAvailable()
}

export async function handleAgentTrustMarkTrusted(
  params: AgentTrustInput,
  _context: RpcContext
): Promise<void> {
  markAgentWorkspaceTrusted(params)
}
