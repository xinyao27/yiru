import {
  isDefinitiveCoworkingFilesystemFailure,
  isExistingCoworkingFilesystemError,
  isMissingCoworkingFilesystemError
} from './canonical-host-path'
import { CoworkingWorktreeIncarnationHostError } from './worktree-incarnation'

export function classifyCoworkingIncarnationMarkerIoError(
  error: unknown
): CoworkingWorktreeIncarnationHostError {
  if (error instanceof CoworkingWorktreeIncarnationHostError) {
    return error
  }
  return new CoworkingWorktreeIncarnationHostError(
    isMissingCoworkingFilesystemError(error) ||
      isExistingCoworkingFilesystemError(error) ||
      isDefinitiveCoworkingFilesystemFailure(error)
      ? 'marker-unavailable'
      : 'host-unavailable',
    { cause: error }
  )
}
