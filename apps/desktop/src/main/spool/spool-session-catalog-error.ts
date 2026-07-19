import { SpoolExecutionError, type SpoolExecutionErrorDiagnostic } from './spool-execution-error'

export async function tagSpoolSessionCatalogStage<T>(
  operation: Promise<T>,
  diagnostic: SpoolExecutionErrorDiagnostic
): Promise<T> {
  try {
    return await operation
  } catch (error) {
    throw spoolSessionCatalogError(error, diagnostic)
  }
}

export function projectSpoolSessionCatalogValue<T>(
  operation: () => T,
  diagnostic: SpoolExecutionErrorDiagnostic
): T {
  try {
    return operation()
  } catch (error) {
    throw spoolSessionCatalogError(error, diagnostic)
  }
}

export function spoolSessionCatalogError(
  error: unknown,
  diagnostic: SpoolExecutionErrorDiagnostic
): unknown {
  return error instanceof SpoolExecutionError
    ? error
    : new SpoolExecutionError('internal_error', diagnostic)
}
