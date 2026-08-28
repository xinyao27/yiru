import { installMacOSComputerUseHelper } from '../../computer/macos-helper-install'
import { translate } from '../../i18n/translate'
import { installNativeMessagingHost } from '../../native-messaging/install'
import { installDaemonService } from '../../service/manager'
import { hasFlag } from '../arguments'
import { writeCliOutput } from '../output'

const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/yiru/mfgmfiabfncmdekmikepemddejoeihbf'

export async function runInstallCommand(args: string[]): Promise<void> {
  const json = hasFlag(args, '--json')
  const computerUse = await installMacOSComputerUseHelper()
  installNativeMessagingHost(['--silent'])
  const serviceInstalled = !hasFlag(args, '--no-service')
  if (serviceInstalled) {
    installDaemonService()
  }
  const extensionPageOpened = hasFlag(args, '--no-browser') ? false : await openExtensionPage()
  writeCliOutput(
    {
      extensionPageOpened,
      extensionUrl: CHROME_WEB_STORE_URL,
      computerUse,
      service: serviceInstalled ? 'running' : 'not-installed'
    },
    json,
    extensionPageOpened
      ? translate('Yiru is running. Confirm Add to Chrome in the opened Web Store page.')
      : translate(`Yiru is running. Install the Chrome extension: ${CHROME_WEB_STORE_URL}`)
  )
}

async function openExtensionPage(): Promise<boolean> {
  const command = browserOpenCommand()
  if (!command) {
    return false
  }
  try {
    const child = Bun.spawn(command, { stderr: 'ignore', stdin: 'ignore', stdout: 'ignore' })
    const exitCode = await child.exited
    return exitCode === 0
  } catch {
    return false
  }
}

function browserOpenCommand(): string[] | null {
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY) {
    return null
  }
  switch (process.platform) {
    case 'darwin':
      return ['/usr/bin/open', CHROME_WEB_STORE_URL]
    case 'linux': {
      if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
        return null
      }
      const opener = Bun.which('xdg-open')
      return opener ? [opener, CHROME_WEB_STORE_URL] : null
    }
    case 'win32':
      return [
        'powershell.exe',
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Start-Process -FilePath $args[0]',
        CHROME_WEB_STORE_URL
      ]
    default:
      return null
  }
}
