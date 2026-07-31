import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

export type SourceControlPanelView = 'changes' | 'review'

export type SourceControlPanelViewSlice = {
  requestedSourceControlPanelView: SourceControlPanelView
  sourceControlPanelViewByTab: Record<string, SourceControlPanelView>
  requestSourceControlPanelView: (view: SourceControlPanelView) => void
  setSourceControlPanelView: (tabId: string, view: SourceControlPanelView) => void
  clearSourceControlPanelView: (tabId: string) => void
}

export const createSourceControlPanelViewSlice: StateCreator<
  AppState,
  [],
  [],
  SourceControlPanelViewSlice
> = (set) => ({
  requestedSourceControlPanelView: 'changes',
  sourceControlPanelViewByTab: {},
  requestSourceControlPanelView: (view) => set({ requestedSourceControlPanelView: view }),
  setSourceControlPanelView: (tabId, view) =>
    set((state) => ({
      sourceControlPanelViewByTab: {
        ...state.sourceControlPanelViewByTab,
        [tabId]: view
      }
    })),
  clearSourceControlPanelView: (tabId) =>
    set((state) => {
      if (!(tabId in state.sourceControlPanelViewByTab)) {
        return state
      }
      const next = { ...state.sourceControlPanelViewByTab }
      delete next[tabId]
      return { sourceControlPanelViewByTab: next }
    })
})
