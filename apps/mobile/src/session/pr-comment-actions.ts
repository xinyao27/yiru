import type { PRComment, PRState } from '@yiru/workbench-model/review'

// Pure helpers for the interactive PR comment timeline (reply / resolve / add
// root comment), kept independent of React and native rendering concerns.

// A review thread can be resolved only when GitHub gave it a thread node id;
// top-level PR conversation comments have no thread to toggle.
export function isResolvableComment(comment: Pick<PRComment, 'threadId'>): boolean {
  return typeof comment.threadId === 'string' && comment.threadId.length > 0
}

// Root-comment composer is offered only on an OPEN PR — a closed/merged PR is no
// longer an active conversation surface (desktop parity).
export function canAddRootComment(state: PRState | null | undefined): boolean {
  return state === 'open' || state === 'draft'
}

export type ReplyParams = {
  prNumber: number
  commentId: number
  body: string
  threadId?: string
  path?: string
  line?: number
}

// Build the github.addPRReviewCommentReply payload from the comment being replied
// to. threadId/path/line are forwarded only when present so the host schema (which
// marks them optional) never receives empty strings.
export function buildReplyParams(prNumber: number, comment: PRComment, body: string): ReplyParams {
  const params: ReplyParams = {
    prNumber,
    commentId: comment.id,
    body
  }
  if (comment.threadId) {
    params.threadId = comment.threadId
  }
  if (comment.path) {
    params.path = comment.path
  }
  if (typeof comment.line === 'number') {
    params.line = comment.line
  }
  return params
}

export type ResolveParams = { threadId: string; resolve: boolean }

// Toggle: resolve when currently unresolved, unresolve when resolved. The host's
// github.resolveReviewThread takes a `resolve` boolean and runs the matching
// GraphQL mutation, so one wrapper covers both directions.
export function buildResolveParams(comment: PRComment): ResolveParams | null {
  if (!comment.threadId) {
    return null
  }
  return { threadId: comment.threadId, resolve: comment.isResolved !== true }
}

export type AddRootCommentParams = { prNumber: number; body: string }

export function buildAddRootCommentParams(prNumber: number, body: string): AddRootCommentParams {
  return { prNumber, body }
}

// The composer disables submit on empty/whitespace input (host rejects empty body).
export function isSubmittableCommentBody(body: string): boolean {
  return body.trim().length > 0
}
