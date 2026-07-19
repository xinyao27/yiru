import {
  isDefinitiveSpoolFilesystemFailure,
  isExistingSpoolFilesystemError,
  isMissingSpoolFilesystemError
} from './spool-canonical-host-path'
import { SpoolWorktreeIncarnationHostError } from './spool-worktree-incarnation'

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
