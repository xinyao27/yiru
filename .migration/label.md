# label

2026-07-16. Transformation engine (legacy `new-york-v4`). No Base primitive → native.

## Changed
- `ui/label.tsx`: `LabelPrimitive.Root` → native `<label>`; type
  `React.ComponentProps<'label'>`. Classes/`data-slot` kept.

## Left alone
- Nothing relevant.

## Behavior changes
- Loses Radix's double-click text-select guard, but `select-none` already covers it.

## Verify by hand
- Clicking a label focuses/toggles its control.
