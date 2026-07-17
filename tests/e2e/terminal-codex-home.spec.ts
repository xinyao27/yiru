import { test, expect } from './helpers/yiru-app'
import {
  execInTerminal,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

type CodexHomeProbe = {
  codexHome: string | null
  yiruCodexHome: string | null
}

function readCodexHomeProbe(pageContent: string, marker: string): CodexHomeProbe | null {
  const match = new RegExp(`${marker}:(\\{[^\\r\\n]+\\})`).exec(pageContent)
  if (!match) {
    return null
  }
  return JSON.parse(match[1] ?? 'null') as CodexHomeProbe | null
}

test.describe('Terminal Codex runtime home', () => {
  test.beforeEach(async ({ yiruPage }) => {
    await waitForSessionReady(yiruPage)
    await waitForActiveWorktree(yiruPage)
    await ensureTerminalVisible(yiruPage)
  })

  test('terminal process receives the Yiru-managed Codex home', async ({ yiruPage }) => {
    await waitForActiveTerminalManager(yiruPage)
    const ptyId = await waitForActivePanePtyId(yiruPage)
    const marker = `__YIRU_CODEX_HOME_E2E_${Date.now()}__`
    const command = [
      'node -e',
      `"console.log('${marker}:' + JSON.stringify({codexHome: process.env.CODEX_HOME || null, yiruCodexHome: process.env.YIRU_CODEX_HOME || null}))"`
    ].join(' ')

    await execInTerminal(yiruPage, ptyId, command)

    let probe: CodexHomeProbe | null = null
    await expect
      .poll(
        async () => {
          probe = readCodexHomeProbe(await getTerminalContent(yiruPage), marker)
          return Boolean(
            probe?.codexHome &&
            probe.yiruCodexHome &&
            probe.codexHome === probe.yiruCodexHome &&
            /[\\/]codex-runtime-home[\\/]home$/.test(probe.codexHome)
          )
        },
        { timeout: 15_000, message: 'Terminal did not expose Yiru-managed Codex home env' }
      )
      .toBe(true)

    expect(probe?.codexHome).toBe(probe?.yiruCodexHome)
  })
})
