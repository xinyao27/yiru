# button-group

2026-07-16. Transformation engine (legacy `new-york-v4`). Slot → useRender.

## Changed
- `ui/button-group.tsx`: `ButtonGroupText` (the only Slot user) → `useRender` +
  `mergeProps` on a `div`. `ButtonGroup`/`ButtonGroupSeparator` unchanged.

## Left alone
- `ButtonGroupSeparator` wraps the migrated Separator (no radix).

## Behavior changes
- `ButtonGroupText` `asChild` removed (use `render`).

## Verify by hand
- Button groups lay out; separators render between items.
