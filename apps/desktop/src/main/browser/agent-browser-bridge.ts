/* eslint-disable max-lines */
import { execFile, type ChildProcess } from 'node:child_process'
import { existsSync, accessSync, chmodSync, readFileSync, constants } from 'node:fs'
import { platform, arch } from 'node:os'
import { join } from 'node:path'

import type {
  BrowserAgentCommandResult,
  BrowserInterceptListResult,
  BrowserMouseClickResult
} from '@yiru/runtime-protocol/contract'
import { assertClipboardTextWriteWithinLimitWithYield } from '@yiru/workbench-model/ui'
import type {
  BrowserTabInfo,
  BrowserTabListResult,
  BrowserTabSwitchResult,
  BrowserSnapshotResult,
  BrowserClickResult,
  BrowserGotoResult,
  BrowserFillResult,
  BrowserTypeResult,
  BrowserSelectResult,
  BrowserScrollResult,
  BrowserBackResult,
  BrowserReloadResult,
  BrowserScreenshotResult,
  BrowserEvalResult,
  BrowserHoverResult,
  BrowserDragResult,
  BrowserUploadResult,
  BrowserWaitResult,
  BrowserCheckResult,
  BrowserFocusResult,
  BrowserClearResult,
  BrowserSelectAllResult,
  BrowserKeypressResult,
  BrowserPdfResult,
  BrowserCookieGetResult,
  BrowserCookieSetResult,
  BrowserCookieDeleteResult,
  BrowserViewportResult,
  BrowserGeolocationResult,
  BrowserInterceptEnableResult,
  BrowserInterceptDisableResult,
  BrowserConsoleResult,
  BrowserNetworkLogResult,
  BrowserCaptureStartResult,
  BrowserCaptureStopResult,
  BrowserCookie
} from '~shared/runtime-types'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { BrowserError } from './cdp-bridge'
import { captureFullPageScreenshot } from './cdp-screenshot'
import { CdpWsProxy } from './cdp-ws-proxy'
import type { BrowserPageProvider } from './page/catalog'
import type { BrowserPageCdpLease, BrowserPageHandle } from './page/handle'
import { iterateBrowserTextInsertionChunks } from './text-insertion'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before
// agent-browser's own timeout fires and returns a proper error.
const EXEC_TIMEOUT_MS = 90_000
const CONSECUTIVE_TIMEOUT_LIMIT = 3
const WAIT_PROCESS_TIMEOUT_GRACE_MS = 1_000
const STALE_SESSION_CLOSE_TIMEOUT_MS = 3_000
const PAGE_REPLACEMENT_WAIT_TIMEOUT_MS = 2_000
const PAGE_REPLACEMENT_POLL_MS = 25
export const AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES = 8 * 1024
export const AGENT_BROWSER_CLIPBOARD_WRITE_MAX_BYTES = AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES

type SessionState = {
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

type QueuedCommand = {
  execute: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

type ResolvedBrowserCommandTarget = {
  browserPageId: string
  backendPageId: string
}

export type BrowserMouseModifier = 'cmd' | 'ctrl' | 'alt' | 'shift'

function focusedValueSetExpression(
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
function focusedRichTextEditExpression(
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

function isExplicitContentEditableResult(result: unknown): boolean {
  const value =
    result && typeof result === 'object' ? (result as { value?: unknown }).value : undefined
  return typeof value === 'string' && /^(|true|plaintext-only)$/i.test(value)
}

type AgentBrowserExecOptions = {
  envOverrides?: NodeJS.ProcessEnv
  timeoutMs?: number
  timeoutError?: BrowserError
  stdinText?: string
}

type EnqueueTargetedCommandOptions = {
  ensureSession?: boolean
  ensureVisible?: boolean
  // Why: text-mutating commands must never fall back to the global active tab,
  // which can point at a different worktree the user is currently viewing.
  requireScopedTarget?: boolean
}

type AgentBrowserBridgeOptions = {
  onTabsChanged?: (worktreeId?: string) => void
}

function agentBrowserNativeName(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return `agent-browser-${platform()}-${arch()}${ext}`
}

function resolveAgentBrowserBinary(): string {
  const pathsProvider = getRuntimeHostPathsProvider()
  // Why: production builds copy the platform-specific binary into resources/
  // via electron-builder extraResources. Use the host's resolved resources path
  // instead of hand-rolling ../resources so packaged macOS builds keep working
  // on case-sensitive filesystems where Contents/Resources casing matters.
  const bundledResourcesPath =
    pathsProvider.resourcesPath() ??
    (process.platform === 'darwin'
      ? join(pathsProvider.executablePath(), '..', '..', 'Resources')
      : join(pathsProvider.executablePath(), '..', 'resources'))
  const bundled = join(bundledResourcesPath, agentBrowserNativeName())
  if (existsSync(bundled)) {
    return bundled
  }

  // Why: in dev mode, resolve directly to the native binary inside node_modules.
  // Use the host app path for a stable project root — __dirname is unreliable after
  // electron-vite bundles main process code into out/main/index.js.
  const nmBin = join(
    pathsProvider.appPath(),
    'node_modules',
    'agent-browser',
    'bin',
    agentBrowserNativeName()
  )
  if (existsSync(nmBin)) {
    if (process.platform !== 'win32') {
      try {
        accessSync(nmBin, constants.X_OK)
      } catch {
        chmodSync(nmBin, 0o755)
      }
    }
    return nmBin
  }

  // Last resort: assume it's on PATH
  return 'agent-browser'
}

// Why: exec commands arrive as a single string (e.g. 'keyboard inserttext "hello world"').
// Naive split on whitespace breaks quoted arguments. This parser respects double and
// single quotes so the value arrives as a single argument without surrounding quotes.
export function parseShellArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inDouble = false
  let inSingle = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (ch === ' ' && !inDouble && !inSingle) {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) {
    args.push(current)
  }
  return args
}

export function stripAgentBrowserTargetArgs(args: string[]): string[] {
  const stripped: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--cdp' || arg === '--session') {
      index++
      continue
    }
    if (arg.startsWith('--cdp=') || arg.startsWith('--session=')) {
      continue
    }
    stripped.push(arg)
  }
  return stripped
}

// Why: agent-browser returns generic error messages for stale/unknown refs.
// Map them to a specific code so agents can reliably detect and re-snapshot.
function classifyErrorCode(message: string): string {
  if (/unknown ref|ref not found|element not found: @e/i.test(message)) {
    return 'browser_stale_ref'
  }
  return 'browser_error'
}

function isTabClosedTransportError(message: string): boolean {
  return /session destroyed while command|session destroyed while commands|connection refused|cdp discovery methods failed|websocket connect failed/i.test(
    message
  )
}

function pageUnavailableMessageForSession(sessionName: string): string {
  const prefix = 'yiru-tab-'
  const browserPageId = sessionName.startsWith(prefix) ? sessionName.slice(prefix.length) : null
  return browserPageId
    ? `Browser page ${browserPageId} is no longer available`
    : 'Browser tab is no longer available'
}

type CdpMouseButton = 'left' | 'middle' | 'right'

type BrowserClickPoint = {
  x: number
  y: number
  adjusted: boolean
  handled: boolean
}

function normalizeCdpMouseButton(button?: string): CdpMouseButton {
  return button === 'middle' || button === 'right' ? button : 'left'
}

function cdpMouseButtonMask(button: CdpMouseButton): number {
  if (button === 'right') {
    return 2
  }
  if (button === 'middle') {
    return 4
  }
  return 1
}

function cdpMouseModifierMask(modifiers: BrowserMouseModifier[] | undefined): number {
  if (!modifiers || modifiers.length === 0) {
    return 0
  }
  let mask = 0
  for (const modifier of modifiers) {
    if (modifier === 'alt') {
      mask |= 1
    } else if (modifier === 'ctrl') {
      mask |= 2
    } else if (modifier === 'cmd') {
      mask |= 4
    } else if (modifier === 'shift') {
      mask |= 8
    }
  }
  return mask
}

function readClickPoint(value: unknown, fallback: BrowserClickPoint): BrowserClickPoint {
  const point = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  const x = point?.x
  const y = point?.y
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y)
  ) {
    return fallback
  }
  return { x, y, adjusted: point?.adjusted === true, handled: point?.handled === true }
}

function mobileTouchClickExpression(
  x: number,
  y: number,
  radius: number,
  allowDomActivation: boolean
): string {
  return `(() => {
    const inputX = ${JSON.stringify(x)};
    const inputY = ${JSON.stringify(y)};
    const radius = ${JSON.stringify(radius)};
    const allowDomActivation = ${JSON.stringify(allowDomActivation)};
    const selector = [
      'a[href]',
      'button',
      'input',
      'textarea',
      'select',
      'summary',
      'label',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[onclick]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const isUsable = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && style.pointerEvents !== 'none';
    };
    const dispatchClick = (target, clickX, clickY) => {
      try {
        if (typeof target.focus === 'function') {
          target.focus({ preventScroll: true });
        }
      } catch {
        try { target.focus(); } catch {}
      }
      if (typeof target.click === 'function') {
        target.click();
        return true;
      }
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: clickX,
        clientY: clickY,
        screenX: clickX,
        screenY: clickY,
        button: 0,
        buttons: 1
      };
      try {
        if (typeof PointerEvent === 'function') {
          target.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'touch', pointerId: 1 }));
          target.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0, pointerType: 'touch', pointerId: 1 }));
        }
      } catch {}
      target.dispatchEvent(new MouseEvent('mousedown', init));
      target.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
      return true;
    };
    const clickableFor = (el) => {
      for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        if (node.matches(selector)) return node;
        if (window.getComputedStyle(node).cursor === 'pointer') return node;
      }
      return null;
    };
    const offsets = [[0, 0]];
    for (const distance of [radius * 0.45, radius, radius * 1.35]) {
      for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI,
        Math.PI * 5 / 4, Math.PI * 3 / 2, Math.PI * 7 / 4]) {
        offsets.push([Math.cos(angle) * distance, Math.sin(angle) * distance]);
      }
    }
    let best = null;
    for (const [dx, dy] of offsets) {
      const px = inputX + dx;
      const py = inputY + dy;
      if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) continue;
      for (const el of document.elementsFromPoint(px, py)) {
        const target = clickableFor(el);
        if (!target || !isUsable(target)) continue;
        const rect = target.getBoundingClientRect();
        const clickX = clamp(inputX, rect.left + 1, rect.right - 1);
        const clickY = clamp(inputY, rect.top + 1, rect.bottom - 1);
        const score = Math.hypot(clickX - inputX, clickY - inputY) + Math.hypot(dx, dy) * 0.25;
        if (!best || score < best.score) best = { score, x: clickX, y: clickY, target };
        break;
      }
    }
    if (best && allowDomActivation && dispatchClick(best.target, best.x, best.y)) {
      return { x: best.x, y: best.y, adjusted: true, handled: true };
    }
    if (best) {
      return { x: best.x, y: best.y, adjusted: true, handled: false };
    }
    return { x: inputX, y: inputY, adjusted: false, handled: false };
  })()`
}

async function resolveMobileTouchClickPoint(
  cdp: BrowserPageCdpLease,
  x: number,
  y: number,
  radius: number | undefined,
  allowDomActivation: boolean
): Promise<BrowserClickPoint> {
  const fallback = { x, y, adjusted: false, handled: false }
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) {
    return fallback
  }
  try {
    const result = await cdp.sendCommand('Runtime.evaluate', {
      expression: mobileTouchClickExpression(x, y, radius, allowDomActivation),
      returnByValue: true,
      silent: true
    })
    const raw = result && typeof result === 'object' ? (result as Record<string, unknown>) : null
    const evaluated = raw?.result && typeof raw.result === 'object' ? raw.result : null
    return readClickPoint((evaluated as Record<string, unknown> | null)?.value, fallback)
  } catch {
    return fallback
  }
}

function translateResult(
  stdout: string
): { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } } {
  let parsed: { success?: boolean; data?: unknown; error?: string }
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return {
      ok: false,
      error: {
        code: 'browser_error',
        message: `Unexpected output from agent-browser: ${stdout.slice(0, 1000)}`
      }
    }
  }
  if (parsed.success) {
    return { ok: true, result: parsed.data }
  }
  const message = parsed.error ?? 'Unknown browser error'
  return {
    ok: false,
    error: {
      code: classifyErrorCode(message),
      message
    }
  }
}

export class AgentBrowserBridge {
  // Why: per-worktree active tab prevents one worktree's tab switch from
  // affecting another worktree's command targeting.
  private readonly activePagePerWorktree = new Map<string, string>()
  private activePageId: string | null = null
  private readonly sessions = new Map<string, SessionState>()
  private readonly commandQueues = new Map<string, QueuedCommand[]>()
  private readonly processingQueues = new Set<string>()
  // Why: screenshot prep temporarily changes shared renderer paintability state.
  // Per-session queues only serialize commands within one browser tab, so
  // concurrent screenshots on different tabs can otherwise interleave hidden
  // surface leases and blank each other's capture.
  private screenshotTurn: Promise<void> = Promise.resolve()
  private readonly agentBrowserBin: string
  // Why: when a process swap destroys a session that had active intercept patterns,
  // store them here keyed by sessionName so the next ensureSession + first successful
  // command can restore them automatically.
  private readonly pendingInterceptRestore = new Map<string, string[]>()
  // Why: two concurrent CLI calls can both enter ensureSession before either creates
  // the session entry. This promise-based lock ensures only one creation proceeds.
  private readonly pendingSessionCreation = new Map<string, Promise<void>>()
  // Why: session destruction shells out to `agent-browser close`, which is async
  // and keyed by session name. Recreating the same session before that close
  // finishes can let the old teardown close the new daemon session.
  private readonly pendingSessionDestruction = new Map<string, Promise<void>>()
  private readonly cancelledProcesses = new WeakSet<ChildProcess>()
  private readonly browserPages: BrowserPageProvider
  private readonly options: AgentBrowserBridgeOptions

  constructor(browserPages: BrowserPageProvider, options: AgentBrowserBridgeOptions = {}) {
    this.browserPages = browserPages
    this.options = options
    this.agentBrowserBin = resolveAgentBrowserBinary()
  }

  // ── Tab tracking ──

  setActiveTab(browserPageId: string, worktreeId?: string): void {
    this.activePageId = browserPageId
    if (worktreeId) {
      this.activePagePerWorktree.set(worktreeId, browserPageId)
    }
    this.options.onTabsChanged?.(worktreeId)
  }

  private selectFallbackActivePage(
    worktreeId: string,
    excludedBrowserPageId?: string
  ): string | null {
    for (const [browserPageId] of this.getRegisteredTabs(worktreeId)) {
      if (browserPageId === excludedBrowserPageId) {
        continue
      }
      if (this.browserPages.getPage(browserPageId)) {
        this.activePagePerWorktree.set(worktreeId, browserPageId)
        return browserPageId
      }
    }
    this.activePagePerWorktree.delete(worktreeId)
    return null
  }

  getActiveBrowserPageId(): string | null {
    return this.activePageId
  }

  getPageInfo(
    worktreeId?: string,
    browserPageId?: string
  ): { browserPageId: string; url: string; title: string } | null {
    try {
      const target = this.resolveCommandTarget(worktreeId, browserPageId)
      const page = this.browserPages.getPage(target.browserPageId)
      if (!page) {
        return null
      }
      const info = page.getInfo()
      return {
        browserPageId: target.browserPageId,
        url: info.url,
        title: info.title
      }
    } catch {
      return null
    }
  }

  onTabChanged(browserPageId: string, worktreeId?: string): void {
    this.activePageId = browserPageId
    if (worktreeId) {
      this.activePagePerWorktree.set(worktreeId, browserPageId)
    }
    this.options.onTabsChanged?.(worktreeId)
  }

  async onTabClosed(browserPageId: string): Promise<void> {
    const owningWorktreeId = this.browserPages.getWorktreeIdForTab(browserPageId)
    let nextWorktreeActivePageId: string | null = null
    if (owningWorktreeId && this.activePagePerWorktree.get(owningWorktreeId) === browserPageId) {
      nextWorktreeActivePageId = this.selectFallbackActivePage(owningWorktreeId, browserPageId)
    }
    if (this.activePageId === browserPageId) {
      this.activePageId = nextWorktreeActivePageId
    }
    const sessionName = `yiru-tab-${browserPageId}`
    await this.destroySession(sessionName)
    this.pendingInterceptRestore.delete(sessionName)
    this.options.onTabsChanged?.(owningWorktreeId)
  }

  async onProcessSwap(browserPageId: string): Promise<void> {
    // Why: the stable product page remains active while its opaque backend page
    // changes. Only the CDP session needs replacement.
    const sessionName = `yiru-tab-${browserPageId}`
    const session = this.sessions.get(sessionName)
    const owningWorktreeId = this.browserPages.getWorktreeIdForTab(browserPageId)
    // Why: save active intercept patterns before destroying so they can be restored
    // on the new session after the next successful init command.
    if (session && session.activeInterceptPatterns.length > 0) {
      this.pendingInterceptRestore.set(sessionName, [...session.activeInterceptPatterns])
    }
    await this.destroySession(sessionName)
    this.options.onTabsChanged?.(owningWorktreeId ?? undefined)
  }

  // ── Worktree-scoped tab queries ──

  getRegisteredTabs(worktreeId?: string): Map<string, string> {
    const pages = new Map<string, string>()
    for (const page of this.browserPages.getPages()) {
      const browserPageId = page.identity.browserPageId
      if (!worktreeId || this.browserPages.getWorktreeIdForTab(browserPageId) === worktreeId) {
        pages.set(browserPageId, page.identity.backendPageId)
      }
    }
    return pages
  }

  getPage(browserPageId: string): BrowserPageHandle | null {
    return this.browserPages.getPage(browserPageId)
  }

  getWorktreeIdForTab(browserPageId: string): string | undefined {
    return this.browserPages.getWorktreeIdForTab(browserPageId)
  }

  getSessionProfileIdForTab(browserPageId: string): string | null {
    return this.browserPages.getSessionProfileIdForTab(browserPageId)
  }

  async destroyAll(): Promise<void> {
    const sessionNames = new Set([
      ...this.sessions.keys(),
      ...this.pendingSessionCreation.keys(),
      ...this.pendingSessionDestruction.keys()
    ])
    await Promise.allSettled(
      [...sessionNames].map((sessionName) => this.destroySession(sessionName))
    )
    this.activePageId = null
    this.activePagePerWorktree.clear()
    this.pendingInterceptRestore.clear()
  }

  // ── Tab management ──

  tabList(worktreeId?: string): BrowserTabListResult {
    const tabs = this.getRegisteredTabs(worktreeId)
    // Why: use per-worktree active tab for the "active" flag so tab-list is
    // consistent with what resolveActiveTab would pick for command routing.
    // Keep this read-only though: discovery commands must not mutate the
    // active-tab state that later bare commands rely on.
    let activeBrowserPageId =
      (worktreeId && this.activePagePerWorktree.get(worktreeId)) ?? this.activePageId
    const result: BrowserTabInfo[] = []
    let index = 0
    let firstLivePageId: string | null = null
    for (const [tabId] of tabs) {
      const page = this.browserPages.getPage(tabId)
      if (!page) {
        this.browserPages.unregisterPage(tabId)
        continue
      }
      const info = page.getInfo()
      if (firstLivePageId === null) {
        firstLivePageId = tabId
      }
      const loadError = this.browserPages.getBrowserPageLoadError(tabId)
      const certificateFailure = this.browserPages.getBrowserPageCertificateFailure(tabId)
      result.push({
        browserPageId: tabId,
        index: index++,
        // Why: failed WebContents report chrome-error://, which is neither
        // actionable nor the address the user asked to load.
        url: loadError?.validatedUrl ?? info.url,
        title: info.title,
        active: tabId === activeBrowserPageId,
        loadError,
        certificateFailure
      })
    }
    // Why: if no tab has been explicitly activated yet, surface the first live
    // tab as active in the listing without mutating bridge state. That keeps
    // `tab list` side-effect free while still showing users which tab a bare
    // command would select next.
    if (activeBrowserPageId == null && firstLivePageId !== null) {
      activeBrowserPageId = firstLivePageId
      if (result.length > 0) {
        result[0].active = true
      }
    }
    return { tabs: result }
  }

  // Why: tab switch must go through the command queue to prevent race conditions
  // with in-flight commands that target the previously active tab.
  async tabSwitch(
    index: number | undefined,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserTabSwitchResult> {
    return this.enqueueCommand(worktreeId, async () => {
      const tabs = this.getRegisteredTabs(worktreeId)
      // Why: queue delay means the tab list can change between RPC arrival and
      // execution time. Recompute against live webContents here so we never
      // activate a tab index that disappeared while earlier commands were running.
      const liveEntries = [...tabs.entries()].filter(([tabId]) => this.browserPages.getPage(tabId))
      let switchedIndex = index ?? -1
      let resolvedPageId = browserPageId
      if (resolvedPageId) {
        switchedIndex = liveEntries.findIndex(([tabId]) => tabId === resolvedPageId)
      }
      if (switchedIndex < 0 || switchedIndex >= liveEntries.length) {
        const targetLabel =
          resolvedPageId != null ? `Browser page ${resolvedPageId}` : `Tab index ${index}`
        throw new BrowserError(
          'browser_tab_not_found',
          `${targetLabel} out of range (0-${liveEntries.length - 1})`
        )
      }
      const [tabId] = liveEntries[switchedIndex]
      this.activePageId = tabId
      // Why: resolveActiveTab prefers the per-worktree map over the global when
      // worktreeId is provided. Without this update, subsequent commands would
      // still route to the previous tab despite tabSwitch reporting success.
      const owningWorktreeId = worktreeId ?? this.browserPages.getWorktreeIdForTab(tabId)
      // Why: `tab switch --page <id>` may omit --worktree because the page id is
      // already a stable target. We still need to update the owning worktree's
      // active-tab slot so later worktree-scoped commands follow the tab that was
      // just activated instead of the previously active one.
      if (owningWorktreeId) {
        this.activePagePerWorktree.set(owningWorktreeId, tabId)
      }
      this.options.onTabsChanged?.(owningWorktreeId ?? undefined)
      return { switched: switchedIndex, browserPageId: tabId }
    })
  }

  // ── Core commands (typed) ──

  async snapshot(worktreeId?: string, browserPageId?: string): Promise<BrowserSnapshotResult> {
    // Why: snapshot creates fresh refs so it must bypass the stale-ref guard
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName, target) => {
      const result = (await this.execAgentBrowser(sessionName, [
        'snapshot'
      ])) as BrowserSnapshotResult
      return {
        ...result,
        browserPageId: target.browserPageId
      }
    })
  }

  async click(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserClickResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['click', element])) as BrowserClickResult
    })
  }

  async dblclick(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserClickResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['dblclick', element])) as BrowserClickResult
    })
  }

  async goto(url: string, worktreeId?: string, browserPageId?: string): Promise<BrowserGotoResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['goto', url])) as BrowserGotoResult
    })
  }

  async fill(
    element: string,
    value: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserFillResult> {
    await assertClipboardTextWriteWithinLimitWithYield(value)
    // Why: agent-browser's CDP text insertion loses focus in Electron guests.
    // Resolve the ref first, then edit through the browser's input pipeline.
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        if (!(await this.isExplicitContentEditableTarget(sessionName, element))) {
          await this.execAgentBrowser(sessionName, ['focus', element])
          await this.execAgentBrowser(sessionName, [
            'eval',
            focusedValueSetExpression(JSON.stringify(''))
          ])
          for (const chunk of iterateBrowserTextInsertionChunks(
            value,
            AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES
          )) {
            await this.execAgentBrowser(sessionName, [
              'eval',
              focusedValueSetExpression(JSON.stringify(chunk), { append: true })
            ])
          }
          await this.execAgentBrowser(sessionName, [
            'eval',
            focusedValueSetExpression(JSON.stringify(''), { append: true, dispatchEvents: true })
          ])
          return { filled: element } as BrowserFillResult
        }

        await this.fillExplicitContentEditable(sessionName, element, value)
        return { filled: element } as BrowserFillResult
      },
      { requireScopedTarget: true }
    )
  }

  async type(
    input: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserTypeResult> {
    await assertClipboardTextWriteWithinLimitWithYield(input)
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        for (const chunk of iterateBrowserTextInsertionChunks(
          input,
          AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES
        )) {
          await this.execAgentBrowser(sessionName, ['keyboard', 'type', chunk])
        }
        return { typed: true } as BrowserTypeResult
      },
      { requireScopedTarget: true }
    )
  }

  async select(
    element: string,
    value: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserSelectResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'select',
        element,
        value
      ])) as BrowserSelectResult
    })
  }

  async scroll(
    direction: string,
    amount?: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserScrollResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['scroll', direction]
      if (amount != null) {
        args.push(String(amount))
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserScrollResult
    })
  }

  async scrollIntoView(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'scrollintoview',
        element
      ])) as BrowserAgentCommandResult
    })
  }

  async get(
    what: string,
    selector?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['get', what]
      if (selector) {
        args.push(selector)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async is(
    what: string,
    selector: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'is',
        what,
        selector
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Keyboard commands ──

  async keyboardInsertText(
    text: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    await assertClipboardTextWriteWithinLimitWithYield(text)
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        let result: BrowserAgentCommandResult = { inserted: true }
        for (const chunk of iterateBrowserTextInsertionChunks(
          text,
          AGENT_BROWSER_TEXT_ARGUMENT_MAX_BYTES
        )) {
          result = (await this.execAgentBrowser(sessionName, [
            'keyboard',
            'inserttext',
            chunk
          ])) as BrowserAgentCommandResult
        }
        return result
      },
      { requireScopedTarget: true }
    )
  }

  // ── Mouse commands ──

  async mouseMove(
    x: number,
    y: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'mouse',
        'move',
        String(x),
        String(y)
      ])) as BrowserAgentCommandResult
    })
  }

  async mouseDown(
    button?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['mouse', 'down']
      if (button) {
        args.push(button)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async mouseClick(
    x: number,
    y: number,
    button?: string,
    worktreeId?: string,
    browserPageId?: string,
    radius?: number,
    modifiers?: BrowserMouseModifier[]
  ): Promise<BrowserMouseClickResult> {
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (_sessionName, target) => {
        const page = this.browserPages.getPage(target.browserPageId)
        if (!page) {
          throw new BrowserError(
            'browser_tab_not_found',
            `Browser page ${target.browserPageId} is no longer available`
          )
        }
        const cdpButton = normalizeCdpMouseButton(button)
        const buttons = cdpMouseButtonMask(cdpButton)
        const cdpModifiers = cdpMouseModifierMask(modifiers)
        const lease = page.acquireCdp()
        try {
          await page.focus()
          const point =
            cdpButton === 'left'
              ? // Why: DOM activation cannot carry Cmd/Ctrl/Alt/Shift, so modifier
                // clicks use only the adjusted point and let CDP dispatch the event.
                await resolveMobileTouchClickPoint(lease, x, y, radius, cdpModifiers === 0)
              : { x, y, adjusted: false, handled: false }
          // Why: mobile taps should land as one atomic input operation. Sending
          // move/down/up through separate CLI calls visibly hovers targets and can
          // miss small controls before the click lands.
          // Runtime may already activate DOM controls because mobile-emulated
          // BrowserViews can ignore CDP mouse clicks for regular page taps.
          if (!point.handled) {
            await lease.sendCommand('Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x: point.x,
              y: point.y,
              button: cdpButton,
              buttons,
              modifiers: cdpModifiers,
              clickCount: 1
            })
            await lease.sendCommand('Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: point.x,
              y: point.y,
              button: cdpButton,
              buttons: 0,
              modifiers: cdpModifiers,
              clickCount: 1
            })
          }
          return {
            clicked: {
              x: point.x,
              y: point.y,
              button: cdpButton,
              adjusted: point.adjusted,
              handled: point.handled
            }
          }
        } finally {
          lease.release()
        }
      },
      { ensureSession: false }
    )
  }

  async mouseUp(
    button?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['mouse', 'up']
      if (button) {
        args.push(button)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async mouseWheel(
    dy: number,
    dx?: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['mouse', 'wheel', String(dy)]
      if (dx != null) {
        args.push(String(dx))
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  // ── Find (semantic locators) ──

  async find(
    locator: string,
    value: string,
    action: string,
    text?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['find', locator, value, action]
      if (text) {
        args.push(text)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  // ── Set commands ──

  async setDevice(
    name: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'set',
        'device',
        name
      ])) as BrowserAgentCommandResult
    })
  }

  async setOffline(
    state?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['set', 'offline']
      if (state) {
        args.push(state)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async setHeaders(
    headersJson: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'set',
        'headers',
        headersJson
      ])) as BrowserAgentCommandResult
    })
  }

  async setCredentials(
    user: string,
    pass: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'set',
        'credentials',
        user,
        pass
      ])) as BrowserAgentCommandResult
    })
  }

  async setMedia(
    colorScheme?: string,
    reducedMotion?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['set', 'media']
      if (colorScheme) {
        args.push(colorScheme)
      }
      if (reducedMotion) {
        args.push(reducedMotion)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  // ── Clipboard commands ──

  async clipboardRead(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'clipboard',
        'read'
      ])) as BrowserAgentCommandResult
    })
  }

  async clipboardWrite(
    text: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    await assertClipboardTextWriteWithinLimitWithYield(text, {
      maxBytes: AGENT_BROWSER_CLIPBOARD_WRITE_MAX_BYTES
    })
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'clipboard',
        'write',
        text
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Dialog commands ──

  async dialogAccept(
    text?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['dialog', 'accept']
      if (text) {
        args.push(text)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  async dialogDismiss(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'dialog',
        'dismiss'
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Storage commands ──

  async storageLocalGet(
    key: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'local',
        'get',
        key
      ])) as BrowserAgentCommandResult
    })
  }

  async storageLocalSet(
    key: string,
    value: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'local',
        'set',
        key,
        value
      ])) as BrowserAgentCommandResult
    })
  }

  async storageLocalClear(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'local',
        'clear'
      ])) as BrowserAgentCommandResult
    })
  }

  async storageSessionGet(
    key: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'session',
        'get',
        key
      ])) as BrowserAgentCommandResult
    })
  }

  async storageSessionSet(
    key: string,
    value: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'session',
        'set',
        key,
        value
      ])) as BrowserAgentCommandResult
    })
  }

  async storageSessionClear(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'storage',
        'session',
        'clear'
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Download command ──

  async download(
    selector: string,
    path: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'download',
        selector,
        path
      ])) as BrowserAgentCommandResult
    })
  }

  // ── Highlight command ──

  async highlight(
    selector: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'highlight',
        selector
      ])) as BrowserAgentCommandResult
    })
  }

  async back(worktreeId?: string, browserPageId?: string): Promise<BrowserBackResult> {
    return this.navigateHistory('back', worktreeId, browserPageId)
  }

  async forward(worktreeId?: string, browserPageId?: string): Promise<BrowserBackResult> {
    return this.navigateHistory('forward', worktreeId, browserPageId)
  }

  async reload(worktreeId?: string, browserPageId?: string): Promise<BrowserReloadResult> {
    // Why: reload can trigger a process swap in Electron (site-isolation), which
    // destroys the agent-browser session mid-command. Use the stable page handle
    // instead of going through agent-browser to avoid that session lifecycle issue.
    // Routed through enqueueCommand so it serializes with other in-flight commands.
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (_sessionName, target) => {
      const page = this.browserPages.getPage(target.browserPageId)
      if (!page) {
        throw new BrowserError('browser_no_tab', 'Tab is no longer available')
      }
      let cancelLoadWait = (): void => {}
      const loadOutcome = new Promise<'loaded' | 'closed' | 'timeout'>((resolve) => {
        let settled = false
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null
        let unsubscribe = (): void => {}

        const finish = (outcome: 'loaded' | 'closed' | 'timeout'): void => {
          if (settled) {
            return
          }
          settled = true
          unsubscribe()
          if (fallbackTimer) {
            clearTimeout(fallbackTimer)
            fallbackTimer = null
          }
          resolve(outcome)
        }
        unsubscribe = page.subscribe((event) => {
          if (event.type === 'load-finished' || event.type === 'load-failed') {
            finish('loaded')
          } else if (event.type === 'closed') {
            finish('closed')
          }
        })
        // Why: successful reloads must clear the fallback timer; otherwise each
        // reload retains the page handle and listeners until the 10s timeout fires.
        fallbackTimer = setTimeout(() => finish('timeout'), 10_000)
        if (typeof fallbackTimer.unref === 'function') {
          fallbackTimer.unref()
        }
        cancelLoadWait = () => finish('timeout')
      })
      try {
        await page.reload()
      } catch (error) {
        cancelLoadWait()
        throw error
      }
      const outcome = await loadOutcome
      const currentPage =
        outcome === 'closed' || page.isClosed()
          ? await this.waitForReplacementPage(target.browserPageId, page)
          : page
      if (!currentPage) {
        throw new BrowserError(
          'browser_tab_not_found',
          `Browser page ${target.browserPageId} is no longer available`
        )
      }
      const info = currentPage.getInfo()
      return { url: info.url, title: info.title }
    })
  }

  async screenshot(
    format?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserScreenshotResult> {
    // Why: agent-browser writes the screenshot to a temp file and returns
    // { "path": "/tmp/screenshot-xxx.png" }. We read the file and return base64.
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        return this.captureScreenshotCommand(sessionName, ['screenshot'], 300, format)
      },
      { ensureVisible: false }
    )
  }

  async fullPageScreenshot(
    format?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserScreenshotResult> {
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName, target) => {
        return this.captureFullPageScreenshotCommand(
          sessionName,
          target.browserPageId,
          500,
          format === 'jpeg' ? 'jpeg' : 'png'
        )
      },
      { ensureVisible: false }
    )
  }

  private readScreenshotFromResult(raw: unknown, format?: string): BrowserScreenshotResult {
    const parsed = raw as { path?: string } | undefined
    if (!parsed?.path) {
      throw new BrowserError('browser_error', 'Screenshot returned no file path')
    }
    if (!existsSync(parsed.path)) {
      throw new BrowserError('browser_error', `Screenshot file not found: ${parsed.path}`)
    }
    const data = readFileSync(parsed.path).toString('base64')
    return { data, format: format === 'jpeg' ? 'jpeg' : 'png' } as BrowserScreenshotResult
  }

  private async captureScreenshotCommand(
    sessionName: string,
    commandArgs: string[],
    settleMs: number,
    format?: string
  ): Promise<BrowserScreenshotResult> {
    return this.withSerializedScreenshotAccess(async () => {
      const session = this.sessions.get(sessionName)
      const restore = session
        ? await this.browserPages.acquireAutomationVisibility(session.browserPageId)
        : () => {}
      try {
        // Why: after acquiring the hidden paintability lease, the compositor
        // needs a short settle period to produce a painted frame. Waiting inside
        // the global screenshot lock prevents another tab from changing lease
        // state before the current capture actually hits CDP.
        await new Promise((r) => setTimeout(r, settleMs))
        const raw = await this.execAgentBrowser(sessionName, commandArgs)
        return this.readScreenshotFromResult(raw, format)
      } finally {
        restore()
      }
    })
  }

  private async captureFullPageScreenshotCommand(
    sessionName: string,
    browserPageId: string,
    settleMs: number,
    format: 'png' | 'jpeg'
  ): Promise<BrowserScreenshotResult> {
    return this.withSerializedScreenshotAccess(async () => {
      const session = this.sessions.get(sessionName)
      const restore = session
        ? await this.browserPages.acquireAutomationVisibility(session.browserPageId)
        : () => {}
      try {
        // Why: full-page capture still depends on the guest compositor producing
        // a fresh frame. Wait after the target webview is paintable so the direct
        // CDP capture sees the live page instead of a stale surface.
        await new Promise((r) => setTimeout(r, settleMs))
        const page = this.browserPages.getPage(browserPageId)
        if (!page) {
          throw new BrowserError('browser_tab_not_found', 'Tab is no longer available')
        }
        return await captureFullPageScreenshot(page, format)
      } catch (error) {
        throw new BrowserError('browser_error', (error as Error).message)
      } finally {
        restore()
      }
    })
  }

  private async withSerializedScreenshotAccess<T>(execute: () => Promise<T>): Promise<T> {
    const previousTurn = this.screenshotTurn.catch(() => {})
    let releaseTurn!: () => void
    this.screenshotTurn = new Promise<void>((resolve) => {
      releaseTurn = resolve
    })
    await previousTurn
    try {
      return await execute()
    } finally {
      releaseTurn()
    }
  }

  async evaluate(
    expression: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserEvalResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['eval', expression])) as BrowserEvalResult
    })
  }

  async hover(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserHoverResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['hover', element])) as BrowserHoverResult
    })
  }

  async drag(
    from: string,
    to: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserDragResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['drag', from, to])) as BrowserDragResult
    })
  }

  async upload(
    element: string,
    filePaths: string[],
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserUploadResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'upload',
        element,
        ...filePaths
      ])) as BrowserUploadResult
    })
  }

  async wait(
    options?: {
      selector?: string
      timeout?: number
      text?: string
      url?: string
      load?: string
      fn?: string
      state?: string
    },
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserWaitResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['wait']
      const hasCondition =
        !!options?.selector || !!options?.text || !!options?.url || !!options?.load || !!options?.fn
      if (options?.selector) {
        args.push(options.selector)
      } else if (options?.timeout != null && !hasCondition) {
        args.push(String(options.timeout))
      }
      if (options?.text) {
        args.push('--text', options.text)
      }
      if (options?.url) {
        args.push('--url', options.url)
      }
      if (options?.load) {
        args.push('--load', options.load)
      }
      if (options?.fn) {
        args.push('--fn', options.fn)
      }
      const normalizedState = options?.state === 'visible' ? undefined : options?.state
      if (normalizedState) {
        args.push('--state', normalizedState)
      }
      // Why: agent-browser's selector wait surface does not support `--state visible`
      // or a documented per-command `--timeout`. Yiru normalizes "visible" back
      // to the default selector wait semantics and enforces the requested timeout
      // at the bridge layer so missing selectors fail as browser_timeout instead
      // of hanging until the generic runtime RPC timeout fires.
      return (await this.execAgentBrowser(sessionName, args, {
        timeoutMs:
          options?.timeout != null && hasCondition
            ? options.timeout + WAIT_PROCESS_TIMEOUT_GRACE_MS
            : undefined,
        timeoutError:
          options?.timeout != null && hasCondition
            ? new BrowserError(
                'browser_timeout',
                `Timed out waiting for browser condition after ${options.timeout}ms.`
              )
            : undefined
      })) as BrowserWaitResult
    })
  }

  async check(
    element: string,
    checked: boolean,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserCheckResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = checked ? ['check', element] : ['uncheck', element]
      return (await this.execAgentBrowser(sessionName, args)) as BrowserCheckResult
    })
  }

  async focus(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserFocusResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['focus', element])) as BrowserFocusResult
    })
  }

  async clear(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserClearResult> {
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName) => {
        if (!(await this.isExplicitContentEditableTarget(sessionName, element))) {
          // Why: agent-browser resolves this ref directly, preserving iframe,
          // shadow-root, and unfocusable-target semantics for ordinary fields.
          await this.execAgentBrowser(sessionName, ['fill', element, ''])
          return { cleared: element }
        }

        await this.fillExplicitContentEditable(sessionName, element, '')
        return { cleared: element }
      },
      { requireScopedTarget: true }
    )
  }

  async selectAll(
    element: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserSelectAllResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      // Why: agent-browser has no select-all command — implement as focus + Ctrl+A
      await this.execAgentBrowser(sessionName, ['focus', element])
      return (await this.execAgentBrowser(sessionName, [
        'press',
        'Control+a'
      ])) as BrowserSelectAllResult
    })
  }

  async keypress(
    key: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserKeypressResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['press', key])) as BrowserKeypressResult
    })
  }

  async pdf(worktreeId?: string, browserPageId?: string): Promise<BrowserPdfResult> {
    // Why: agent-browser's pdf command via CDP Page.printToPDF hangs in Electron
    // webviews. Use Electron's native webContents.printToPDF() which is reliable.
    // Routed through enqueueCommand so it serializes with other in-flight commands.
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (_sessionName, target) => {
      const page = this.browserPages.getPage(target.browserPageId)
      if (!page) {
        throw new BrowserError('browser_no_tab', 'Tab is no longer available')
      }
      const bytes = await page.printToPdf({
        printBackground: true,
        preferCSSPageSize: true
      })
      return { data: Buffer.from(bytes).toString('base64') }
    })
  }

  // ── Cookie commands ──

  async cookieGet(
    _url?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserCookieGetResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'cookies',
        'get'
      ])) as BrowserCookieGetResult
    })
  }

  async cookieSet(
    cookie: Partial<BrowserCookie>,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserCookieSetResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['cookies', 'set', cookie.name ?? '', cookie.value ?? '']
      if (cookie.domain) {
        args.push('--domain', cookie.domain)
      }
      if (cookie.path) {
        args.push('--path', cookie.path)
      }
      if (cookie.secure) {
        args.push('--secure')
      }
      if (cookie.httpOnly) {
        args.push('--httpOnly')
      }
      if (cookie.sameSite) {
        args.push('--sameSite', cookie.sameSite)
      }
      if (cookie.expires != null) {
        args.push('--expires', String(cookie.expires))
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserCookieSetResult
    })
  }

  async cookieDelete(
    name?: string,
    domain?: string,
    _url?: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserCookieDeleteResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const args = ['cookies', 'clear']
      if (name) {
        args.push('--name', name)
      }
      if (domain) {
        args.push('--domain', domain)
      }
      return (await this.execAgentBrowser(sessionName, args)) as BrowserCookieDeleteResult
    })
  }

  // ── Viewport / emulation commands ──

  async setViewport(
    width: number,
    height: number,
    scale = 1,
    mobile = false,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserViewportResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (_sessionName, target) => {
      const page = this.browserPages.getPage(target.browserPageId)
      if (!page) {
        throw new BrowserError('browser_tab_not_found', 'Tab is no longer available')
      }
      const cdp = page.acquireCdp()

      // Why: agent-browser only supports width/height/scale for `set viewport`;
      // it has no `mobile` flag. Yiru's CLI exposes `--mobile`, so apply the
      // emulation directly through CDP to keep the public CLI contract honest.
      try {
        await cdp.sendCommand('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: scale,
          mobile
        })
        // Why: BrowserView's compositor surface can keep the previous host size
        // after metrics-only resize, which crops remote screencast clients.
        await cdp.sendCommand('Emulation.setVisibleSize', { width, height }).catch(() => {})
      } finally {
        cdp.release()
      }

      return {
        width,
        height,
        deviceScaleFactor: scale,
        mobile
      }
    })
  }

  async setGeolocation(
    lat: number,
    lon: number,
    _accuracy?: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserGeolocationResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'set',
        'geo',
        String(lat),
        String(lon)
      ])) as BrowserGeolocationResult
    })
  }

  // ── Network interception commands ──

  async interceptEnable(
    patterns?: string[],
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserInterceptEnableResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      // Why: agent-browser uses "network route <url>" to intercept. Route each pattern individually.
      const urlPattern = patterns?.[0] ?? '**/*'
      const args = ['network', 'route', urlPattern]
      const result = (await this.execAgentBrowser(
        sessionName,
        args
      )) as BrowserInterceptEnableResult
      const session = this.sessions.get(sessionName)
      if (session) {
        this.pendingInterceptRestore.delete(sessionName)
        session.activeInterceptPatterns = patterns ?? ['*']
      }
      return result
    })
  }

  async interceptDisable(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserInterceptDisableResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const result = (await this.execAgentBrowser(sessionName, [
        'network',
        'unroute'
      ])) as BrowserInterceptDisableResult
      const session = this.sessions.get(sessionName)
      if (session) {
        this.pendingInterceptRestore.delete(sessionName)
        session.activeInterceptPatterns = []
      }
      return result
    })
  }

  async interceptList(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserInterceptListResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'network',
        'requests'
      ])) as BrowserInterceptListResult
    })
  }

  // TODO: Add interceptContinue/interceptBlock once agent-browser supports per-request
  // interception decisions. Currently agent-browser only operates on URL pattern-level
  // routing, not individual request IDs, so the RPC/CLI interface doesn't map cleanly.

  // ── Capture commands ──

  async captureStart(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserCaptureStartResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const result = (await this.execAgentBrowser(sessionName, [
        'network',
        'har',
        'start'
      ])) as BrowserCaptureStartResult
      const session = this.sessions.get(sessionName)
      if (session) {
        session.activeCapture = true
      }
      return result
    })
  }

  async captureStop(
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserCaptureStopResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      const result = (await this.execAgentBrowser(sessionName, [
        'network',
        'har',
        'stop'
      ])) as BrowserCaptureStopResult
      const session = this.sessions.get(sessionName)
      if (session) {
        session.activeCapture = false
      }
      return result
    })
  }

  async consoleLog(
    _limit?: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserConsoleResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, ['console'])) as BrowserConsoleResult
    })
  }

  async networkLog(
    _limit?: number,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserNetworkLogResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      return (await this.execAgentBrowser(sessionName, [
        'network',
        'requests'
      ])) as BrowserNetworkLogResult
    })
  }

  // ── Generic passthrough ──

  async exec(
    command: string,
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserAgentCommandResult> {
    return this.enqueueTargetedCommand(worktreeId, browserPageId, async (sessionName) => {
      // Why: strip target/session flags from raw passthrough commands so a
      // caller cannot override Yiru's selected browser page or CDP proxy.
      const args = stripAgentBrowserTargetArgs(parseShellArgs(command.trim()))
      return (await this.execAgentBrowser(sessionName, args)) as BrowserAgentCommandResult
    })
  }

  // ── Session lifecycle ──

  private async navigateHistory(
    direction: 'back' | 'forward',
    worktreeId?: string,
    browserPageId?: string
  ): Promise<BrowserBackResult> {
    return this.enqueueTargetedCommand(
      worktreeId,
      browserPageId,
      async (sessionName, target) => {
        const page = this.browserPages.getPage(target.browserPageId)
        if (page?.navigateHistory) {
          await page.navigateHistory(direction)
          const info = page.getInfo()
          return { url: info.url, title: info.title }
        }

        // Chrome-backed remote pages do not expose Electron's navigationHistory;
        // keep the agent-browser CDP path for those hosts.
        await this.ensureSession(sessionName, target.browserPageId, target.backendPageId)
        return (await this.execAgentBrowser(sessionName, [direction])) as BrowserBackResult
      },
      { ensureSession: false }
    )
  }

  async destroyAllSessions(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const sessionName of this.sessions.keys()) {
      promises.push(this.destroySession(sessionName))
    }
    await Promise.allSettled(promises)
    this.pendingInterceptRestore.clear()
  }

  // ── Internal ──

  private async enqueueCommand<T>(
    worktreeId: string | undefined,
    execute: (sessionName: string) => Promise<T>
  ): Promise<T> {
    return this.enqueueTargetedCommand(
      worktreeId,
      undefined,
      async (sessionName) => execute(sessionName),
      { ensureVisible: false }
    )
  }

  private async enqueueTargetedCommand<T>(
    worktreeId: string | undefined,
    browserPageId: string | undefined,
    execute: (sessionName: string, target: ResolvedBrowserCommandTarget) => Promise<T>,
    options: EnqueueTargetedCommandOptions = {}
  ): Promise<T> {
    const target = this.resolveCommandTarget(worktreeId, browserPageId, options.requireScopedTarget)
    const sessionName = `yiru-tab-${target.browserPageId}`

    if (options.ensureSession !== false) {
      await this.ensureSession(sessionName, target.browserPageId, target.backendPageId)
    }

    return new Promise<T>((resolve, reject) => {
      let queue = this.commandQueues.get(sessionName)
      if (!queue) {
        queue = []
        this.commandQueues.set(sessionName, queue)
      }
      queue.push({
        execute: (() =>
          this.executeWithVisibleTarget(
            sessionName,
            worktreeId,
            target,
            execute,
            options
          )) as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject
      })
      this.processQueue(sessionName)
    })
  }

  private async executeWithVisibleTarget<T>(
    sessionName: string,
    worktreeId: string | undefined,
    target: ResolvedBrowserCommandTarget,
    execute: (sessionName: string, target: ResolvedBrowserCommandTarget) => Promise<T>,
    options: EnqueueTargetedCommandOptions
  ): Promise<T> {
    if (options.ensureVisible === false) {
      return execute(sessionName, target)
    }

    // Why: inactive browser panes are display:none in the renderer; the
    // automation lease makes only this target paintable without selecting it.
    const restore = await this.browserPages.acquireAutomationVisibility(target.browserPageId)
    try {
      const visibleTarget = await this.refreshTargetAfterAutomationVisibility(
        sessionName,
        worktreeId,
        target,
        options
      )
      return await execute(sessionName, visibleTarget)
    } finally {
      restore()
    }
  }

  private async refreshTargetAfterAutomationVisibility(
    sessionName: string,
    worktreeId: string | undefined,
    target: ResolvedBrowserCommandTarget,
    options: EnqueueTargetedCommandOptions
  ): Promise<ResolvedBrowserCommandTarget> {
    const visibleTarget = this.resolveCommandTarget(worktreeId, target.browserPageId)
    if (visibleTarget.backendPageId === target.backendPageId) {
      return visibleTarget
    }

    // Why: making a parked webview paintable can re-register the same browser
    // page with a new guest webContents. Tear down any stale named session now;
    // DOM commands recreate immediately, direct-CDP commands let the next DOM
    // command recreate against the live guest.
    await this.restartSessionForTarget(
      sessionName,
      visibleTarget.browserPageId,
      visibleTarget.backendPageId,
      { recreate: options.ensureSession !== false }
    )

    return visibleTarget
  }

  private async processQueue(sessionName: string): Promise<void> {
    if (this.processingQueues.has(sessionName)) {
      return
    }
    this.processingQueues.add(sessionName)

    const queue = this.commandQueues.get(sessionName)
    while (queue && queue.length > 0) {
      const cmd = queue.shift()!
      try {
        const result = await cmd.execute()
        cmd.resolve(result)
      } catch (error) {
        cmd.reject(error)
      }
    }

    if (queue && queue.length === 0 && this.commandQueues.get(sessionName) === queue) {
      this.commandQueues.delete(sessionName)
    }
    this.processingQueues.delete(sessionName)
  }

  getActivePageId(worktreeId?: string, browserPageId?: string): string | null {
    try {
      return this.resolveCommandTarget(worktreeId, browserPageId).browserPageId
    } catch {
      return null
    }
  }

  private resolveCommandTarget(
    worktreeId?: string,
    browserPageId?: string,
    requireScopedTarget = false
  ): ResolvedBrowserCommandTarget {
    if (!browserPageId) {
      return requireScopedTarget
        ? this.resolveScopedActiveTab(worktreeId)
        : this.resolveActiveTab(worktreeId)
    }

    const tabs = this.getRegisteredTabs(worktreeId)
    const backendPageId = tabs.get(browserPageId)
    if (backendPageId == null) {
      const scope = worktreeId ? ' in this worktree' : ''
      throw new BrowserError(
        'browser_tab_not_found',
        `Browser page ${browserPageId} was not found${scope}`
      )
    }

    const page = this.browserPages.getPage(browserPageId)
    if (!page || page.identity.backendPageId !== backendPageId) {
      this.browserPages.unregisterPage(browserPageId)
      throw new BrowserError(
        'browser_tab_not_found',
        `Browser page ${browserPageId} is no longer available`
      )
    }

    return { browserPageId, backendPageId }
  }

  private resolveActiveTab(worktreeId?: string): ResolvedBrowserCommandTarget {
    const tabs = this.getRegisteredTabs(worktreeId)

    if (tabs.size === 0) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }

    // Why: prefer per-worktree active page to prevent cross-worktree interference.
    // Fall back to the global stable page identity for unscoped callers.
    const preferredPageId =
      (worktreeId && this.activePagePerWorktree.get(worktreeId)) ?? this.activePageId

    if (preferredPageId != null) {
      const backendPageId = tabs.get(preferredPageId)
      const page = this.browserPages.getPage(preferredPageId)
      if (backendPageId && page?.identity.backendPageId === backendPageId) {
        return { browserPageId: preferredPageId, backendPageId }
      }
      if (backendPageId) {
        this.browserPages.unregisterPage(preferredPageId)
        if (this.activePageId === preferredPageId) {
          this.activePageId = null
        }
        if (worktreeId && this.activePagePerWorktree.get(worktreeId) === preferredPageId) {
          this.activePagePerWorktree.delete(worktreeId)
        }
      }
    }

    // Why: persisted store state can leave ghost tabs whose webContents no longer exist.
    // Skip those and pick the first live tab. Also activate it so tabList and
    // subsequent resolveActiveTab calls are consistent without requiring an
    // explicit tab switch after app startup.
    for (const [tabId, backendPageId] of tabs) {
      const page = this.browserPages.getPage(tabId)
      if (page?.identity.backendPageId === backendPageId) {
        this.activePageId = tabId
        if (worktreeId) {
          this.activePagePerWorktree.set(worktreeId, tabId)
        }
        return { browserPageId: tabId, backendPageId }
      }
      this.browserPages.unregisterPage(tabId)
    }

    throw new BrowserError(
      'browser_no_tab',
      'No live browser tab available — all registered tabs have been destroyed'
    )
  }

  // Why: text-mutating commands (inserttext/type/fill) must not silently fall
  // back to the global active tab when no worktree was resolved — that tab can
  // belong to a worktree the user is currently viewing, so a goal-loop agent in
  // another worktree would inject text into the user's foreground webview and
  // steal OS focus. A scoped (worktreeId-bearing) call is already safe because
  // the candidate set is pre-filtered to that worktree, so defer to the lenient
  // resolver. An unscoped call instead requires an unambiguous target: scope to
  // the lone worktree with live tabs, or refuse rather than guess.
  private resolveScopedActiveTab(worktreeId?: string): ResolvedBrowserCommandTarget {
    if (worktreeId) {
      return this.resolveActiveTab(worktreeId)
    }

    const worktreesWithLiveTabs = new Set<string | undefined>()
    for (const [tabId, backendPageId] of this.getRegisteredTabs(undefined)) {
      if (this.browserPages.getPage(tabId)?.identity.backendPageId === backendPageId) {
        worktreesWithLiveTabs.add(this.browserPages.getWorktreeIdForTab(tabId))
      }
    }

    if (worktreesWithLiveTabs.size === 0) {
      throw new BrowserError('browser_no_tab', 'No browser tab open in this worktree')
    }
    if (worktreesWithLiveTabs.size > 1) {
      throw new BrowserError(
        'browser_target_ambiguous',
        'Multiple worktrees have browser tabs open; pass --worktree to target text insertion safely'
      )
    }

    const [onlyWorktreeId] = worktreesWithLiveTabs
    return this.resolveActiveTab(onlyWorktreeId)
  }

  private async ensureSession(
    sessionName: string,
    browserPageId: string,
    backendPageId: string
  ): Promise<void> {
    const pendingDestruction = this.pendingSessionDestruction.get(sessionName)
    if (pendingDestruction) {
      await pendingDestruction
    }

    const existingSession = this.sessions.get(sessionName)
    if (existingSession) {
      if (existingSession.backendPageId === backendPageId) {
        return
      }
      await this.restartSessionForTarget(sessionName, browserPageId, backendPageId)
      return
    }

    // Why: two concurrent CLI calls can both reach here before either finishes
    // creating the session. Without this lock, both would create proxies and the
    // second would overwrite the first, leaking the first proxy's server/debugger.
    const pending = this.pendingSessionCreation.get(sessionName)
    if (pending) {
      await pending
      return
    }

    const createSession = async (): Promise<void> => {
      const page = this.browserPages.getPage(browserPageId)
      if (!page || page.identity.backendPageId !== backendPageId) {
        // Why: the renderer can unregister/destroy a webview between target
        // resolution and session creation. Preserve the explicit page identity
        // so callers get the same error shape as a settled closed tab.
        throw new BrowserError(
          'browser_tab_not_found',
          `Browser page ${browserPageId} is no longer available`
        )
      }

      // Why: agent-browser's daemon persists session state (including the CDP port)
      // across Yiru restarts. A stale session ignores --cdp (already initialized) and
      // connects to the dead port. Must await close so the daemon forgets the session
      // before we pass --cdp with the new port.
      await this.closeStaleAgentBrowserSession(sessionName)

      const proxy = new CdpWsProxy(page)
      const cdpEndpoint = await proxy.start()

      this.sessions.set(sessionName, {
        proxy,
        cdpEndpoint,
        initialized: false,
        consecutiveTimeouts: 0,
        activeInterceptPatterns: [],
        activeCapture: false,
        backendPageId,
        browserPageId,
        activeProcess: null
      })
    }

    const promise = createSession()
    this.pendingSessionCreation.set(sessionName, promise)
    try {
      await promise
    } finally {
      this.pendingSessionCreation.delete(sessionName)
    }
  }

  private async restartSessionForTarget(
    sessionName: string,
    browserPageId: string,
    backendPageId: string,
    options: { recreate: boolean } = { recreate: true }
  ): Promise<void> {
    const pendingCreation = this.pendingSessionCreation.get(sessionName)
    if (pendingCreation) {
      await pendingCreation.catch(() => {})
    }

    const session = this.sessions.get(sessionName)
    if (session) {
      if (session.activeInterceptPatterns.length > 0) {
        this.pendingInterceptRestore.set(sessionName, [...session.activeInterceptPatterns])
      }
      this.sessions.delete(sessionName)
      this.pendingSessionCreation.delete(sessionName)
      if (session.activeProcess) {
        this.cancelledProcesses.add(session.activeProcess)
        try {
          session.activeProcess.kill()
        } catch {
          // Process may already be exiting.
        }
        session.activeProcess = null
      }

      const destroy = (async (): Promise<void> => {
        try {
          await this.runAgentBrowserRaw(sessionName, ['--session', sessionName, 'close'])
        } catch {
          // Session may already be dead.
        }
        await session.proxy.stop()
      })()
      this.pendingSessionDestruction.set(sessionName, destroy)
      try {
        await destroy
      } finally {
        this.pendingSessionDestruction.delete(sessionName)
      }
    }

    if (options.recreate) {
      await this.ensureSession(sessionName, browserPageId, backendPageId)
    }
  }

  private async destroySession(sessionName: string): Promise<void> {
    const pendingDestruction = this.pendingSessionDestruction.get(sessionName)
    if (pendingDestruction) {
      await pendingDestruction
      return
    }

    const pendingCreation = this.pendingSessionCreation.get(sessionName)
    if (pendingCreation) {
      // Why: tab close can race with stale-session cleanup before sessions.set().
      // Wait for creation to settle so a late proxy cannot survive the close.
      try {
        await pendingCreation
      } catch {
        // Creation failures are handled by the original caller; teardown still
        // needs to reject queued work and clear any partial state below.
      }
    }

    const session = this.sessions.get(sessionName)
    if (!session) {
      this.rejectQueuedCommandsForClosedSession(sessionName)
      return
    }

    this.sessions.delete(sessionName)
    this.pendingSessionCreation.delete(sessionName)

    // Why: queued commands would hang forever if we just delete the queue —
    // their promises would never resolve or reject. Drain and reject them.
    this.rejectQueuedCommandsForClosedSession(sessionName)

    if (session.activeProcess) {
      // Why: queued command rejection is not enough when a daemon command is
      // already running. Kill the active process so callers do not wait for the
      // generic exec timeout after the session/tab has already been destroyed.
      this.cancelledProcesses.add(session.activeProcess)
      try {
        session.activeProcess.kill()
      } catch {
        // Process may already be exiting.
      }
      session.activeProcess = null
    }

    const destroy = (async (): Promise<void> => {
      try {
        // Why: each browser tab uses its own named agent-browser session. Closing
        // without --session only tears down the default session and leaves the tab
        // session's daemon process running.
        await this.runAgentBrowserRaw(sessionName, ['--session', sessionName, 'close'])
      } catch {
        // Session may already be dead
      }

      await session.proxy.stop()
    })()
    this.pendingSessionDestruction.set(sessionName, destroy)
    try {
      await destroy
    } finally {
      this.pendingSessionDestruction.delete(sessionName)
    }
  }

  private rejectQueuedCommandsForClosedSession(sessionName: string): void {
    const queue = this.commandQueues.get(sessionName)
    this.commandQueues.delete(sessionName)
    this.processingQueues.delete(sessionName)
    if (queue) {
      const err = new BrowserError(
        'browser_tab_closed',
        'Tab was closed while commands were queued'
      )
      for (const cmd of queue) {
        cmd.reject(err)
      }
      queue.length = 0
    }
  }

  private async execAgentBrowser(
    sessionName: string,
    commandArgs: string[],
    execOptions?: AgentBrowserExecOptions
  ): Promise<unknown> {
    const session = this.sessions.get(sessionName)
    if (!session) {
      // Why: queued commands can reach execution after a concurrent tab close
      // deletes the session. Surface this as a tab lifecycle error, not an
      // opaque internal bridge failure.
      throw this.createPageUnavailableError(sessionName)
    }

    // Why: between enqueue time and execution time, the backend page may close or
    // be replaced. Check the opaque instance identity before driving its proxy.
    if (
      this.browserPages.getPage(session.browserPageId)?.identity.backendPageId !==
      session.backendPageId
    ) {
      await this.destroySession(sessionName)
      throw this.createPageUnavailableError(sessionName)
    }

    const args = ['--session', sessionName]
    const managesInterceptRoutes =
      commandArgs[0] === 'network' && (commandArgs[1] === 'route' || commandArgs[1] === 'unroute')

    // Why: --cdp is session-initialization only — first command needs it, subsequent don't.
    // Pass the explicit IPv4 websocket endpoint. agent-browser resolves a numeric
    // port through localhost, which may prefer ::1 while this private proxy is
    // deliberately bound to 127.0.0.1; that miss silently launches a new Chrome.
    // The proxy itself exposes only this page, so direct CDP cannot select the host renderer.
    const needsInit = !session.initialized
    if (needsInit) {
      args.push('--cdp', session.cdpEndpoint)
    }

    // Why: exec passthrough can produce a large argv array; spreading it into
    // push risks V8 argument limits before execFile receives the command.
    for (const commandArg of commandArgs) {
      args.push(commandArg)
    }
    args.push('--json')

    const stdout = await this.runAgentBrowserRaw(sessionName, args, execOptions)
    const translated = translateResult(stdout)

    if (!translated.ok) {
      throw this.createCommandError(
        sessionName,
        translated.error.message,
        translated.error.code,
        session.backendPageId
      )
    }

    // Why: only mark initialized after a successful command — if the first --cdp
    // connection fails, the next attempt should retry with --cdp.
    if (needsInit) {
      session.initialized = true

      // Why: after a process swap, intercept patterns are lost because the session
      // was destroyed and recreated. Restore them now that the new session is live,
      // unless the caller's first command explicitly reconfigured routing.
      const pendingPatterns = managesInterceptRoutes
        ? undefined
        : this.pendingInterceptRestore.get(sessionName)
      if (pendingPatterns && pendingPatterns.length > 0) {
        this.pendingInterceptRestore.delete(sessionName)
        try {
          const urlPattern = pendingPatterns[0] ?? '**/*'
          await this.runAgentBrowserRaw(sessionName, [
            '--session',
            sessionName,
            'network',
            'route',
            urlPattern,
            '--json'
          ])
          session.activeInterceptPatterns = pendingPatterns
        } catch {
          // Why: intercept restore is best-effort — don't fail the user's command
          // if the new page doesn't support the same interception setup.
        }
      }
    }

    return translated.result
  }

  private async isExplicitContentEditableTarget(
    sessionName: string,
    element: string
  ): Promise<boolean> {
    const result = await this.execAgentBrowser(sessionName, [
      'get',
      'attr',
      element,
      'contenteditable'
    ])
    return isExplicitContentEditableResult(result)
  }

  private async fillExplicitContentEditable(
    sessionName: string,
    element: string,
    value: string
  ): Promise<void> {
    await this.execAgentBrowser(sessionName, ['focus', element])
    // Why: stdin avoids argv limits while keeping replacement atomic; chunked
    // editor transactions can move focus and split one fill across controls.
    await this.execAgentBrowser(sessionName, ['eval', '--stdin'], {
      stdinText: focusedRichTextEditExpression(JSON.stringify(value), { selectAll: true })
    })
  }

  private createPageUnavailableError(sessionName: string): BrowserError {
    return new BrowserError('browser_tab_not_found', pageUnavailableMessageForSession(sessionName))
  }

  private closeStaleAgentBrowserSession(sessionName: string): Promise<void> {
    return new Promise((resolve) => {
      let child: ReturnType<typeof execFile> | null = null
      let settled = false

      const finish = (): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        resolve()
      }

      // Why: this is best-effort daemon cleanup before creating a fresh session;
      // a wedged close command must not block the real browser action.
      const timeout = setTimeout(() => {
        child?.kill()
        finish()
      }, STALE_SESSION_CLOSE_TIMEOUT_MS)

      try {
        child = execFile(
          this.agentBrowserBin,
          ['--session', sessionName, 'close'],
          { timeout: STALE_SESSION_CLOSE_TIMEOUT_MS },
          finish
        )
      } catch {
        finish()
      }
    })
  }

  private createCommandError(
    sessionName: string,
    message: string,
    fallbackCode: string,
    backendPageId?: string
  ): BrowserError {
    // Why: CDP "connection refused" can also mean a real proxy failure. Only
    // convert it to a closed-page error when bridge state confirms the target is gone.
    if (
      fallbackCode === 'browser_error' &&
      isTabClosedTransportError(message) &&
      this.isSessionTargetClosed(sessionName, backendPageId)
    ) {
      return this.createPageUnavailableError(sessionName)
    }
    return new BrowserError(fallbackCode, message)
  }

  private isSessionTargetClosed(sessionName: string, backendPageId?: string): boolean {
    const session = this.sessions.get(sessionName)
    if (!session) {
      return true
    }
    const expectedBackendPageId = backendPageId ?? session.backendPageId
    return (
      this.browserPages.getPage(session.browserPageId)?.identity.backendPageId !==
      expectedBackendPageId
    )
  }

  private runAgentBrowserRaw(
    sessionName: string,
    args: string[],
    execOptions?: AgentBrowserExecOptions
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const session = this.sessions.get(sessionName)
      let child: ChildProcess | null = null
      child = execFile(
        this.agentBrowserBin,
        args,
        // Why: screenshots return large base64 strings that exceed Node's default
        // 1MB maxBuffer, causing ENOBUFS and a timeout-like failure.
        {
          timeout: execOptions?.timeoutMs ?? EXEC_TIMEOUT_MS,
          maxBuffer: 50 * 1024 * 1024,
          env: execOptions?.envOverrides
            ? { ...process.env, ...execOptions.envOverrides }
            : process.env
        },
        (error, stdout, stderr) => {
          if (session && session.activeProcess === child) {
            session.activeProcess = null
          }
          if (child && this.cancelledProcesses.has(child)) {
            this.cancelledProcesses.delete(child)
            reject(
              new BrowserError('browser_tab_closed', 'Tab was closed while command was running')
            )
            return
          }

          const liveSession = this.sessions.get(sessionName)

          if (error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
            if (execOptions?.timeoutError) {
              reject(execOptions.timeoutError)
              return
            }
            if (liveSession) {
              liveSession.consecutiveTimeouts++
              if (liveSession.consecutiveTimeouts >= CONSECUTIVE_TIMEOUT_LIMIT) {
                // Why: 3 consecutive timeouts means the daemon is likely stuck — destroy and recreate
                this.destroySession(sessionName)
              }
            }
            reject(new BrowserError('browser_error', 'Browser command timed out'))
            return
          }

          if (liveSession) {
            liveSession.consecutiveTimeouts = 0
          }

          if (error) {
            // Why: agent-browser exits non-zero for command failures (e.g. clipboard
            // NotAllowedError) but still writes structured JSON to stdout. Parse it
            // so callers get the real error message instead of generic "Command failed".
            if (stdout) {
              try {
                const parsed = JSON.parse(stdout)
                if (parsed.error) {
                  const code = classifyErrorCode(parsed.error)
                  reject(
                    this.createCommandError(sessionName, parsed.error, code, session?.backendPageId)
                  )
                  return
                }
              } catch {
                // stdout not valid JSON — fall through to stderr/error.message
              }
            }
            const message = stderr || error.message
            const code = classifyErrorCode(message)
            reject(this.createCommandError(sessionName, message, code, session?.backendPageId))
            return
          }

          resolve(stdout)
        }
      )
      if (session) {
        session.activeProcess = child
      }
      if (execOptions?.stdinText !== undefined && child?.stdin) {
        // Why: eval --stdin keeps paste-sized scripts out of argv on every platform.
        child.stdin.on('error', () => {})
        child.stdin.end(execOptions.stdinText)
      }
    })
  }

  private async waitForReplacementPage(
    browserPageId: string,
    previousPage: BrowserPageHandle
  ): Promise<BrowserPageHandle | null> {
    const deadline = Date.now() + PAGE_REPLACEMENT_WAIT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const page = this.browserPages.getPage(browserPageId)
      if (page && page !== previousPage) {
        return page
      }
      await new Promise<void>((resolve) => setTimeout(resolve, PAGE_REPLACEMENT_POLL_MS))
    }
    return null
  }
}
