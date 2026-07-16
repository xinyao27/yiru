# command

2026-07-16. Transformation engine (legacy `new-york-v4`). cmdk untouched; only Dialog migrated.

## Changed
- `ui/command.tsx`: `CommandDialog`'s raw Radix Dialog → `@base-ui/react/dialog`
  (`Overlay`→`Backdrop`, `Content`→`Popup`). The wrapper still accepts the old
  `onOpenAutoFocus`/`onCloseAutoFocus` `(e)=>void` and adapts to `initialFocus`/
  `finalFocus`, so QuickOpen / WorktreeJumpPalette / MarkdownTemplatePicker are unchanged.

## Left alone
- **cmdk** (`Command as CommandPrimitive`), all `CommandPrimitive.*`, `[cmdk-*]`
  selectors, wheel-scroll workaround — NOT radix, untouched. `CommandItem.onSelect`
  is cmdk's and is kept.

## Behavior changes
- Command dialog now uses Base UI Dialog; bridged focus props keep prior behavior.

## Verify by hand
- Open the command palette(s): input focuses, typing filters, Enter runs an item,
  Escape closes and returns focus.
