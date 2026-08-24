import type { ChildProcess } from 'node:child_process'

import type { BrowserError } from './cdp-bridge'
import type { CdpWsProxy } from './cdp-ws-proxy'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before
// agent-browser's own timeout fires and returns a proper error.
export const EXEC_TIMEOUT_MS = 90_000
export const CONSECUTIVE_TIMEOUT_LIMIT = 3
export const WAIT_PROCESS_TIMEOUT_GRACE_MS = 1_000
export const STALE_SESSION_CLOSE_TIMEOUT_MS = 3_000
export const PAGE_REPLACEMENT_WAIT_TIMEOUT_MS = 2_000
export const PAGE_REPLACEMENT_POLL_MS = 25
export const AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES = 8 * 1024
export const AGENT_BROWSER_CLIPBOARD_WRITE_MAX_BYTES = AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES

export type SessionState = {
  proxy: CdpWsProxy
  cdpEndpoint: string
  initialized: boolean
  consecutiveTimeouts: number
  // Why: track active interception patterns so they can be re-enabled after session restart
  activeInterceptPatterns: string[]
  activeCapture: boolean
  // Why: the backend page can be replaced while the stable product page remains.
  // Queue-time checks compare this opaque identity instead of an Electron-only id.
  backendPageId: string
  browserPageId: string
  activeProcess: ChildProcess | null
}

export type QueuedCommand = {
  execute: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export type ResolvedBrowserCommandTarget = {
  browserPageId: string
  backendPageId: string
}

export type BrowserMouseModifier = 'cmd' | 'ctrl' | 'alt' | 'shift'

export function focusedValueSetExpression(
  valueExpression: string,
  options?: { append?: boolean; dispatchEvents?: boolean }
): string {
  const nextValue = options?.append
    ? ["String(target.value ?? '') + ", valueExpression].join('')
    : valueExpression
  const dispatchEvents = options?.dispatchEvents
    ? " target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true }));"
    : ''
  return [
    '(() => { const el = document.activeElement; if (el) {',
    // Why: ARIA spinbutton wrappers can hold focus while a contained or controlled input owns the value.
    " const editableSelector = \"input:not([type='hidden']):not([type='button']):not([type='checkbox']):not([type='radio']):not([type='file']):not([type='image']):not([type='reset']):not([type='submit']), textarea\";",
    " const isEditable = (node) => !!node && (node.matches?.(editableSelector) ?? (node.tagName === 'TEXTAREA' || (node.tagName === 'INPUT' && !/^(hidden|button|checkbox|radio|file|image|reset|submit)$/i.test(node.getAttribute?.('type') ?? ''))));",
    ' const findEditable = (root) => root?.querySelector?.(editableSelector) ?? null;',
    ' let target = el;',
    " if (!isEditable(target) && target.getAttribute?.('role') === 'spinbutton') {",
    "   const controls = target.getAttribute('aria-controls');",
    '   if (controls) { for (const id of controls.split(/\\s+/)) { if (!id) continue; const controlled = document.getElementById(id); if (isEditable(controlled)) { target = controlled; break; } const descendant = findEditable(controlled); if (descendant) { target = descendant; break; } } }',
    '   if (target === el) { const descendant = findEditable(target); if (descendant) target = descendant; }',
    ' }',
    " const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;",
    ' const nextValue = ',
    nextValue,
    '; if (nativeSetter) { nativeSetter.call(target, nextValue); } else { target.value = nextValue; }',
    dispatchEvents,
    ' } })()'
  ].join('')
}

// Why: rich editors reconcile only browser editing transactions; direct DOM
// fallback can look correct while leaving their model stale.
export function focusedRichTextEditExpression(
  valueExpression: string,
  options?: { selectAll?: boolean }
): string {
  const selectAll = options?.selectAll ? 'true' : 'false'
  return [
    '(() => {',
    ' const target = document.activeElement;',
    ' const value = ',
    valueExpression,
    ';',
    ` const selectAll = ${selectAll};`,
    " const isEditable = target?.isContentEditable === true || /^(|true|plaintext-only)$/i.test(target?.getAttribute?.('contenteditable') ?? 'false');",
    " if (!target || target === document.body || !isEditable) { throw new Error('Focused rich-text target is unavailable'); }",
    ' if (selectAll) {',
    "   if (typeof window.getSelection !== 'function') { throw new Error('Rich-text selection is unavailable'); }",
    '   const selection = window.getSelection();',
    "   if (!selection) { throw new Error('Rich-text selection is unavailable'); }",
    '   selection.selectAllChildren(target);',
    ' }',
    " const editCommand = selectAll && value.length === 0 ? 'delete' : 'insertText';",
    ' let edited = false;',
    ' try {',
    '   edited = document.execCommand(editCommand, false, value) === true;',
    ' } catch { edited = false; }',
    " if (!edited) { throw new Error('Browser rich-text editing command failed'); }",
    ' })()'
  ].join('')
}

export function isExplicitContentEditableResult(result: unknown): boolean {
  const value =
    result && typeof result === 'object' ? (result as { value?: unknown }).value : undefined
  return typeof value === 'string' && /^(|true|plaintext-only)$/i.test(value)
}

export type AgentBrowserExecOptions = {
  envOverrides?: NodeJS.ProcessEnv
  timeoutMs?: number
  timeoutError?: BrowserError
  stdinText?: string
}

export type EnqueueTargetedCommandOptions = {
  ensureSession?: boolean
  ensureVisible?: boolean
  // Why: text-mutating commands must never fall back to the global active tab,
  // which can point at a different worktree the user is currently viewing.
  requireScopedTarget?: boolean
}

export type AgentBrowserBridgeOptions = {
  onTabsChanged?: (worktreeId?: string) => void
}
