# slider

2026-07-16. Transformation engine (legacy `new-york-v4`). Restructured.

## Changed
- `ui/slider.tsx`: → `@base-ui/react/slider`; `Root > Control > Track >
  (Indicator, Thumb)`; `Range` → `Indicator`; layout classes moved Root → Control;
  added `thumbAlignment="edge"`.
- Call sites: `onValueCommit` → `onValueCommitted`; value handlers widened to
  `number | readonly number[]`.

## Left alone
- Single `Thumb` kept; dead `disabled:*` on Thumb left as-is.

## Behavior changes
- `thumbAlignment="edge"` preserves Radix positioning; value callbacks may deliver arrays.

## Verify by hand
- Drag a slider (notification volume, terminal settings): thumb tracks, value
  updates live, commit fires on release.
