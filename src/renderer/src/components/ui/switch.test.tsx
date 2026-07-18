// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vite-plus/test'
import { Switch } from './switch'

it('renders native switch semantics and reports changes', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  const onCheckedChange = vi.fn()

  act(() => {
    root.render(<Switch checked aria-label="Example setting" onCheckedChange={onCheckedChange} />)
  })

  const control = container.querySelector<HTMLButtonElement>('button[role="switch"]')
  expect(control?.getAttribute('aria-checked')).toBe('true')
  expect(control?.getAttribute('data-slot')).toBe('switch')

  act(() => control?.click())
  expect(onCheckedChange).toHaveBeenCalledWith(false, expect.anything())

  act(() => root.unmount())
})
