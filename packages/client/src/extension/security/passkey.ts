import type { DangerousApprovalOperation } from '@yiru/runtime-protocol/contract'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { getExtensionRuntimeClient } from '../runtime/session'

export async function enrollDangerousApproval(): Promise<void> {
  const client = await getExtensionRuntimeClient()
  const begin = await client.dangerousApproval.beginRegistration({})
  const credential = await getExtensionBrowserCapabilities().createDangerousCredential(begin)
  await client.dangerousApproval.finishRegistration({
    ...credential,
    requestId: begin.requestId
  })
}

export async function confirmDangerousOperation(
  operation: DangerousApprovalOperation
): Promise<void> {
  const client = await getExtensionRuntimeClient()
  const status = await client.dangerousApproval.status({})
  if (!status.configured || !status.credentialId) {
    return
  }
  const begin = await client.dangerousApproval.beginApproval({ operation })
  const assertion = await getExtensionBrowserCapabilities().requestDangerousAssertion({
    challenge: begin.challenge,
    credentialId: status.credentialId
  })
  await client.dangerousApproval.finishApproval({
    ...assertion,
    operation,
    requestId: begin.requestId
  })
}

export async function removeDangerousApproval(): Promise<void> {
  await confirmDangerousOperation('security.manage-passkey')
  await (await getExtensionRuntimeClient()).dangerousApproval.remove({})
}
