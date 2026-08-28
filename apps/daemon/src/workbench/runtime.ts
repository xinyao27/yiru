import type { AnyRouter } from '@orpc/server'
import type { MinimalWebsocket } from '@orpc/server/websocket'
import type {
  RuntimeAgentStatusEvent,
  RuntimeHostProgressEvent,
  RuntimeRepo,
  RuntimeWorkspacePortScanResult
} from '@yiru/runtime-protocol/contract'
import type { AgentPhase, TuiAgent } from '@yiru/runtime-protocol/model/agent'

import type { WorkspaceEventLog } from '../events/log'
import { createNativePlatformActions } from '../platform/actions'
import type { BunPtyProvider } from '../pty-provider/provider'
import type { WorkbenchAgentSession } from '../runtime/host/agent-sessions'
import { createBunWorkbenchRuntime } from '../runtime/host/bun-workbench-entry'
import type { DaemonRestart } from '../server/restart'
import { readSkillBundleArtifactSources } from '../skills/resources'

export type WorkbenchRuntimeBridge = {
  approveWorkbenchTerminal: (terminalHandle: string) => Promise<boolean>
  cleanupConnection: (connectionId: string) => void
  closeWorkbenchTerminal: (terminalHandle: string) => Promise<void>
  closeWorkbenchTerminals: (worktreeId: string) => Promise<void>
  createContext: (
    connectionId: string,
    transport: WorkbenchRuntimeConnectionTransport,
    identity?: WorkbenchRuntimeClientIdentity
  ) => Record<string, unknown>
  createRpcHandler: (router: AnyRouter) => WorkbenchRpcHandler
  findActiveWorkbenchAgent: (worktreeId: string) => string | null
  getWorkbenchAgentPhase: (terminalHandle: string) => AgentPhase | null
  handleBinary: (connectionId: string, payload: Uint8Array<ArrayBufferLike>) => boolean
  hasWorkbenchTerminal: (worktreeId: string, terminalHandle: string) => Promise<boolean>
  launchWorkbenchAgent: (
    worktreeId: string,
    prompt: string,
    title: string,
    agent?: TuiAgent
  ) => Promise<{ terminalHandle: string }>
  launchWorkbenchTerminal: (
    worktreeId: string,
    title: string,
    command?: string
  ) => Promise<{ terminalHandle: string }>
  listWorkbenchAgentSessions: (worktreeId?: string) => Promise<WorkbenchAgentSession[]>
  listRepos: () => RuntimeRepo[]
  onAgentStatusEvent: (listener: (event: RuntimeAgentStatusEvent) => void) => () => void
  onHostProgressEvent: (listener: (event: RuntimeHostProgressEvent) => void) => () => void
  onReposChanged: (listener: () => void) => () => void
  readWorktreeChangeCount: (worktreeId: string) => Promise<number>
  readWorkbenchSessionContext: (
    worktreeIds: ReadonlySet<string>,
    maxChars?: number
  ) => Promise<string>
  router: AnyRouter
  requestBrowserCommand: <TResult>(method: string, input: unknown) => Promise<TResult>
  runtimeId: string
  scanWorkspacePorts: (repoId?: string) => Promise<RuntimeWorkspacePortScanResult>
  sendWorkbenchAgentPrompt: (terminalHandle: string, prompt: string) => Promise<boolean>
  shellServices: WorkbenchShellServicesBridge
  shutdown: () => Promise<void>
  startedAt: number
  terminalEnvironment: Record<string, string>
}

export type WorkbenchRuntimeClientIdentity =
  | { kind: 'extension' }
  | {
      kind: 'mobile'
      deviceId: string
      deviceToken: string
      isAuthorized: () => boolean
    }

export type WorkbenchRuntimeConnectionTransport = {
  bufferedBytes: () => number
  close: (code?: number, reason?: string) => void
  sendBinary: (payload: Uint8Array<ArrayBufferLike>) => boolean
}

export type WorkbenchRpcHandler = {
  close: (peer: MinimalWebsocket) => void
  message: (
    peer: MinimalWebsocket,
    payload: string | ArrayBuffer,
    context: Record<string, unknown>
  ) => Promise<void>
}

export type WorkbenchShellServicesTransport = {
  close: (code?: number) => void
  identity: object
  sendBinary: (payload: Uint8Array<ArrayBufferLike>) => boolean
  sendText: (payload: string) => boolean
}

export type WorkbenchShellServicesBridge = {
  close: (connectionId: string, transport: WorkbenchShellServicesTransport) => void
  handleMessage: (
    connectionId: string,
    message: string | Uint8Array<ArrayBufferLike>,
    transport: WorkbenchShellServicesTransport
  ) => boolean
}

export async function loadWorkbenchRuntime(
  userDataPath: string,
  terminals: BunPtyProvider,
  workspaceEventLog: WorkspaceEventLog,
  readMobileEndpoint: () => string | null,
  restartDaemon: DaemonRestart
): Promise<WorkbenchRuntimeBridge> {
  const skillBundleArtifacts = await readSkillBundleArtifactSources()
  const bridge = await createBunWorkbenchRuntime({
    localPtyProvider: terminals,
    platformActions: createNativePlatformActions(),
    readMobileEndpoint,
    restartDaemon,
    skillBundleArtifacts,
    userDataPath,
    workspaceEventLog
  })
  if (!isWorkbenchRuntimeBridge(bridge)) {
    throw new Error('workbench_runtime_bundle_invalid')
  }
  return bridge
}

function isWorkbenchRuntimeBridge(value: unknown): value is WorkbenchRuntimeBridge {
  return (
    isRecord(value) &&
    typeof value.approveWorkbenchTerminal === 'function' &&
    typeof value.cleanupConnection === 'function' &&
    typeof value.closeWorkbenchTerminal === 'function' &&
    typeof value.closeWorkbenchTerminals === 'function' &&
    typeof value.createContext === 'function' &&
    typeof value.createRpcHandler === 'function' &&
    typeof value.findActiveWorkbenchAgent === 'function' &&
    typeof value.getWorkbenchAgentPhase === 'function' &&
    typeof value.handleBinary === 'function' &&
    typeof value.hasWorkbenchTerminal === 'function' &&
    typeof value.launchWorkbenchAgent === 'function' &&
    typeof value.launchWorkbenchTerminal === 'function' &&
    typeof value.listWorkbenchAgentSessions === 'function' &&
    typeof value.listRepos === 'function' &&
    typeof value.onAgentStatusEvent === 'function' &&
    typeof value.onHostProgressEvent === 'function' &&
    typeof value.onReposChanged === 'function' &&
    typeof value.readWorktreeChangeCount === 'function' &&
    typeof value.readWorkbenchSessionContext === 'function' &&
    isRecord(value.router) &&
    typeof value.requestBrowserCommand === 'function' &&
    typeof value.runtimeId === 'string' &&
    typeof value.scanWorkspacePorts === 'function' &&
    typeof value.sendWorkbenchAgentPrompt === 'function' &&
    isWorkbenchShellServicesBridge(value.shellServices) &&
    typeof value.shutdown === 'function' &&
    typeof value.startedAt === 'number' &&
    isStringRecord(value.terminalEnvironment)
  )
}

function isWorkbenchShellServicesBridge(value: unknown): value is WorkbenchShellServicesBridge {
  return (
    isRecord(value) &&
    typeof value.close === 'function' &&
    typeof value.handleMessage === 'function'
  )
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
