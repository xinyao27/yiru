import {
  handleSettingsGet,
  handleSettingsGetTerminalQuickCommands,
  handleSettingsListFonts,
  handleSettingsPreviewGhosttyImport,
  handleSettingsPreviewWarpThemeImport,
  handleSettingsUpdate,
  handleSettingsUpdatePRBotAuthorOverride,
  handleSettingsUpdateTerminalQuickCommands,
  handleUIGet,
  handleUIRecordFeatureInteraction,
  handleUISet
} from '~main/runtime/rpc/methods/client-ui'
import {
  abortClipboardImageUpload,
  appendClipboardImageUploadChunk,
  commitClipboardImageUpload,
  saveClipboardImageAsTempFile,
  startClipboardImageUpload
} from '~main/runtime/rpc/methods/clipboard'
import { handleSettingsEventsSubscribe } from '~main/runtime/rpc/methods/settings-events'
import { handleUIEventsSubscribe } from '~main/runtime/rpc/methods/ui-events'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: settings, ui, and clipboard are renderer-support surfaces that don't
// belong to any one workspace, project, or agent session — they configure
// or assist the client itself.
export const clientSurfaceRuntimeHandlers = {
  clipboard: {
    saveImageAsTempFile: runtimeImplementation.clipboard.saveImageAsTempFile.handler(
      wireRuntimeMethod('clipboard.saveImageAsTempFile', saveClipboardImageAsTempFile)
    ),
    startImageUpload: runtimeImplementation.clipboard.startImageUpload.handler(
      wireRuntimeMethod('clipboard.startImageUpload', startClipboardImageUpload)
    ),
    appendImageUploadChunk: runtimeImplementation.clipboard.appendImageUploadChunk.handler(
      wireRuntimeMethod('clipboard.appendImageUploadChunk', appendClipboardImageUploadChunk)
    ),
    commitImageUpload: runtimeImplementation.clipboard.commitImageUpload.handler(
      wireRuntimeMethod('clipboard.commitImageUpload', commitClipboardImageUpload)
    ),
    abortImageUpload: runtimeImplementation.clipboard.abortImageUpload.handler(
      wireRuntimeMethod('clipboard.abortImageUpload', abortClipboardImageUpload)
    )
  },
  settings: {
    get: runtimeImplementation.settings.get.handler(
      wireRuntimeMethod('settings.get', handleSettingsGet)
    ),
    update: runtimeImplementation.settings.update.handler(
      wireRuntimeMethod('settings.update', handleSettingsUpdate)
    ),
    getTerminalQuickCommands: runtimeImplementation.settings.getTerminalQuickCommands.handler(
      wireRuntimeMethod('settings.getTerminalQuickCommands', handleSettingsGetTerminalQuickCommands)
    ),
    updateTerminalQuickCommands: runtimeImplementation.settings.updateTerminalQuickCommands.handler(
      wireRuntimeMethod(
        'settings.updateTerminalQuickCommands',
        handleSettingsUpdateTerminalQuickCommands
      )
    ),
    updatePRBotAuthorOverride: runtimeImplementation.settings.updatePRBotAuthorOverride.handler(
      wireRuntimeMethod(
        'settings.updatePRBotAuthorOverride',
        handleSettingsUpdatePRBotAuthorOverride
      )
    ),
    listFonts: runtimeImplementation.settings.listFonts.handler(
      wireRuntimeMethod('settings.listFonts', handleSettingsListFonts)
    ),
    previewGhosttyImport: runtimeImplementation.settings.previewGhosttyImport.handler(
      wireRuntimeMethod('settings.previewGhosttyImport', handleSettingsPreviewGhosttyImport)
    ),
    previewWarpThemeImport: runtimeImplementation.settings.previewWarpThemeImport.handler(
      wireRuntimeMethod('settings.previewWarpThemeImport', handleSettingsPreviewWarpThemeImport)
    ),
    events: {
      subscribe: runtimeImplementation.settings.events.subscribe.handler(
        wireRuntimeStream('settings.events.subscribe', handleSettingsEventsSubscribe)
      )
    }
  },
  ui: {
    get: runtimeImplementation.ui.get.handler(wireRuntimeMethod('ui.get', handleUIGet)),
    set: runtimeImplementation.ui.set.handler(wireRuntimeMethod('ui.set', handleUISet)),
    recordFeatureInteraction: runtimeImplementation.ui.recordFeatureInteraction.handler(
      wireRuntimeMethod('ui.recordFeatureInteraction', handleUIRecordFeatureInteraction)
    ),
    events: {
      subscribe: runtimeImplementation.ui.events.subscribe.handler(
        wireRuntimeStream('ui.events.subscribe', handleUIEventsSubscribe)
      )
    }
  }
} as const
