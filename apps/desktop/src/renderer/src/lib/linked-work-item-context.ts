type ReviewReference = { url: string }

export function getLinkedWorkItemPromptContext(linkedReview: ReviewReference | null | undefined): {
  linkedUrls: string[]
  linkedContextBlocks: string[]
} {
  const url = linkedReview?.url.trim()
  return url
    ? { linkedUrls: [url], linkedContextBlocks: [] }
    : { linkedUrls: [], linkedContextBlocks: [] }
}

export function resolveQuickCreateLinkedWorkItemPrompt(
  linkedReview: ReviewReference | null | undefined,
  note: string
): { prompt: string; draftPrompt: string | null } {
  const trimmedNote = note.trim()
  const url = linkedReview?.url.trim()
  return {
    prompt: '',
    draftPrompt: url ? [trimmedNote, url].filter(Boolean).join('\n\n') : null
  }
}
