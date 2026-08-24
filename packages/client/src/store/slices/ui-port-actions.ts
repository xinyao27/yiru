import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import type { UISlice } from './ui'

export function createUIPortActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'setWorkspacePortScan'
  | 'setWorkspacePortScanProjection'
  | 'replaceWorkspacePortScans'
  | 'setWorkspacePortScanForKey'
  | 'setWorkspacePortScanRefreshing'
> {
  return {
    setWorkspacePortScan: (scan) =>
      set((state) => {
        if (!scan) {
          if (!state.workspacePortScan && Object.keys(state.workspacePortScansByKey).length === 0) {
            return state
          }
          return { workspacePortScan: null, workspacePortScansByKey: {} }
        }
        if (
          state.workspacePortScan?.key === scan.key &&
          state.workspacePortScan.result === scan.result &&
          state.workspacePortScansByKey[scan.key] === scan.result
        ) {
          return state
        }
        return {
          workspacePortScan: scan,
          workspacePortScansByKey: { ...state.workspacePortScansByKey, [scan.key]: scan.result }
        }
      }),
    setWorkspacePortScanProjection: (scan) =>
      set((state) => {
        if (
          state.workspacePortScan?.key === scan?.key &&
          state.workspacePortScan?.result === scan?.result
        ) {
          return state
        }
        return { workspacePortScan: scan }
      }),
    replaceWorkspacePortScans: (scansByKey, projection) =>
      set((state) => {
        if (
          state.workspacePortScansByKey === scansByKey &&
          state.workspacePortScan?.key === projection?.key &&
          state.workspacePortScan?.result === projection?.result
        ) {
          return state
        }
        return { workspacePortScansByKey: scansByKey, workspacePortScan: projection }
      }),
    setWorkspacePortScanForKey: (key, result) =>
      set((state) => {
        const currentResult = state.workspacePortScansByKey[key]
        if (currentResult === result || (!result && !currentResult)) {
          return state
        }
        const nextScansByKey = { ...state.workspacePortScansByKey }
        if (result) {
          nextScansByKey[key] = result
        } else {
          delete nextScansByKey[key]
        }
        return {
          workspacePortScansByKey: nextScansByKey,
          workspacePortScan:
            state.workspacePortScan?.key === key
              ? result
                ? { key, result }
                : null
              : state.workspacePortScan
        }
      }),
    setWorkspacePortScanRefreshing: (refreshing) => set({ workspacePortScanRefreshing: refreshing })
  }
}
