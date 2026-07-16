# button

2026-07-16. Transformation engine (legacy `new-york-v4`). Real Base UI Button primitive.

## Changed
- `ui/button.tsx`: `Slot`/`asChild` → `@base-ui/react/button` (`render` native);
  cva variants/`buttonVariants` kept; `className` narrowed to `string`.
- `asChild` call sites → `render={<El/>}`; non-button targets get `nativeButton={false}`.

## Left alone
- Nothing relevant.

## Behavior changes
- `asChild` removed (use `render`); ref type `HTMLButtonElement` → `HTMLElement`.

## Verify by hand
- Buttons click normally; `<Button render={<a/>}>` link-buttons navigate.
