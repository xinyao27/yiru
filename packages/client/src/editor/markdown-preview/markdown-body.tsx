import type { MarkdownDocument, Worktree } from '@yiru/runtime-protocol/workbench/types'
import React, { useRef } from 'react'
import type { ComponentProps, RefObject } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkBreaks from 'remark-breaks'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { translate } from '~renderer/i18n/i18n'
import type { AppState } from '~renderer/store/state'

import type { HttpLinkSourceOwner } from '../http-link-routing'
import { remarkMarkdownDocLinks } from '../markdown-doc-links'
import type { useLocalImageSrc } from '../use-local-image-src'
import type { MarkdownPreviewLinkContext } from './link'
import {
  createMarkdownPreviewComponents,
  type CreateMarkdownPreviewComponentsOptions
} from './renderers'
import { markdownPreviewSanitizeSchema } from './sanitize-schema'
import { markdownPreviewUrlTransform } from './url-transform'

const MARKDOWN_REMARK_PLUGINS: NonNullable<ComponentProps<typeof Markdown>['remarkPlugins']> = [
  remarkGfm,
  remarkBreaks,
  remarkFrontmatter,
  remarkMath,
  remarkMarkdownDocLinks
]
const MARKDOWN_REHYPE_PLUGINS: NonNullable<ComponentProps<typeof Markdown>['rehypePlugins']> = [
  rehypeRaw,
  [rehypeSanitize, markdownPreviewSanitizeSchema],
  rehypeSlug,
  rehypeHighlight,
  rehypeKatex
]

type MarkdownBodyProps = {
  activateMarkdownLink: AppState['activateMarkdownLink']
  bodyRef: RefObject<HTMLDivElement | null>
  filePath: string
  frontMatterInner: string
  handleAnnotatedMarkdownBlockClick: CreateMarkdownPreviewComponentsOptions['handleAnnotatedMarkdownBlockClick']
  imageRuntimeContext: Parameters<typeof useLocalImageSrc>[3]
  isDark: boolean
  isFrontMatterVisible: boolean
  isMac: boolean
  markdownDocumentIndex: MarkdownPreviewLinkContext['markdownDocumentIndex']
  onOpenDocument?: (
    document: MarkdownDocument,
    options?: { anchor?: string | null }
  ) => void | Promise<void>
  openFile: AppState['openFile']
  openMarkdownPreview: AppState['openMarkdownPreview']
  pendingEditorRevealFrameIdsRef: MarkdownPreviewLinkContext['pendingEditorRevealFrameIdsRef']
  renderAnnotationControls: CreateMarkdownPreviewComponentsOptions['renderAnnotationControls']
  renderedContent: string
  resolvedSourceRuntimeEnvironmentId: string | null | undefined
  reviewRevision: string
  scrollToAnchor: (anchor: string) => boolean
  setMarkdownViewMode: AppState['setMarkdownViewMode']
  setPendingEditorReveal: AppState['setPendingEditorReveal']
  sourceConnectionId: string | null | undefined
  sourceOwner: HttpLinkSourceOwner
  sourceRoutingWorktreeId: string | null
  sourceWorktree: Worktree | null
  worktreeRoot: string | null
  worktreesByRepo: Record<string, Worktree[]>
  wrapAnnotatedBlock: CreateMarkdownPreviewComponentsOptions['wrapAnnotatedBlock']
}

export const MarkdownBody = React.memo(function MarkdownBody(
  props: MarkdownBodyProps
): React.JSX.Element {
  const latestRef = useRef(props)
  latestRef.current = props
  const linkContextRef = useRef<MarkdownPreviewLinkContext | null>(null)
  if (!linkContextRef.current) {
    linkContextRef.current = createLinkContext(props)
  } else {
    Object.assign(linkContextRef.current, createLinkContext(props))
  }
  const renderOptionsRef = useRef<CreateMarkdownPreviewComponentsOptions | null>(null)
  if (!renderOptionsRef.current) {
    renderOptionsRef.current = {
      handleAnnotatedMarkdownBlockClick: (...args) =>
        latestRef.current.handleAnnotatedMarkdownBlockClick(...args),
      imageRuntimeContext: props.imageRuntimeContext,
      isDark: props.isDark,
      linkContext: linkContextRef.current,
      renderAnnotationControls: (...args) => latestRef.current.renderAnnotationControls(...args),
      wrapAnnotatedBlock: (...args) => latestRef.current.wrapAnnotatedBlock(...args)
    }
  }
  renderOptionsRef.current.imageRuntimeContext = props.imageRuntimeContext
  renderOptionsRef.current.isDark = props.isDark
  const componentsRef = useRef<Components | null>(null)
  componentsRef.current ??= createMarkdownPreviewComponents(renderOptionsRef.current)
  void props.reviewRevision

  return (
    <div ref={props.bodyRef} className="markdown-body" translate="no">
      {props.isFrontMatterVisible ? (
        <div className="border-border/60 bg-muted/40 mb-4 border px-3 py-2">
          <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
            {translate('auto.components.editor.MarkdownPreview.2b2b31382c', 'Front Matter')}
          </div>
          <pre className="text-muted-foreground scrollbar-editor max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {props.frontMatterInner}
          </pre>
        </div>
      ) : null}
      <Markdown
        components={componentsRef.current}
        urlTransform={markdownPreviewUrlTransform}
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
      >
        {props.renderedContent}
      </Markdown>
    </div>
  )
})

function createLinkContext(props: MarkdownBodyProps): MarkdownPreviewLinkContext {
  return {
    activateMarkdownLink: props.activateMarkdownLink,
    filePath: props.filePath,
    isMac: props.isMac,
    markdownDocumentIndex: props.markdownDocumentIndex,
    onOpenDocument: props.onOpenDocument,
    openFile: props.openFile,
    openMarkdownPreview: props.openMarkdownPreview,
    pendingEditorRevealFrameIdsRef: props.pendingEditorRevealFrameIdsRef,
    resolvedSourceRuntimeEnvironmentId: props.resolvedSourceRuntimeEnvironmentId,
    scrollToAnchor: props.scrollToAnchor,
    setMarkdownViewMode: props.setMarkdownViewMode,
    setPendingEditorReveal: props.setPendingEditorReveal,
    sourceConnectionId: props.sourceConnectionId,
    sourceOwner: props.sourceOwner,
    sourceRoutingWorktreeId: props.sourceRoutingWorktreeId,
    sourceWorktree: props.sourceWorktree,
    worktreeRoot: props.worktreeRoot,
    worktreesByRepo: props.worktreesByRepo
  }
}
