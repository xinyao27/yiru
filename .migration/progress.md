# progress

2026-07-16. Transformation engine (legacy `new-york-v4`). Restructured.

## Changed
- `ui/progress.tsx`: → `@base-ui/react/progress`; `Root > Track > Indicator`;
  deleted manual `translateX` (primitive computes fill from `value` on Root).

## Left alone
- Nothing relevant.

## Behavior changes
- New `Track` wrapper (`data-slot="progress-track"`, `size-full` — only added class).

## Verify by hand
- Progress bars fill to the correct percentage and animate on change.
