import type { IDisposable } from '@xterm/xterm'
import { useRef } from 'react'

export type TerminalPaneResources = {
  fileLinkClickFallbackDisposablesRef: React.RefObject<Map<number, IDisposable>>
  httpLinkClickFallbackDisposablesRef: React.RefObject<Map<number, IDisposable>>
  imeCompositionDisposablesRef: React.RefObject<Map<number, IDisposable>>
  imeNativeTextForwarderDisposablesRef: React.RefObject<Map<number, IDisposable>>
  linkProviderDisposablesRef: React.RefObject<Map<number, IDisposable>>
  mode2031DisposablesRef: React.RefObject<Map<number, IDisposable[]>>
  mouseHideDisposablesRef: React.RefObject<Map<number, IDisposable>>
  osc52DisposablesRef: React.RefObject<Map<number, IDisposable>>
  osc7DisposablesRef: React.RefObject<Map<number, IDisposable>>
  queuedInitialCwdRef: React.RefObject<string | null | undefined>
  restoredViewportBlankingPanesRef: React.RefObject<Set<number>>
  selectionCaptureTimersRef: React.RefObject<Map<number, number>>
  selectionDisposablesRef: React.RefObject<Map<number, IDisposable>>
  terminalHandleLinkDisposablesRef: React.RefObject<Map<number, IDisposable>>
}

export function useTerminalPaneResources(): TerminalPaneResources {
  const fileLinkClickFallbackDisposablesRef = useRef(new Map<number, IDisposable>())
  const httpLinkClickFallbackDisposablesRef = useRef(new Map<number, IDisposable>())
  const imeCompositionDisposablesRef = useRef(new Map<number, IDisposable>())
  const imeNativeTextForwarderDisposablesRef = useRef(new Map<number, IDisposable>())
  const linkProviderDisposablesRef = useRef(new Map<number, IDisposable>())
  const mode2031DisposablesRef = useRef(new Map<number, IDisposable[]>())
  const mouseHideDisposablesRef = useRef(new Map<number, IDisposable>())
  const osc52DisposablesRef = useRef(new Map<number, IDisposable>())
  const osc7DisposablesRef = useRef(new Map<number, IDisposable>())
  const queuedInitialCwdRef = useRef<string | null | undefined>(undefined)
  const restoredViewportBlankingPanesRef = useRef(new Set<number>())
  const selectionCaptureTimersRef = useRef(new Map<number, number>())
  const selectionDisposablesRef = useRef(new Map<number, IDisposable>())
  const terminalHandleLinkDisposablesRef = useRef(new Map<number, IDisposable>())

  return {
    fileLinkClickFallbackDisposablesRef,
    httpLinkClickFallbackDisposablesRef,
    imeCompositionDisposablesRef,
    imeNativeTextForwarderDisposablesRef,
    linkProviderDisposablesRef,
    mode2031DisposablesRef,
    mouseHideDisposablesRef,
    osc52DisposablesRef,
    osc7DisposablesRef,
    queuedInitialCwdRef,
    restoredViewportBlankingPanesRef,
    selectionCaptureTimersRef,
    selectionDisposablesRef,
    terminalHandleLinkDisposablesRef
  }
}
