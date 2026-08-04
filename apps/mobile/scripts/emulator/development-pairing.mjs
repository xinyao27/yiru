const DESKTOP_WAIT_TIMEOUT_MS = 120_000
const DESKTOP_RETRY_INTERVAL_MS = 1_000

export async function waitForDevelopmentDesktopPairing({ device, logger, worktree, yiru }) {
  logger.step('0', 'Waiting for the development desktop runtime...')
  const startedAt = Date.now()
  let lastError = null
  let didLogWait = false

  while (Date.now() - startedAt < DESKTOP_WAIT_TIMEOUT_MS) {
    try {
      const { stdout } = await yiru(
        [
          'mobile',
          'development-pairing',
          '--address',
          '127.0.0.1',
          '--device-name',
          `iOS Simulator ${device.udid}`,
          '--json'
        ],
        { cwd: worktree, timeout: 5_000 }
      )
      const response = JSON.parse(stdout)
      const pairingUrl = response?.result?.pairingUrl
      if (typeof pairingUrl !== 'string' || pairingUrl.length === 0) {
        throw new Error('Development desktop returned no pairing URL')
      }
      logger.success('Development desktop runtime is ready')
      return pairingUrl
    } catch (error) {
      lastError = error
      if (!didLogWait) {
        didLogWait = true
        logger.info('Desktop is still starting; mobile will connect when it is ready')
      }
      await new Promise((resolve) => setTimeout(resolve, DESKTOP_RETRY_INTERVAL_MS))
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`Timed out waiting for the development desktop runtime${detail}`)
}
