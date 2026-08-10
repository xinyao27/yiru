import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { translateMain } from '~main/i18n/main-i18n'

import { ChromeCdpTransport } from './transport'

const ACTIVE_PORT_FILENAME = 'DevToolsActivePort'
const STARTUP_POLL_MS = 50
const STARTUP_TIMEOUT_MS = 15_000
const SHUTDOWN_TIMEOUT_MS = 3_000

export type ChromeProcessOptions = {
  additionalArguments?: readonly string[]
  persistentUserDataDirectory?: string
  resolveExecutablePath: () => Promise<string | null> | string | null
  startupTimeoutMs?: number
  userDataParentPath?: string
}

export type RunningChrome = {
  browserVersion: string
  transport: ChromeCdpTransport
  stop: () => Promise<void>
}

export async function startChromeProcess(options: ChromeProcessOptions): Promise<RunningChrome> {
  const executablePath = await options.resolveExecutablePath()
  if (!executablePath) {
    throw new Error(
      translateMain(
        'browser.chrome.notConfigured',
        'Chrome executable is not configured for this runtime host'
      )
    )
  }
  try {
    await access(executablePath, constants.X_OK)
  } catch {
    throw new Error(
      translateMain('browser.chrome.notAvailable', 'Chrome executable is not available: {{path}}', {
        path: executablePath
      })
    )
  }

  const persistentUserDataDirectory = options.persistentUserDataDirectory
  const userDataDirectory = persistentUserDataDirectory
    ? await mkdir(persistentUserDataDirectory, { recursive: true }).then(
        () => persistentUserDataDirectory
      )
    : await mkdtemp(join(options.userDataParentPath ?? tmpdir(), 'yiru-chrome-'))
  const removeUserDataDirectory = async (): Promise<void> => {
    if (!persistentUserDataDirectory) {
      await rm(userDataDirectory, { force: true, recursive: true })
    }
  }
  // Why: a cleanly stopped persistent Chrome profile leaves its discovery
  // file behind. Reading that stale port would race the replacement process.
  await rm(join(userDataDirectory, ACTIVE_PORT_FILENAME), { force: true })
  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(executablePath, buildArguments(userDataDirectory, options), {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch (error) {
    await removeUserDataDirectory()
    const reason = error instanceof Error ? error.message : String(error)
    throw chromeStartError(reason)
  }
  child.stdin.end()
  let diagnosticOutput = ''
  let spawnError: Error | null = null
  child.once('error', (error) => {
    spawnError = error
  })
  const appendDiagnostic = (chunk: Buffer): void => {
    diagnosticOutput = `${diagnosticOutput}${chunk.toString()}`.slice(-4_000)
  }
  child.stdout.on('data', appendDiagnostic)
  child.stderr.on('data', appendDiagnostic)

  try {
    const endpoint = await waitForDevToolsEndpoint(
      child,
      userDataDirectory,
      options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS,
      () => diagnosticOutput,
      () => spawnError
    )
    const transport = await ChromeCdpTransport.connect(endpoint)
    const version = await transport.send('Browser.getVersion')
    return {
      browserVersion: readBrowserVersion(version),
      transport,
      stop: async () => {
        if (transport.isConnected()) {
          await transport.send('Browser.close').catch(() => {})
        }
        transport.close()
        await waitForExit(child)
        await removeUserDataDirectory()
      }
    }
  } catch (error) {
    child.kill('SIGTERM')
    await waitForExit(child)
    await removeUserDataDirectory()
    throw error
  }
}

function buildArguments(userDataDirectory: string, options: ChromeProcessOptions): string[] {
  return [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDirectory}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--password-store=basic',
    '--use-mock-keychain',
    ...(options.additionalArguments ?? []),
    'about:blank'
  ]
}

async function waitForDevToolsEndpoint(
  child: ChildProcessWithoutNullStreams,
  userDataDirectory: string,
  timeoutMs: number,
  readDiagnostic: () => string,
  readSpawnError: () => Error | null
): Promise<string> {
  const activePortPath = join(userDataDirectory, ACTIVE_PORT_FILENAME)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const spawnError = readSpawnError()
    if (spawnError) {
      throw chromeStartError(spawnError.message)
    }
    if (child.exitCode !== null) {
      const diagnostic = readDiagnostic().trim()
      throw new Error(
        diagnostic
          ? translateMain(
              'browser.chrome.exitedWithDiagnostic',
              'Chrome exited before DevTools became ready: {{reason}}',
              { reason: diagnostic }
            )
          : translateMain(
              'browser.chrome.exitedBeforeReady',
              'Chrome exited before DevTools became ready (exit {{exitCode}})',
              { exitCode: child.exitCode }
            )
      )
    }
    try {
      const lines = (await readFile(activePortPath, 'utf8')).trim().split(/\r?\n/)
      const port = Number(lines[0])
      const socketPath = lines[1]
      if (Number.isInteger(port) && port > 0 && socketPath?.startsWith('/')) {
        return `ws://127.0.0.1:${port}${socketPath}`
      }
    } catch {
      // Why: Chrome writes the file atomically after its browser endpoint is listening.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, STARTUP_POLL_MS))
  }
  throw new Error(
    translateMain(
      'browser.chrome.startTimeout',
      'Timed out waiting {{timeoutMs}}ms for Chrome DevTools',
      { timeoutMs }
    )
  )
}

function readBrowserVersion(value: unknown): string {
  if (!isRecord(value) || typeof value.product !== 'string') {
    return 'unknown'
  }
  const separator = value.product.indexOf('/')
  return separator >= 0 ? value.product.slice(separator + 1) : value.product
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  if (await waitForExitUntil(child, SHUTDOWN_TIMEOUT_MS)) {
    return
  }
  child.kill('SIGTERM')
  if (await waitForExitUntil(child, SHUTDOWN_TIMEOUT_MS)) {
    return
  }
  // Why: only the exact Chrome child launched above is escalated; development Electron is untouched.
  child.kill('SIGKILL')
  await waitForExitUntil(child, SHUTDOWN_TIMEOUT_MS)
}

function waitForExitUntil(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const handleExit = (): void => {
      clearTimeout(timeout)
      resolve(true)
    }
    const timeout = setTimeout(() => {
      child.removeListener('exit', handleExit)
      resolve(false)
    }, timeoutMs)
    timeout.unref?.()
    child.once('exit', handleExit)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function chromeStartError(reason: string): Error {
  return new Error(
    translateMain('browser.chrome.startFailed', 'Could not start Chrome: {{reason}}', { reason })
  )
}
