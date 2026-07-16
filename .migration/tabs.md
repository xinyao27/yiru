# tabs

2026-07-16. Transformation engine (legacy `new-york-v4`).

## Changed
- `ui/tabs.tsx`: → `@base-ui/react/tabs`; `Trigger` → `Tab`, `Content` → `Panel`;
  `data-[state=active]:` → `data-active:`.

## Left alone
- Did not add `activateOnFocus` (matches shadcn base registry).

## Behavior changes
- **Manual activation**: Base UI defaults `activateOnFocus={false}`; tabs activate
  on click/Enter, not arrow-key focus. Flagged, not patched.

## Verify by hand
- Arrow-key through a tab list: panel changes only on Enter/Space; click switches immediately.
