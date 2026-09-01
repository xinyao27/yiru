import { runElementAction } from './dom'

const DOWNLOAD_TIMEOUT_MS = 60_000
let hasActiveDownload = false

export async function downloadBrowserFile(
  tabId: number,
  input: Record<string, unknown>
): Promise<{ sourcePath: string; token: string }> {
  const selector = requireString(input, 'selector')
  if (!(await chrome.permissions.contains({ permissions: ['downloads'] }))) {
    throw new Error('browser_download_permission_required')
  }
  if (hasActiveDownload) {
    throw new Error('browser_download_already_active')
  }
  hasActiveDownload = true
  const token = `yiru-${crypto.randomUUID()}`
  const pending = waitForChromeDownload(token)
  try {
    await runElementAction(tabId, { action: 'click', element: selector })
    const item = await pending.promise
    await chrome.downloads.erase({ id: item.id })
    return { sourcePath: item.filename, token }
  } finally {
    pending.cancel()
    hasActiveDownload = false
  }
}

function waitForChromeDownload(token: string): {
  cancel: () => void
  promise: Promise<chrome.downloads.DownloadItem>
} {
  let cancel = (): void => {}
  const promise = new Promise<chrome.downloads.DownloadItem>((resolve, reject) => {
    let downloadId: number | null = null
    const timeout = setTimeout(
      () => settle(() => reject(new Error('browser_download_timeout'))),
      DOWNLOAD_TIMEOUT_MS
    )
    const onFilename = (
      item: chrome.downloads.DownloadItem,
      suggest: (suggestion?: chrome.downloads.FilenameSuggestion) => void
    ): void => {
      if (downloadId !== null) {
        return
      }
      downloadId = item.id
      // Why: Chrome defines nested suggested filenames with URL-style slashes.
      suggest({ conflictAction: 'overwrite', filename: `Yiru/${token}` })
    }
    const onChanged = (delta: chrome.downloads.DownloadDelta): void => {
      if (delta.id !== downloadId || !delta.state?.current) {
        return
      }
      if (delta.state.current === 'interrupted') {
        settle(() => reject(new Error('browser_download_interrupted')))
        return
      }
      if (delta.state.current === 'complete') {
        void chrome.downloads.search({ id: delta.id }).then((items) => {
          const item = items[0]
          settle(() =>
            item ? resolve(item) : reject(new Error('browser_download_record_missing'))
          )
        }, reject)
      }
    }
    const settle = (complete: () => void): void => {
      clearTimeout(timeout)
      chrome.downloads.onChanged.removeListener(onChanged)
      chrome.downloads.onDeterminingFilename.removeListener(onFilename)
      complete()
    }
    chrome.downloads.onDeterminingFilename.addListener(onFilename)
    chrome.downloads.onChanged.addListener(onChanged)
    cancel = () => settle(() => {})
  })
  return { cancel, promise }
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = Reflect.get(input, key)
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`browser_download_value_missing:${key}`)
  }
  return value
}
