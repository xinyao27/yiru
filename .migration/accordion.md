# accordion

2026-07-16. Transformation engine (legacy `new-york-v4`). Migrated cleanly.

## Changed
- `ui/accordion.tsx`: `radix-ui` → `@base-ui/react/accordion`; `Content` → `Panel`;
  trigger `[&[data-state=open]>svg]:rotate-180` → `[&[data-panel-open]>svg]:rotate-180`.
- Call sites: removed `type="single" collapsible` (single is Base UI default and
  always collapsible); per-item string `value`s unchanged.

## Left alone
- No height-animation classes existed.

## Behavior changes
- None for these uncontrolled single-mode accordions (controlled would use arrays).

## Verify by hand
- Open each accordion (PR resolved comments, GitHub item dialog, mobile pairing
  guide, checks panel): toggles, chevron rotates, one section open at a time.
