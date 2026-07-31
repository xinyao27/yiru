const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
})

function toDate(timestamp: number | undefined): Date | null {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return null
  }
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatGitGraphShortDate(timestamp: number | undefined): string {
  const date = toDate(timestamp)
  return date ? shortDateFormatter.format(date) : ''
}

export function formatGitGraphFullDate(timestamp: number | undefined): string {
  const date = toDate(timestamp)
  return date ? fullDateFormatter.format(date) : ''
}

// Why: `GitHistoryItem.message` is git's full `%B`, which repeats the subject
// line the collapsed row already shows — strip that leading line (plus the
// blank separator line git inserts before a body) so the details panel shows
// only the body, or nothing when the commit has no body beyond its subject.
export function formatGitGraphMessageBody(subject: string, message: string): string {
  const normalizedMessage = message.replace(/\r\n/g, '\n').trim()
  const normalizedSubject = subject.replace(/\r\n/g, '\n').trim()
  if (!normalizedMessage || normalizedMessage === normalizedSubject) {
    return ''
  }
  if (!normalizedMessage.startsWith(normalizedSubject)) {
    return normalizedMessage
  }
  return normalizedMessage.slice(normalizedSubject.length).replace(/^\n+/, '').trim()
}
