import { mkdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { agentHookServer } from '~main/agent-hooks/server'
import { startDaemon, type DaemonHandle } from '~main/daemon/main'
import { createPtySubprocess } from '~main/daemon/pty-subprocess'
import { getDaemonSocketPath, getDaemonTokenPath } from '~main/daemon/spawner'
import { getEndpointFileName } from '~shared/agent/hook-listener'

export type NodeRuntimeHostDaemon = {
  agentHookEndpointFile: string
  agentHookPort: number
  endpoint: string
  tokenPath: string
  restart: () => Promise<void>
  shutdown: () => Promise<void>
}

export async function startNodeRuntimeHostDaemon(
  userDataPath: string,
  onShutdownRequested: () => void
): Promise<NodeRuntimeHostDaemon> {
  // Why: one user-data root may briefly host two runtime versions during an
  // update. The pid scope prevents either process from unlinking or replacing
  // the other's PTY socket, token, or hook endpoint.
  const hostDirectory = join(userDataPath, 'rh', String(process.pid))
  const agentHookDirectory = join(hostDirectory, 'hooks')
  const agentHookEndpointFile = join(agentHookDirectory, getEndpointFileName())
  mkdirSync(agentHookDirectory, { recursive: true, mode: 0o700 })
  const endpoint = getDaemonSocketPath(hostDirectory)
  const tokenPath = getDaemonTokenPath(hostDirectory)
  const paths = {
    agentHookDirectory,
    agentHookEndpointFile,
    endpoint,
    hostDirectory,
    tokenPath
  }
  const initialGeneration = await startDaemonGeneration(paths, onShutdownRequested)
  let generation: DaemonGeneration | null = initialGeneration
  let transition = Promise.resolve()
  const serialize = (operation: () => Promise<void>): Promise<void> => {
    const result = transition.then(operation, operation)
    transition = result.catch(() => {})
    return result
  }
  return {
    endpoint,
    tokenPath,
    agentHookPort: initialGeneration.agentHookPort,
    agentHookEndpointFile,
    restart: () =>
      serialize(async () => {
        const previousGeneration = generation
        generation = null
        if (previousGeneration) {
          await stopDaemonGeneration(previousGeneration, paths)
        }
        generation = await startDaemonGeneration(paths, onShutdownRequested)
      }),
    shutdown: () =>
      serialize(async () => {
        const currentGeneration = generation
        generation = null
        if (currentGeneration) {
          await stopDaemonGeneration(currentGeneration, paths)
        }
      })
  }
}

type DaemonGeneration = {
  agentHookPort: number
  handle: DaemonHandle
}

async function startDaemonGeneration(
  paths: HostArtifactPaths,
  onShutdownRequested: () => void
): Promise<DaemonGeneration> {
  mkdirSync(paths.agentHookDirectory, { recursive: true, mode: 0o700 })
  const handle = await startDaemon({
    socketPath: paths.endpoint,
    tokenPath: paths.tokenPath,
    spawnSubprocess: (options) => createPtySubprocess(options),
    agentHookHost: {
      endpointDir: paths.agentHookDirectory,
      env: process.env.NODE_ENV === 'production' ? 'production' : 'development'
    },
    isAgentHookHostRequired: true,
    onAgentHook: (envelope) => agentHookServer.ingestRemote(envelope, null),
    onShutdownRequested
  }).catch((error) => {
    removeHostArtifacts(paths)
    throw error
  })
  const agentHookHost = handle.agentHookHost
  if (!agentHookHost) {
    try {
      await handle.shutdown()
    } finally {
      removeHostArtifacts(paths)
    }
    throw new Error('The daemon started without its required agent hook host')
  }
  return {
    agentHookPort: agentHookHost.port,
    handle
  }
}

async function stopDaemonGeneration(
  generation: DaemonGeneration,
  paths: HostArtifactPaths
): Promise<void> {
  try {
    await generation.handle.shutdown()
  } finally {
    removeHostArtifacts(paths)
  }
}

type HostArtifactPaths = {
  agentHookDirectory: string
  agentHookEndpointFile: string
  endpoint: string
  hostDirectory: string
  tokenPath: string
}

function removeHostArtifacts(paths: HostArtifactPaths): void {
  removeOwnedFile(paths.endpoint)
  removeOwnedFile(paths.tokenPath)
  removeOwnedFile(paths.agentHookEndpointFile)
  removeOwnedDirectory(paths.agentHookDirectory)
  removeOwnedDirectory(paths.hostDirectory)
}

function removeOwnedFile(path: string): void {
  try {
    unlinkSync(path)
  } catch {}
}

function removeOwnedDirectory(path: string): void {
  try {
    rmdirSync(path)
  } catch {}
}
