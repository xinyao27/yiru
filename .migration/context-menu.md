# context-menu

2026-07-16. Transformation engine (legacy `new-york-v4`). Same Menu anatomy.

## Changed
- `ui/context-menu.tsx`: → `@base-ui/react/context-menu`; `Content` → `Portal >
  Positioner > Popup` (main content pointer-anchored); SubContent `align="start"
  alignOffset={4} side="right" sideOffset={0}`. Item highlight `focus:*` →
  `data-highlighted:*`.
- **ContextMenuLabel** now renders a plain `<div>` (GroupLabel throws outside a
  Group). [runtime fix]
- Call sites: `ContextMenuTrigger asChild`→`render`; item `onSelect`→`onClick`,
  `textValue`→`label`; outside/close handlers → Root `onOpenChange` reasons.

## Left alone
- Nothing relevant.

## Behavior changes
- `ContextMenu.Root` has no `modal`; `ContextMenu.Trigger` has no `disabled` (both
  dropped; no call site relied on them). Checkbox/radio close-on-select default flips.

## Verify by hand
- Right-click targets (file rows, terminal, git history, sidebar cards): menu opens
  WITHOUT crashing at the pointer, items highlight via keyboard, actions run.
