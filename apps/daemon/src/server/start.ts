import { mkdirSync } from 'node:fs'

import { getRepoIdFromWorktreeId } from '@yiru/runtime-protocol/model/workspace'

import { ArtifactStore } from '../artifacts/store'
import { BrowserReplayStore } from '../browser-replay/store'
import { BrowserWritebackService } from '../browser-writeback/service'
import { parseDaemonOptions } from '../cli/daemon-options'
import { WorkspaceEventLog } from '../events/log'
import { persistWorkbenchEvents } from '../events/workbench-events'
import { WorktreeArchiveService } from '../git/repo/archive'
import { WorktreeArchiveStore } from '../git/repo/archive-store'
import { WorktreeCatalog } from '../git/worktree/worktrees'
import { GitHubCommentDrafter } from '../github-comment/draft'
import { HostRegistry } from '../hosts/registry'
import { HostStore } from '../hosts/store'
import { translate } from '../i18n/translate'
import { LayoutService } from '../layouts/service'
import { MobileDeviceStore } from '../mobile/devices'
import { loadOrCreateMobileKeypair } from '../mobile/keypair'
import { MobilePairing } from '../mobile/pairing'
import { startMobileServer } from '../mobile/server'
import { writeExtensionBootstrap } from '../native-messaging/bootstrap-file'
import { NotificationService } from '../notifications/service'
import { WorkspacePortService } from '../ports/service'
import { ProjectStore } from '../projects/store'
import { BunPtyProvider } from '../pty-provider/provider'
import { RitualScheduler } from '../rituals/scheduler'
import { RitualService } from '../rituals/service'
import { RitualScheduleStore } from '../rituals/store'
import { createDaemonRouter } from '../rpc/router'
import { type RuntimeMetadata, writeRuntimeMetadata } from '../runtime/metadata'
import { SearchService } from '../search/service'
import { DangerousCredentialStore } from '../security/credential-store'
import { DangerousApprovalService } from '../security/dangerous-approval'
import { AgentSessionService } from '../sessions/service'
import { AgentSessionStore } from '../sessions/store'
import { SkillCatalogService } from '../skills/catalog'
import { DaemonDatabase } from '../store/database'
import { DaemonUpdateService } from '../updates/service'
import { VisualRegressionService } from '../visual-regression/service'
import { VisualRegressionStore } from '../visual-regression/store'
import { mergeWorkbenchRouters } from '../workbench/router'
import { loadWorkbenchRuntime } from '../workbench/runtime'
import { installDaemonExitHandlers } from './exit-handlers'
import { startExtensionServer } from './extension-server'
import { notifySupervisorReady, printReadiness, shutdownDaemon } from './lifecycle'
import { readAllowedExtensionOrigins } from './origin'
import { createDaemonRestart } from './restart'

export async function startDaemon(argv: string[]): Promise<void> {
  const options = parseDaemonOptions(argv)
  const restartDaemon = createDaemonRestart(options.userDataPath, argv)
  const allowedExtensionOrigins = readAllowedExtensionOrigins(process.env)
  mkdirSync(options.userDataPath, { recursive: true, mode: 0o700 })
  const database = new DaemonDatabase(options.userDataPath)
  const events = new WorkspaceEventLog(database)
  const hosts = new HostRegistry(new HostStore(database), events)
  let connectedExtensionClientCount = (): number => 0
  let isMobileDeviceConnected = (_deviceId: string): boolean => false
  const devices = new MobileDeviceStore(database)
  const notifications = new NotificationService({
    database,
    devices,
    events,
    gatewayEndpoint: process.env.YIRU_APNS_GATEWAY_URL,
    gatewayToken: process.env.YIRU_APNS_GATEWAY_TOKEN,
    hasChromeClient: () => connectedExtensionClientCount() > 0,
    isMobileDeviceConnected: (deviceId) => isMobileDeviceConnected(deviceId)
  })
  const terminals = new BunPtyProvider({
    hosts,
    onLifecycleEvent: (event) => {
      const scope = event.worktreeId ? getRepoIdFromWorktreeId(event.worktreeId) : 'daemon'
      events.append(scope, event.kind, {
        sessionId: event.sessionId,
        ...(event.kind === 'terminal.exited' ? { exitCode: event.exitCode } : {})
      })
    }
  })
  let mobileEndpoint: string | null = null
  let workbenchRuntime
  try {
    workbenchRuntime = await loadWorkbenchRuntime(
      options.userDataPath,
      terminals,
      events,
      () => mobileEndpoint,
      restartDaemon
    )
  } catch (error) {
    await terminals.shutdownAll()
    database.close()
    throw error
  }
  const runtimeId = workbenchRuntime.runtimeId
  const startedAt = workbenchRuntime.startedAt
  terminals.configureEnvironment(workbenchRuntime.terminalEnvironment)
  const projects = new ProjectStore(database, hosts)
  projects.syncWorkbenchCatalog(workbenchRuntime.listRepos())
  const detachProjectCatalog = workbenchRuntime.onReposChanged(() => {
    projects.syncWorkbenchCatalog(workbenchRuntime.listRepos())
  })
  const artifacts = new ArtifactStore(database, options.userDataPath)
  const browserReplays = new BrowserReplayStore(database)
  const worktrees = new WorktreeCatalog(projects, hosts)
  const worktreeArchives = new WorktreeArchiveService({
    events,
    hosts,
    projects,
    runtime: workbenchRuntime,
    store: new WorktreeArchiveStore(database),
    worktrees
  })
  const agentSessions = new AgentSessionService(
    new AgentSessionStore(database),
    workbenchRuntime,
    hosts,
    worktrees
  )
  const layouts = new LayoutService(worktrees, workbenchRuntime, agentSessions, events, hosts)
  const githubCommentDrafter = new GitHubCommentDrafter(
    projects,
    worktrees,
    workbenchRuntime,
    hosts
  )
  const workspacePorts = new WorkspacePortService(workbenchRuntime)
  const visualRegression = new VisualRegressionService(
    new VisualRegressionStore(database, options.userDataPath, artifacts),
    workspacePorts
  )
  const browserWriteback = new BrowserWritebackService(
    worktrees,
    workbenchRuntime,
    workspacePorts,
    hosts
  )
  const rituals = new RitualService(
    projects,
    worktrees,
    workbenchRuntime,
    events,
    hosts,
    worktreeArchives,
    new RitualScheduleStore(database)
  )
  const ritualScheduler = new RitualScheduler(rituals)
  const search = new SearchService(projects, worktrees, hosts)
  const skills = new SkillCatalogService(projects, hosts)
  const dangerousApproval = new DangerousApprovalService(
    new DangerousCredentialStore(database),
    allowedExtensionOrigins
  )
  const keypair = loadOrCreateMobileKeypair(options.userDataPath)
  const pairing = new MobilePairing({
    devices,
    publicKeyB64: keypair.publicKeyB64,
    readEndpoint: () => mobileEndpoint
  })
  const daemonRouter = createDaemonRouter({
    agentSessions,
    artifacts,
    browserCommands: workbenchRuntime.requestBrowserCommand,
    browserReplays,
    browserWriteback,
    dangerousApproval,
    events,
    githubCommentDrafter,
    hosts,
    layouts,
    mobileDevices: devices,
    mobilePairing: pairing,
    mobileNotifications: notifications.channel,
    projects,
    rituals,
    search,
    skills,
    updates: new DaemonUpdateService(),
    visualRegression,
    workbenchRuntime,
    worktrees,
    workspacePorts,
    worktreeArchives
  })
  const extensionRouter = mergeWorkbenchRouters(workbenchRuntime.router, daemonRouter)
  const authToken = crypto.getRandomValues(new Uint8Array(24)).toHex()
  const extensionServer = startExtensionServer({
    allowedOrigins: allowedExtensionOrigins,
    authToken,
    cleanupConnection: workbenchRuntime.cleanupConnection,
    createContext: workbenchRuntime.createContext,
    createRpcHandler: workbenchRuntime.createRpcHandler,
    hostname: options.listenAddress,
    port: options.rpcPort,
    router: extensionRouter,
    runtimeId,
    shellServices: workbenchRuntime.shellServices,
    handleBinary: workbenchRuntime.handleBinary,
    consumeArtifactTicket: (id, ticket) => artifacts.consumeDownloadTicket(id, ticket)
  })
  const detachWorkbenchEvents = persistWorkbenchEvents(workbenchRuntime, events, (input) =>
    notifications.publishAgentPhase(input)
  )
  connectedExtensionClientCount = extensionServer.connectedClientCount
  let mobileServer: ReturnType<typeof startMobileServer>
  try {
    mobileServer = startMobileServer({
      cleanupConnection: workbenchRuntime.cleanupConnection,
      createContext: workbenchRuntime.createContext,
      createRpcHandler: workbenchRuntime.createRpcHandler,
      devices,
      handleBinary: workbenchRuntime.handleBinary,
      keypair,
      port: options.port,
      router: extensionRouter,
      runtimeId
    })
    isMobileDeviceConnected = mobileServer.isDeviceConnected
    mobileEndpoint = mobileServer.endpoint
  } catch (error) {
    detachProjectCatalog()
    detachWorkbenchEvents()
    await extensionServer.shutdown()
    await workbenchRuntime.shutdown()
    await terminals.shutdownAll()
    database.close()
    throw error
  }

  const metadata: RuntimeMetadata = {
    authToken,
    pid: process.pid,
    runtimeId,
    startedAt,
    transports: [
      { endpoint: extensionServer.endpoint, kind: 'websocket' },
      { endpoint: mobileServer.endpoint, kind: 'websocket' }
    ]
  }
  try {
    writeExtensionBootstrap(options.userDataPath, process.pid, {
      authToken,
      endpoint: extensionServer.endpoint,
      protocolVersion: extensionServer.protocolVersion,
      runtimeId
    })
    writeRuntimeMetadata(options.userDataPath, metadata)
  } catch (error) {
    detachProjectCatalog()
    detachWorkbenchEvents()
    await mobileServer.shutdown()
    await extensionServer.shutdown()
    await workbenchRuntime.shutdown()
    await terminals.shutdownAll()
    database.close()
    throw error
  }

  const startupPairing = options.mobilePairing
    ? pairing.create({
        address: options.pairingAddress ?? endpointAddress(mobileServer.endpoint),
        deviceName: translate('Mobile runtime client')
      })
    : null
  printReadiness({
    extensionEndpoint: extensionServer.endpoint,
    json: options.json,
    mobileEndpoint: mobileServer.endpoint,
    pairingUrl: startupPairing?.pairingUrl ?? null,
    runtimeId
  })
  notifySupervisorReady(runtimeId)
  ritualScheduler.start()

  installDaemonExitHandlers(() =>
    shutdownDaemon({
      database,
      detachProjectCatalog,
      detachWorkbenchEvents,
      extensionServer,
      mobileServer,
      notifications,
      ritualScheduler,
      runtimeId,
      terminals,
      userDataPath: options.userDataPath,
      workbenchRuntime
    })
  )
}

function endpointAddress(endpoint: string): string {
  const url = new URL(endpoint)
  return `${url.hostname}:${url.port}`
}
