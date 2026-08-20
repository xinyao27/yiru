import { z } from 'zod'

import type { BrowserNavigationResult } from './contract/browser/page-result.js' with {
  'resolution-mode': 'import'
}
import type { BrowserScreencastResult } from './contract/browser/screencast-result.js' with {
  'resolution-mode': 'import'
}
import type { BrowserTabCreateResult } from './contract/browser/session-result.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_BROWSER_SCREENCAST_SUBSCRIBE_ORPC_PATH = '/browser/screencast/subscribe'
export const MOBILE_BROWSER_GOTO_ORPC_PATH = '/browser/goto'
export const MOBILE_BROWSER_BACK_ORPC_PATH = '/browser/back'
export const MOBILE_BROWSER_FORWARD_ORPC_PATH = '/browser/forward'
export const MOBILE_BROWSER_RELOAD_ORPC_PATH = '/browser/reload'
export const MOBILE_BROWSER_KEYPRESS_ORPC_PATH = '/browser/keypress'
export const MOBILE_BROWSER_KEYBOARD_INSERT_TEXT_ORPC_PATH = '/browser/keyboardInsertText'
export const MOBILE_BROWSER_MOUSE_CLICK_ORPC_PATH = '/browser/mouseClick'
export const MOBILE_BROWSER_MOUSE_MOVE_ORPC_PATH = '/browser/mouseMove'
export const MOBILE_BROWSER_MOUSE_DOWN_ORPC_PATH = '/browser/mouseDown'
export const MOBILE_BROWSER_MOUSE_UP_ORPC_PATH = '/browser/mouseUp'
export const MOBILE_BROWSER_MOUSE_WHEEL_ORPC_PATH = '/browser/mouseWheel'
export const MOBILE_BROWSER_TAB_CREATE_ORPC_PATH = '/browser/tabCreate'
export const MOBILE_BROWSER_DIALOG_ACCEPT_ORPC_PATH = '/browser/dialogAccept'
export const MOBILE_BROWSER_DIALOG_DISMISS_ORPC_PATH = '/browser/dialogDismiss'

export const MobileBrowserTargetRequestSchema = z.object({
  worktree: z.string().min(1),
  page: z.string().min(1)
})

export const MobileBrowserScreencastRequestSchema = MobileBrowserTargetRequestSchema.extend({
  format: z.enum(['jpeg', 'png']),
  quality: z.number().finite().optional(),
  maxWidth: z.number().finite().optional(),
  maxHeight: z.number().finite().optional(),
  viewportWidth: z.number().finite().optional(),
  viewportHeight: z.number().finite().optional(),
  deviceScaleFactor: z.number().finite().optional(),
  mobile: z.boolean().optional(),
  everyNthFrame: z.number().finite().optional(),
  minFrameIntervalMs: z.number().finite().optional()
})

export const MobileBrowserScreencastEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    subscriptionId: z.string().min(1),
    browserPageId: z.string().min(1),
    format: z.enum(['jpeg', 'png']),
    tab: z.object({ url: z.string(), title: z.string() })
  }),
  z.object({ type: z.literal('end'), subscriptionId: z.string().min(1) }),
  z.object({ type: z.literal('dialog'), dialogType: z.string(), message: z.string() }),
  z.object({ type: z.literal('dialogClosed') }),
  z.object({ type: z.literal('error'), message: z.string() })
])

export const MobileBrowserGotoRequestSchema = MobileBrowserTargetRequestSchema.extend({
  url: z.string().min(1)
})

export const MobileBrowserNavigationResultSchema = z.object({
  url: z.string(),
  title: z.string()
})

export const MobileBrowserKeyRequestSchema = MobileBrowserTargetRequestSchema.extend({
  value: z.string()
})

export const MobileBrowserMouseCoordinatesRequestSchema = MobileBrowserTargetRequestSchema.extend({
  x: z.number().finite(),
  y: z.number().finite()
})

export const MobileBrowserMouseClickRequestSchema =
  MobileBrowserMouseCoordinatesRequestSchema.extend({
    button: z.enum(['left', 'right', 'middle']).optional(),
    radius: z.number().finite().optional(),
    modifiers: z.array(z.enum(['cmd', 'ctrl', 'alt', 'shift'])).optional()
  })

export const MobileBrowserMouseButtonRequestSchema = MobileBrowserTargetRequestSchema.extend({
  button: z.enum(['left', 'right', 'middle']).optional()
})

export const MobileBrowserMouseWheelRequestSchema = MobileBrowserTargetRequestSchema.extend({
  dx: z.number().finite().optional(),
  dy: z.number().finite()
})

export const MobileBrowserTabCreateRequestSchema = z.object({
  worktree: z.string().min(1),
  url: z.string().min(1),
  activate: z.boolean().optional()
})

export const MobileBrowserTabCreateResultSchema = z.object({
  browserPageId: z.string().min(1)
})

export const MobileBrowserDialogAcceptRequestSchema = MobileBrowserTargetRequestSchema.extend({
  text: z.string().optional()
})

export const MOBILE_BROWSER_SCREENCAST_WIRE_IS_COMPATIBLE: BrowserScreencastResult extends z.infer<
  typeof MobileBrowserScreencastEventSchema
>
  ? true
  : false = true

export const MOBILE_BROWSER_NAVIGATION_WIRE_IS_COMPATIBLE: BrowserNavigationResult extends z.infer<
  typeof MobileBrowserNavigationResultSchema
>
  ? true
  : false = true

export const MOBILE_BROWSER_TAB_CREATE_WIRE_IS_COMPATIBLE: BrowserTabCreateResult extends z.infer<
  typeof MobileBrowserTabCreateResultSchema
>
  ? true
  : false = true
