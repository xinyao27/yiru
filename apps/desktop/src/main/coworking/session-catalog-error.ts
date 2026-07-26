import { CoworkingExecutionError, type CoworkingExecutionErrorDiagnostic } from './execution-error'

export async function tagCoworkingSessionCatalogStage<T>(
  operation: Promise<T>,
  diagnostic: CoworkingExecutionErrorDiagnostic
): Promise<T> {
  try {
    return await operation
  } catch (error) {
    throw coworkingSessionCatalogError(error, diagnostic)
  }
}

export function projectCoworkingSessionCatalogValue<T>(
  operation: () => T,
  diagnostic: CoworkingExecutionErrorDiagnostic
): T {
  try {
    return operation()
  } catch (error) {
    throw coworkingSessionCatalogError(error, diagnostic)
  }
}

export function coworkingSessionCatalogError(
  error: unknown,
  diagnostic: CoworkingExecutionErrorDiagnostic
): unknown {
  return error instanceof CoworkingExecutionError
    ? error
    : new CoworkingExecutionError('internal_error', diagnostic)
}
