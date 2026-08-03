import {
  createBotAuthorOverrideSet,
  normalizePRCommentAuthorLogin
} from '@yiru/workbench-model/review'
import type { PRComment } from '@yiru/workbench-model/review'

import { translate } from '~/i18n/translate'

export { createBotAuthorOverrideSet }

// Audience filtering for the PR comment timeline, ported from the desktop helper.
// Classification must match so the same comment reads as human or bot on both surfaces.
export type PRCommentAudienceFilter = 'all' | 'human' | 'bot'

export const PR_COMMENT_AUDIENCE_FILTERS: { value: PRCommentAudienceFilter; label: string }[] = [
  { value: 'all', label: translate('mobile.pullRequest.comments.audience.all', 'All') },
  { value: 'human', label: translate('mobile.pullRequest.comments.audience.humans', 'Humans') },
  { value: 'bot', label: translate('mobile.pullRequest.comments.audience.bots', 'Bots') }
]

const BOT_LOGIN_SUFFIX = '[bot]'
const AUTOMATION_LOGIN_PATTERNS = [
  /bot$/i,
  /-bot$/i,
  /\bbot\b/i,
  /automation/i,
  /actions/i,
  /renovate/i,
  /dependabot/i
]
// Some AI/code-review services use regular user accounts, so GitHub metadata can
// report them as users — keep this list in sync with the desktop helper.
const KNOWN_AUTOMATION_LOGIN_SUBSTRINGS = [
  'chatgpt-codex-connector',
  'codex-connector',
  'qodo',
  'coderabbit',
  'codium',
  'sonarcloud',
  'sonarqube',
  'sourcery-ai',
  'deepsource',
  'snyk',
  'codecov',
  'greptile',
  'ellipsis',
  'graphite-app',
  'reviewer-gpt',
  '-reviewer'
]

export function isBotPRComment(
  comment: PRComment,
  botAuthorOverrides?: ReadonlySet<string>
): boolean {
  const author = comment.author.trim()
  const normalized = normalizePRCommentAuthorLogin(author)
  if (botAuthorOverrides?.has(normalized)) {
    return true
  }
  if (comment.isBot === true) {
    return true
  }
  if (normalized.endsWith(BOT_LOGIN_SUFFIX)) {
    return true
  }
  if (KNOWN_AUTOMATION_LOGIN_SUBSTRINGS.some((needle) => normalized.includes(needle))) {
    return true
  }
  return AUTOMATION_LOGIN_PATTERNS.some((pattern) => pattern.test(author))
}

export function getPRCommentAudienceCounts(
  comments: PRComment[],
  botAuthorOverrides?: ReadonlySet<string>
): Record<PRCommentAudienceFilter, number> {
  const bot = comments.filter((comment) => isBotPRComment(comment, botAuthorOverrides)).length
  return {
    all: comments.length,
    human: comments.length - bot,
    bot
  }
}

export function filterPRCommentsByAudience(
  comments: PRComment[],
  filter: PRCommentAudienceFilter,
  botAuthorOverrides?: ReadonlySet<string>
): PRComment[] {
  if (filter === 'bot') {
    return comments.filter((comment) => isBotPRComment(comment, botAuthorOverrides))
  }
  if (filter === 'human') {
    return comments.filter((comment) => !isBotPRComment(comment, botAuthorOverrides))
  }
  return comments
}

export function getPRCommentAudienceEmptyLabel(filter: PRCommentAudienceFilter): string {
  switch (filter) {
    case 'bot':
      return translate('mobile.pullRequest.comments.emptyBots', 'No bot comments.')
    case 'human':
      return translate('mobile.pullRequest.comments.emptyHumans', 'No human comments.')
    case 'all':
      return translate('mobile.pullRequest.comments.empty', 'No comments yet.')
  }
}
