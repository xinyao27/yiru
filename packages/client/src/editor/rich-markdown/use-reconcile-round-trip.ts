import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { useAppStore } from '~renderer/store/state'

import type { RichMarkdownHtmlSuperscriptLinkContext } from './html-superscript-link-context'
import { createRichMarkdownImageResolverContext } from './image-context'
import { serializeRichMarkdownForReconcile } from './reconcile-serializer'

type ReconcileRoundTripParams = {
  htmlSuperscriptLinkContext: RichMarkdownHtmlSuperscriptLinkContext
  filePath: string
  runtimeEnvironmentId?: string | null
  worktreeId: string
  worktreeRoot: string | null
}

/**
 * Exposes the reconciliation safety serializer as a render-updated ref. It
 * mirrors the live editor's codec/link/image context so the step-6 re-parse
 * matches getMarkdown(), and only runs on commit — so rebuilding the closure
 * each render is cheap and always reflects the latest context.
 */
export function useRichMarkdownReconcileRoundTrip({
  htmlSuperscriptLinkContext,
  filePath,
  runtimeEnvironmentId,
  worktreeId,
  worktreeRoot
}: ReconcileRoundTripParams): MutableRefObject<(markdown: string) => string | null> {
  const settings = useAppStore((s) => s.settings)
  const ref = useRef<(markdown: string) => string | null>(() => null)
  useLayoutEffect(() => {
    ref.current = (markdown) =>
      serializeRichMarkdownForReconcile(markdown, {
        htmlSuperscriptLinkContext,
        imageResolverContext: createRichMarkdownImageResolverContext({
          filePath,
          runtimeEnvironmentId,
          settings,
          worktreeId,
          worktreeRoot
        })
      })
  }, [
    filePath,
    htmlSuperscriptLinkContext,
    runtimeEnvironmentId,
    settings,
    worktreeId,
    worktreeRoot
  ])
  return ref
}
