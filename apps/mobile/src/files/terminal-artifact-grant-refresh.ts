import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import { isTerminalArtifactGrantError } from './terminal-artifact-grant-error'

type MobileFilePreviewClient = Pick<RpcClient, 'orpc'>

export type MobileTerminalArtifactPreviewSource = {
  source: 'terminalArtifact'
  worktreeId: string
  absolutePath: string
  grantId: string
  terminalHandle?: string
  pathText?: string
  cwd?: string
}

export type TerminalArtifactRetryOptions = {
  onTerminalArtifactSourceRefreshed?: (source: MobileTerminalArtifactPreviewSource) => void
  refreshGrant?: boolean
}

export async function refreshTerminalArtifactSourceAfterGrantFailure(
  client: MobileFilePreviewClient,
  source: MobileTerminalArtifactPreviewSource,
  error: unknown,
  options: TerminalArtifactRetryOptions = {}
): Promise<MobileTerminalArtifactPreviewSource | null> {
  if (!isTerminalArtifactGrantFailure(error, options)) {
    return null
  }
  let result: unknown
  try {
    result = await callRuntimeOrpc(client, (runtime) => runtime.files.resolveTerminalPath, {
      worktree: `id:${source.worktreeId}`,
      pathText: source.pathText ?? source.absolutePath,
      ...(source.cwd ? { cwd: source.cwd } : {}),
      ...(source.terminalHandle ? { terminal: source.terminalHandle } : {})
    })
  } catch {
    return null
  }
  if (!isTerminalArtifactResolution(result)) {
    return null
  }
  if (result.openTarget.absolutePath !== source.absolutePath) {
    return null
  }
  return {
    source: 'terminalArtifact',
    worktreeId: source.worktreeId,
    absolutePath: result.openTarget.absolutePath,
    grantId: result.openTarget.grantId,
    ...(source.terminalHandle ? { terminalHandle: source.terminalHandle } : {}),
    ...(source.pathText ? { pathText: source.pathText } : {}),
    ...(source.cwd ? { cwd: source.cwd } : {})
  }
}

function isTerminalArtifactGrantFailure(
  error: unknown,
  options: TerminalArtifactRetryOptions
): boolean {
  if (options.refreshGrant === false) {
    return false
  }
  return isTerminalArtifactGrantError(error instanceof Error ? error.message : String(error))
}

function isTerminalArtifactResolution(result: unknown): result is {
  exists: true
  isDirectory: false
  openTarget: { kind: 'absolute-file'; absolutePath: string; grantId: string }
} {
  if (!result || typeof result !== 'object') {
    return false
  }
  const resolution = result as {
    exists?: unknown
    isDirectory?: unknown
    openTarget?: { kind?: unknown; absolutePath?: unknown; grantId?: unknown }
  }
  return (
    resolution.exists === true &&
    resolution.isDirectory === false &&
    resolution.openTarget?.kind === 'absolute-file' &&
    typeof resolution.openTarget.absolutePath === 'string' &&
    typeof resolution.openTarget.grantId === 'string'
  )
}
