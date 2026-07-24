import { YIRU_GITHUB_RELEASES_URL } from '@yiru/workbench-model/product'
import type { UpdateInfo } from 'electron-updater'

import type { ChangelogData } from '../shared/types'

type GitHubReleaseUpdateInfo = Pick<UpdateInfo, 'version' | 'releaseName' | 'releaseNotes'>
type CachedReleaseChangelog = { title: string | null; notes: string }

const DESCRIPTION_MAX_LENGTH = 280
const TITLE_MAX_LENGTH = 120
const RELEASE_TAG_URL_PREFIX = `${YIRU_GITHUB_RELEASES_URL}/tag/`
let cachedReleaseChangelog = new Map<string, CachedReleaseChangelog>()

function decodeCodePoint(value: string, radix: number, fallback: string): string {
  const codePoint = Number.parseInt(value, radix)
  return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback
}

function decodeHtmlEntities(value: string): string {
  const named = new Map([
    ['amp', '&'],
    ['apos', "'"],
    ['gt', '>'],
    ['lt', '<'],
    ['nbsp', ' '],
    ['quot', '"']
  ])
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x')) {
      return decodeCodePoint(entity.slice(2), 16, match)
    }
    if (entity.startsWith('#')) {
      return decodeCodePoint(entity.slice(1), 10, match)
    }
    return named.get(entity.toLowerCase()) ?? match
  })
}

function releaseNoteLines(value: string): string[] {
  // Why: GitHub's Atom feed supplies rendered HTML while generated metadata may
  // carry Markdown; reduce both to bounded plain text before crossing into UI.
  const decodedMarkup = decodeHtmlEntities(value)
  const plain = decodeHtmlEntities(
    decodedMarkup
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(?:br|hr)\s*\/?\s*>/gi, '\n')
      .replace(/<\/(?:h[1-6]|li|p|div|blockquote|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )

  return plain
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/\[([^\]]+)]\([^\s)]+(?:\s+"[^"]*")?\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .replace(/\s+by\s+@\S+\s+in\s+https?:\/\/\S+$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
}

function elementValue(entry: string, elementName: string): string | null {
  const match = entry.match(
    new RegExp(`<${elementName}\\b[^>]*>([\\s\\S]*?)<\\/${elementName}>`, 'i')
  )
  return match?.[1]?.trim() || null
}

/** Cache release bodies from the same public Atom feed used to select update tags. */
export function cacheGitHubReleaseFeed(feedXml: string): void {
  const nextCache = new Map<string, CachedReleaseChangelog>()
  for (const entryMatch of feedXml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const entry = entryMatch[1]
    const releaseUrl = [...entry.matchAll(/\bhref=["']([^"']+)["']/gi)]
      .map((match) => decodeHtmlEntities(match[1]))
      .find((href) => href.startsWith(RELEASE_TAG_URL_PREFIX))
    const notes = elementValue(entry, 'content')
    if (!releaseUrl || !notes) {
      continue
    }

    const tag = releaseUrl.slice(RELEASE_TAG_URL_PREFIX.length)
    const version = tag.replace(/^v/i, '')
    const title = elementValue(entry, 'title')
    nextCache.set(version, {
      title: title ? decodeHtmlEntities(title) : null,
      notes
    })
  }

  // Why: a transient malformed response should not erase the last feed that
  // successfully drove the current update check.
  if (nextCache.size > 0) {
    cachedReleaseChangelog = nextCache
  }
}

function releaseDescription(value: string): string | null {
  const line = releaseNoteLines(value).find(
    (candidate) =>
      !/^what'?s changed:?$/i.test(candidate) &&
      !/^full changelog:?\s*(?:https?:\/\/\S+)?$/i.test(candidate) &&
      !/^https?:\/\/\S+$/i.test(candidate)
  )
  if (!line) {
    return null
  }
  return line.length <= DESCRIPTION_MAX_LENGTH
    ? line
    : `${line.slice(0, DESCRIPTION_MAX_LENGTH - 1).trimEnd()}…`
}

function releaseTitle(info: GitHubReleaseUpdateInfo): string {
  const cachedTitle = cachedReleaseChangelog.get(info.version)?.title
  const supplied = info.releaseName
    ? releaseNoteLines(info.releaseName)[0]
    : cachedTitle
      ? releaseNoteLines(cachedTitle)[0]
      : undefined
  const title =
    supplied && supplied !== `v${info.version}` && supplied !== info.version
      ? supplied
      : `Yiru ${info.version}`
  return title.length <= TITLE_MAX_LENGTH
    ? title
    : `${title.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
}

function latestReleaseNote(info: GitHubReleaseUpdateInfo): string | null {
  if (typeof info.releaseNotes === 'string') {
    return info.releaseNotes
  }
  if (!Array.isArray(info.releaseNotes)) {
    return cachedReleaseChangelog.get(info.version)?.notes ?? null
  }
  const supplied =
    info.releaseNotes.find((entry) => entry.version === info.version && entry.note)?.note ??
    info.releaseNotes.find((entry) => entry.note)?.note ??
    null
  return supplied ?? cachedReleaseChangelog.get(info.version)?.notes ?? null
}

/** Build the update card from GitHub Release data resolved during update feed selection. */
export function changelogFromUpdateInfo(info: GitHubReleaseUpdateInfo): ChangelogData | null {
  const note = latestReleaseNote(info)
  const description = note ? releaseDescription(note) : null
  if (!description) {
    return null
  }

  return {
    release: {
      title: releaseTitle(info),
      description,
      releaseNotesUrl: `${YIRU_GITHUB_RELEASES_URL}/tag/v${encodeURIComponent(info.version)}`
    },
    releasesBehind: Array.isArray(info.releaseNotes) ? info.releaseNotes.length : null
  }
}
