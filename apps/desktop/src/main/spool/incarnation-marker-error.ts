import {
  isDefinitiveSpoolFilesystemFailure,
  isExistingSpoolFilesystemError,
  isMissingSpoolFilesystemError
} from './canonical-host-path'
import { SpoolWorktreeIncarnationHostError } from './worktree-incarnation'

export function classifySpoolIncarnationMarkerIoError(
  error: unknown
): SpoolWorktreeIncarnationHostError {
  if (error instanceof SpoolWorktreeIncarnationHostError) {
    return error
  }
  return new SpoolWorktreeIncarnationHostError(
    isMissingSpoolFilesystemError(error) ||
      isExistingSpoolFilesystemError(error) ||
      isDefinitiveSpoolFilesystemFailure(error)
      ? 'marker-unavailable'
      : 'host-unavailable',
    { cause: error }
  )
}
