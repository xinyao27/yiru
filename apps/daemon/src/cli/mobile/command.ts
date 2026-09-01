import { translate } from '../../i18n/translate'
import { hasFlag, requireFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'

export async function runMobileCommand(args: string[]): Promise<void> {
  if (args[0] !== 'pair') {
    throw new Error('mobile_action_unsupported')
  }
  const session = await connectCliRuntime(args)
  try {
    const result = await session.client.mobile.developmentPairing({
      address: requireFlag(args, '--address'),
      deviceName: requireFlag(args, '--device-name')
    })
    writeCliOutput(
      result,
      hasFlag(args, '--json'),
      translate('Open this pairing link on Yiru Mobile: {{url}}', { url: result.pairingUrl })
    )
  } finally {
    session.close()
  }
}
