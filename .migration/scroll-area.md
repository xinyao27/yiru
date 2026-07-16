# scroll-area

2026-07-16. Transformation engine (legacy `new-york-v4`). Renames only.

## Changed
- `ui/scroll-area.tsx`: → `@base-ui/react/scroll-area`; `ScrollAreaScrollbar` →
  `Scrollbar`, `ScrollAreaThumb` → `Thumb`. Structure/classes preserved.

## Left alone
- No `type`/`scrollHideDelay` existed.

## Behavior changes
- Scrollbar visibility is CSS-driven; no visible change (wrapper never set `type`).

## Verify by hand
- Scroll a long list/panel: scrollbar appears, thumb drags.
