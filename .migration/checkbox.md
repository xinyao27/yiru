# checkbox

2026-07-16. Transformation engine (legacy `new-york-v4`). ~1:1.

## Changed
- `ui/checkbox.tsx`: → `@base-ui/react/checkbox`; `data-[state=checked]:` →
  `data-checked:`. Check icon/classes kept.
- `checked="indeterminate"` call sites → `indeterminate` boolean + boolean `checked`.

## Left alone
- Dead `disabled:*` classes on the Root `<span>` left as-is (upstream quirk).

## Behavior changes
- `checked="indeterminate"` replaced by the `indeterminate` prop.

## Verify by hand
- Checkboxes check/uncheck; tri-state shows the indeterminate mark.
