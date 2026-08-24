export type ParsedTerminalFileLink = {
  pathText: string
  line: number | null
  column: number | null
  startIndex: number
  endIndex: number
  displayText: string
}

export type ResolvedTerminalFileLink = Pick<ParsedTerminalFileLink, 'line' | 'column'> & {
  absolutePath: string
}
