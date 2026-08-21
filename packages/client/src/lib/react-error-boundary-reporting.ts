import type React from 'react'
import type { ReactErrorBoundaryReportArgs } from '~shared/crash-reporting'

import { reportRendererErrorCrash } from './renderer-error-reporting'

type BuildReportArgsInput = {
  boundaryId: string
  surface: ReactErrorBoundaryReportArgs['surface']
  error: unknown
  errorInfo?: React.ErrorInfo
}

function stringFromThrown(value: unknown): { name: string; message: string; stack?: string } {
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: value.message || String(value),
      ...(value.stack ? { stack: value.stack } : {})
    }
  }

  return {
    name: 'NonErrorThrown',
    message: String(value)
  }
}

export function buildReactErrorBoundaryReportArgs({
  boundaryId,
  surface,
  error,
  errorInfo
}: BuildReportArgsInput): ReactErrorBoundaryReportArgs {
  const fields = stringFromThrown(error)
  const componentStack = errorInfo?.componentStack?.trim()
  return {
    boundaryId,
    surface,
    errorName: fields.name,
    errorMessage: fields.message,
    ...(fields.stack ? { errorStack: fields.stack } : {}),
    ...(componentStack ? { componentStack } : {})
  }
}

export function reportReactErrorBoundaryCrash(input: BuildReportArgsInput): Promise<void> {
  return reportRendererErrorCrash({
    kind: 'react-error-boundary',
    originId: input.boundaryId,
    surface: input.surface,
    error: input.error,
    ...(input.errorInfo?.componentStack ? { componentStack: input.errorInfo.componentStack } : {})
  })
}
