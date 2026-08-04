import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEVELOPMENT_CLIENT_BUNDLE_ID = 'com.xinyao27.yiru.mobile'

export async function ensureDevelopmentClient({ device, expoPath, logger, mobileDir }) {
  try {
    await execFileAsync(
      'xcrun',
      ['simctl', 'get_app_container', device.udid, DEVELOPMENT_CLIENT_BUNDLE_ID, 'app'],
      { timeout: 10_000 }
    )
    return
  } catch {
    logger.info('Yiru Mobile development client is not installed; building it once')
  }

  await runInherited(expoPath, ['run:ios', '--device', device.udid, '--no-bundler'], mobileDir)
  logger.success('Installed Yiru Mobile development client')
}

function runInherited(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} was terminated by ${signal}`))
      } else if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with code ${code}`))
      }
    })
  })
}
