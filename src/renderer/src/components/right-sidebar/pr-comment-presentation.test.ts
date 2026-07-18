// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  DEFAULT_PR_COMMENT_PRESENTATION_VARIANT,
  resolvePRCommentPresentationVariant
} from './pr-comment-presentation'

describe('pr-comment-presentation', () => {
  beforeEach(() => {
    window.localStorage.removeItem('yiru:pr-comment-presentation')
  })

  it('falls back to the default variant when localStorage is unset', () => {
    expect(resolvePRCommentPresentationVariant()).toBe(DEFAULT_PR_COMMENT_PRESENTATION_VARIANT)
  })

  it('uses a supported local override', () => {
    window.localStorage.setItem('yiru:pr-comment-presentation', 'flat')
    expect(resolvePRCommentPresentationVariant()).toBe('flat')
  })

  it('ignores an unknown local override', () => {
    window.localStorage.setItem('yiru:pr-comment-presentation', 'unknown')
    expect(resolvePRCommentPresentationVariant()).toBe(DEFAULT_PR_COMMENT_PRESENTATION_VARIANT)
  })
})
