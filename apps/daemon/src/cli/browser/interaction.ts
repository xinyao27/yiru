import { translate } from '../../i18n/translate'
import { writeCliOutput } from '../output'
import type { BrowserCliHandler } from './context'
import {
  readBrowserFlag,
  readFiniteBrowserFlag,
  requireBrowserFlag,
  requireFiniteBrowserFlag
} from './input'
import { resolveBrowserFileTarget, resolveBrowserTarget, resolveBrowserUploadFiles } from './target'

export const BROWSER_INTERACTION_COMMANDS: Record<string, BrowserCliHandler> = {
  click: elementCommand('click'),
  dblclick: elementCommand('dblclick'),
  focus: elementCommand('focus'),
  clear: elementCommand('clear'),
  'select-all': elementCommand('selectAll'),
  hover: elementCommand('hover'),
  scrollintoview: elementCommand('scrollIntoView'),
  fill: async (context) => {
    const element = requireBrowserFlag(context.args, 'element')
    const fillElement = context.client.browser.fill
    const result = await fillElement({
      element,
      value: requireBrowserFlag(context.args, 'value'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Filled ${result.filled}`))
  },
  type: async (context) => {
    const result = await context.client.browser.type({
      input: requireBrowserFlag(context.args, 'input'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate('Typed input'))
  },
  select: async (context) => {
    const result = await context.client.browser.select({
      element: requireBrowserFlag(context.args, 'element'),
      value: requireBrowserFlag(context.args, 'value'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Selected ${result.selected}`))
  },
  check: checkCommand(true),
  uncheck: checkCommand(false),
  keypress: async (context) => {
    const result = await context.client.browser.keypress({
      key: requireBrowserFlag(context.args, 'key'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Pressed ${result.pressed}`))
  },
  drag: async (context) => {
    const result = await context.client.browser.drag({
      from: requireBrowserFlag(context.args, 'from'),
      to: requireBrowserFlag(context.args, 'to'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(`Dragged ${result.dragged.from} → ${result.dragged.to}`)
    )
  },
  upload: async (context) => {
    const files = requireBrowserFlag(context.args, 'files')
      .split(',')
      .map((file) => file.trim())
      .filter(Boolean)
    if (files.length === 0) {
      throw new Error('cli_flag_invalid:--files')
    }
    const result = await context.client.browser.upload({
      element: requireBrowserFlag(context.args, 'element'),
      files: await resolveBrowserUploadFiles(context, files),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Uploaded ${result.uploaded} file(s)`))
  },
  get: async (context) => {
    const result = await context.client.browser.get({
      selector: readBrowserFlag(context.args, 'element'),
      what: requireBrowserFlag(context.args, 'what'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, displayWireValue(result))
  },
  is: async (context) => {
    const result = await context.client.browser.is({
      selector: requireBrowserFlag(context.args, 'element'),
      what: requireBrowserFlag(context.args, 'what'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, String(result))
  },
  inserttext: async (context) => {
    const result = await context.client.browser.keyboardInsertText({
      text: requireBrowserFlag(context.args, 'text'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate('Text inserted'))
  },
  find: async (context) => {
    const result = await context.client.browser.find({
      action: requireBrowserFlag(context.args, 'action'),
      locator: requireBrowserFlag(context.args, 'locator'),
      text: readBrowserFlag(context.args, 'text'),
      value: requireBrowserFlag(context.args, 'value'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, displayWireValue(result))
  },
  highlight: async (context) => {
    const selector = requireBrowserFlag(context.args, 'selector')
    const result = await context.client.browser.highlight({
      selector,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Highlighted ${selector}`))
  },
  download: async (context) => {
    const path = requireBrowserFlag(context.args, 'path')
    const result = await context.client.browser.download({
      path,
      selector: requireBrowserFlag(context.args, 'selector'),
      ...(await resolveBrowserFileTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Downloaded to ${path}`))
  },
  exec: async (context) => {
    const result = await context.client.browser.exec({
      command: requireBrowserFlag(context.args, 'command'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, displayWireValue(result))
  },
  'mouse move': async (context) => {
    const x = requireFiniteBrowserFlag(context.args, 'x')
    const y = requireFiniteBrowserFlag(context.args, 'y')
    const result = await context.client.browser.mouseMove({
      x,
      y,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Mouse moved to ${x},${y}`))
  },
  'mouse down': pointerButtonCommand('mouseDown', 'pressed'),
  'mouse up': pointerButtonCommand('mouseUp', 'released'),
  'mouse wheel': async (context) => {
    const dx = readFiniteBrowserFlag(context.args, 'dx')
    const dy = requireFiniteBrowserFlag(context.args, 'dy')
    const result = await context.client.browser.mouseWheel({
      dx,
      dy,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(`Mouse wheel scrolled dy=${dy}${dx ? ` dx=${dx}` : ''}`)
    )
  }
}

type ElementMethod =
  | 'clear'
  | 'click'
  | 'dblclick'
  | 'focus'
  | 'hover'
  | 'scrollIntoView'
  | 'selectAll'

function elementCommand(method: ElementMethod): BrowserCliHandler {
  return async (context) => {
    const element = requireBrowserFlag(context.args, 'element')
    const result = await context.client.browser[method]({
      element,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`${elementAction(method)} ${element}`))
  }
}

function checkCommand(checked: boolean): BrowserCliHandler {
  return async (context) => {
    const element = requireBrowserFlag(context.args, 'element')
    const result = await context.client.browser.check({
      checked,
      element,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(`${checked ? 'Checked' : 'Unchecked'} ${element}`)
    )
  }
}

function pointerButtonCommand(
  method: 'mouseDown' | 'mouseUp',
  action: 'pressed' | 'released'
): BrowserCliHandler {
  return async (context) => {
    const button = readBrowserFlag(context.args, 'button')
    const result = await context.client.browser[method]({
      button,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Mouse button ${button ?? 'left'} ${action}`))
  }
}

function displayWireValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function elementAction(method: ElementMethod): string {
  switch (method) {
    case 'click':
      return 'Clicked'
    case 'dblclick':
      return 'Double-clicked'
    case 'focus':
      return 'Focused'
    case 'clear':
      return 'Cleared'
    case 'selectAll':
      return 'Selected all in'
    case 'hover':
      return 'Hovered'
    case 'scrollIntoView':
      return 'Scrolled into view'
  }
}
