import { shellClient } from './shell-client'

export async function getRendererKeyboardInputSourceId(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return await shellClient.app.getKeyboardInputSourceId()
  } catch {
    // Why: input-source detection is advisory and can race renderer teardown.
    return null
  }
}
