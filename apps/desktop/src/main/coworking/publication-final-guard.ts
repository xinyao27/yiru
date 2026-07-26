import { hasStableCoworkingPublicationSnapshot } from './publication-snapshot-guard'
import type {
  PreparedCoworkingPublication,
  CoworkingPublicationValidation,
  CoworkingWorktreePublicationValidator
} from './worktree-publication-validation'

export type CoworkingPublicationFinalGuard = {
  validation: CoworkingPublicationValidation
  stable: boolean
}

export async function revalidateCoworkingPublicationSnapshot(
  validator: CoworkingWorktreePublicationValidator,
  scanned: CoworkingPublicationValidation,
  expectedReady: readonly PreparedCoworkingPublication[]
): Promise<CoworkingPublicationFinalGuard> {
  const validation = await validator.validate(
    expectedReady.map((entry) => ({
      target: entry.target,
      expectedMarkerId: entry.markerId,
      requirePersistedMarker: true
    }))
  )
  return {
    validation,
    stable: hasStableCoworkingPublicationSnapshot(expectedReady, scanned, validation)
  }
}
