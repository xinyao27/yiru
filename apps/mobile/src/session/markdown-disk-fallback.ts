import { isRuntimeOrpcErrorCode } from '../transport/runtime-orpc-client'

const RENDERER_UNAVAILABLE = 'renderer_unavailable'

export function shouldReadMarkdownFromDiskAfterReadTabFailure(error: unknown): boolean {
  return (
    isRuntimeOrpcErrorCode(error, RENDERER_UNAVAILABLE) ||
    (isRuntimeOrpcErrorCode(error, 'runtime_error') &&
      error instanceof Error &&
      error.message === RENDERER_UNAVAILABLE)
  )
}

export function buildMarkdownDiskFallbackDoc(args: {
  content: string
  truncated: boolean
  tabIsDirty: boolean
}) {
  const readOnlyReason = args.truncated
    ? 'File too large for mobile preview'
    : args.tabIsDirty
      ? 'Desktop has unsaved changes. Showing disk content.'
      : 'Editing needs Yiru desktop running.'
  return {
    status: 'ready' as const,
    content: args.content,
    localContent: args.content,
    baseVersion: '',
    isDirty: false,
    editable: false,
    stale: args.tabIsDirty,
    readOnlyReason
  }
}
