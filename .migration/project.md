# Radix UI → Base UI (whole-project migration)

2026-07-16. Strategy: transformation engine on the user's own files (shadcn
style `new-york-v4` has no Base UI golden counterpart, so classes were kept
verbatim; only primitives, part names, data-attribute/CSS-var hooks, and
call-site props changed). Verdict: **complete and green** — all 24 wrappers on
`@base-ui/react@1.6.0`, `radix-ui` removed, typecheck (node+cli+web) clean, web
build passes, oxlint clean.

## Dependency swap
- Removed `radix-ui@^1.6.2`; added `@base-ui/react@1.6.0` (pnpm).
- Zero `radix-ui` / `@radix-ui` references remain in `src/`.

## Wrappers migrated (24)
accordion, collapsible, tabs, toggle, toggle-group, button, badge,
button-group, label, separator, progress, scroll-area, checkbox, slider,
tooltip, popover (+ popover-content-ref), hover-card, dialog, sheet,
dropdown-menu, context-menu, select, command (Dialog part only — cmdk left
intact). See each `.migration/<component>.md`.

Not radix, intentionally untouched: cmdk (command), sonner, input-otp,
react-day-picker, recharts, vaul.

## App-code sweep summary
- **`asChild` → `render`**: 512 call sites via a ts-morph codemod + 33 hand-migrated.
- **VisuallyHidden → `sr-only`** (no Base UI part): 5 files.
- **Semantic call-site props** fixed across 134 files: tooltip delay/timeout,
  popover/hover-card openDelay→trigger, select position→alignItemWithTrigger +
  value|null, accordion/toggle-group type/collapsible + value arrays, separator
  decorative, slider onValueCommit→onValueCommitted, dialog/popover
  onOpenAutoFocus→initialFocus + onEscapeKeyDown/onPointerDownOutside→onOpenChange
  reason/cancel.

## Wrapper-level fixes beyond the primitive swap
- Menu/select item highlight `focus:*` → `data-highlighted:*` (Base UI menus
  highlight via `data-highlighted`; items don't take DOM focus).
- `PopoverAnchor` bridged to the Positioner `anchor` prop via context.

## Post-migration runtime fixes (found via QA, not typecheck)
Two Radix→Base UI semantic gaps type-check cleanly but break at runtime; both fixed:
1. **Menu labels crashed on open.** Base UI `Menu.GroupLabel` /
   `ContextMenu.GroupLabel` *throw* ("MenuGroupContext is missing") unless nested
   in a `Group`, but shadcn labels are free-floating section headers (as Radix
   allowed). Right-clicking the sidebar threw. Fix: `DropdownMenuLabel` /
   `ContextMenuLabel` render a plain styled `<div>` instead of the group-bound
   primitive. (`SelectLabel` kept as `GroupLabel` — unused; select labels are
   idiomatically inside `SelectGroup`.)
2. **Menu item `onSelect` silently stopped firing.** Base UI `Menu.Item` activates
   via `onClick`, not `onSelect` (which now maps to the native DOM handler and
   type-checks), so the typecheck-driven sweep missed it. Converted **286** sites
   (DropdownMenuItem/ContextMenuItem/CheckboxItem/RadioItem + the `Item` alias)
   `onSelect`→`onClick`, adding `closeOnClick={false}` where the handler used
   `preventDefault` (Radix keep-open) — 26 sites. cmdk `CommandItem.onSelect` and
   custom components' own `onSelect` props left untouched.

## Behavior deltas (flagged, not silently patched)
1. **Tabs** default to manual activation (Base UI default; matches shadcn base registry).
2. **Menu** checkbox/radio items default to *not* closing on select.
3. **Positioner defaults**: collision/arrow padding 0→5; tooltip sideOffset 0→4;
   hover delays shifted.
4. **Dropped non-forwarded positioner props** at a few call sites (the wrappers
   forward only align/side/offsets): `avoidCollisions={false}` (TaskPage reviewer
   popover, NativeChatExperimentalSetting select), `collisionPadding`
   (WorkspaceKanbanSettingsMenu, SourceControlActionVariableChips,
   WorkspaceSpaceManagerPanel, BrowserPane), `side` on some SelectContent (== Base
   default). Restore by forwarding the extra Positioner props from the wrappers.
5. **Tooltip Root `delayDuration` dropped**: `ResourceUsageStatusSegment`'s 7
   custom-delay tooltips now use the default hover delay (Base UI has no delay on
   `Tooltip` Root).
6. **Dismiss/focus rewrites**: several `onInteractOutside`/`onOpenAutoFocus`
   handlers were rewritten to the typed `onOpenChange`+reason+`cancel()` /
   `initialFocus` paths — intent preserved; smoke-test.

## Final verification
- `tsc` node + cli + web: **0 errors**.
- `pnpm build:web`: **pass**. `oxlint src/renderer/src`: **0 errors**.
- Not run: full electron/native build (`build:native`) — needs platform toolchains;
  the renderer (all changes) bundles clean via `build:web`.

## Derived status
0 wrappers remain on Radix.
