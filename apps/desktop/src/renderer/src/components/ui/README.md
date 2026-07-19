# Yiru UI Component Library

This catalog defines what belongs in Yiru's reusable UI layer and where higher-level UI should live. Visual rules and token policy remain canonical in [`style-guide.md`](../../../../../docs/style-guide.md).

## Layers

| Layer | Location | Owns | Must not own |
| --- | --- | --- | --- |
| Theme | `src/renderer/src/assets/main.css` | shadcn roles, light/dark values, exceptional product-domain CSS variables | Per-feature colors or component-specific tokens |
| Primitives | `src/renderer/src/components/ui/` | Generic appearance and headless interaction | Repositories, providers, worktrees, teams, or store workflows |
| Domain UI | The nearest feature folder or domain-named module under `components/` | Product terminology, domain data, composed workflows | New visual foundations that belong in a primitive |
| Screens | `src/renderer/src/components/` and feature folders | Layout, data loading, copy, orchestration | Reimplementations of primitive interaction behavior |

A primitive should remain useful if Yiru's domain types are deleted. A searchable repository picker therefore belongs under `components/repo/`, even though it composes `Popover` and `Command` from the primitive layer.

## Token policy

The supported general-purpose vocabulary is the default shadcn set. Use those roles and Tailwind's built-in color palette rather than adding aliases.

- `bg-popover`, not a menu-surface token.
- `border-border`, not a floating-border token.
- `text-green-700 dark:text-green-300`, not a success token.
- `shadow-md` / `shadow-lg`, not a custom elevation variable.

Custom variables are reserved for stable product-domain semantics such as git decorations and embedded editor surfaces. CSS-only variables stay outside `@theme inline`. `config/scripts/check-design-token-budget.mjs` keeps the Tailwind theme on the default shadcn vocabulary in CI; promoting an exception requires a deliberate contract change, not an incidental task edit.

## Primitive catalog

Import primitives directly from their module (`@/components/ui/button`), not through a barrel.

### Actions and selection

| Module | Public interface | Notes |
| --- | --- | --- |
| `button.tsx` | `Button`, `buttonVariants` | Canonical action hierarchy and sizes |
| `button-group.tsx` | `ButtonGroup`, `ButtonGroupText`, `ButtonGroupSeparator` | Visually joins related controls |
| `toggle.tsx` | `Toggle`, `toggleVariants` | One pressed/unpressed action |
| `toggle-group.tsx` | `ToggleGroup`, `ToggleGroupItem` | Related toggle choices |

### Forms

| Module | Public interface | Notes |
| --- | --- | --- |
| `input.tsx` | `Input` | Single-line text and native input types |
| `textarea.tsx` | `Textarea` | Multi-line input with the standard field states |
| `label.tsx` | `Label` | Accessible field label |
| `checkbox.tsx` | `Checkbox` | Independent boolean choice |
| `switch.tsx` | `Switch` | Immediate on/off setting |
| `select.tsx` | `Select` family | Single choice from a known list |
| `slider.tsx` | `Slider` | Bounded numeric choice |

### Layout, disclosure, and navigation

| Module | Public interface | Notes |
| --- | --- | --- |
| `card.tsx` | `Card` family | Repeated or framed content only |
| `separator.tsx` | `Separator` | Semantic visual divider |
| `tabs.tsx` | `Tabs` family | Peer views sharing one region |
| `accordion.tsx` | `Accordion` family | Multiple disclosure sections |
| `collapsible.tsx` | `Collapsible` family | One disclosure section |
| `scroll-area.tsx` | `ScrollArea`, `ScrollBar` | Headless custom scrolling; prefer native overflow plus documented scrollbar classes when sufficient |

### Feedback and status

| Module | Public interface | Notes |
| --- | --- | --- |
| `badge.tsx` | `Badge`, `badgeVariants` | Compact persistent metadata |
| `progress.tsx` | `Progress` | Determinate progress |
| `sonner.tsx` | `Toaster` | App-level transient notifications |

### Floating interaction

| Module | Public interface | Use for |
| --- | --- | --- |
| `tooltip.tsx` | `Tooltip` family | Non-interactive labels for compact controls |
| `hover-card.tsx` | `HoverCard` family | Rich hover previews |
| `popover.tsx` | `Popover` family | Click-revealed arbitrary content |
| `dropdown-menu.tsx` | `DropdownMenu` family | Click-revealed action menus |
| `context-menu.tsx` | `ContextMenu` family | Pointer context actions |
| `dialog.tsx` | `Dialog` family | Blocking decisions and short modal forms |
| `sheet.tsx` | `Sheet` family | Edge-attached panels |
| `command.tsx` | `Command` family | Searchable actions and large option sets |

`floating-surface-styles.ts`, `menu-item-styles.ts`, and `popover-content-ref.ts` are private implementation modules shared by these wrappers. Screens should import rendered primitives, not those modules.

## Current domain composites

These are examples to copy when the same domain needs another composed picker; they are not primitives:

- `components/repo/repo-multi-combobox.tsx`
- `components/repo/repo-color-picker.tsx`
- `components/settings/settings-form-controls.tsx`

## Adding or changing UI

1. Start with the nearest existing primitive and sibling domain UI.
2. Compose default shadcn roles; do not add a theme token for the task.
3. Put domain imports and copy outside `components/ui/`.
4. Preserve `data-slot` on primitive parts and merge caller `className` last with `cn()`.
5. Use Base UI for headless behavior, Phosphor for icons, and existing scrollbar classes.
6. Check light/dark, keyboard focus, reduced motion, Windows/Linux labels, and remote latency.
7. Update this catalog only when the reusable interface or ownership changes.
