import type { Terminal } from '@xterm/xterm'
import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'
import { observeTerminalBracketedPasteModeOutput } from '~renderer/terminal/bracketed-paste'
import { containsStatefulRendererQuery } from '~renderer/terminal/reply-query-extraction'

import { sendTerminalOscColorQueryReplies } from '../terminal-capability-replies'
import { consumePtyDataMetaChars, type HiddenRendererQuery } from './hidden-renderer-query'
import type { OrderedOutputSequence } from './ordered-output-sequence'

type RestoreState = {
  appliesToCurrentPty: boolean
  isNeeded: boolean
  isInFlight: boolean
}

type HiddenRestorePort = {
  resetIfPtyChanged: () => void
  isForegroundBackpressure: () => boolean
  noteFloodBackpressure: () => void
  markNeeded: () => void
  getState: () => RestoreState
  markFreshSnapshotNeeded: () => void
  shouldSkipRendererOutput: (foreground: boolean, data: string) => boolean
  skipRendererOutput: (data: string) => void
  skipBackgroundAlternateScreenOutput: (data: string) => void
  queueLiveChunk: (data: string, meta?: PtyDataMeta) => void
  request: () => void
  resetSkippedRendererRisk: () => void
}

type OutputDeliveryOptions = {
  terminal: Terminal
  query: HiddenRendererQuery
  orderedOutput: OrderedOutputSequence
  hiddenRestore: HiddenRestorePort
  getPaneIsForeground: () => boolean
  observeActivity: () => void
  filterStartupOutput: (data: string) => string
  observeStartupDraft: (data: string) => void
  respondToPixelSizeQueries: (data: string) => void
  observeSideEffects?: (data: string) => void
  observeCommandCode?: (data: string) => void
  sendImmediate: (data: string) => boolean
  write: (
    data: string,
    foreground: boolean,
    options?: { hiddenStartupRendererQuery?: boolean }
  ) => void
  scheduleStartupCommand: () => void
}

export function deliverPtyOutput(
  options: OutputDeliveryOptions,
  incomingData: string,
  incomingMeta?: PtyDataMeta
): void {
  let data = incomingData
  let meta = incomingMeta
  if (data.length > 0) {
    options.observeActivity()
  }
  data = options.filterStartupOutput(data)
  options.observeStartupDraft(data)
  options.hiddenRestore.resetIfPtyChanged()
  if (meta?.droppedOutput === true) {
    if (meta.background !== true && options.hiddenRestore.isForegroundBackpressure()) {
      options.hiddenRestore.noteFloodBackpressure()
    } else {
      options.hiddenRestore.markNeeded()
      if (data) {
        options.query.salvageDiscarded(data)
      }
      return
    }
  }
  options.respondToPixelSizeQueries(data)
  observeTerminalBracketedPasteModeOutput(options.terminal, data)
  options.observeSideEffects?.(data)
  options.observeCommandCode?.(data)
  const paneIsForeground = options.getPaneIsForeground()
  const foreground = paneIsForeground && meta?.background !== true
  if (foreground && options.query.hasPendingModeSequence()) {
    options.query.observeMode2031(data)
  }
  const reconciliation = options.orderedOutput.reconcileLive(data, meta)
  if (reconciliation.action === 'drop-duplicate') {
    return
  }
  if (reconciliation.action === 'force-fresh-restore') {
    if (foreground && options.hiddenRestore.isForegroundBackpressure()) {
      options.hiddenRestore.noteFloodBackpressure()
      options.orderedOutput.clearSnapshotBaseline()
    } else {
      const wasInFlight = options.hiddenRestore.getState().isInFlight
      options.hiddenRestore.markNeeded()
      if (wasInFlight) {
        options.hiddenRestore.markFreshSnapshotNeeded()
      }
      return
    }
  } else {
    data = reconciliation.data
    meta = reconciliation.meta
  }
  const pendingForegroundQuery = foreground ? options.query.takePendingForForeground(data) : null
  const rendererData = pendingForegroundQuery?.remainingData ?? data
  const rendererMeta = consumePtyDataMetaChars(
    meta,
    pendingForegroundQuery?.consumedCurrentChars ?? 0
  )
  options.orderedOutput.observeChannel(meta)
  const orderedRendererData = foreground
    ? rendererData
    : options.orderedOutput.sliceAfterRendered(rendererData, rendererMeta)
  if (orderedRendererData === null) {
    options.hiddenRestore.markNeeded()
    options.scheduleStartupCommand()
    return
  }
  if (!foreground && orderedRendererData.length === 0) {
    options.scheduleStartupCommand()
    return
  }
  if (pendingForegroundQuery?.statelessQueryData) {
    options.write(pendingForegroundQuery.statelessQueryData, true, {
      hiddenStartupRendererQuery: true
    })
  }
  if (pendingForegroundQuery?.oscColorQueryData) {
    sendTerminalOscColorQueryReplies(
      pendingForegroundQuery.oscColorQueryData,
      options.terminal,
      options.sendImmediate
    )
  }
  const restore = options.hiddenRestore.getState()
  const skipBackgroundAlternateScreenFrame =
    meta?.background === true &&
    paneIsForeground &&
    options.terminal.buffer.active.type === 'alternate' &&
    !containsStatefulRendererQuery(orderedRendererData)
  if (skipBackgroundAlternateScreenFrame) {
    options.hiddenRestore.skipBackgroundAlternateScreenOutput(orderedRendererData)
  } else if (options.hiddenRestore.shouldSkipRendererOutput(foreground, orderedRendererData)) {
    options.hiddenRestore.skipRendererOutput(orderedRendererData)
  } else if ((restore.isNeeded || restore.isInFlight) && restore.appliesToCurrentPty) {
    if (foreground) {
      if (pendingForegroundQuery?.statefulQueryData) {
        options.hiddenRestore.queueLiveChunk(pendingForegroundQuery.statefulQueryData)
      }
      options.hiddenRestore.queueLiveChunk(orderedRendererData, rendererMeta)
      options.hiddenRestore.request()
    } else if (restore.isInFlight) {
      options.hiddenRestore.resetSkippedRendererRisk()
      options.hiddenRestore.markFreshSnapshotNeeded()
    }
  } else {
    if (pendingForegroundQuery?.statefulQueryData) {
      options.write(pendingForegroundQuery.statefulQueryData, true, {
        hiddenStartupRendererQuery: true
      })
    }
    options.write(orderedRendererData, foreground)
    if (foreground) {
      options.orderedOutput.recordRendered(rendererMeta)
    }
  }
  options.scheduleStartupCommand()
}
