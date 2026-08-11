type ConflictBlock = {
  startLine: number
  baseLine?: number
  separatorLine: number
  endLine: number
}

type ParsedConflictBlock = ConflictBlock & {
  startText: string
  baseText?: string
  separatorText: string
  endText: string
}

export function findGitConflictBlocks(content: string): ConflictBlock[] {
  return parseGitConflictBlocks(content).map(({ startLine, baseLine, separatorLine, endLine }) => ({
    startLine,
    ...(baseLine === undefined ? {} : { baseLine }),
    separatorLine,
    endLine
  }))
}

export function getGitConflictMarkerLineLength(content: string, lineNumber: number): number {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    return 0
  }
  let foundLength = 0
  forEachLine(content, (lineStart, lineEnd, currentLineNumber) => {
    if (currentLineNumber !== lineNumber) {
      return
    }
    foundLength = lineEnd - lineStart
    return false
  })
  return foundLength
}

function parseGitConflictBlocks(content: string): ParsedConflictBlock[] {
  const blocks: ParsedConflictBlock[] = []
  let current: {
    startLine: number
    startText: string
    baseLine?: number
    baseText?: string
    separatorLine?: number
    separatorText?: string
  } | null = null

  forEachLine(content, (lineStart, lineEnd, lineNumber) => {
    if (lineStartsWith(content, lineStart, lineEnd, '<<<<<<<')) {
      current = { startLine: lineNumber, startText: content.slice(lineStart, lineEnd) }
      return
    }

    if (!current) {
      return
    }

    if (lineStartsWith(content, lineStart, lineEnd, '|||||||')) {
      current.baseLine = lineNumber
      current.baseText = content.slice(lineStart, lineEnd)
      return
    }

    if (lineEquals(content, lineStart, lineEnd, '=======')) {
      current.separatorLine = lineNumber
      current.separatorText = '======='
      return
    }

    if (lineStartsWith(content, lineStart, lineEnd, '>>>>>>>')) {
      if (current.separatorLine && current.separatorText) {
        blocks.push({
          startLine: current.startLine,
          startText: current.startText,
          baseLine: current.baseLine,
          baseText: current.baseText,
          separatorLine: current.separatorLine,
          separatorText: current.separatorText,
          endLine: lineNumber,
          endText: content.slice(lineStart, lineEnd)
        })
      }
      current = null
    }
  })

  return blocks
}

function forEachLine(
  content: string,
  visit: (lineStart: number, lineEnd: number, lineNumber: number) => boolean | void
): void {
  let lineStart = 0
  let lineNumber = 1
  for (let index = 0; index <= content.length; index += 1) {
    if (index < content.length && content.charCodeAt(index) !== 10) {
      continue
    }
    const lineEnd = index > lineStart && content.charCodeAt(index - 1) === 13 ? index - 1 : index
    if (visit(lineStart, lineEnd, lineNumber) === false) {
      return
    }
    lineStart = index + 1
    lineNumber += 1
  }
}

function lineStartsWith(
  content: string,
  lineStart: number,
  lineEnd: number,
  prefix: string
): boolean {
  return lineEnd - lineStart >= prefix.length && content.startsWith(prefix, lineStart)
}

function lineEquals(content: string, lineStart: number, lineEnd: number, value: string): boolean {
  return lineEnd - lineStart === value.length && content.startsWith(value, lineStart)
}
