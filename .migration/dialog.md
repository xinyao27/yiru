# dialog

2026-07-16. Transformation engine (legacy `new-york-v4`). Overlay→Backdrop, Content→Popup.

## Changed
- `ui/dialog.tsx`: → `@base-ui/react/dialog`; `Overlay`→`Backdrop`, `Content`→`Popup`
  (centered, no Positioner); `Close asChild`→`render`; animate-in/out → transitions
  + `data-starting-style`/`data-ending-style`.
- Call sites: `onOpenAutoFocus`/`onCloseAutoFocus`→`initialFocus`/`finalFocus`;
  `onEscapeKeyDown`/`onPointerDownOutside`/`onInteractOutside`→ Root `onOpenChange`
  + reason + `cancel()`.

## Left alone
- Nothing relevant.

## Behavior changes
- Per-interaction dismiss callbacks gone; dismissal via `onOpenChange` reasons.
  Base Portal renders a wrapping `<div>`.

## Verify by hand
- Open dialogs (delete-worktree, project-group name/delete, rename): focus lands
  right, Escape/outside closes (or is prevented while busy), focus returns on close.
