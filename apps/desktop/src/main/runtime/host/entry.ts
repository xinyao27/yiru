import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { DaemonPtyAdapter } from '~main/daemon/pty-adapter'
import { setMainSystemLocaleProvider, setMainUiLanguage, translateMain } from '~main/i18n/main-i18n'
import { getNodeSystemLocale } from '~main/i18n/node-system-locale'
import type { RuntimeMetadata } from '~shared/runtime-bootstrap'
import type { ServeSupervisorMessage } from '~shared/serve-update-handoff'
import { UI_LANGUAGE_SYSTEM } from '~shared/ui-language'

import { clearRuntimeMetadataIfOwned, writeRuntimeMetadata } from '../metadata'
import { createRuntimeTransportMetadata } from '../rpc/transport-metadata'
import { UnixSocketTransport } from '../rpc/unix-socket-transport'
import { startNodeRuntimeHostDaemon } from './daemon-service'
import {
  createNodeRuntimeHostPathsProvider,
  getRuntimeHostPathsProvider,
  setRuntimeHostPathsProvider
} from './paths-provider'
import { printNodeRuntimeHostReadiness } from './serve-readiness'
import { createNodeRuntimeHostService } from './service'
import { createNodeRuntimeHostSocketHandler } from './socket-handler'
import { startNodeRuntimeHostWebService } from './web-service'

type RuntimeHostArgs = {
  json: boolean
  mobilePairing: boolean
  pairingAddress: string | null
  port: number
  preferPinnedPort: boolean
  userDataPath: string
}

const DEFAULT_WEB_SOCKET_PORT = 6768

class RuntimeHostArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuntimeHostArgumentError'
  }
}

function parseArgs(argv: string[]): RuntimeHostArgs {
  let json = false
  let mobilePairing = false
  let pairingAddress: string | null = null
  let port = DEFAULT_WEB_SOCKET_PORT
  let preferPinnedPort = false
  let userDataPath: string | null = null
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--json') {
      json = true
      continue
    }
    if (arg === '--mobile-pairing') {
      mobilePairing = true
      continue
    }
    if (arg === '--pairing-address') {
      pairingAddress = readOptionValue(argv, index, arg)
      index++
      continue
    }
    if (arg === '--port') {
      const rawPort = readOptionValue(argv, index, arg)
      const parsedPort = Number(rawPort)
      if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
        throw new RuntimeHostArgumentError(
          translateMain('runtimeHost.invalidPort', 'Invalid runtime host port: {{port}}', {
            port: rawPort
          })
        )
      }
      port = parsedPort
      preferPinnedPort = true
      index++
      continue
    }
    if (arg === '--user-data-path') {
      userDataPath = readOptionValue(argv, index, arg)
      index++
      continue
    }
    throw new RuntimeHostArgumentError(
      translateMain('runtimeHost.unknownOption', 'Unknown runtime host option: {{option}}', {
        option: arg
      })
    )
  }
  if (pairingAddress && !mobilePairing) {
    throw new RuntimeHostArgumentError(
      translateMain(
        'runtimeHost.pairingAddressRequiresMobile',
        '`--pairing-address` requires `--mobile-pairing`'
      )
    )
  }
  return {
    json,
    mobilePairing,
    pairingAddress,
    port,
    preferPinnedPort,
    userDataPath: resolve(userDataPath ?? createNodeRuntimeHostPathsProvider().userDataPath())
  }
}

function readOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('-')) {
    throw new RuntimeHostArgumentError(
      translateMain('runtimeHost.optionValueRequired', '`{{option}}` requires a value', { option })
    )
  }
  return value
}

async function main(): Promise<void> {
  setMainSystemLocaleProvider(getNodeSystemLocale)
  setMainUiLanguage(UI_LANGUAGE_SYSTEM)
  const args = parseArgs(process.argv.slice(2))
  setRuntimeHostPathsProvider(createNodeRuntimeHostPathsProvider(args.userDataPath))
  mkdirSync(args.userDataPath, { recursive: true, mode: 0o700 })

  let didRequestDaemonShutdown = false
  let requestHostExit: (() => void) | null = null
  const daemon = await startNodeRuntimeHostDaemon(args.userDataPath, () => {
    if (requestHostExit) {
      requestHostExit()
      return
    }
    didRequestDaemonShutdown = true
  })
  const ptyAdapter = new DaemonPtyAdapter({
    socketPath: daemon.endpoint,
    tokenPath: daemon.tokenPath
  })
  let service: ReturnType<typeof createNodeRuntimeHostService>
  try {
    service = createNodeRuntimeHostService(args.userDataPath, ptyAdapter, daemon.restart)
  } catch (error) {
    ptyAdapter.dispose()
    await daemon.shutdown().catch(() => {})
    throw error
  }
  const { runtime } = service
  const web = await startNodeRuntimeHostWebService({
    deviceName: translateMain('runtimeHost.webClient', 'Runtime web client'),
    mobilePairing: args.mobilePairing,
    pairingAddress: args.pairingAddress,
    port: args.port,
    preferPinnedPort: args.preferPinnedPort,
    runtime,
    userDataPath: args.userDataPath
  }).catch(async (error) => {
    await service.shutdown()
    ptyAdapter.dispose()
    await daemon.shutdown().catch(() => {})
    throw error
  })
  await service.attachCoworkingOwner(web.coworkingRuntimeRpc)
  const authToken = randomBytes(24).toString('hex')
  const transportMetadata = createRuntimeTransportMetadata(
    args.userDataPath,
    process.pid,
    process.platform,
    runtime.getRuntimeId()
  )
  const transport = new UnixSocketTransport({
    endpoint: transportMetadata.endpoint,
    kind: transportMetadata.kind
  })
  transport.onProtocol(
    createNodeRuntimeHostSocketHandler({
      runtime,
      authToken,
      mobileDevelopmentPairing: web.createDevelopmentMobilePairing
    })
  )

  const metadata: RuntimeMetadata = {
    runtimeId: runtime.getRuntimeId(),
    pid: process.pid,
    transports: [transportMetadata, { kind: 'websocket', endpoint: web.endpoint }],
    authToken,
    startedAt: runtime.getStartedAt()
  }
  try {
    await transport.start()
    writeRuntimeMetadata(args.userDataPath, metadata)
  } catch (error) {
    await transport.stop().catch(() => {})
    await web.shutdown().catch(() => {})
    await service.shutdown()
    ptyAdapter.dispose()
    await daemon.shutdown().catch(() => {})
    throw error
  }

  let shutdownPromise: Promise<void> | null = null
  const shutdown = async (): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise
    }
    shutdownPromise = (async () => {
      try {
        await transport.stop()
      } finally {
        try {
          await web.shutdown()
        } finally {
          try {
            await service.shutdown()
            ptyAdapter.dispose()
          } finally {
            try {
              await daemon.shutdown()
            } finally {
              clearRuntimeMetadataIfOwned(args.userDataPath, process.pid, runtime.getRuntimeId())
            }
          }
        }
      }
    })()
    return shutdownPromise
  }
  let isExitRequested = false
  const stopHost = (): void => {
    if (isExitRequested) {
      return
    }
    isExitRequested = true
    void shutdown().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(
          `[runtime-host] ${translateMain(
            'runtimeHost.shutdownFailed',
            'Runtime host shutdown failed'
          )}:`,
          error
        )
        process.exit(1)
      }
    )
  }
  requestHostExit = stopHost
  // Why: an interactive signal reaches the shared process group before the
  // CLI supervisor forwards it; keep the idempotent handler for both deliveries.
  process.on('SIGINT', stopHost)
  process.on('SIGTERM', stopHost)
  process.on('SIGHUP', stopHost)
  if (process.connected) {
    process.once('disconnect', stopHost)
  }
  if (didRequestDaemonShutdown) {
    stopHost()
    return
  }

  await printNodeRuntimeHostReadiness({
    capabilities: runtime.getStatus().capabilities ?? [],
    daemon: {
      agentHookEndpointFile: daemon.agentHookEndpointFile,
      agentHookPort: daemon.agentHookPort,
      endpoint: daemon.endpoint
    },
    json: args.json,
    mobilePairing: web.mobilePairing,
    pairingFile: web.pairingFile,
    runtimeId: runtime.getRuntimeId(),
    unixEndpoint: transportMetadata.endpoint,
    webEndpoint: web.endpoint
  })
  notifySupervisorReady(runtime.getRuntimeId())
}

function notifySupervisorReady(runtimeId: string): void {
  if (!process.send || process.connected === false) {
    return
  }
  const message: ServeSupervisorMessage = {
    type: 'yiru:serve-ready',
    version: getRuntimeHostPathsProvider().version(),
    runtimeId
  }
  try {
    process.send(message)
  } catch {
    // Why: parent-loss shutdown owns the lifecycle; readiness reporting is best effort.
  }
}

void main().catch((error: unknown) => {
  console.error(
    `[runtime-host] ${translateMain('runtimeHost.fatal', 'Runtime host failed')}:`,
    error instanceof RuntimeHostArgumentError ? error.message : error
  )
  process.exit(1)
})
