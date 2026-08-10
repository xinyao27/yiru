import { z } from 'zod'

import { OptionalString, requiredString } from './input-schema.js'

const AUDIO_BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/
const DICTATION_SAMPLE_RATE = 16_000
const PCM_BYTES_PER_SAMPLE = 2
const MAX_DICTATION_AUDIO_SECONDS = 5

export const MAX_DICTATION_AUDIO_CHUNK_BYTES =
  DICTATION_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * MAX_DICTATION_AUDIO_SECONDS
export const MAX_DICTATION_AUDIO_CHUNK_BASE64_LENGTH =
  Math.ceil(MAX_DICTATION_AUDIO_CHUNK_BYTES / 3) * 4

function isValidAudioBase64(value: string): boolean {
  return value.length % 4 !== 1 && AUDIO_BASE64_PATTERN.test(value)
}

export const SpeechDictationStartInputSchema = z.object({
  dictationId: requiredString('Missing dictation ID'),
  modelId: OptionalString
})

export const SpeechDictationChunkInputSchema = z.object({
  dictationId: requiredString('Missing dictation ID'),
  audioBase64: requiredString('Missing audio chunk')
    // Why: the runtime decodes into Buffer + Float32Array; reject oversized
    // chunks before allocation and keep parity with the mobile pending-audio budget.
    .refine(
      (value) => value.length <= MAX_DICTATION_AUDIO_CHUNK_BASE64_LENGTH,
      'Audio chunk is too large'
    )
    // Why: base64 decoders can silently drop malformed bytes, so malformed
    // mobile chunks must fail before corrupt PCM reaches the speech worker.
    .refine(isValidAudioBase64, 'Audio chunk must be base64'),
  sampleRate: z.number().finite().positive()
})

export const SpeechDictationHandleInputSchema = z.object({
  dictationId: requiredString('Missing dictation ID')
})

export const SpeechModelActionInputSchema = z.object({
  modelId: requiredString('Missing model ID')
})

export const SpeechDictationSetupInputSchema = z.object({
  enabled: z.boolean().optional(),
  modelId: OptionalString,
  dictationMode: z.enum(['toggle', 'hold']).optional()
})

export const SpeechOpenAiKeySaveInputSchema = z.object({
  apiKey: requiredString('Missing OpenAI API key')
})

export type SpeechDictationStartInput = z.output<typeof SpeechDictationStartInputSchema>
export type SpeechDictationChunkInput = z.output<typeof SpeechDictationChunkInputSchema>
export type SpeechDictationHandleInput = z.output<typeof SpeechDictationHandleInputSchema>
export type SpeechModelActionInput = z.output<typeof SpeechModelActionInputSchema>
export type SpeechDictationSetupInput = z.output<typeof SpeechDictationSetupInputSchema>
export type SpeechOpenAiKeySaveInput = z.output<typeof SpeechOpenAiKeySaveInputSchema>
