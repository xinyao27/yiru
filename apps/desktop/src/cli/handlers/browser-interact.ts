import type { CommandHandler } from '../dispatch'
import {
  getOptionalNumberFlag,
  getOptionalStringFlag,
  getRequiredFiniteNumber,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { getBrowserCommandTarget } from '../selectors'

const checkHandler =
  (checked: boolean): CommandHandler =>
  async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.check, {
      element,
      checked,
      ...target
    })
    printResult(result, json, (v) => (v.checked ? `Checked ${element}` : `Unchecked ${element}`))
  }

export const BROWSER_INTERACT_HANDLERS: Record<string, CommandHandler> = {
  click: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.click, { element, ...target })
    printResult(result, json, (v) => `Clicked ${v.clicked}`)
  },
  dblclick: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.dblclick, { element, ...target })
    printResult(result, json, () => `Double-clicked ${element}`)
  },
  fill: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const value = getRequiredStringFlag(flags, 'value')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.fill, {
      element,
      value,
      ...target
    })
    printResult(result, json, (v) => `Filled ${v.filled}`)
  },
  type: async ({ flags, client, cwd, json }) => {
    const input = getRequiredStringFlag(flags, 'input')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.type, { input, ...target })
    printResult(result, json, () => 'Typed input')
  },
  select: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const value = getRequiredStringFlag(flags, 'value')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.select, {
      element,
      value,
      ...target
    })
    printResult(result, json, (v) => `Selected ${v.selected}`)
  },
  check: checkHandler(true),
  uncheck: checkHandler(false),
  focus: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.focus, { element, ...target })
    printResult(result, json, (v) => `Focused ${v.focused}`)
  },
  clear: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.clear, { element, ...target })
    printResult(result, json, (v) => `Cleared ${v.cleared}`)
  },
  'select-all': async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.selectAll, {
      element,
      ...target
    })
    printResult(result, json, (v) => `Selected all in ${v.selected}`)
  },
  keypress: async ({ flags, client, cwd, json }) => {
    const key = getRequiredStringFlag(flags, 'key')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.keypress, {
      key,
      ...target
    })
    printResult(result, json, (v) => `Pressed ${v.pressed}`)
  },
  hover: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.hover, { element, ...target })
    printResult(result, json, (v) => `Hovered ${v.hovered}`)
  },
  drag: async ({ flags, client, cwd, json }) => {
    const from = getRequiredStringFlag(flags, 'from')
    const to = getRequiredStringFlag(flags, 'to')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.drag, { from, to, ...target })
    printResult(result, json, (v) => `Dragged ${v.dragged.from} → ${v.dragged.to}`)
  },
  upload: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const filesStr = getRequiredStringFlag(flags, 'files')
    const files = filesStr.split(',').map((f) => f.trim())
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.upload, {
      element,
      files,
      ...target
    })
    printResult(result, json, (v) => `Uploaded ${v.uploaded} file(s)`)
  },
  scrollintoview: async ({ flags, client, cwd, json }) => {
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.scrollIntoView, { element, ...target })
    printResult(result, json, () => `Scrolled ${element} into view`)
  },
  get: async ({ flags, client, cwd, json }) => {
    const what = getRequiredStringFlag(flags, 'what')
    const element = getOptionalStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.get, {
      what,
      selector: element,
      ...target
    })
    printResult(result, json, (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2)))
  },
  is: async ({ flags, client, cwd, json }) => {
    const what = getRequiredStringFlag(flags, 'what')
    const element = getRequiredStringFlag(flags, 'element')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.is, {
      what,
      selector: element,
      ...target
    })
    printResult(result, json, (v) => String(v))
  },
  inserttext: async ({ flags, client, cwd, json }) => {
    const text = getRequiredStringFlag(flags, 'text')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.keyboardInsertText, { text, ...target })
    printResult(result, json, () => 'Text inserted')
  },
  'mouse move': async ({ flags, client, cwd, json }) => {
    const x = getRequiredFiniteNumber(flags, 'x')
    const y = getRequiredFiniteNumber(flags, 'y')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.mouseMove, { x, y, ...target })
    printResult(result, json, () => `Mouse moved to ${x},${y}`)
  },
  'mouse down': async ({ flags, client, cwd, json }) => {
    const button = getOptionalStringFlag(flags, 'button')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.mouseDown, { button, ...target })
    printResult(result, json, () => `Mouse button ${button ?? 'left'} pressed`)
  },
  'mouse up': async ({ flags, client, cwd, json }) => {
    const button = getOptionalStringFlag(flags, 'button')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.mouseUp, { button, ...target })
    printResult(result, json, () => `Mouse button ${button ?? 'left'} released`)
  },
  'mouse wheel': async ({ flags, client, cwd, json }) => {
    const dy = getRequiredFiniteNumber(flags, 'dy')
    const dx = getOptionalNumberFlag(flags, 'dx')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.mouseWheel, { dy, dx, ...target })
    printResult(result, json, () => `Mouse wheel scrolled dy=${dy}${dx != null ? ` dx=${dx}` : ''}`)
  },
  find: async ({ flags, client, cwd, json }) => {
    const locator = getRequiredStringFlag(flags, 'locator')
    const value = getRequiredStringFlag(flags, 'value')
    const action = getRequiredStringFlag(flags, 'action')
    const text = getOptionalStringFlag(flags, 'text')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.find, {
      locator,
      value,
      action,
      text,
      ...target
    })
    printResult(result, json, (v) => JSON.stringify(v, null, 2))
  },
  download: async ({ flags, client, cwd, json }) => {
    const selector = getRequiredStringFlag(flags, 'selector')
    const path = getRequiredStringFlag(flags, 'path')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.download, { selector, path, ...target })
    printResult(result, json, () => `Downloaded to ${path}`)
  },
  highlight: async ({ flags, client, cwd, json }) => {
    const selector = getRequiredStringFlag(flags, 'selector')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call(client.rpc.browser.highlight, { selector, ...target })
    printResult(result, json, () => `Highlighted ${selector}`)
  }
}
