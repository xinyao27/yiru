import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import type { RuntimeSpeechModelSummary, RuntimeSpeechSetupState } from '../mobile-runtime-types.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import type * as SpeechEvents from './speech-event.js'
import {
  SpeechDictationChunkInputSchema,
  SpeechDictationHandleInputSchema,
  SpeechDictationSetupInputSchema,
  SpeechDictationStartInputSchema,
  SpeechModelActionInputSchema,
  SpeechOpenAiKeySaveInputSchema
} from './speech-input.js'

export type RuntimeSpeechModelDownloadResult = { started: true }
export type RuntimeSpeechOpenAiKeyStatus = { configured: boolean }
export type RuntimeSpeechDictationStartResult = { dictationId: string; modelId: string }
export type RuntimeSpeechDictationHandleResult = { dictationId: string }
export type RuntimeSpeechDictationFinishResult = RuntimeSpeechDictationHandleResult & {
  text: string
}

const SPEECH_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const SPEECH_HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE = { mobile: true } as const

export const speechContract = {
  models: {
    list: withAccess(SPEECH_READ_ACCESS, MOBILE).output(type<RuntimeSpeechSetupState>()),
    download: withAccess(SPEECH_HOST_ACCESS, MOBILE)
      .input(SpeechModelActionInputSchema)
      .output(type<RuntimeSpeechModelDownloadResult>()),
    delete: withAccess(SPEECH_HOST_ACCESS, MOBILE)
      .input(SpeechModelActionInputSchema)
      .output(type<RuntimeSpeechSetupState>())
  },
  // Why: the OpenAI cloud models in `models.list` need a key configured on
  // this host before they're usable — same host-credential shape as
  // `models.download`, not window/renderer state, so it belongs here rather
  // than staying preload-only.
  openaiKey: {
    getStatus: withAccess(SPEECH_READ_ACCESS, MOBILE).output(type<RuntimeSpeechOpenAiKeyStatus>()),
    save: withAccess(SPEECH_HOST_ACCESS, MOBILE)
      .input(SpeechOpenAiKeySaveInputSchema)
      .output(type<RuntimeSpeechOpenAiKeyStatus>()),
    clear: withAccess(SPEECH_HOST_ACCESS, MOBILE).output(type<RuntimeSpeechOpenAiKeyStatus>())
  },
  dictation: {
    setup: withAccess(SPEECH_HOST_ACCESS, MOBILE)
      .input(SpeechDictationSetupInputSchema)
      .output(type<RuntimeSpeechSetupState>()),
    start: withAccess(SPEECH_HOST_ACCESS, MOBILE)
      .input(SpeechDictationStartInputSchema)
      .output(type<RuntimeSpeechDictationStartResult>()),
    chunk: withAccess(SPEECH_HOST_ACCESS, MOBILE)
      .input(SpeechDictationChunkInputSchema)
      .output(type<RuntimeSpeechDictationHandleResult>()),
    finish: withAccess(SPEECH_HOST_ACCESS, MOBILE)
      .input(SpeechDictationHandleInputSchema)
      .output(type<RuntimeSpeechDictationFinishResult>()),
    cancel: withAccess(SPEECH_HOST_ACCESS, MOBILE)
      .input(SpeechDictationHandleInputSchema)
      .output(type<RuntimeSpeechDictationHandleResult>())
  },
  // Why: read tier — the stream reports download/dictation state, it never
  // drives it (same reasoning as `agentStatus.events.subscribe`). One
  // subscription rather than six matches `browser.guestEvents.subscribe`:
  // a client wants the whole speech feed, and subscription state should scale
  // with clients, not with event kinds.
  events: {
    subscribe: withAccess(SPEECH_READ_ACCESS, MOBILE)
      .input(type<void>())
      .output(eventIterator(type<SpeechEvents.RuntimeSpeechSubscriptionEvent>()))
  }
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  MAX_DICTATION_AUDIO_CHUNK_BASE64_LENGTH,
  MAX_DICTATION_AUDIO_CHUNK_BYTES,
  SpeechDictationChunkInputSchema,
  SpeechDictationHandleInputSchema,
  SpeechDictationSetupInputSchema,
  SpeechDictationStartInputSchema,
  SpeechModelActionInputSchema,
  SpeechOpenAiKeySaveInputSchema
} from './speech-input.js'
export type {
  SpeechDictationChunkInput,
  SpeechDictationHandleInput,
  SpeechDictationSetupInput,
  SpeechDictationStartInput,
  SpeechModelActionInput,
  SpeechOpenAiKeySaveInput
} from './speech-input.js'
export type * from './speech-event.js'
export type { RuntimeSpeechModelSummary, RuntimeSpeechSetupState }
