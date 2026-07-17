import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const RUNTIME_METADATA_FILE = 'yiru-runtime.json'
let yiruDevUserDataPath: string | null = null
let yiruServeProcess: ChildProcess | null = null
let yiruServeStdout = ''
let yiruServeStderr = ''

export type CliResult = {
  stdout: string
  stderr: string
}

type RunYiruCliOptions = {
  retryMissingRuntimeMetadata?: boolean
}

export async function runYiruCli(
  args: string[],
  options: RunYiruCliOptions = {}
): Promise<CliResult> {
  try {
    return await runYiruCliOnce(args)
  } catch (error) {
    if (
      options.retryMissingRuntimeMetadata !== false &&
      isMissingRuntimeMetadataError(args, error)
    ) {
      // Why: Windows CI can let the dev runtime exit while launching the
      // fixture app; reopen once so the desktop action gets a live runtime.
      await ensureYiruRuntimeLaunched()
      return await runYiruCliOnce(args)
    }
    throw error
  }
}

async function runYiruCliOnce(args: string[]): Promise<CliResult> {
  const devCli = join(process.cwd(), 'config/scripts/yiru-dev.mjs')
  const command = process.env.YIRU_COMPUTER_CLI ?? process.execPath
  const cliArgs = process.env.YIRU_COMPUTER_CLI ? args : [devCli, ...args]
  const env = { ...process.env }
  if (!process.env.YIRU_COMPUTER_CLI && !env.YIRU_DEV_USER_DATA_PATH) {
    env.YIRU_DEV_USER_DATA_PATH = await getComputerE2eYiruDevUserDataPath()
  }
  try {
    const result = await execFileAsync(command, cliArgs, {
      env,
      maxBuffer: 20 * 1024 * 1024
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
      const output = error as { message: string; stdout: string; stderr: string }
      throw new Error(`${output.message}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`)
    }
    throw error
  }
}

export async function ensureYiruRuntimeLaunched(): Promise<void> {
  if (!process.env.YIRU_COMPUTER_CLI && process.platform === 'win32') {
    await ensureYiruRuntimeServed()
    return
  }
  await runYiruCli(['open', '--json'], { retryMissingRuntimeMetadata: false })
  await waitForYiruRuntimeReady()
}

export async function stopYiruRuntime(): Promise<void> {
  const processToStop = yiruServeProcess
  if (!processToStop?.pid) {
    return
  }
  yiruServeProcess = null
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill.exe', ['/PID', String(processToStop.pid), '/T', '/F'])
    } catch {
      // The foreground test runtime may already have exited.
    }
    return
  }
  processToStop.kill()
}

export function parseJsonOutput<T>(stdout: string): T {
  return JSON.parse(stdout) as T
}

async function getComputerE2eYiruDevUserDataPath(): Promise<string> {
  if (!yiruDevUserDataPath) {
    // Why: the shared yiru-dev profile can keep an older runtime alive across
    // local test runs, making computer-use E2E exercise stale provider code.
    yiruDevUserDataPath = await mkdtemp(join(tmpdir(), 'yiru-computer-runtime-'))
  }
  return yiruDevUserDataPath
}

async function waitForYiruRuntimeReady(): Promise<void> {
  const userDataPath = await getComputerE2eYiruDevUserDataPath()
  const metadataPath = join(userDataPath, RUNTIME_METADATA_FILE)
  const deadline = Date.now() + 15000
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      await access(metadataPath)
      const status = parseJsonOutput<{
        result: { runtime: { reachable: boolean } }
      }>((await runYiruCli(['status', '--json'], { retryMissingRuntimeMetadata: false })).stdout)
      if (status.result.runtime.reachable) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }

  const detail = [
    lastError instanceof Error ? `Last error: ${lastError.message}` : null,
    yiruServeStdout.trim() ? `serve stdout: ${yiruServeStdout.trim()}` : null,
    yiruServeStderr.trim() ? `serve stderr: ${yiruServeStderr.trim()}` : null
  ]
    .filter(Boolean)
    .join(' ')
  throw new Error(`Yiru runtime metadata was not ready at ${metadataPath}.${detail}`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureYiruRuntimeServed(): Promise<void> {
  if (!yiruServeProcess || yiruServeProcess.exitCode !== null) {
    const devCli = join(process.cwd(), 'config/scripts/yiru-dev.mjs')
    const env = {
      ...process.env,
      YIRU_DEV_USER_DATA_PATH: await getComputerE2eYiruDevUserDataPath()
    }
    yiruServeStdout = ''
    yiruServeStderr = ''
    yiruServeProcess = spawn(process.execPath, [devCli, 'serve', '--no-pairing', '--json'], {
      env,
      windowsHide: true
    })
    yiruServeProcess.stdout?.on('data', (chunk) => {
      yiruServeStdout += String(chunk)
    })
    yiruServeProcess.stderr?.on('data', (chunk) => {
      yiruServeStderr += String(chunk)
    })
    yiruServeProcess.once('exit', () => {
      yiruServeProcess = null
    })
    process.once('exit', () => {
      yiruServeProcess?.kill()
    })
  }
  await waitForYiruRuntimeReady()
}

function isMissingRuntimeMetadataError(args: string[], error: unknown): boolean {
  if (args[0] !== 'computer') {
    return false
  }
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return false
  }
  const message = String((error as { message?: unknown }).message)
  return (
    message.includes('"code": "runtime_unavailable"') &&
    message.includes('Could not read Yiru runtime metadata')
  )
}
