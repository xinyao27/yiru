import { acquireCdp, releaseCdp, sendCdp } from '../cdp/session'
import { optionalNumber, optionalString, requiredNumber } from './command-value'
import { readBrowserCommandInput, resolveBrowserTab } from './target'

type PointerState = { x: number; y: number }

const pointers = new Map<number, PointerState>()

export async function executeBrowserPointer(method: string, rawInput: unknown): Promise<unknown> {
  const input = readBrowserCommandInput(rawInput)
  const tab = await resolveBrowserTab(input)
  if (tab.id === undefined) {
    throw new Error('browser_tab_id_missing')
  }
  const tabId = tab.id
  const pointer = pointers.get(tabId) ?? { x: 0, y: 0 }
  switch (method) {
    case 'browser.mouseMove': {
      const next = { x: requiredNumber(input, 'x'), y: requiredNumber(input, 'y') }
      pointers.set(tabId, next)
      await dispatchMouse(tabId, { ...next, type: 'mouseMoved' })
      return { moved: next }
    }
    case 'browser.mouseDown': {
      const button = normalizeButton(optionalString(input, 'button'))
      await dispatchMouse(tabId, { ...pointer, button, clickCount: 1, type: 'mousePressed' })
      return { pressed: button }
    }
    case 'browser.mouseUp': {
      const button = normalizeButton(optionalString(input, 'button'))
      await dispatchMouse(tabId, { ...pointer, button, clickCount: 1, type: 'mouseReleased' })
      return { released: button }
    }
    case 'browser.mouseClick':
      return clickPointer(tabId, input)
    case 'browser.mouseWheel': {
      const deltaX = optionalNumber(input, 'dx') ?? 0
      const deltaY = requiredNumber(input, 'dy')
      await dispatchMouse(tabId, { ...pointer, deltaX, deltaY, type: 'mouseWheel' })
      return { deltaX, deltaY }
    }
  }
  throw new Error(`browser_pointer_command_unsupported:${method}`)
}

async function clickPointer(tabId: number, input: Record<string, unknown>) {
  const x = requiredNumber(input, 'x')
  const y = requiredNumber(input, 'y')
  const button = normalizeButton(optionalString(input, 'button'))
  const modifiers = modifierMask(Reflect.get(input, 'modifiers'))
  pointers.set(tabId, { x, y })
  await withPointerCdp(tabId, async () => {
    await sendCdp(tabId, 'Input.dispatchMouseEvent', {
      button,
      clickCount: 1,
      modifiers,
      type: 'mousePressed',
      x,
      y
    })
    await sendCdp(tabId, 'Input.dispatchMouseEvent', {
      button,
      clickCount: 1,
      modifiers,
      type: 'mouseReleased',
      x,
      y
    })
  })
  return { clicked: { adjusted: false, button, handled: false, x, y } }
}

async function dispatchMouse(tabId: number, params: Record<string, unknown>): Promise<void> {
  await withPointerCdp(tabId, () => sendCdp(tabId, 'Input.dispatchMouseEvent', params))
}

async function withPointerCdp<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  await acquireCdp(tabId, 'browser-use')
  try {
    return await operation()
  } finally {
    await releaseCdp(tabId, 'browser-use')
  }
}

function normalizeButton(value: string | null): 'left' | 'middle' | 'right' {
  if (value === 'middle' || value === 'right') {
    return value
  }
  return 'left'
}

function modifierMask(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0
  }
  return value.reduce((mask, modifier) => {
    if (modifier === 'alt') {
      return mask | 1
    }
    if (modifier === 'ctrl') {
      return mask | 2
    }
    if (modifier === 'cmd') {
      return mask | 4
    }
    if (modifier === 'shift') {
      return mask | 8
    }
    return mask
  }, 0)
}
