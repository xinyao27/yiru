// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values?.[key] ?? ''))
}))

import { useAppStore } from '../store'
import CodexRestartChip from './codex-restart-chip'

describe('CodexRestartChip', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useAppStore.setState(useAppStore.getInitialState(), true)
  })

  it('offers only restart while a Codex account switch is unresolved', async () => {
    useAppStore.setState({
      tabsByWorktree: {
        'worktree-1': [
          {
            id: 'tab-1',
            worktreeId: 'worktree-1',
            title: String(),
            customTitle: null,
            color: null,
            sortOrder: 0,
            createdAt: 1,
            ptyId: null
          }
        ]
      },
      ptyIdsByTabId: { 'tab-1': ['pty-1'] },
      codexRestartNoticeByPtyId: {
        'pty-1': {
          previousAccountLabel: 'old@example.com',
          nextAccountLabel: 'new@example.com'
        }
      }
    })

    await act(async () => {
      root.render(<CodexRestartChip worktreeId="worktree-1" />)
    })

    expect(container.textContent).toContain('Codex is still signed in as old@example.com')
    expect(
      Array.from(container.querySelectorAll('button'), (button) => button.textContent?.trim())
    ).toEqual(['Restart'])
  })
})
