// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  shouldSuppressNativePaste: vi.fn(() => false)
}))

vi.mock('@/lib/primary-selection', () => ({
  readPrimarySelectionText: vi.fn(),
  setPrimarySelectionEnabled: vi.fn(),
  setPrimarySelectionText: vi.fn(),
  shouldSuppressPrimarySelectionNativePaste: mocks.shouldSuppressNativePaste
}))

import { usePrimarySelectionPaste } from './use-primary-selection-paste'

function Probe(): null {
  usePrimarySelectionPaste(true)
  return null
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderProbe(): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(Probe))
  })
}

function appendXtermTextarea(): HTMLTextAreaElement {
  const terminal = document.createElement('div')
  terminal.className = 'xterm'
  const textarea = document.createElement('textarea')
  textarea.className = 'xterm-helper-textarea'
  terminal.appendChild(textarea)
  document.body.appendChild(terminal)
  return textarea
}

beforeEach(() => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (X11; Linux x86_64)'
  })
  mocks.shouldSuppressNativePaste.mockReturnValue(false)
})

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
  }
  root = null
  container = null
  document.body.replaceChildren()
  vi.clearAllMocks()
})

describe('usePrimarySelectionPaste terminal event ownership', () => {
  it('swallows the terminal native paste follow-up without a DOM pending target', async () => {
    mocks.shouldSuppressNativePaste.mockReturnValue(true)
    await renderProbe()
    const textarea = appendXtermTextarea()
    const beforeInput = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertFromPaste'
    })
    const paste = new Event('paste', { bubbles: true, cancelable: true })

    textarea.dispatchEvent(beforeInput)
    textarea.dispatchEvent(paste)

    expect(beforeInput.defaultPrevented).toBe(true)
    expect(paste.defaultPrevented).toBe(true)
  })

  it('does not swallow an unrelated document paste while terminal suppression is armed', async () => {
    mocks.shouldSuppressNativePaste.mockReturnValue(true)
    await renderProbe()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    const paste = new Event('paste', { bubbles: true, cancelable: true })

    textarea.dispatchEvent(paste)

    expect(paste.defaultPrevented).toBe(false)
  })
})
