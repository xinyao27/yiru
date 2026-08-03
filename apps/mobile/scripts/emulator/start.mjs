#!/usr/bin/env node
/**
 * Start Yiru Mobile server and load it in the iOS emulator.
 * Looks for emulators in the given worktree.
 *
 * Usage:
 *   node scripts/emulator/start.mjs [--worktree <path>] [--device <name>]
 *
 * Options:
 *   --worktree <path>  Worktree path (default: auto-detect)
 *   --device <name>    Device name (default: 'iPhone 17 Pro')
 *   --port <port>      Metro port (default: first available from 8081)
 *   --no-open          Don't open the app URL automatically
 *   --no-pair          Don't create a temporary paired desktop runtime
 *   --pair-desktop     Pair with the visible development desktop runtime
 *   --ui-lab           Skip pairing and open the development-only UI Lab
 *   --wait-for-ready   Wait for Metro to be ready before opening URL
 *   --screenshot       Take a screenshot after opening
 */

import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { ensureMobileExpoCli, getMobileExpoExecutablePath } from '../expo-cli.mjs'
import { ensureDevelopmentClient } from './development-client.mjs'
import { waitForDevelopmentDesktopPairing } from './development-pairing.mjs'
import { findIosSimulatorDevice } from './device.mjs'
import {
  devClientUrlForMetroUrl,
  findReachableMetroUrl,
  lanIpCandidates,
  startMetro
} from './metro.mjs'
import {
  registerWorktreeForPairingRuntime,
  startHeadlessPairingRuntime
} from './pairing-runtime.mjs'

const execFileAsync = promisify(execFile)
const RUN_MODE = {
  temporaryRuntime: 'temporary-runtime',
  developmentDesktop: 'development-desktop',
  unpaired: 'unpaired',
  uiLab: 'ui-lab'
}

// Parse CLI arguments
const args = process.argv.slice(2)
const options = {
  worktree: null,
  device: 'iPhone 17 Pro',
  port: null,
  open: true,
  mode: RUN_MODE.temporaryRuntime,
  waitForReady: false,
  screenshot: false
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--worktree' && i + 1 < args.length) {
    options.worktree = args[++i]
  } else if (arg === '--device' && i + 1 < args.length) {
    options.device = args[++i]
  } else if (arg === '--port' && i + 1 < args.length) {
    options.port = args[++i]
  } else if (arg === '--no-open') {
    options.open = false
  } else if (arg === '--no-pair') {
    options.mode = RUN_MODE.unpaired
  } else if (arg === '--pair-desktop') {
    options.mode = RUN_MODE.developmentDesktop
  } else if (arg === '--ui-lab') {
    options.mode = RUN_MODE.uiLab
  } else if (arg === '--wait-for-ready') {
    options.waitForReady = true
  } else if (arg === '--screenshot') {
    options.screenshot = true
  } else if (arg === '--help' || arg === '-h') {
    console.log(`Usage: node scripts/emulator/start.mjs [options]

Options:
  --worktree <path>  Worktree path (default: auto-detect)
  --device <name>    Device name (default: 'iPhone 17 Pro')
  --port <port>      Metro port (default: first available from 8081)
  --no-open          Don't open the app URL automatically
  --no-pair          Don't create a temporary paired desktop runtime
  --pair-desktop     Pair with the visible development desktop runtime
  --ui-lab           Skip pairing and open the development-only UI Lab
  --wait-for-ready   Wait for Metro to be ready before opening URL
  --screenshot       Take a screenshot after opening
  --help, -h         Show this help message
`)
    process.exit(0)
  }
}

const YIRU_CLI = process.env.YIRU_CLI || 'yiru'

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logStep(step, message) {
  log(`[${step}] ${message}`, 'cyan')
}

function logError(message) {
  log(`[error] ${message}`, 'red')
}

function logSuccess(message) {
  log(`[ok] ${message}`, 'green')
}

function logInfo(message) {
  log(`[info] ${message}`, 'yellow')
}

function assertIosSimulatorPlatform() {
  if (process.platform !== 'darwin') {
    throw new Error('iOS Simulator automation requires macOS and Xcode.')
  }
}

// Execute yiru CLI command
async function yiru(args, options = {}) {
  const { stdout, stderr } = await execFileAsync(YIRU_CLI, args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: 'utf8',
    timeout: options.timeout || 30000
  })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

// Get worktree path - either from CLI or auto-detect
async function getWorktree() {
  if (options.worktree) {
    return path.resolve(options.worktree)
  }

  try {
    const { stdout } = await yiru(['worktree', 'current', '--json'])
    const result = JSON.parse(stdout)
    // Handle both response formats
    const worktreePath = result.worktree?.path || result.result?.worktree?.path
    if (worktreePath) {
      return worktreePath
    }
  } catch {
    // Why: workspace development starts Desktop in parallel, so its CLI may
    // not be reachable yet when Mobile resolves the repository root.
  }

  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    if (stdout.trim()) {
      return stdout.trim()
    }
  } catch {
    // Why: source archives without git metadata still need a usable fallback.
  }

  return process.cwd()
}

function getMobileDir(worktree) {
  const currentDir = process.cwd()
  if (!options.worktree && path.basename(currentDir) === 'mobile') {
    return currentDir
  }
  return path.join(worktree, 'apps', 'mobile')
}

async function ensureMobileDependencies(worktree) {
  const mobileDir = getMobileDir(worktree)
  await ensureMobileExpoCli(mobileDir, { logStep, logSuccess })
}

// Attach to emulator
async function attachEmulator(worktree, device, runtime) {
  logStep('1', `Attaching to emulator: ${device.name}`)

  try {
    await yiru(['emulator', 'attach', device.udid, '--worktree', worktree, '--focus', '--json'], {
      cwd: worktree,
      env: runtime?.env || process.env,
      timeout: 60000
    })
    logSuccess(`Attached to ${device.name}`)
  } catch (error) {
    logError(`Failed to attach to emulator: ${error.message}`)
    throw error
  }
}

async function bootIosSimulator(device) {
  logStep('1', `Booting simulator: ${device.name}`)
  await execFileAsync('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], { timeout: 120000 })
  await execFileAsync('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', device.udid])
  logSuccess(`Booted ${device.name}`)
}

// Open the app in the simulator
async function openInSimulator(url, deviceUdid) {
  logStep('3', 'Opening app in simulator...')

  const fullUrl = devClientUrlForMetroUrl(url)

  try {
    await execFileAsync('xcrun', ['simctl', 'openurl', deviceUdid, fullUrl])
    logSuccess('Opened app in simulator')
  } catch (error) {
    logError(`Failed to open app: ${error.message}`)
    throw error
  }
}

async function openPairingUrlInSimulator(pairingUrl, deviceUdid, runtime, worktree) {
  if (!pairingUrl || !options.open) {
    return
  }

  logStep('4', 'Pairing mobile app to desktop runtime...')
  await execFileAsync('xcrun', ['simctl', 'openurl', deviceUdid, pairingUrl])
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Why: the first deep link can arrive while the freshly opened Expo app is
  // still mounting, so resend it once the JS router is ready to receive URLs.
  await execFileAsync('xcrun', ['simctl', 'openurl', deviceUdid, pairingUrl])
  await new Promise((resolve) => setTimeout(resolve, 2000))

  if (options.mode === RUN_MODE.developmentDesktop) {
    logSuccess('Opened pairing link with development auto-confirm enabled')
    return
  }

  // Why: the mobile app intentionally asks for a trust confirmation before
  // saving a host. This lands on the Pair button on current iPhone simulators.
  await yiru(['emulator', 'tap', '0.5', '0.56', '--worktree', worktree, '--json'], {
    cwd: worktree,
    env: runtime?.env || process.env,
    timeout: 30000
  })
  logSuccess('Opened pairing link and confirmed Pair')
}

// Take a screenshot
async function takeScreenshot(
  deviceUdid,
  outputPath = path.join(os.tmpdir(), 'yiru-mobile-ios.png')
) {
  logStep('4', 'Taking screenshot...')

  try {
    await execFileAsync('xcrun', ['simctl', 'io', deviceUdid, 'screenshot', outputPath])
    logSuccess(`Screenshot saved to: ${outputPath}`)
    return outputPath
  } catch (error) {
    logError(`Failed to take screenshot: ${error.message}`)
    return null
  }
}

// Main function
async function main() {
  log(`${colors.bright}Starting Yiru Mobile in Emulator\n${colors.reset}`)
  let pairingRuntime = null

  try {
    assertIosSimulatorPlatform()

    // Get worktree
    const worktree = await getWorktree()
    logInfo(`Using worktree: ${worktree}`)
    await ensureMobileDependencies(worktree)

    pairingRuntime = await startHeadlessPairingRuntime({
      enabled: options.mode === RUN_MODE.temporaryRuntime,
      yiruCli: YIRU_CLI,
      cwd: process.cwd(),
      lanIpCandidates,
      logStep,
      logSuccess
    })
    await registerWorktreeForPairingRuntime(pairingRuntime, worktree, {
      yiru,
      logStep,
      logSuccess
    })

    // Find best device
    const device = await findIosSimulatorDevice(options.device, logError)
    logInfo(`Using device: ${device.name} (${device.runtime})`)

    const developmentPairingUrl =
      options.mode === RUN_MODE.developmentDesktop
        ? await waitForDevelopmentDesktopPairing({
            device,
            logger: { info: logInfo, step: logStep, success: logSuccess },
            worktree,
            yiru
          })
        : null

    // Why: emulator helpers are worktree-scoped in Yiru; attach is idempotent
    // for the active worktree, while a global helper list cannot prove that.
    await (options.mode === RUN_MODE.uiLab || options.mode === RUN_MODE.developmentDesktop
      ? bootIosSimulator(device)
      : attachEmulator(worktree, device, pairingRuntime))

    if (options.mode === RUN_MODE.developmentDesktop) {
      const mobileDir = getMobileDir(worktree)
      const expoPath = getMobileExpoExecutablePath(mobileDir)
      if (!expoPath) {
        throw new Error('Mobile Expo CLI is missing after dependency setup.')
      }
      await ensureDevelopmentClient({
        device,
        expoPath,
        logger: { info: logInfo, success: logSuccess },
        mobileDir
      })
    }

    const metro = await startMetro({
      environment: options.mode,
      logger: {
        errorOutput: (line) => process.stderr.write(`${colors.red + line + colors.reset}\n`),
        info: logInfo,
        output: (line) => process.stdout.write(`${colors.dim + line + colors.reset}\n`),
        step: logStep
      },
      mobileDir: getMobileDir(worktree),
      requestedPort: options.port,
      waitForReady: options.waitForReady
    })
    logSuccess('Metro is running')

    // Verify Metro is reachable
    const reachableMetro = await findReachableMetroUrl(metro.url)
    if (reachableMetro.url !== metro.url) {
      logInfo(`Using reachable Metro URL: ${reachableMetro.url}`)
    }
    metro.url = reachableMetro.url

    if (!reachableMetro.reachable) {
      logError('Metro is not reachable from this machine.')
      logInfo('The app may still work if the simulator can access the LAN IP.')
    } else {
      logSuccess('Metro is reachable')
    }

    // Open in simulator
    if (options.open) {
      await openInSimulator(metro.url, device.udid)
      await openPairingUrlInSimulator(
        developmentPairingUrl ?? pairingRuntime?.pairingUrl,
        device.udid,
        pairingRuntime,
        worktree
      )
      if (options.mode === RUN_MODE.uiLab) {
        logSuccess('Opened UI Lab without pairing')
      }

      // Take screenshot if requested
      if (options.screenshot) {
        // Wait a moment for the app to load
        await new Promise((r) => setTimeout(r, options.mode === RUN_MODE.uiLab ? 8000 : 3000))
        await takeScreenshot(device.udid)
      }
    } else {
      logInfo(`Metro URL: ${metro.url}`)
      logInfo(`Dev-client URL: ${devClientUrlForMetroUrl(metro.url)}`)
      logInfo('Omit --no-open to automatically open in simulator')
    }

    log(`${colors.bright}\nSetup complete!${colors.reset}`)
    logInfo(
      options.mode === RUN_MODE.temporaryRuntime
        ? 'Press Ctrl+C to stop Metro and runtime'
        : 'Press Ctrl+C to stop Metro'
    )

    // Keep running until Metro exits
    await new Promise((resolve) => {
      let stopping = false
      let stopTimeout = null
      const finish = () => {
        if (stopTimeout) {
          clearTimeout(stopTimeout)
        }
        metro.process.off('exit', finish)
        process.off('SIGINT', stopMetro)
        process.off('SIGTERM', stopMetro)
        metro.closeOutput?.()
        pairingRuntime?.stop()
        resolve()
      }
      const stopMetro = () => {
        if (stopping) {
          finish()
          return
        }
        stopping = true
        metro.process.kill('SIGINT')
        stopTimeout = setTimeout(finish, 2000)
        stopTimeout.unref?.()
      }
      metro.process.once('exit', finish)
      if (metro.isExited()) {
        finish()
        return
      }
      process.once('SIGINT', stopMetro)
      process.once('SIGTERM', stopMetro)
    })
    process.exit(0)
  } catch (error) {
    pairingRuntime?.stop()
    logError(error.message)
    process.exit(1)
  }
}

main()
