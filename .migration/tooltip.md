# tooltip

2026-07-16. Transformation engine (legacy `new-york-v4`). Positioner model.

## Changed
- `ui/tooltip.tsx`: → `@base-ui/react/tooltip`; `Content` → `Portal > Positioner >
  Popup`; Provider `delayDuration` → `delay`; `disableHoverableContent` → Root
  `disableHoverablePopup`; Positioner `isolate z-[90]`.
- Call sites: `TooltipProvider delayDuration`→`delay`, `skipDelayDuration`→`timeout`
  (~40 files); `TooltipTrigger asChild`→`render`.

## Left alone
- Kept the user's exact arrow classes.

## Behavior changes
- Defaults: sideOffset 0→4; hover delay 700→600; skip 300→400; collision/arrow padding 0→5.
- `<Tooltip delayDuration>` on Root is unsupported; most sites wrapped in
  `<TooltipProvider delay>`, but `ResourceUsageStatusSegment`'s 7 custom-delay
  tooltips dropped to default delay (delta #5 in project.md).

## Verify by hand
- Hover tooltips (sidebar cards, toolbar): appear after delay, correct side, arrow
  points at trigger. Check status-bar tooltips feel OK (now default delay).
