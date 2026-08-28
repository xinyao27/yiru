type Respond = (response: unknown) => void

export function handleGitHubCommentMessage(message: object, respond: Respond): boolean | null {
  const type = Reflect.get(message, 'type')
  if (type !== 'github-comment-context' && type !== 'github-comment-fill') {
    return null
  }
  const tabId = Reflect.get(message, 'tabId')
  const draft = Reflect.get(message, 'draft')
  if (
    typeof tabId !== 'number' ||
    !Number.isInteger(tabId) ||
    (type === 'github-comment-fill' && typeof draft !== 'string')
  ) {
    respond({ error: 'invalid_github_comment_request', ok: false })
    return false
  }
  const task =
    type === 'github-comment-context'
      ? readGitHubContext(tabId).then((pageContext) => ({ ok: true, pageContext }))
      : fillGitHubComment(tabId, typeof draft === 'string' ? draft : '').then(() => ({ ok: true }))
  void task.then(respond, (error: unknown) =>
    respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

async function readGitHubContext(tabId: number): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (location.hostname.toLowerCase() !== 'github.com') {
        throw new Error('github_page_required')
      }
      const selectedText = getSelection()?.toString().trim() ?? ''
      const main = document.querySelector('main, [role="main"]')
      const pageText = main instanceof HTMLElement ? main.innerText : ''
      return [
        `Title: ${document.title}`,
        `URL: ${location.href}`,
        selectedText ? `Selected text:\n${selectedText}` : '',
        `Visible thread:\n${pageText.slice(0, 56_000)}`
      ]
        .filter(Boolean)
        .join('\n\n')
    }
  })
  const context = results[0]?.result
  if (typeof context !== 'string') {
    throw new Error('github_page_context_unavailable')
  }
  return context
}

async function fillGitHubComment(tabId: number, draft: string): Promise<void> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [draft],
    // Why: Chrome serializes `args` into the isolated world, while chrome-types still models
    // ScriptInjection.func as zero-argument. Content scripts cannot read storage.session by default.
    func: fillCommentBox as () => boolean
  })
  if (results[0]?.result !== true) {
    throw new Error('github_comment_box_not_found')
  }
}

function fillCommentBox(comment: string): boolean {
  if (location.hostname.toLowerCase() !== 'github.com') {
    return false
  }
  const focused = document.activeElement
  const candidate =
    (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement
      ? focused
      : null) ??
    document.querySelector<HTMLTextAreaElement>(
      '#new_comment_field, textarea[name="comment[body]"], textarea.js-comment-field, textarea.markdown-body'
    )
  if (!candidate) {
    return false
  }
  const prototype =
    candidate instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(candidate, comment)
  candidate.dispatchEvent(new InputEvent('input', { bubbles: true, data: comment }))
  candidate.dispatchEvent(new Event('change', { bubbles: true }))
  candidate.focus()
  return true
}
