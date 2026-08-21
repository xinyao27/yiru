import { hostname } from 'node:os'
import { createInterface } from 'node:readline/promises'

import {
  confirmConnectGrant,
  exchangeConnectGrant,
  revokeBrowserAccess
} from '~main/web-connect/grant-client'
import { createConnectIdentityStore } from '~main/web-connect/identity'
import { RuntimeClientError } from '~shared/runtime-client-error'

import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { getDefaultUserDataPath } from '../runtime-client'
import { runForegroundRelay } from './relay'

// Why: the CLI resolves the same userData directory Electron uses, so `yiru
// connect` and the app share one machine identity and one paired-browser list.
function connectStore(): ReturnType<typeof createConnectIdentityStore> {
  return createConnectIdentityStore(getDefaultUserDataPath())
}

export const CONNECT_HANDLERS: Record<string, CommandHandler> = {
  connect: async ({ flags, json }) => {
    const store = connectStore()
    const pairGrant = flags.has('pair') ? getOptionalStringFlag(flags, 'pair') : undefined
    if (!pairGrant) {
      if (store.listPairedBrowserAccess().length === 0) {
        throw new RuntimeClientError(
          'connect_not_paired',
          'This computer is not paired. Open https://app.yiru.ai and run the command shown there.'
        )
      }
      await runForegroundRelay(store, store.loadOrCreateMachineIdentity(), json)
      return
    }
    const identity = store.loadOrCreateMachineIdentity()
    const exchanged = await exchangeConnectGrant({
      grant: pairGrant,
      machineName: hostname(),
      machineKey: identity.publicKey
    })
    if (json) {
      console.log(
        JSON.stringify({
          status: 'verification-required',
          machineId: exchanged.machineId,
          verificationCode: exchanged.verificationCode,
          expiresAt: exchanged.expiresAt
        })
      )
    } else {
      console.log(`Verification code: ${exchanged.verificationCode}`)
      console.log('Confirm that the Web page shows the same code.')
    }
    if (flags.get('yes') !== true) {
      await confirmInteractively()
    }
    const confirmed = await confirmConnectGrant(exchanged, identity)
    store.savePairedBrowserAccess({
      machineId: confirmed.machineId,
      browser: confirmed.browser,
      pairedAt: Date.now(),
      usedRelayNonces: []
    })
    if (json) {
      console.log(JSON.stringify({ status: 'paired', machineId: confirmed.machineId }))
    } else {
      console.log('Paired securely. Connecting this computer now…')
    }
    await runForegroundRelay(store, identity, json)
  },
  'connect access list': async ({ json }) => {
    const store = connectStore()
    const access = store.listPairedBrowserAccess().map((entry) => ({
      id: store.browserAccessId(entry.browser),
      machineId: entry.machineId,
      pairedAt: entry.pairedAt
    }))
    if (json) {
      console.log(JSON.stringify({ access }))
      return
    }
    if (access.length === 0) {
      console.log('No browsers are paired with this computer.')
      return
    }
    for (const entry of access) {
      console.log(`${entry.id}\tpaired ${new Date(entry.pairedAt).toISOString()}`)
    }
  },
  'connect access revoke': async ({ flags, json }) => {
    const store = connectStore()
    const browserId = getRequiredStringFlag(flags, 'id')
    const entry = store
      .listPairedBrowserAccess()
      .find((candidate) => store.browserAccessId(candidate.browser) === browserId)
    if (!entry) {
      throw new RuntimeClientError(
        'connect_access_not_found',
        `Unknown browser access: ${browserId}`
      )
    }
    await revokeBrowserAccess({
      machineId: entry.machineId,
      browserId,
      identity: store.loadOrCreateMachineIdentity()
    })
    store.removePairedBrowserAccess(browserId)
    if (json) {
      console.log(JSON.stringify({ status: 'revoked', browserId }))
    } else {
      console.log(`Revoked browser access: ${browserId}`)
    }
  },
  'connect forget': async ({ json }) => {
    const store = connectStore()
    const access = store.listPairedBrowserAccess()
    if (access.length > 0) {
      const identity = store.loadOrCreateMachineIdentity()
      for (const entry of access) {
        await revokeBrowserAccess({
          machineId: entry.machineId,
          browserId: store.browserAccessId(entry.browser),
          identity
        })
      }
    }
    store.forgetConnectIdentity()
    if (json) {
      console.log(JSON.stringify({ status: 'forgotten' }))
    } else {
      console.log('Removed this computer identity and all paired browser access.')
    }
  }
}

async function confirmInteractively(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new RuntimeClientError(
      'confirmation_required',
      'Interactive verification is required. Re-run in a terminal, or pass --yes only after checking the code on the Web page.'
    )
  }
  const input = createInterface({ input: process.stdin, output: process.stdout })
  try {
    await input.question('Press Enter to confirm this browser, or Ctrl+C to cancel: ')
  } finally {
    input.close()
  }
}
