---
version: alpha
name: Yiru
description: Yiru’s quiet, monochrome desktop design system, Light theme (the Dark theme is documented in DESIGN.dark.md).
colors:
  primary: '#171717'
  primary-foreground: '#fafafa'
  secondary: '#f5f5f5'
  secondary-foreground: '#171717'
  muted: '#f5f5f5'
  muted-foreground: '#737373'
  accent: '#f5f5f5'
  accent-foreground: '#171717'
  destructive: '#e40014'
  destructive-foreground: '#fcf3f3'
  background: '#ffffff'
  foreground: '#0a0a0a'
  card: '#ffffff'
  card-foreground: '#0a0a0a'
  popover: '#ffffff'
  popover-foreground: '#0a0a0a'
  border: '#e5e5e5'
  input: '#e5e5e5'
  ring: '#a1a1a1'
  editor-surface: '#ffffff'
  sidebar: '#fafafa'
  sidebar-foreground: '#0a0a0a'
  sidebar-primary: '#171717'
  sidebar-primary-foreground: '#fafafa'
  sidebar-accent: '#f5f5f5'
  sidebar-accent-foreground: '#171717'
  sidebar-border: '#e5e5e5'
  sidebar-ring: '#a1a1a1'
  worktree-sidebar: '#f5f5f5'
  worktree-sidebar-foreground: '#0a0a0a'
  worktree-sidebar-accent: '#eaeaea'
  worktree-sidebar-accent-foreground: '#171717'
  worktree-sidebar-border: '#e5e5e5'
  worktree-sidebar-ring: '#a1a1a1'
  status-success: '#15803d'
  status-success-background: '#15803d1a'
  status-success-border: '#15803d40'
  git-added: '#587c0c'
  git-modified: '#895503'
  git-deleted: '#ad0707'
  git-renamed: '#007acc'
  git-untracked: '#007100'
  git-copied: '#007acc'
  git-ignored: '#8c8c8c'
typography:
  heading-24:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: 0.01em
  heading-18:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: 0.01em
  heading-16:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: 0.01em
  control-14:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0.01em
  body-14:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0.01em
  dense-13:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0.01em
  caption-12:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.01em
  meta-11:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-13:
    fontFamily: 'SF Mono, SFMono-Regular, ui-monospace, Cascadia Code, Menlo, Consolas, Liberation Mono, monospace'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0.01em
  mono-12:
    fontFamily: 'SF Mono, SFMono-Regular, ui-monospace, Cascadia Code, Menlo, Consolas, Liberation Mono, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.01em
spacing:
  1: 4px
  '1.5': 6px
  2: 8px
  '2.5': 10px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
  base: 4px
rounded:
  none: 0px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.control-14}'
    rounded: '{rounded.none}'
    padding: '0 16px'
    height: 36px
  button-primary-hover:
    backgroundColor: '#2e2e2e'
    textColor: '{colors.primary-foreground}'
  button-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    typography: '{typography.control-14}'
    rounded: '{rounded.none}'
    padding: '0 16px'
    height: 36px
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    typography: '{typography.control-14}'
    rounded: '{rounded.none}'
    padding: '0 16px'
    height: 36px
  button-ghost:
    textColor: '{colors.foreground}'
    typography: '{typography.control-14}'
    rounded: '{rounded.none}'
    padding: '0 16px'
    height: 36px
  button-destructive:
    backgroundColor: '{colors.destructive}'
    textColor: '#ffffff'
    typography: '{typography.control-14}'
    rounded: '{rounded.none}'
    padding: '0 16px'
    height: 36px
  button-small:
    typography: '{typography.control-14}'
    rounded: '{rounded.none}'
    padding: '0 12px'
    height: 32px
  button-extra-small:
    typography: '{typography.caption-12}'
    rounded: '{rounded.none}'
    padding: '0 8px'
    height: 24px
  button-large:
    typography: '{typography.control-14}'
    rounded: '{rounded.none}'
    padding: '0 24px'
    height: 40px
  input:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    typography: '{typography.body-14}'
    rounded: '{rounded.none}'
    padding: '0 12px'
    height: 36px
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.none}'
    padding: 24px
  popover:
    backgroundColor: '{colors.popover}'
    textColor: '{colors.popover-foreground}'
    rounded: '{rounded.none}'
    padding: 16px
  sidebar-row:
    backgroundColor: '{colors.sidebar}'
    textColor: '{colors.sidebar-foreground}'
    typography: '{typography.dense-13}'
    rounded: '{rounded.none}'
  sidebar-row-hover:
    backgroundColor: '{colors.sidebar-accent}'
    textColor: '{colors.sidebar-accent-foreground}'
  worktree-sidebar-row:
    backgroundColor: '{colors.worktree-sidebar}'
    textColor: '{colors.worktree-sidebar-foreground}'
    typography: '{typography.dense-13}'
    rounded: '{rounded.none}'
  worktree-sidebar-row-hover:
    backgroundColor: '{colors.worktree-sidebar-accent}'
    textColor: '{colors.worktree-sidebar-accent-foreground}'
  success-status:
    textColor: '{colors.status-success}'
    rounded: '{rounded.none}'
  git-added-decoration:
    textColor: '{colors.git-added}'
  git-modified-decoration:
    textColor: '{colors.git-modified}'
  git-deleted-decoration:
    textColor: '{colors.git-deleted}'
  git-renamed-decoration:
    textColor: '{colors.git-renamed}'
  git-untracked-decoration:
    textColor: '{colors.git-untracked}'
  git-copied-decoration:
    textColor: '{colors.git-copied}'
  git-ignored-decoration:
    textColor: '{colors.git-ignored}'
---

# Yiru

## Overview

Yiru is an Electron desktop app for orchestrating coding agents across Git worktrees. Its interface is monochrome, quiet, rectilinear, and deliberately dense. Yiru’s chrome should recede so terminals, editors, diffs, Markdown, and the user’s work remain dominant.

Use neutral surfaces, hairline borders, and typography to create hierarchy. Reserve color for meaning: focus, destructive actions, success, Git state, annotations, and other real application state. This file documents the Light theme; the Dark theme uses the same semantic roles in [`DESIGN.dark.md`](./DESIGN.dark.md).

The implemented token source of truth is [`src/renderer/src/assets/main.css`](./src/renderer/src/assets/main.css). Use its CSS variables and Tailwind bindings in product code rather than copying hex values from this file. [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md) remains the detailed UI and UX reference; keep all three files aligned when the system changes.

## Colors

Color tokens are semantic surface/foreground pairs, not a palette for free-form decoration:

- `background` / `foreground` set the app canvas and default text.
- `card` / `card-foreground` set framed panels; `popover` / `popover-foreground` set floating surfaces.
- `primary` / `primary-foreground` identify the single affirmative action in a flow.
- `secondary` is for a lower-emphasis sibling action; `accent` is the hover, selected, and active-row wash.
- `muted` / `muted-foreground` de-emphasize captions, placeholders, metadata, and disabled chrome.
- `destructive` is only for irreversible actions and errors. Cancel, Dismiss, and Close are not destructive.
- `border` draws hairlines; `input` belongs to form fields; `ring` is reserved for focus-visible and active-selection halos.
- `editor-surface` frames Monaco, Markdown, and editor-adjacent panes. Do not substitute the app canvas.
- `sidebar-*` and `worktree-sidebar-*` are scoped families. Keep their hover, current, and focus states inside the corresponding sidebar.

Git decoration tokens mirror familiar editor conventions. Use them only for their named Git status; never reuse them as general success, warning, or error colors. When a tint is necessary, mix an existing CSS token with `color-mix()` so light and dark mode stay paired.

## Typography

Geist is the only sans-serif family. Use the existing `var(--font-mono)` stack for paths, code, terminal-adjacent controls, literal values, and aligned numbers.

- `body-14` and `control-14` cover most body copy, inputs, and default-size buttons.
- `dense-13` is the normal density for sidebar items and compact rows.
- `caption-12` handles supporting text, paths, and secondary content.
- `meta-11` is the uppercase category-label style: weight 600, `0.05em` tracking.
- Heading tokens are for genuine hierarchy, not to make ordinary chrome louder.

The global `0.01em` letter spacing is intentional. Do not override it per component without a documented need.

## Layout

Spacing follows Tailwind’s 4px-based scale. Use 4–8px inside compact control groups, 12–16px between related groups, and 24–32px between larger sections. Match the density of the surrounding toolbar, sidebar, dialog, or pane rather than enlarging a component in isolation.

Yiru is a desktop workbench, not a marketing page. Favor aligned rows, stable columns, restrained padding, and progressive disclosure. Keep frequent actions visible and move rare actions into a well-grouped menu or detail surface. Avoid cards inside cards; if content is not a repeated item, modal, or framed tool, prefer an unframed section.

All layouts must survive narrow windows, macOS titlebar traffic lights, Windows scrollbar behavior, and Linux font rendering. Assume the underlying Git host may be local, WSL, or SSH.

## Elevation & Depth

Depth has three levels and no more:

1. Hairline: the `border` token, used for almost every separator and container edge.
2. Subtle lift: `shadow-xs` plus one token border, used for outline controls and embedded cards.
3. Floating: `0 10px 24px rgba(0, 0, 0, 0.18)`, reserved for popovers and surfaces that escape the editor plane.

Use tonal surfaces and borders before shadows. Dialogs may use their existing deeper overlay recipe; extend the shared primitive rather than introducing another elevation tier.

## Motion

Motion explains continuity; it does not decorate. Keep expansion, collapse, and overlay transitions subtle, preserve focus, and honor `prefers-reduced-motion`.

Match in-flight feedback to perceived duration:

- 0–100 ms: show nothing.
- 100 ms–1 s: disable the initiating control.
- 1–3 s: add a spinner or specific label change.
- 3 s or multi-step work: name the current stage and expose useful progress.

Disable submission immediately, but delay visible loading feedback by about 200 ms when an operation may be fast locally and slower over SSH. Reserve the eventual label or icon footprint so controls do not resize mid-action.

## Shapes

Yiru is fully rectilinear. Every radius resolves to `0px`, including badges, buttons, inputs, cards, dialogs, avatars, status markers, scrollbars, pseudo-elements, legacy utilities, and third-party UI. Do not add pills or circular controls as exceptions.

## Components

Use the shadcn-style primitives in [`src/renderer/src/components/ui/`](./src/renderer/src/components/ui/) before writing custom UI. Preserve their `data-slot` attributes, merge classes with `cn()`, pass caller `className` last, and use CVA when a primitive has multiple variants. Extend a primitive instead of reimplementing its focus, keyboard, or dismissal behavior.

Buttons use this hierarchy:

- `default`: the single affirmative action in a flow.
- `secondary`: a lower-emphasis sibling.
- `outline`: toolbar and standalone actions where a fill feels heavy.
- `ghost`: icon buttons, row triggers, and disappearing chrome.
- `link`: inline actions in prose.
- `destructive`: irreversible loss only, never Cancel or Close.

Default buttons and inputs are 36px high; small is 32px, extra-small is 24px, and large is 40px. Match the control height to its row. Use the icon-size variants for square icon controls.

Choose behavior by semantics: `Tooltip` names an icon-only control, `HoverCard` previews rich noncritical content, `DropdownMenu` exposes click actions, `ContextMenu` handles right-click actions, `Popover` hosts arbitrary nonmodal content, `Dialog` demands a decision, and `Sheet` opens an edge panel. Use `Select` for a known single-choice list and `Command` inside `Popover` when search is required.

Use Phosphor icons from `@phosphor-icons/react`, normally at 16px with regular weight and inherited color. Use `<SpinnerGap className="size-4 animate-spin" />` for loading. Apply the existing scrollbar classes; do not create another scrollbar treatment.

Every focusable element needs a visible `:focus-visible` state. Inputs expose errors through `aria-invalid`; rely on the primitive’s destructive border and ring instead of painting a parallel error style.

## Voice & Content

Copy is part of the interface. Be concise, direct, and specific. Use concrete verbs and nouns, remove filler, and keep the same noun throughout a flow.

Never overclaim. Pending copy describes process; result verbs such as “deleted,” “verified,” “found,” “protected,” or “skipped” appear only when real result data supports them. Errors say what happened and give the next useful action. Empty states point to the first action. Long operations name the stage, such as “Cloning…” or “Installing…”.

Cancel, Dismiss, Close, and Discard are quiet back-out paths: no destructive color, shortcut chip, or animated emphasis. Toasts are transient; keep actionable or persistent failures inline.

## Platform & Remote Context

Keyboard behavior and labels are platform-aware. Use `metaKey` and `⌘` / `⇧` only on macOS; use `ctrlKey` and `Ctrl+` / `Shift+` on Linux and Windows. Electron accelerators use `CmdOrCtrl`. Render shortcut labels through `<ShortcutKeyCombo />` and show only shortcuts that actually exist.

Assume Git and agent operations can run through WSL or SSH with 50–200 ms of added latency. Keep focus stable while remote data arrives, prevent duplicate submissions immediately, and provide recovery without assuming local filesystem access.

## Do's and Don'ts

- Use semantic CSS variables and their paired foreground tokens.
- Use neutral contrast, alignment, and borders for hierarchy; reserve color for meaning.
- Use the nearest existing primitive and adjacent domain component.
- Design empty, loading, dense, error, disabled, hover, selected, and focus-visible states.
- Keep every primary workflow keyboard-operable with predictable Enter and Esc behavior.
- Verify every UI in light and dark mode, on macOS, Linux, and Windows, with SSH latency in mind.
- Pair state color with text or an icon; never communicate state through color alone.
- Keep required controls visible on touch devices; never make hover the only way to reveal an action.
- Don’t hardcode a hex, font size, radius, or shadow when an existing token covers the role.
- Don’t introduce rounded corners, decorative gradients, extra elevation tiers, or a second icon library.
- Don’t reuse Git decoration colors outside Git status.
- Don’t hardcode `metaKey`, macOS shortcut labels, POSIX paths, or local-only assumptions.
- Don’t make rare actions compete with the primary action or hide recovery behind a transient toast.
