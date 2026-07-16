# popover

2026-07-16. Transformation engine (legacy `new-york-v4`). Positioner + Anchor bridge.

## Changed
- `ui/popover.tsx`: → `@base-ui/react/popover`; `Content` → `Portal > Positioner >
  Popup` (FORWARD rule); wheel-shim/no-drag preserved; animate/CSS-var idioms restated.
- **PopoverAnchor** rebuilt from inert to a real anchor bridge (context registers
  the element node; PopoverContent forwards it to the Positioner `anchor` prop;
  falls back to the trigger when absent). Accepts `render` and `children`.
- `ui/popover-content-ref.ts`: type repointed; `Content['ref']` → `Popup.Props['ref']`.
- Call sites: `openDelay`/`closeDelay` Root → `PopoverTrigger`; `asChild`→`render`;
  `onOpenAutoFocus`/`onCloseAutoFocus`→`initialFocus`/`finalFocus`; outside/escape
  handlers → Root `onOpenChange` + reason + `cancel()`.

## Left alone
- Nothing relevant.

## Behavior changes
- `collisionPadding`/`collisionBoundary`/`avoidCollisions` not forwarded — dropped
  at a few sites (delta #4). Dismiss handlers rewritten to the typed path.

## Verify by hand
- Anchor popovers (WorktreeParentPickerPopover, SmartWorkspaceNameField input,
  SettingsFormControls, BrowserPane) anchor to the right element; search popovers
  autofocus; escape/outside dismiss (and keep-open cases) behave as before.
