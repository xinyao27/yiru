# hover-card

2026-07-16. Transformation engine (legacy `new-york-v4`). Renamed primitive (preview-card).

## Changed
- `ui/hover-card.tsx`: → `@base-ui/react/preview-card` (public names kept `HoverCard*`);
  `Content` → `Portal > Positioner > Popup`; Positioner `isolate z-50`; Trigger `<a>`.
- Call sites: `openDelay`/`closeDelay` Root → `HoverCardTrigger`; `asChild`→`render`.

## Left alone
- Nothing relevant.

## Behavior changes
- `collisionPadding` not forwarded — dropped at SourceControlActionVariableChips,
  WorkspaceSpaceManagerPanel. Open delay default 700→600.

## Verify by hand
- Hover preview-card triggers (worktree card meta, project rows): card appears after
  delay, positioned correctly, dismisses on leave.
