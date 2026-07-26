import {
  detectFilePathSegments,
  isFilePathCodeSpan,
  normalizeFilePath
} from './markdown-file-path-detection'

const FILE_LINK_SCHEME = 'yiru-file://'
const INLINE_TOKEN_PATTERN =
  /(!?\[[^\]\n]*\]\([^)\n]+\)|(`+)([^`\n]+)\2|<[^>\n]+>|https?:\/\/[^\s<]+)/g

function fileLink(path: string): string {
  return `${FILE_LINK_SCHEME}${encodeURIComponent(normalizeFilePath(path))}`
}

function linkifyPlainFilePaths(text: string): string {
  return detectFilePathSegments(text)
    .map((segment) =>
      segment.type === 'file' ? `[${segment.value}](${fileLink(segment.path)})` : segment.value
    )
    .join('')
}

function linkifyInlineFilePaths(line: string): string {
  let output = ''
  let lastIndex = 0
  INLINE_TOKEN_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = INLINE_TOKEN_PATTERN.exec(line))) {
    output += linkifyPlainFilePaths(line.slice(lastIndex, match.index))
    const token = match[0]
    const code = match[3]
    output += code && isFilePathCodeSpan(code) ? `[${token}](${fileLink(code.trim())})` : token
    lastIndex = INLINE_TOKEN_PATTERN.lastIndex
  }

  return output + linkifyPlainFilePaths(line.slice(lastIndex))
}

function isClosingFence(line: string, marker: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed.length >= marker.length &&
    trimmed.split('').every((character) => character === marker[0])
  )
}

export function linkifyMarkdownFilePaths(content: string): string {
  let fenceMarker: string | null = null
  return content
    .split('\n')
    .map((line) => {
      if (fenceMarker) {
        if (isClosingFence(line, fenceMarker)) {
          fenceMarker = null
        }
        return line
      }
      const fence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
      if (fence?.[1]) {
        fenceMarker = fence[1]
        return line
      }
      return linkifyInlineFilePaths(line)
    })
    .join('\n')
}

export function filePathFromMarkdownUrl(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed.startsWith(FILE_LINK_SCHEME)) {
    try {
      return decodeURIComponent(trimmed.slice(FILE_LINK_SCHEME.length))
    } catch {
      return null
    }
  }
  return isFilePathCodeSpan(trimmed) ? normalizeFilePath(trimmed) : null
}
