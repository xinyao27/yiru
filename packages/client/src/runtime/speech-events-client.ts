import type { RuntimeSpeechEvent } from '@yiru/runtime-protocol/contract'
import type {
  SpeechErrorEvent,
  SpeechLifecycleEvent,
  SpeechTranscriptEvent
} from '~shared/speech-types'

import { createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'

export type SpeechDownloadEventHandlers = {
  onProgress: () => void
  onFailed: (modelId: string, error: string) => void
}

export type SpeechDictationEventHandlers = {
  onPartialTranscript: (event: SpeechTranscriptEvent) => void
  onFinalTranscript: (event: SpeechTranscriptEvent) => void
  onStopped: (event: SpeechLifecycleEvent) => void
  onError: (event: SpeechErrorEvent) => void
}

// Why: desktop mic audio remains shell-local, while lifecycle events share the
// runtime stream with remote dictation. This keeps transcripts off the shared
// transport's hot data path without retaining a WebContents-only event channel.
export function subscribeLocalSpeechDictationEvents(
  handlers: SpeechDictationEventHandlers
): () => void {
  return subscribeSpeechEvents({ kind: 'local' }, (event) => {
    if (event.type === 'dictationPartialTranscript') {
      handlers.onPartialTranscript({ sessionId: event.dictationId, text: event.text })
    } else if (event.type === 'dictationFinalTranscript') {
      handlers.onFinalTranscript({ sessionId: event.dictationId, text: event.text })
    } else if (event.type === 'dictationStopped') {
      handlers.onStopped({ sessionId: event.dictationId })
    } else if (event.type === 'dictationError') {
      handlers.onError({ sessionId: event.dictationId, error: event.error })
    }
  })
}

// Why: catalog CRUD already routes through `speech.models.*`, so download
// status shares the same host feed instead of a preload-only push.
export function subscribeLocalSpeechDownloadEvents(
  target: RuntimeClientTarget,
  handlers: SpeechDownloadEventHandlers
): () => void {
  return subscribeSpeechEvents(target, (event) => {
    if (event.type === 'downloadProgress') {
      handlers.onProgress()
    } else if (event.type === 'downloadFailed') {
      handlers.onFailed(event.modelId, event.error)
    }
  })
}

function subscribeSpeechEvents(
  target: RuntimeClientTarget,
  onEvent: (event: RuntimeSpeechEvent) => void
): () => void {
  const controller = new AbortController()
  void (async () => {
    let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
    try {
      connection = await createRuntimeOrpcClient(target, { signal: controller.signal })
      const stream = await connection.client.speech.events.subscribe(undefined, {
        signal: controller.signal
      })
      for await (const event of stream) {
        if (controller.signal.aborted) {
          return
        }
        if (event.type !== 'ready' && event.type !== 'end') {
          onEvent(event)
        }
      }
    } catch {
      // Why: unmounting aborts the iterator; transport shutdown must not surface
      // either case as an unhandled rejection from this background task.
    } finally {
      connection?.close()
    }
  })()
  return () => controller.abort()
}
