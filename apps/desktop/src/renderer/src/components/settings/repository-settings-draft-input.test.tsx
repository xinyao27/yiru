// @vitest-environment happy-dom

import { act, startTransition, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { RepoSettingsDraftInput } from './repository-settings-draft-input'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!setter) {
    throw new Error('HTMLInputElement value setter is unavailable')
  }
  setter.call(input, value)
}

describe('RepoSettingsDraftInput', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('persists the visible composition once when the input blurs', () => {
    const onTextChange = vi.fn()
    act(() => {
      root.render(
        <RepoSettingsDraftInput repoId="repo-1" storeValue="" onTextChange={onTextChange} />
      )
    })
    const input = container.querySelector('input')
    expect(input).not.toBeNull()

    act(() => {
      input!.focus()
      input!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      setInputValue(input!, '最后')
      input!.dispatchEvent(new InputEvent('input', { bubbles: true, data: '最后' }))
    })
    expect(onTextChange).not.toHaveBeenCalled()

    act(() => input!.blur())

    expect(onTextChange).toHaveBeenCalledTimes(1)
    expect(onTextChange).toHaveBeenCalledWith('最后')
  })

  it('persists an active visible composition when the input unmounts', () => {
    const onTextChange = vi.fn()
    act(() => {
      root.render(
        <RepoSettingsDraftInput repoId="repo-1" storeValue="" onTextChange={onTextChange} />
      )
    })
    const input = container.querySelector('input')
    expect(input).not.toBeNull()

    act(() => {
      input!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      setInputValue(input!, 'さいご')
      input!.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'さいご' }))
      root.unmount()
    })

    expect(onTextChange).toHaveBeenCalledTimes(1)
    expect(onTextChange).toHaveBeenCalledWith('さいご')
    root = createRoot(container)
  })

  it('discards an active composition when the pane switches repositories', () => {
    const onTextChange = vi.fn()
    act(() => {
      root.render(
        <RepoSettingsDraftInput repoId="repo-1" storeValue="First" onTextChange={onTextChange} />
      )
    })
    const input = container.querySelector('input')
    expect(input).not.toBeNull()

    act(() => {
      input!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      setInputValue(input!, '未確定')
      input!.dispatchEvent(new InputEvent('input', { bubbles: true, data: '未確定' }))
      root.render(
        <RepoSettingsDraftInput repoId="repo-2" storeValue="Second" onTextChange={onTextChange} />
      )
    })

    expect(onTextChange).not.toHaveBeenCalled()
    expect(container.querySelector('input')?.value).toBe('Second')
  })

  it('flushes through the last committed callback after a suspended render', async () => {
    const committedChange = vi.fn()
    const uncommittedChange = vi.fn()
    const neverResolves = new Promise<void>(() => {})
    function SuspendAfterInput({ active }: { active: boolean }): null {
      if (active) {
        throw neverResolves
      }
      return null
    }
    function Harness({
      onTextChange,
      suspended
    }: {
      onTextChange: (text: string) => void
      suspended: boolean
    }): React.JSX.Element {
      return (
        <Suspense fallback={null}>
          <RepoSettingsDraftInput repoId="repo-1" storeValue="" onTextChange={onTextChange} />
          <SuspendAfterInput active={suspended} />
        </Suspense>
      )
    }

    act(() => root.render(<Harness onTextChange={committedChange} suspended={false} />))
    const input = container.querySelector('input')
    expect(input).not.toBeNull()
    act(() => {
      input!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      setInputValue(input!, '홍')
      input!.dispatchEvent(new InputEvent('input', { bubbles: true, data: '홍' }))
    })

    await act(async () => {
      startTransition(() => {
        root.render(<Harness onTextChange={uncommittedChange} suspended />)
      })
      await Promise.resolve()
    })
    act(() => root.unmount())

    expect(committedChange).toHaveBeenCalledOnce()
    expect(committedChange).toHaveBeenCalledWith('홍')
    expect(uncommittedChange).not.toHaveBeenCalled()
    root = createRoot(container)
  })
})
