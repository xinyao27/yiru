import type {
  RuntimeSpeechDictationFinishResult,
  RuntimeSpeechDictationHandleResult,
  RuntimeSpeechDictationStartResult,
  RuntimeSpeechModelDownloadResult,
  RuntimeSpeechOpenAiKeyStatus,
  RuntimeSpeechSetupState,
  SpeechDictationChunkInput,
  SpeechDictationHandleInput,
  SpeechDictationSetupInput,
  SpeechDictationStartInput,
  SpeechModelActionInput,
  SpeechOpenAiKeySaveInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

// Why: the contract leaf has no `.input()` (a plain read), so oRPC infers
// `unknown` rather than `void` — direct wiring checks against the real
// contract shape, unlike the legacy registry's erased `params: null`.
export async function handleSpeechModelsList(
  _params: unknown,
  { runtime }: RpcContext
): Promise<RuntimeSpeechSetupState> {
  return runtime.listMobileSpeechModels()
}

export async function handleSpeechModelsDownload(
  params: SpeechModelActionInput,
  { runtime }: RpcContext
): Promise<RuntimeSpeechModelDownloadResult> {
  return runtime.downloadMobileSpeechModel(params.modelId)
}

export async function handleSpeechModelsDelete(
  params: SpeechModelActionInput,
  { runtime }: RpcContext
): Promise<RuntimeSpeechSetupState> {
  return runtime.deleteMobileSpeechModel(params.modelId)
}

// Why: the contract leaf has no `.input()` (a plain read), same reasoning as
// `handleSpeechModelsList`.
export function handleSpeechOpenAiKeyGetStatus(
  _params: unknown,
  { runtime }: RpcContext
): RuntimeSpeechOpenAiKeyStatus {
  return runtime.getSpeechOpenAiKeyStatus()
}

export function handleSpeechOpenAiKeySave(
  params: SpeechOpenAiKeySaveInput,
  { runtime }: RpcContext
): RuntimeSpeechOpenAiKeyStatus {
  return runtime.saveSpeechOpenAiKey(params.apiKey)
}

export function handleSpeechOpenAiKeyClear(
  _params: unknown,
  { runtime }: RpcContext
): RuntimeSpeechOpenAiKeyStatus {
  return runtime.clearSpeechOpenAiKey()
}

export async function handleSpeechDictationSetup(
  params: SpeechDictationSetupInput,
  { runtime }: RpcContext
): Promise<RuntimeSpeechSetupState> {
  return runtime.configureMobileDictation({
    ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
    ...(params.modelId !== undefined ? { modelId: params.modelId } : {}),
    ...(params.dictationMode !== undefined ? { dictationMode: params.dictationMode } : {})
  })
}

export async function handleSpeechDictationStart(
  params: SpeechDictationStartInput,
  { runtime, clientId, connectionId }: RpcContext
): Promise<RuntimeSpeechDictationStartResult> {
  return runtime.startMobileDictation({
    ...params,
    clientId: clientId ?? connectionId,
    connectionId
  })
}

export function handleSpeechDictationChunk(
  params: SpeechDictationChunkInput,
  { runtime, clientId, connectionId }: RpcContext
): RuntimeSpeechDictationHandleResult {
  return runtime.feedMobileDictation({
    ...params,
    clientId: clientId ?? connectionId,
    connectionId
  })
}

export async function handleSpeechDictationFinish(
  params: SpeechDictationHandleInput,
  { runtime, clientId, connectionId }: RpcContext
): Promise<RuntimeSpeechDictationFinishResult> {
  return runtime.finishMobileDictation({
    ...params,
    clientId: clientId ?? connectionId,
    connectionId
  })
}

export async function handleSpeechDictationCancel(
  params: SpeechDictationHandleInput,
  { runtime, clientId, connectionId }: RpcContext
): Promise<RuntimeSpeechDictationHandleResult> {
  return runtime.cancelMobileDictation({
    ...params,
    clientId: clientId ?? connectionId,
    connectionId
  })
}
