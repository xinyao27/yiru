import type { CodexUsagePersistedFile, CodexUsagePersistedState } from './types'

type CodexUsagePersistedFileOnDisk = CodexUsagePersistedFile & {
  ownedEventKeys?: string[]
  ownedEventKeysGzipBase64?: string
}

type CodexUsagePersistedStateOnDisk = Omit<CodexUsagePersistedState, 'processedFiles'> & {
  processedFiles: CodexUsagePersistedFileOnDisk[]
}

export function decodeCodexUsagePersistedState(serializedState: string): CodexUsagePersistedState {
  const state = JSON.parse(serializedState) as CodexUsagePersistedStateOnDisk
  return {
    ...state,
    processedFiles: state.processedFiles.map((file) => {
      const {
        ownedEventKeys: _ownedEventKeys,
        ownedEventKeysGzipBase64: _compressed,
        ...rest
      } = file
      return rest
    })
  }
}

export function encodeCodexUsagePersistedState(state: CodexUsagePersistedState): string {
  return JSON.stringify(state)
}
