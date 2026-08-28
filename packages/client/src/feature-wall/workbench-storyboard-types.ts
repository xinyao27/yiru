export const RUN_QUEUE: readonly { name: string; desc: string }[] = [
  { name: 'dashboard.spec.ts', desc: '› renders metrics' },
  { name: 'profile.spec.ts', desc: '› updates avatar' },
  { name: 'invoices.spec.ts', desc: '› exports CSV' },
  { name: 'settings.spec.ts', desc: '› toggles dark mode' }
]

export type Phase =
  // Initial state: cursor parked off-canvas, no menu, no split.
  | { kind: 'idle' }
  // Cursor has entered the left pane and is hovering the prompt area.
  | { kind: 'hover' }
  // Right-click ripple is playing.
  | { kind: 'right-click' }
  // Context menu is open, no row highlighted yet.
  | { kind: 'menu-open' }
  // Cursor is parked on the highlighted "Split Terminal Right" row.
  | { kind: 'menu-active' }
  // Click ripple on the menu row.
  | { kind: 'menu-click' }
  // Pane has split; right pane is empty.
  | { kind: 'split-empty' }
  // Right pane is showing live progress (typing / thinking / response).
  | { kind: 'split-active' }

export type RightLine =
  | { kind: 'submitted-command'; text: string }
  | { kind: 'session-started' }
  | { kind: 'submitted-prompt'; text: string }
  | { kind: 'thinking' }
  | { kind: 'agent-action'; action: string; target: string; working?: boolean }
  | { kind: 'response-skeleton'; widthPct: number; withGlyph: boolean }

export type CursorTarget = { kind: 'hidden' } | { kind: 'pane' } | { kind: 'split-row' }

export const KBD_CLASS =
  'border border-border bg-card px-1.5 py-0.5 font-mono text-[11.5px] text-foreground'
