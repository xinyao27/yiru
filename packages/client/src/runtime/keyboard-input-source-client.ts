export async function getRendererKeyboardInputSourceId(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return await window.api.app.getKeyboardInputSourceId()
  } catch {
    // Why: input-source detection is advisory and can race renderer teardown.
    return null
  }
}
