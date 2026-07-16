# select

2026-07-16. Transformation engine (legacy `new-york-v4`). Restructured.

## Changed
- `ui/select.tsx`: → `@base-ui/react/select`; `Select` bare re-export of Root;
  `Content` → `Portal > Positioner > Popup` (`isolate z-50` on Popup); `Viewport`→
  `List`, `ScrollUp/DownButton`→`ScrollUp/DownArrow`, `Label`→`GroupLabel`; item
  anatomy ItemText-first. Dropped `position`; exposes `alignItemWithTrigger`.
  Item highlight `focus:*` → `data-highlighted:*` (trigger keeps `focus-visible:`).
- Call sites: `position="popper"`→`alignItemWithTrigger={false}`; `onValueChange`
  widened to `string | null` (null-guarded).

## Left alone
- `SelectLabel` kept as `GroupLabel` (unused; select labels belong in `SelectGroup`).

## Behavior changes
- `onValueChange` receives `value | null` + eventDetails. `side`/`collisionAvoidance`
  not forwarded — a couple sites dropped `side="bottom"` (== default) and one
  `avoidCollisions={false}` (delta #4).

## Verify by hand
- Open selects (device pickers, settings dropdowns): options open aligned to the
  trigger, keyboard highlights options, selecting updates value + shows the check.
