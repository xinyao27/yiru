/**
 * Phase 5 slice 2 (docs/reference/terminal-query-authority.md §View-attribute
 * bridge): host-side cache of the renderer's terminal view-attribute RPC.
 * One app-global snapshot, not per-PTY — per-pane font zoom never
 * affects these attributes and the color/cursor settings are global.
 *
 * Null until the first call, and the responder answers NO view-attribute
 * query while null (silent-until-first-push): a fabricated default would
 * resurrect the default-black OSC-11 bug. Staleness is bounded by one IPC
 * call; subscribed TUIs are corrected by the renderer-owned 2031/997 flip.
 */
import {
  terminalViewAttributesEqual,
  type TerminalViewAttributes
} from '~shared/terminal/view-attributes'

// Why module state: the RPC handler writes once, while every live runtime
// emulator consults the same app-global appearance at reply time.
let currentAttributes: TerminalViewAttributes | null = null

// Why appliers (pattern of registerConptyDa1OverrideInstaller): each push
// must also reach already-live emulators — cursor options under the replay
// guard, plus the per-PTY override reset a theme apply implies.
type TerminalViewAttributesApplier = (attributes: TerminalViewAttributes) => void
const pushAppliers = new Set<TerminalViewAttributesApplier>()

export function registerTerminalViewAttributesApplier(
  applier: TerminalViewAttributesApplier
): void {
  pushAppliers.add(applier)
}

/** Called from the terminal RPC handler. Last call wins. */
export function setTerminalViewAttributes(attributes: TerminalViewAttributes): void {
  // Why idempotent: the renderer publisher's dedupe is per-process, so a
  // fresh renderer (second window, reload, macOS re-activation) re-pushes
  // identical attributes. That is not a theme apply — fanning out would wipe
  // every PTY's OSC SET overlay while visible panes keep theirs.
  if (currentAttributes && terminalViewAttributesEqual(currentAttributes, attributes)) {
    return
  }
  currentAttributes = attributes
  for (const applier of pushAppliers) {
    applier(attributes)
  }
}

export function getTerminalViewAttributes(): TerminalViewAttributes | null {
  return currentAttributes
}
