import { hostname } from 'node:os'
import { createInterface } from 'node:readline/promises'

import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { confirmConnectGrant, exchangeConnectGrant, revokeBrowserAccess } from './api'
import {
  browserAccessId,
  forgetConnectIdentity,
  listPairedBrowserAccess,
  loadOrCreateMachineIdentity,
  removePairedBrowserAccess,
  savePairedBrowserAccess
} from './identity'
import { runForegroundRelay } from './relay'

export const CONNECT_HANDLERS: Record<string, CommandHandler> = {
  connect: async ({ flags, json }) => {
    const pairGrant = flags.has('pair') ? getOptionalStringFlag(flags, 'pair') : undefined
    if (!pairGrant) {
      const access = listPairedBrowserAccess()
      if (access.length === 0) {
        throw new RuntimeClientError(
          'connect_not_paired',
          'This computer is not paired. Open https://app.yiru.ai and run the command shown there.'
        )
      }
      await runForegroundRelay(access, loadOrCreateMachineIdentity(), json)
      return
    }
    const identity = loadOrCreateMachineIdentity()
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
    savePairedBrowserAccess({
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
    await runForegroundRelay(listPairedBrowserAccess(), identity, json)
  },
  'connect access list': async ({ json }) => {
    const access = listPairedBrowserAccess().map((entry) => ({
      id: browserAccessId(entry.browser),
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
    const browserId = getRequiredStringFlag(flags, 'id')
    const access = listPairedBrowserAccess()
    const entry = access.find((candidate) => browserAccessId(candidate.browser) === browserId)
    if (!entry) {
      throw new RuntimeClientError(
        'connect_access_not_found',
        `Unknown browser access: ${browserId}`
      )
    }
    await revokeBrowserAccess({
      machineId: entry.machineId,
      browserId,
      identity: loadOrCreateMachineIdentity()
    })
    removePairedBrowserAccess(browserId)
    if (json) {
      console.log(JSON.stringify({ status: 'revoked', browserId }))
    } else {
      console.log(`Revoked browser access: ${browserId}`)
    }
  },
  'connect forget': async ({ json }) => {
    const access = listPairedBrowserAccess()
    if (access.length > 0) {
      const identity = loadOrCreateMachineIdentity()
      for (const entry of access) {
        await revokeBrowserAccess({
          machineId: entry.machineId,
          browserId: browserAccessId(entry.browser),
          identity
        })
      }
    }
    forgetConnectIdentity()
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
