# toggle

2026-07-16. Transformation engine (legacy `new-york-v4`). Direct.

## Changed
- `ui/toggle.tsx`: → `@base-ui/react/toggle`; callable primitive (`.Root` dropped);
  `data-[state=on]:` → `data-pressed:`.

## Left alone
- `toggleVariants` and classes unchanged.

## Behavior changes
- None (presence-attribute rename only).

## Verify by hand
- A standalone toggle reflects pressed styling when active.
