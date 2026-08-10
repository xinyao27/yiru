import type { RuntimeSpeechEvent } from '@yiru/runtime-protocol/contract'

// Why: desktop microphone capture is registered by the shell IPC module, which
// owns its BrowserWindow-scoped session but no runtime handle. The runtime
// installs this publisher once at startup so lifecycle events share the same
// stream as remote dictation without moving microphone audio onto that stream.
let publish: (event: RuntimeSpeechEvent) => void = () => {}

export function setSpeechEventPublisher(publisher: (event: RuntimeSpeechEvent) => void): void {
  publish = publisher
}

export function publishSpeechEvent(event: RuntimeSpeechEvent): void {
  publish(event)
}
