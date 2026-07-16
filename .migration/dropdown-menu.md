# dropdown-menu

2026-07-16. Transformation engine (legacy `new-york-v4`). DropdownMenu → Menu.

## Changed
- `ui/dropdown-menu.tsx`: → `@base-ui/react/menu`; `Content`/`SubContent` →
  `Portal > Positioner > Popup`; `Sub`→`SubmenuRoot`, `SubTrigger`→`SubmenuTrigger`,
  `ItemIndicator` split. Item highlight `focus:*` → `data-highlighted:*`.
- **DropdownMenuLabel** now renders a plain `<div>` (Base UI `Menu.GroupLabel`
  throws outside a `Group`; shadcn labels float freely). [runtime fix]
- Call sites: item `onSelect` → `onClick` (+ `closeOnClick={false}` where
  preventDefault); `textValue`→`label`; content `onCloseAutoFocus`→`finalFocus`;
  outside handlers → Root `onOpenChange` + reason + `cancel()`.

## Left alone
- Nothing relevant.

## Behavior changes
- Checkbox/Radio items default `closeOnClick={false}` (Radix closed on select).
- `collisionPadding` not forwarded — dropped at WorkspaceKanbanSettingsMenu.

## Verify by hand
- Open dropdown menus: right-click/trigger opens WITHOUT crashing; arrow-key
  highlights items (data-highlighted); menu ACTIONS fire (onClick); submenus open
  right; keep-open menus don't dismiss on intended interactions.
