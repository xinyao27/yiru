import type { RuntimeSpeechModelSummary } from '@yiru/runtime-protocol/contract'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import type { AppState } from '~renderer/store/types'
import type { DictationState } from '~shared/speech-types'

export type DictationSlice = {
  dictationState: DictationState
  partialTranscript: string
  activeModelId: string | null
  modelStates: RuntimeSpeechModelSummary[]
  setDictationState: (state: DictationState) => void
  setPartialTranscript: (text: string) => void
  setActiveModelId: (id: string | null) => void
  setModelStates: (states: RuntimeSpeechModelSummary[]) => void
  refreshModelStates: () => Promise<void>
}

export const createDictationSlice: StateCreator<AppState, [], [], DictationSlice> = (set) => ({
  dictationState: 'idle',
  partialTranscript: '',
  activeModelId: null,
  modelStates: [],

  setDictationState: (state) => set({ dictationState: state }),
  setPartialTranscript: (text) => set({ partialTranscript: text }),
  setActiveModelId: (id) => set({ activeModelId: id }),
  setModelStates: (states) => set({ modelStates: states }),

  // Why: model catalog/state is host state with no per-client identity — the
  // same `speech.models.list` procedure mobile uses to present its dictation
  // setup sheet, called on the local target instead of the desktop's own
  // preload IPC round-trip (mic capture stays local; catalog/state does not).
  refreshModelStates: async () => {
    try {
      const setup = await callRuntimeOrpc(
        { kind: 'local' },
        (client) => client.speech.models.list,
        undefined
      )
      set({ modelStates: setup.models })
    } catch (err) {
      console.error('Failed to fetch model states:', err)
    }
  }
})
