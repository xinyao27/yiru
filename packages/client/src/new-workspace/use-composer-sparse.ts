import { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { normalizeSparseDirectoryLines, sparseDirectoriesMatch } from '~renderer/sparse/paths'
import type { AppState } from '~renderer/store/state'

const EMPTY_SPARSE_PRESETS: AppState['sparsePresetsByRepo'][string] = []

type UseComposerSparseOptions = {
  fetchSparsePresets: AppState['fetchSparsePresets']
  isGit: boolean
  presetsByRepo: AppState['sparsePresetsByRepo']
  repoId: string
}

export function useComposerSparse({
  fetchSparsePresets,
  isGit,
  presetsByRepo,
  repoId
}: UseComposerSparseOptions) {
  const [isEnabled, setEnabled] = useState(false)
  const [directories, setDirectories] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const presets = presetsByRepo[repoId] ?? EMPTY_SPARSE_PRESETS
  const normalizedDirectories = normalizeSparseDirectoryLines(directories)
  const selectedPreset = selectedPresetId
    ? presets.find((preset) => preset.id === selectedPresetId)
    : null
  const effectivePresetId =
    selectedPreset && sparseDirectoriesMatch(selectedPreset.directories, normalizedDirectories)
      ? selectedPreset.id
      : null
  const error = resolveSparseError(isEnabled, isGit, normalizedDirectories)

  useEffect(() => {
    if (!repoId || !isGit || presetsByRepo[repoId] !== undefined) {
      return
    }
    void fetchSparsePresets(repoId)
  }, [fetchSparsePresets, isGit, presetsByRepo, repoId])

  return {
    directories,
    effectivePresetId,
    error,
    isEnabled,
    normalizedDirectories,
    presets,
    selectedPresetId,
    setDirectories,
    setEnabled,
    setSelectedPresetId
  }
}

function resolveSparseError(
  isEnabled: boolean,
  isGit: boolean,
  directories: string[]
): string | null {
  if (!isEnabled || !isGit) {
    return null
  }
  if (directories.length === 0) {
    return translate(
      'auto.newWorkspace.sparse.enterDirectory',
      'Enter at least one repo-relative directory.'
    )
  }
  if (directories.some((entry) => entry === '.' || entry.split('/').includes('..'))) {
    return translate(
      'auto.newWorkspace.sparse.useRelativeDirectories',
      'Use repo-relative directories, not root or parent paths.'
    )
  }
  return null
}
