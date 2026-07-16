# badge

2026-07-16. Transformation engine (legacy `new-york-v4`). Slot → useRender.

## Changed
- `ui/badge.tsx`: `Slot`/`asChild` → `useRender` + `mergeProps`; `data-slot` object
  literal cast to `React.ComponentProps<'span'>`; `badgeVariants` kept.
- `asChild` call sites → `render`.

## Left alone
- Nothing relevant.

## Behavior changes
- `asChild` removed (use `render`).

## Verify by hand
- Badges render; `render`-composed badges look correct.
