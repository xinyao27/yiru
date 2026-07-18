// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { SESSION_RESTORED_BANNER_TEXT, SessionRestoredBanner } from './session-restored-banner'

const mountedRoots: Root[] = []

async function renderBanner(visible: boolean): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push(root)

  await act(async () => {
    root.render(<SessionRestoredBanner visible={visible} />)
  })

  return container
}

describe('SessionRestoredBanner', () => {
  afterEach(async () => {
    await act(async () => {
      for (const root of mountedRoots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  it('renders the exact restored-session marker when visible', async () => {
    const container = await renderBanner(true)

    expect(container.textContent).toBe(SESSION_RESTORED_BANNER_TEXT)
  })

  it('does not render without the startup marker', async () => {
    const container = await renderBanner(false)

    expect(container.textContent).toBe('')
  })
})
