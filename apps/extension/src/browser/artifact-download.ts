export async function downloadArtifact(
  bootstrap: { endpoint: string; protocolVersion: number },
  input: { id: string; ticket: string }
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(input.id) || !/^[0-9a-f]{48}$/i.test(input.ticket)) {
    throw new Error('artifact_id_invalid')
  }
  const granted = await chrome.permissions.request({ permissions: ['downloads'] })
  if (!granted) {
    throw new Error('downloads_permission_denied')
  }
  const url = new URL(bootstrap.endpoint)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = `/artifacts/${input.id}`
  url.search = ''
  url.searchParams.set('protocolVersion', String(bootstrap.protocolVersion))
  url.searchParams.set('downloadTicket', input.ticket)
  await chrome.downloads.download({ saveAs: true, url: url.href })
}
