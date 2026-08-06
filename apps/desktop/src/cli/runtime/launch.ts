import { spawn as spawnProcess, type SpawnOptions } from 'node:child_process'
import { resolve } from 'node:path'

import { getMacAppBundlePath } from './mac-app-update-bundle'
import { getDefaultUserDataPath } from './metadata'
import {
  buildServeUpdateChildEnvironment,
  resolveServeUpdateHandoffLaunchPath
} from './serve-update-launch-config'
import {
  readServeUpdateHandoffSync,
  resumeInterruptedServeUpdate,
  superviseForegroundServe
} from './serve-update-supervisor'
import { RuntimeClientError } from './types'

export function launchYiruApp(): void {
  const overrideCommand = process.env.YIRU_OPEN_COMMAND
  if (typeof overrideCommand === 'string' && overrideCommand.trim().length > 0) {
    spawnDetached(overrideCommand, [], { shell: true })
    return
  }

  const overrideExecutable = process.env.YIRU_APP_EXECUTABLE
  if (typeof overrideExecutable === 'string' && overrideExecutable.trim().length > 0) {
    spawnDetached(overrideExecutable, getExecutableAppArgs(), {
      ...getExecutableSpawnOptions(overrideExecutable),
      env: stripElectronRunAsNode(process.env)
    })
    return
  }

  if (process.env.ELECTRON_RUN_AS_NODE === '1') {
    if (process.platform === 'darwin') {
      const appBundlePath = getMacAppBundlePath(process.execPath)
      if (appBundlePath) {
        // Why: launching the inner MacOS binary directly can trigger macOS app
        // launch failures and bypass normal bundle lifecycle. The public
        // packaged CLI should re-open the .app the same way Finder does.
        spawnDetached('open', [appBundlePath], {
          env: stripElectronRunAsNode(process.env)
        })
        return
      }
    }

    spawnDetached(process.execPath, [], {
      env: stripElectronRunAsNode(process.env)
    })
    return
  }

  throw new RuntimeClientError(
    'runtime_open_failed',
    'Could not determine how to launch Yiru. Start Yiru manually and try again.'
  )
}

function spawnDetached(command: string, args: string[], options: SpawnOptions): void {
  const child = spawnProcess(command, args, {
    detached: true,
    stdio: 'ignore',
    ...options
  })
  // Why: detached launch errors are reported asynchronously after this function
  // returns; openYiru already reports the user-facing timeout if startup fails.
  child.once('error', () => {})
  child.unref()
}

export function serveYiruApp(
  args: {
    json?: boolean
    port?: string | null
    pairingAddress?: string | null
    mobilePairing?: boolean
  } = {}
): Promise<number> {
  const executable = resolveForegroundYiruExecutable()
  const childArgs = [...getExecutableAppArgs(), '--serve']
  if (args.json) {
    childArgs.push('--serve-json')
  }
  if (args.port) {
    childArgs.push('--serve-port', args.port)
  }
  if (args.pairingAddress) {
    childArgs.push('--serve-pairing-address', args.pairingAddress)
  }
  if (args.mobilePairing) {
    childArgs.push('--serve-mobile-pairing')
  }

  const handoffPath = resolveServeUpdateHandoffLaunchPath({
    executable,
    userDataPath: getDefaultUserDataPath()
  })
  const childEnv = buildServeUpdateChildEnvironment(
    stripElectronRunAsNode(process.env),
    handoffPath
  )
  const spawnOptions: SpawnOptions = {
    cwd: resolveAppRoot(),
    stdio: handoffPath ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit',
    ...getExecutableSpawnOptions(executable),
    env: childEnv
  }
  const interruptedHandoff = handoffPath ? readServeUpdateHandoffSync(handoffPath) : null
  if (interruptedHandoff?.phase === 'install-requested') {
    // Why: the node-mode CLI remains alive while ShipIt replaces the app and
    // can recover an interrupted handoff after a service-manager restart.
    return resumeInterruptedServeUpdate({
      executable,
      childArgs,
      spawnOptions,
      spawnChild: spawnProcess,
      handoffPath: handoffPath!,
      handoff: interruptedHandoff
    })
  }
  const child = spawnProcess(executable, childArgs, spawnOptions)

  return superviseForegroundServe({
    executable,
    childArgs,
    spawnOptions,
    spawnChild: spawnProcess,
    child,
    handoffPath,
    expectedHandoff: null
  })
}

function getExecutableAppArgs(): string[] {
  return process.env.YIRU_APP_EXECUTABLE_NEEDS_APP_ROOT === '1' ? [resolveAppRoot()] : []
}

function getExecutableSpawnOptions(executable: string): Pick<SpawnOptions, 'shell'> {
  return process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable) ? { shell: true } : {}
}

function resolveAppRoot(): string {
  // Why: dev-mode resource resolution in the Electron child may consult
  // process.cwd(). Pin it to the app root so `yiru serve` behaves the same
  // regardless of the shell directory it was launched from.
  return resolve(__dirname, '../../..')
}

function resolveForegroundYiruExecutable(): string {
  const overrideExecutable = process.env.YIRU_APP_EXECUTABLE
  if (typeof overrideExecutable === 'string' && overrideExecutable.trim().length > 0) {
    return overrideExecutable
  }
  if (process.env.ELECTRON_RUN_AS_NODE === '1') {
    return process.execPath
  }
  throw new RuntimeClientError(
    'runtime_serve_failed',
    'Could not determine how to start the Yiru runtime host. Set YIRU_APP_EXECUTABLE to the Yiru executable.'
  )
}

export function stripElectronRunAsNode(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env }
  delete next.ELECTRON_RUN_AS_NODE
  return next
}
