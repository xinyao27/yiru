import { hasStableSpoolPublicationSnapshot } from './spool-publication-snapshot-guard'
import type {
  PreparedSpoolPublication,
  SpoolPublicationValidation,
  SpoolWorktreePublicationValidator
} from './spool-worktree-publication-validation'

export type SpoolPublicationFinalGuard = {
  validation: SpoolPublicationValidation
  stable: boolean
}

export async function revalidateSpoolPublicationSnapshot(
  validator: SpoolWorktreePublicationValidator,
  scanned: SpoolPublicationValidation,
  expectedReady: readonly PreparedSpoolPublication[]
): Promise<SpoolPublicationFinalGuard> {
  const validation = await validator.validate(
    expectedReady.map((entry) => ({
      target: entry.target,
      expectedMarkerId: entry.markerId,
      requirePersistedMarker: true
    }))
  )
  return {
    validation,
    stable: hasStableSpoolPublicationSnapshot(expectedReady, scanned, validation)
  }
}
