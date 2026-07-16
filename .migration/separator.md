# separator

2026-07-16. Transformation engine (legacy `new-york-v4`). Callable primitive.

## Changed
- `ui/separator.tsx`: → `@base-ui/react/separator`; callable (no `.Root`); dropped
  hardcoded `decorative`; kept `orientation`.
- `decorative` removed at ~21 call sites.

## Left alone
- Nothing relevant.

## Behavior changes
- Always semantic (`role="separator"`); no call site depended on decorative semantics.

## Verify by hand
- Separators render at the right orientation between sections/menu groups.
