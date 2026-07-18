---
version: alpha
name: Yiru
description: Yiru’s quiet, monochrome desktop design system, Dark theme (the Light theme is documented in DESIGN.md).
colors:
  primary: '#e5e5e5'
  primary-foreground: '#171717'
  secondary: '#262626'
  secondary-foreground: '#fafafa'
  muted: '#262626'
  muted-foreground: '#a1a1a1'
  accent: '#404040'
  accent-foreground: '#fafafa'
  destructive: '#ff6568'
  destructive-foreground: '#df2225'
  background: '#0a0a0a'
  foreground: '#fafafa'
  card: '#171717'
  card-foreground: '#fafafa'
  popover: '#171717'
  popover-foreground: '#fafafa'
  border: '#ffffff12'
  input: '#ffffff26'
  ring: '#737373'
  editor-surface: '#1e1e1e'
  sidebar: '#171717'
  sidebar-foreground: '#fafafa'
  sidebar-primary: '#1447e6'
  sidebar-primary-foreground: '#fafafa'
  sidebar-accent: '#262626'
  sidebar-accent-foreground: '#fafafa'
  sidebar-border: '#ffffff12'
  sidebar-ring: '#525252'
  worktree-sidebar: '#2a2a2a'
  worktree-sidebar-foreground: '#fafafa'
  worktree-sidebar-accent: '#353535'
  worktree-sidebar-accent-foreground: '#fafafa'
  worktree-sidebar-border: '#ffffff12'
  worktree-sidebar-ring: '#737373'
  status-success: '#86efac'
  status-success-background: '#86efac1a'
  status-success-border: '#86efac40'
  git-added: '#81b88b'
  git-modified: '#e2c08d'
  git-deleted: '#c74e39'
  git-renamed: '#73c991'
  git-untracked: '#73c991'
  git-copied: '#73c991'
  git-ignored: '#6e6e6e'
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
    backgroundColor: '#cfcfcf'
    textColor: '{colors.primary-foreground}'
  button-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    typography: '{typography.control-14}'
    rounded: '{rounded.none}'
    padding: '0 16px'
    height: 36px
  button-outline:
    backgroundColor: '#151515'
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
    backgroundColor: '#9e4143'
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
    backgroundColor: '#151515'
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

# Yiru Dark

## Overview

Yiru is an Electron desktop app for orchestrating coding agents across Git worktrees. Its dark interface is monochrome, quiet, rectilinear, and deliberately dense. Near-black canvas, neutral raised surfaces, restrained separators, and readable editor planes keep Yiru’s chrome behind terminals, diffs, Markdown, and the user’s work.

This file is the Dark-theme companion to [`DESIGN.md`](./DESIGN.md). It uses the same token names, typography, spacing, shapes, and component hierarchy with dark-specific color values.

The implemented token source of truth is [`src/renderer/src/assets/main.css`](./src/renderer/src/assets/main.css). Use its CSS variables and Tailwind bindings in product code rather than copying hex values from this file. [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md) remains the detailed UI and UX reference; keep all three files aligned when the system changes.

## Colors

Dark mode is not a color inversion. The `background` canvas is near-black; `card`, `popover`, `sidebar`, and `editor-surface` provide deliberate tonal steps. Keep each surface with its paired foreground token.

- `primary` / `primary-foreground` identify the single affirmative action.
- `secondary` is the lower-emphasis filled action; `accent` is the hover, selected, and active-row wash.
- `muted` / `muted-foreground` carry captions, placeholders, metadata, and disabled chrome.
- `border` is a 7% white hairline and `input` is a stronger translucent field treatment. Do not replace one with the other.
- `ring` and the scoped sidebar ring tokens are reserved for focus-visible and active selection.
- `editor-surface` is lighter than the canvas to match editor conventions without making the editor look like a card.
- `worktree-sidebar-*` is intentionally lifted above the app canvas; keep its states scoped to that panel.

Git decoration tokens mirror familiar editor conventions. Use them only for their named Git status. Status color always needs a textual or icon cue, and tints should come from the existing CSS token through `color-mix()`.

## Typography

Geist is the only sans-serif family. Use the existing `var(--font-mono)` stack for paths, code, terminal-adjacent controls, literal values, and aligned numbers.

- `body-14` and `control-14` cover most copy, inputs, and default buttons.
- `dense-13` is the normal density for sidebar items and compact rows.
- `caption-12` handles supporting text, paths, and secondary content.
- `meta-11` is the uppercase category-label style: weight 600, `0.05em` tracking.
- Heading tokens are for real hierarchy, not louder chrome.

The global `0.01em` letter spacing is intentional. Keep type metrics identical across themes so switching theme never shifts layout.

## Layout

Spacing follows Tailwind’s 4px-based scale. Use 4–8px inside compact groups, 12–16px between related groups, and 24–32px between larger sections. Match the density of the surrounding toolbar, sidebar, dialog, or pane.

Favor aligned rows, stable columns, restrained padding, and progressive disclosure. Keep frequent actions visible, move rare actions into well-grouped menus, and avoid nested cards. Dark surfaces need a visible tonal or border relationship with their parent; a container that disappears into the canvas is not a valid layer.

All layouts must survive narrow windows, macOS traffic lights, Windows scrollbar behavior, Linux font rendering, and remote Git hosts reached through WSL or SSH.

## Elevation & Depth

Depth has three levels and no more:

1. Hairline: the translucent `border` token, used for separators and container edges.
2. Subtle lift: `shadow-xs` plus one token border, used for outline controls and embedded cards.
3. Floating: `0 10px 24px rgba(0, 0, 0, 0.18)`, reserved for popovers and surfaces that escape the editor plane.

Dark floating surfaces need both a distinct surface and a border; shadow alone can vanish into the canvas. Dialogs use their existing deeper overlay recipe. Extend the shared primitive rather than creating another tier.

## Motion

Motion explains continuity; it does not decorate. Keep expansion, collapse, and overlay transitions subtle, preserve focus, and honor `prefers-reduced-motion`.

- 0–100 ms: show nothing.
- 100 ms–1 s: disable the initiating control.
- 1–3 s: add a spinner or specific label change.
- 3 s or multi-step work: name the current stage and expose useful progress.

Disable submission immediately, but delay visible loading feedback by about 200 ms when an operation may be fast locally and slower over SSH. Reserve the eventual label or icon footprint so controls do not resize mid-action.

## Shapes

Yiru is fully rectilinear. Every radius resolves to `0px`, including badges, buttons, inputs, cards, dialogs, avatars, status markers, scrollbars, pseudo-elements, legacy utilities, and third-party UI. Do not add pills or circular controls as exceptions.

## Components

Use the shadcn-style primitives in [`src/renderer/src/components/ui/`](./src/renderer/src/components/ui/) before writing custom UI. Preserve `data-slot`, merge with `cn()`, pass caller `className` last, and use CVA for variants. Extend primitives instead of reimplementing focus, keyboard, and dismissal behavior.

Buttons keep the same hierarchy in both themes: `default` for the single affirmative action, `secondary` for its lower-emphasis sibling, `outline` for toolbar or standalone actions, `ghost` for icon and row chrome, `link` for inline prose actions, and `destructive` only for irreversible loss. Dark destructive buttons use the primitive’s translucent fill so white copy maintains contrast.

Default buttons and inputs are 36px high; small is 32px, extra-small is 24px, and large is 40px. Match the row height. Use icon-size variants for square icon controls.

Choose behavior by semantics: `Tooltip` names an icon-only control, `HoverCard` previews rich noncritical content, `DropdownMenu` exposes click actions, `ContextMenu` handles right-click actions, `Popover` hosts arbitrary nonmodal content, `Dialog` demands a decision, and `Sheet` opens an edge panel. Use `Select` for a known single-choice list and `Command` inside `Popover` when search is required.

Use Phosphor icons from `@phosphor-icons/react`, normally at 16px with regular weight and inherited color. Use `<SpinnerGap className="size-4 animate-spin" />` for loading. Apply an existing scrollbar class instead of creating another treatment.

Every focusable element needs a visible `:focus-visible` state. Inputs expose errors through `aria-invalid`; rely on the primitive’s destructive border and ring.

## Voice & Content

Copy is concise, direct, and specific. Use concrete verbs and nouns, remove filler, and keep terminology stable across a flow.

Never overclaim. Pending copy describes process; result verbs such as “deleted,” “verified,” “found,” “protected,” or “skipped” appear only when real result data supports them. Errors say what happened and give the next useful action. Empty states point to the first action. Long operations name the stage.

Cancel, Dismiss, Close, and Discard are quiet back-out paths: no destructive color, shortcut chip, or animated emphasis. Toasts are transient; keep actionable or persistent failures inline.

## Platform & Remote Context

Use `metaKey` and `⌘` / `⇧` only on macOS; use `ctrlKey` and `Ctrl+` / `Shift+` on Linux and Windows. Electron accelerators use `CmdOrCtrl`. Render labels through `<ShortcutKeyCombo />` and show only implemented shortcuts.

Assume Git and agent operations can run through WSL or SSH with 50–200 ms of added latency. Keep focus stable while remote data arrives, prevent duplicate submissions immediately, and provide recovery without assuming local filesystem access.

## Do's and Don'ts

- Use semantic CSS variables and paired foreground tokens.
- Use tonal surfaces, alignment, and borders for dark-mode hierarchy; reserve color for meaning.
- Use the nearest existing primitive and adjacent domain component.
- Design empty, loading, dense, error, disabled, hover, selected, and focus-visible states.
- Keep every primary workflow keyboard-operable with predictable Enter and Esc behavior.
- Verify every change in both themes, on macOS, Linux, and Windows, with SSH latency in mind.
- Pair state color with text or an icon.
- Keep required controls visible on touch devices; never make hover the only way to reveal an action.
- Don’t hardcode a hex, font size, radius, or shadow when an existing token covers the role.
- Don’t flatten cards, popovers, editors, and canvas onto one dark surface.
- Don’t introduce rounded corners, decorative gradients, extra elevation tiers, or a second icon library.
- Don’t reuse Git decoration colors outside Git status.
- Don’t hardcode `metaKey`, macOS shortcut labels, POSIX paths, or local-only assumptions.
- Don’t make rare actions compete with the primary action or hide recovery behind a transient toast.
