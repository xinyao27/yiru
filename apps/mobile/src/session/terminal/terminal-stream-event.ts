import { isTerminalOscLinkRanges } from '~/terminal/osc-link-ranges'
import type { TerminalWebViewHandle } from '~/terminal/webview/contract'

import type { MobileDisplayMode } from '../screen-state'
import type { MobileTerminalDiagnostics } from './diagnostics'
import { updateTerminalCwdFromStreamEvent } from './records'

export type MobileTerminalStreamEventContext = {
  handle: string
  // Subscription generation this event belongs to; every re-check after an await
  // compares it against subscribeSeqRef so a superseded stream can't mutate state.
  seq: number
  diagnostics: MobileTerminalDiagnostics
  subscribeSeqRef: React.RefObject<Map<string, number>>
  layoutSeqRef: React.RefObject<Map<string, number>>
  initializedHandlesRef: React.RefObject<Set<string>>
  terminalCwdRef: React.RefObject<Map<string, string>>
  viewportRef: React.RefObject<{ cols: number; rows: number } | null>
  viewportMeasuredRef: React.RefObject<boolean>
  terminalFrameHeightRef: React.RefObject<number>
  getTerminalRef: (handle: string | null) => TerminalWebViewHandle | undefined
  setTerminalModes: React.Dispatch<React.SetStateAction<Map<string, MobileDisplayMode>>>
  scheduleDelayedAction: (fn: () => void, ms: number) => void
  unsubscribeTerminal: (handle: string) => void
  subscribeToTerminal: (handle: string) => void
}

// Applies one terminal stream frame (scrollback / data / metadata / resized) to
// the xterm WebView. Split out of the subscription hook because the layout-seq
// staleness rules and the cold-start measure→resubscribe dance are the terminal's
// own protocol, not subscription bookkeeping.
export function handleMobileTerminalStreamEvent(
  data: Record<string, unknown>,
  ctx: MobileTerminalStreamEventContext
): void {
  const {
    handle,
    seq,
    diagnostics,
    subscribeSeqRef,
    layoutSeqRef,
    initializedHandlesRef,
    terminalCwdRef,
    viewportRef,
    viewportMeasuredRef,
    terminalFrameHeightRef,
    getTerminalRef,
    setTerminalModes,
    scheduleDelayedAction,
    unsubscribeTerminal,
    subscribeToTerminal
  } = ctx
  // Why: stale-event filter. Server-side state machine bumps a
  // monotonic seq on every applyLayout. Drop `resized` events
  // whose seq is strictly older than what we've already observed
  // for this handle — they're late-arriving from a superseded
  // layout. `scrollback` is the response to a fresh subscribe,
  // so it always resets the high-water mark regardless of seq
  // (post-WS-reconnect or post-resubscribe the server may emit
  // scrollback at a seq lower than what we'd seen pre-reconnect;
  // dropping it would leave the user with a blank terminal).
  const eventSeq = typeof data.seq === 'number' ? data.seq : null
  if (eventSeq != null && data.type === 'resized') {
    const last = layoutSeqRef.current.get(handle)
    if (last != null && eventSeq < last && last - eventSeq <= 20) {
      console.log('[fit][session] DROP-stale-seq', {
        handle: handle.slice(-8),
        type: data.type,
        eventSeq,
        lastSeq: last,
        cols: data.cols,
        rows: data.rows,
        displayMode: data.displayMode
      })
      return
    }
    layoutSeqRef.current.set(handle, eventSeq)
  } else if (eventSeq != null && data.type === 'scrollback') {
    layoutSeqRef.current.set(handle, eventSeq)
  }
  if (data.type === 'scrollback') {
    diagnostics.streamScrollback(handle, seq, eventSeq, data)
    if (initializedHandlesRef.current.has(handle)) {
      return
    }
    updateTerminalCwdFromStreamEvent(handle, data, terminalCwdRef.current)
    const cols = (data.cols as number) || 80
    const rows = (data.rows as number) || 24
    const scrollbackCols = cols
    const scrollbackRows = rows
    const initialData =
      typeof data.serialized === 'string' && data.serialized.length > 0 ? data.serialized : ''
    const oscLinks = isTerminalOscLinkRanges(data.oscLinks) ? data.oscLinks : undefined
    const ref = getTerminalRef(handle)
    // Why: previously we set `initializedHandlesRef` even when the
    // WebView wasn't mounted yet (ref=null). The init message went
    // nowhere, but the flag stayed true, so any subsequent scrollback
    // for THIS handle was silently dropped → blank terminal. Only
    // mark initialized if init() actually reached the WebView.
    if (!ref) {
      console.log('[fit][session] scrollback DROPPED — no terminal ref', {
        handle: handle.slice(-8),
        cols,
        rows
      })
      return
    }
    ref.init(cols, rows, initialData, false, oscLinks)
    initializedHandlesRef.current.add(handle)
    if (data.displayMode) {
      setTerminalModes((prev) => new Map(prev).set(handle, data.displayMode as MobileDisplayMode))
    }
    // Why: belt-and-suspenders cold-start fit. The applyFitScale
    // queued by init() runs after writes drain, but on cold start
    // xterm's scrollWidth can still be transient when it commits.
    // Re-fire after a short delay so it runs against a settled DOM.
    // Mirrors the 'resized' handler below.
    scheduleDelayedAction(() => getTerminalRef(handle)?.resetZoom(), 200)
    // Why: viewport measurement needs xterm to be initialized (cell
    // dimensions come from the renderer). On the first subscribe the
    // WebView hasn't loaded yet, so viewportRef is null and the server
    // can't auto-fit. After the first init we can measure, then
    // resubscribe so the server gets the viewport and phone-fits.
    // If viewport was measured by a parallel path BUT the scrollback
    // we just received came back at desktop dims, our subscribe
    // beat the measure; the server still has a null viewport for
    // this subscriber record — resubscribe so it gets stored.
    const needsResubscribe =
      !viewportMeasuredRef.current ||
      (viewportRef.current != null &&
        (scrollbackCols !== viewportRef.current.cols ||
          scrollbackRows !== viewportRef.current.rows))
    if (needsResubscribe) {
      void (async () => {
        // Why: wait for the WebView's init() rAF chain to fully
        // run (term.open → renderService population → first
        // paint) before measuring. Without this, the measure
        // postMessage races ahead of init's async work and
        // returns null (term not ready / cells size 0), the
        // resubscribe never fires, and the server never gets
        // phone dims. See log dump 2026-05-06 confirming the
        // race + measure-result null pattern.
        await getTerminalRef(handle)?.awaitReady()
        if (subscribeSeqRef.current.get(handle) !== seq) {
          return
        }
        const dims = await getTerminalRef(handle)?.measureFitDimensions(
          terminalFrameHeightRef.current || undefined
        )
        // Why: re-check seq after the awaits — awaitReady (up to
        // 3s) and measureFitDimensions can take hundreds of ms,
        // during which a newer subscribe cycle may have armed
        // its own subscription. Tearing it down here would reset
        // the freshly-armed initialized flag and re-subscribe a
        // stale generation.
        if (subscribeSeqRef.current.get(handle) !== seq) {
          return
        }
        if (!getTerminalRef(handle)) {
          return
        }
        // Why: we just got `scrollback` with cols=80 (server's
        // default fallback for null viewport). That means the
        // server-side subscriber record was registered before we
        // could send viewport. Even if `viewportMeasuredRef`
        // raced ahead via a parallel `measureViewportOnce`, the
        // server still has a null viewport for THIS subscriber
        // record — we MUST resubscribe so the server stores it.
        if (dims) {
          diagnostics.streamResubscribing(handle, seq, dims)
          viewportRef.current = dims
          viewportMeasuredRef.current = true
          unsubscribeTerminal(handle)
          initializedHandlesRef.current.delete(handle)
          subscribeToTerminal(handle)
        }
      })()
    }
  } else if (data.type === 'metadata') {
    updateTerminalCwdFromStreamEvent(handle, data, terminalCwdRef.current)
  } else if (data.type === 'data') {
    updateTerminalCwdFromStreamEvent(handle, data, terminalCwdRef.current)
    // Why: log when data arrives but the WebView ref is missing
    // — this is the most likely cause of "blank but input works":
    // server stream is alive, sends flow, but writes are dropped
    // because the WebView ref disappeared (unmount mid-flight) or
    // the scrollback never landed (so xterm has no buffer).
    const dataRef = getTerminalRef(handle)
    if (!dataRef) {
      console.log('[fit][session] data DROPPED — no terminal ref', {
        handle: handle.slice(-8),
        chunkLen: typeof data.chunk === 'string' ? data.chunk.length : 0,
        initialized: initializedHandlesRef.current.has(handle)
      })
      return
    }
    if (!initializedHandlesRef.current.has(handle)) {
      console.log('[fit][session] data RECEIVED before scrollback', {
        handle: handle.slice(-8),
        chunkLen: typeof data.chunk === 'string' ? data.chunk.length : 0
      })
    }
    dataRef.write(data.chunk as string)
  } else if (data.type === 'resized') {
    updateTerminalCwdFromStreamEvent(handle, data, terminalCwdRef.current)
    // Why: inline resize event — the server changed the PTY dimensions
    // (mode toggle, desktop restore, or a width reflow). When the server
    // includes a fresh full-buffer snapshot (width reflow), reinitialize
    // xterm at the new dims so the hard-wrapped scrollback rewraps;
    // preserve the reader's scroll position across the replay. Otherwise
    // resize xterm geometry and let the TUI's own redraw repaint.
    const cols = (data.cols as number) || 80
    const rows = (data.rows as number) || 24
    const serialized = typeof data.serialized === 'string' ? data.serialized : null
    diagnostics.streamResized(handle, seq, eventSeq, data, getTerminalRef(handle) != null)
    const oscLinks = isTerminalOscLinkRanges(data.oscLinks) ? data.oscLinks : undefined
    if (serialized != null) {
      getTerminalRef(handle)?.init(cols, rows, serialized, true, oscLinks)
    } else {
      getTerminalRef(handle)?.resize(cols, rows)
    }
    if (data.displayMode) {
      setTerminalModes((prev) => new Map(prev).set(handle, data.displayMode as MobileDisplayMode))
    }
    scheduleDelayedAction(() => getTerminalRef(handle)?.resetZoom(), 200)
  }
}
