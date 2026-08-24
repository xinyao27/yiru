import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import type { UISlice } from './ui'

export function createUINavigationActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'setActiveView'
  | 'openHomePage'
  | 'openSpacePage'
  | 'closeSpacePage'
  | 'openSkillsPage'
  | 'closeSkillsPage'
  | 'openMobilePage'
  | 'closeMobilePage'
  | 'setNewWorkspaceDraft'
  | 'clearNewWorkspaceDraft'
  | 'openSettingsPage'
  | 'closeSettingsPage'
  | 'openSettingsTarget'
  | 'clearSettingsTarget'
  | 'setSettingsProjectHostSelection'
  | 'setAppearanceAccordionDeepLink'
  | 'clearAppearanceAccordionDeepLink'
  | 'openModal'
  | 'closeModal'
> {
  return {
    setActiveView: (view) => set({ activeView: view }),
    openHomePage: () => set({ activeView: 'home' }),
    openSpacePage: () => {
      get().recordFeatureInteraction?.('workspace-cleanup')
      set((state) => ({
        activeView: 'space',
        previousViewBeforeSpace:
          state.activeView === 'space' ? state.previousViewBeforeSpace : state.activeView
      }))
    },
    closeSpacePage: () =>
      set((state) => ({
        activeView: state.previousViewBeforeSpace
      })),
    openSkillsPage: () =>
      set((state) => ({
        activeView: 'skills',
        previousViewBeforeSkills:
          state.activeView === 'skills' ? state.previousViewBeforeSkills : state.activeView
      })),
    closeSkillsPage: () =>
      set((state) => ({
        activeView: state.previousViewBeforeSkills
      })),
    openMobilePage: () =>
      set((state) => ({
        activeView: 'mobile',
        previousViewBeforeMobile:
          state.activeView === 'mobile' ? state.previousViewBeforeMobile : state.activeView
      })),
    closeMobilePage: () =>
      set((state) => ({
        activeView: state.previousViewBeforeMobile
      })),
    setNewWorkspaceDraft: (draft) => set({ newWorkspaceDraft: draft }),
    clearNewWorkspaceDraft: () => set({ newWorkspaceDraft: null }),
    openSettingsPage: () => {
      // Why: settings search is a transient page filter; opening Settings
      // should never inherit hidden sections from the previous visit.
      get().setSettingsSearchQuery('')
      set((state) => ({
        activeView: 'settings',
        // Why: Settings is a temporary detour from either terminal or the
        // another full-page view. Preserve the originating view so the Settings
        // back action restores an in-progress workspace draft instead of always
        // dumping the user into terminal.
        previousViewBeforeSettings:
          state.activeView === 'settings' ? state.previousViewBeforeSettings : state.activeView
      }))
    },
    closeSettingsPage: () =>
      set((state) => ({
        activeView: state.previousViewBeforeSettings
      })),
    openSettingsTarget: (target) => set({ settingsNavigationTarget: target }),
    clearSettingsTarget: () => set({ settingsNavigationTarget: null }),
    setSettingsProjectHostSelection: (projectId, hostId) =>
      set((s) =>
        s.settingsProjectHostSelection[projectId] === hostId
          ? s
          : {
              settingsProjectHostSelection: {
                ...s.settingsProjectHostSelection,
                [projectId]: hostId
              }
            }
      ),
    setAppearanceAccordionDeepLink: (section) => set({ appearanceAccordionDeepLink: section }),
    clearAppearanceAccordionDeepLink: () => set({ appearanceAccordionDeepLink: null }),
    openModal: (modal, data = {}) => {
      if (modal === 'add-repo' || modal === 'create-worktree') {
        get().recordFeatureInteraction?.('workspace-creation')
      }
      set({
        activeModal: modal,
        modalData: data
      })
    },
    closeModal: () => set({ activeModal: 'none', modalData: {} })
  }
}
