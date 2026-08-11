import { useAppStore } from '~renderer/store'

import { callRuntimeOrpc, isWebRuntimeClient } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

function activeTarget() {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

function encodePcm16(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function startRuntimeDictation(modelId: string, dictationId: string): Promise<void> {
  if (!isWebRuntimeClient()) {
    await window.api.speech.ensureMicrophoneAccess()
  }
  await callRuntimeOrpc(
    activeTarget(),
    (client) => client.speech.dictation.start,
    { dictationId, modelId },
    { timeoutMs: 30_000 }
  )
}

export async function feedRuntimeDictationAudio(
  samples: Float32Array,
  sampleRate: number,
  dictationId: string
): Promise<void> {
  await callRuntimeOrpc(activeTarget(), (client) => client.speech.dictation.chunk, {
    dictationId,
    audioBase64: encodePcm16(samples),
    sampleRate
  })
}

export async function finishRuntimeDictation(dictationId: string): Promise<void> {
  await callRuntimeOrpc(activeTarget(), (client) => client.speech.dictation.finish, {
    dictationId
  })
}
