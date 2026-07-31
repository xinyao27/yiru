# Yiru Style Guide

Detailed cross-client reference for Yiru components, tokens, geometry, typography, and interaction
states. Start with the binding platform contract:

- [`apps/desktop/DESIGN.md`](../apps/desktop/DESIGN.md) for desktop.
- [`apps/mobile/DESIGN.md`](../apps/mobile/DESIGN.md) for mobile.

This guide expands those contracts with component inventory and implementation detail. If it
disagrees with a platform contract, resolve both documents in the same change; do not choose a
one-off implementation. `AGENTS.md` owns code structure and quality, so those rules are not repeated
here.

Scope: `apps/desktop/src/renderer/` and `apps/mobile/`, which share one semantic token vocabulary.

| Source | File |
| --- | --- |
| Desktop visual contract | `apps/desktop/DESIGN.md` |
| Mobile visual contract | `apps/mobile/DESIGN.md` |
| Tokens, base layer, global chrome | `apps/desktop/src/renderer/assets/main.css` |
| Primitives | `apps/desktop/src/renderer/components/ui/` |
| Primitive catalog and layering | `components/ui/README.md` |
| Mobile token mirror (Uniwind) | `apps/mobile/global.css` |
| Mobile headers, controls, and tabs | §12 of this guide |

---

## 1. Design intent

Yiru hosts other tools — Monaco, xterm, Markdown, embedded browsers — so its own chrome must recede and frame, never compete. Three commitments follow, and everything below is a consequence of them:

1. **Monochrome.** Neutral grays carry the chrome. Color means *state* — selection, destructive, git status, diff — never decoration.
2. **Platform-native geometry.** Desktop stays rectilinear. Mobile follows the system's concentric rounded geometry, grouped surfaces, and Liquid Glass materials.
3. **Dense but breathable.** 14px body, 12px chrome, compact rows, real spacing around the primary workflow.

When something isn't covered here, pick the option that makes Yiru quieter.

---

## 2. The decision order

Stop at the first step that works.

1. **Reuse a primitive** from `components/ui/` — match it with `variant` and `size`.
2. **Extend that primitive** — add a CVA `variant`/`size` when the same exception would repeat at two or more call sites.
3. **Build a domain composite** in the feature folder — when the control needs product data or copy (a repo picker, a branch combobox). It still composes primitives for chrome.
4. **Write colocated CSS** — only for host surfaces (Monaco, xterm, Markdown), keyframes, pseudo-elements, or Electron drag chrome.

**Compose, don't restyle.** A call site may add layout classes — placement, flex behavior, `w-full`, gap. It may not re-specify what `variant`/`size` owns. If you are adding `bg-*`, `text-*`, `border-*`, `hover:*`, `focus-*`, `dark:*`, a fixed `h-*`/`w-*`/`size-*`, or padding to a primitive's `className`, extend the primitive instead.

Import primitives from their module (`@/components/ui/button`). The private style modules — `floating-surface-styles.ts`, `menu-item-styles.ts`, `popover-content-ref.ts` — belong to the primitive layer and are off-limits to feature code.

---

## 3. Color

### The closed vocabulary

The Tailwind theme exposes exactly the default shadcn roles, and `check-design-token-budget.mjs` keeps it that way:

`background` · `foreground` · `card` · `popover` · `primary` · `secondary` · `muted` · `accent` · `destructive` · `border` · `input` · `ring` · `chart-1…5` · the `sidebar` family — each with its `-foreground` pair.

Before reaching past it:

- Ordinary state color → **Tailwind's palette** (`green-*` success, `amber-*` warning). Don't alias it into a token.
- A tint of a role → **`color-mix`**, not a new value and not a `dark:` twin recomputing the same role: `color-mix(in srgb, var(--primary) 12%, var(--background))`.
- Hover, selected, modal, menu, floating border → **compositions of the roles above**. None gets its own token.

Never hardcode a hex value in TSX.

### Role semantics

| Role | Use for | Never for |
| --- | --- | --- |
| `background` / `foreground` | App canvas, default text | Cards, popovers, sidebar — they have their own |
| `card` | Panels lifted off the canvas | The canvas; a card inside a card |
| `popover` | Floating menus, dropdowns, hover cards, selects | Inline UI |
| `primary` | The single affirmative action in a flow | Decoration; hover states; secondary actions |
| `secondary` | Lower-emphasis action beside a primary | The affirmative action |
| `muted` | De-emphasized text, captions, placeholders, disabled chrome | Body copy; primary actions |
| `accent` | Hover and active backgrounds for ghost buttons and list rows | Solid filled buttons — use `secondary` |
| `destructive` | Delete, discard, irreversible; error states | Cancel, Dismiss, Close, Back |
| `border` | Every hairline: dividers, input edges, card edges, focus | Heavy emphasis — that's `ring` |
| `input` | Form field background | Anything outside a form field |
| `ring` | `focus-visible` border, active selection emphasis | Persistent decoration |
| `sidebar` family | Panel chrome, left rail, right sidebar | Main canvas; floating surfaces |

**One interaction system.** Buttons, row hover, and nav selection all use `accent`. Sidebar tokens paint panel surfaces and borders — they are not a second hover system; `hover:bg-sidebar-accent` on a `Button` is drift.

### Product-domain tokens

CSS-only variables in `main.css`, deliberately outside `@theme inline`. Consume with `var(--…)`.

| Family | Members | Use only for |
| --- | --- | --- |
| Git status | `--git-decoration-{added,modified,deleted,renamed,untracked,copied,ignored}` | File trees, changes view, status labels |
| Diff surfaces | `--editor-diff-{inserted,removed}-{line,text}-background`, `--editor-diff-{added,modified,deleted}-gutter` | Inside Monaco and Pierre diffs |
| Git graph | `--git-graph-{ref,remote-ref,base-ref}`, `--git-graph-lane-1…5` | History graph lanes and ref chips |
| Editor host | `--editor-surface` | Monaco/Markdown host CSS. Resolves to `background`; JSX pane roots use `bg-background` |
| Chrome geometry | `--titlebar-height`, `--app-font-family`, `--app-font-size` | Shared header height, user font settings |
| Misc domain | `--tab-group-split-divider{,-strong}`, `--terminal-pane-locate`, `--ai-action-accent` | Their one named purpose |

Git status colors mirror VS Code; diff colors mirror Cursor. The two families are deliberately different — don't merge them or borrow either for unrelated state. A new token needs product-domain semantics no role and no palette color can express; ask first.

---

## 4. Geometry

**Desktop radius is zero.** `--radius: 0`, and `main.css` holds every desktop element and pseudo-element to `border-radius: 0 !important` so legacy utilities, inline values, and third-party components comply. Desktop `rounded-*` is a no-op that signals copy-paste drift, and CI flags it.

**Mobile follows the device.** Mobile does not inherit desktop's zero-radius rule. Navigation bars, grouped controls, message bubbles, form sections, floating composers, sheets, and floating actions use concentric system geometry. Terminals, editors, and diff bodies may stay rectangular when rounding would clip or waste working content. Prefer the shared mobile Glass components so material availability and the opaque fallback stay one decision; features keep their role-specific geometry beside the markup.

The concise mobile contract lives in [`apps/mobile/DESIGN.md`](../apps/mobile/DESIGN.md); §12 keeps
the extended header, control-size, grouping, and tab recipes.

**No shadows, no outlines.** Separation is `border` plus an opaque background. No `shadow-*`, `drop-shadow-*`, `box-shadow`, `text-shadow`, or stroke-drawing outline — delete legacy declarations at the source rather than overriding them. A local `outline-none` is allowed only to suppress the UA ring on a component that supplies its own focus state.

**Focus is a border:** `focus-visible:border-ring`, or `focus-visible:bg-accent` where a control has no border seam to spend (status-bar chrome).

---

## 5. Typography

Family is the platform system UI stack via `var(--font-sans)`; mono is `var(--font-mono)` for paths, code, and terminal-adjacent UI. Never hardcode a platform font. Body sets 14px, `letter-spacing: 0.01em`, and antialiasing once on `body` — never re-declare in a component. Editors, diffs, and terminals baseline at 13px.

Use these four sizes and stop:

| Size | Utility | Role |
| --- | --- | --- |
| 14px | `text-sm` | Body copy, default button text, dialog prose |
| 12px | `text-xs` | Dense chrome: list rows, menu items, badges, secondary text |
| 11px | `text-[11px]` | Meta: menu labels, shortcut chips, trailing metadata, captions |
| 10px | `text-[10px]` | Micro counters and status pips only |

Sidebar section headers are 11px + `font-semibold` + `uppercase` + `tracking-[0.05em]`.

---

## 6. Surfaces

**Floating and modal.** Recipes live in `floating-surface-styles.ts` and apply through the rendered wrappers: popovers, menus, hover cards, and selects get `bg-popover text-popover-foreground border border-border`; dialogs, command dialogs, and sheets get `bg-background text-foreground border-border` over a `bg-black/50` backdrop.

Desktop foreground floating surfaces are **opaque while visible** — no `/NN` alpha, translucent `rgba`, `color-mix(…, transparent)`, resting opacity below 1, or backdrop blur. Enter/exit opacity motion is fine. Transparency stays correct where revealing context is the point: modal backdrops, transcript fade masks, drag and selection affordances, hover tints.

On mobile, native Liquid Glass is a functional layer for navigation and controls, not a card treatment. Use it only above content: headers, tab rails, toolbars, composers, and related control groups. Never apply it to scrolling rows, messages, terminal/editor surfaces, diffs, or error content. Unsupported platforms and Reduce Transparency render the same geometry with an opaque semantic background and border.

**Menu rows.** `menu-item-styles.ts` is the grammar for dropdown and context menus alike: 12px `font-medium` rows at `leading-5`, `data-highlighted:bg-accent`, 3.5 icons in `muted-foreground`, destructive rows in `destructive` with a 10% wash on highlight. Labels 11px `font-semibold muted-foreground`; separators `h-px bg-border/70`; shortcuts right-aligned 11px.

**List rows** — the most common source of drift. Any row-shaped control (worktrees, palette items, settings nav, pickers):

- Idle transparent; hover `bg-accent`.
- Keyboard-highlighted: `data-[selected=true]:bg-accent` plus a `border-border` edge so the row stays legible while the user types. `cmdk` sets `data-selected`; Base UI menus use `data-highlighted`.
- Persistent current row: `bg-accent` plus `data-current="true"` so it stays distinct from the keyboard highlight.
- Computing active state yourself? Call `getSelectableControlStateClasses(isActive)` rather than retyping the stack.
- Never `bg-[#ededed]`, `bg-black/N dark:bg-white/N`, or an invented "selected" color.

**Scrollbars.** Apply one of the four global classes to every overflow container; don't write a fifth. `.scrollbar-sleek` is the default thin bar (sidebars, lists, popovers); `.scrollbar-sleek-lg` adds a larger grab target for dense tables, always alongside it; `.scrollbar-editor` covers Monaco-adjacent and terminal surfaces; `.worktree-sidebar-scrollbar` is worktree-sidebar-only and reserves no gutter, so short lists sit flush with the fixed header. `.scrollbar-sleek-parent` on an ancestor fades the thumb in on parent hover only.

---

## 7. Where styles live

Cohesion beats indirection — a reader should see a component's appearance in the component.

1. **Tailwind utilities in the JSX** — the default for everything.
2. **A CVA variant on the primitive** — when the recipe repeats.
3. **A colocated `.css` file in the feature folder**, imported by that feature's entry module — keyframes, host-library overrides, pseudo-elements, Electron drag chrome.

`assets/main.css` is global-only: imports, `@font-face`, custom variants, `@theme inline`, `:root`/`.dark` tokens, `@layer base`, scrollbar utilities, titlebar and layout chrome. Feature CSS does not go there. The feature-wall, feature-tour, and diff-comment blocks currently sitting in it predate this rule — move them into their feature folder when you next touch them; don't add to them.

Mobile mirrors the same vocabulary through Uniwind in `apps/mobile/global.css`. It has no desktop-style primitive layer; its shared components live in `apps/mobile/src/components/`. Native Glass imports stay inside `apps/mobile/src/components/glass/`, whose components own availability checks, grouping, interaction, and fallback paint. Business features consume those wrappers and keep layout classes at the TSX call site.

---

## 8. Primitives

Full inventory and layering: `components/ui/README.md`.

Every primitive part carries `data-slot="<name>"` — don't strip it. Merge classes with `cn()`, user `className` last. Multiple appearances → `class-variance-authority`. Headless behavior comes from Base UI (`command` wraps `cmdk`, `sonner` wraps Sonner) — never reimplement keyboard or focus behavior, extend the wrapper. A primitive must stay useful if every Yiru domain type is deleted, which is why a searchable repo picker lives in `components/repo/`.

`Card` uses `size="compact"` for dense dashboard panels. The size owns the card gap and the vertical and horizontal padding of its direct primitive parts; call sites own only the layout between those parts.

### Buttons

`Button` — never a raw `<button>` for app chrome.

| Variant | Use |
| --- | --- |
| `default` | The one affirmative action in a flow |
| `secondary` | Lower-emphasis sibling beside a `default` |
| `outline` | Toolbar and standalone actions where a filled button reads heavy |
| `sidebar-outline` | Outline toolbar actions resting on a sidebar surface |
| `outline-transparent` | Titlebar controls whose vertical separators reveal host material |
| `ghost` | Icon buttons, row triggers — anywhere chrome should disappear |
| `quiet` | Muted icon/toolbar controls resting quieter than `ghost` |
| `chart` | Full-plot activation targets without button chrome |
| `row-action` | Actions revealed over an accent-highlighted list row |
| `picker-row` | Command and listbox rows, including the selected-state border |
| `popover-outline` | Inline actions floating above an editor, on opaque popover paint |
| `status-bar` / `status-bar-icon` / `status-bar-quiet` | Full-height footer actions, icons, labels |
| `link` | Inline text action inside a paragraph |
| `destructive` | Delete, discard, irreversible. Never Cancel. |

Sizes — match the surrounding row height instead of overriding it in `className`. Text: `xs` 24 · `sm` 32 · `default` 36 · `lg` 40. Icon: `icon-xs` 24 · `icon-sm` 32 · `icon` 36 · `icon-lg` 40. Content-driven: `list-row` · `picker-row` · `row-trigger` · `popover-hint` · `chart` · `chart-plot`. Footer: `status-bar` · `icon-status-bar` 20 · `icon-status-bar-wide` 24. Titlebar: `icon-titlebar` 28 · `-compact` 24 · `-wide` 32 · `-extra-wide` 36. Prefer `xs`/`icon-xs` for dense chrome; never drop a `default` button into a 28px toolbar.

### Forms

Use `Input`, `Textarea`, `Label`, `Checkbox`, `Switch`, `Select`, `Slider`. A native form tag is allowed only where a host editor or IME contract can't otherwise be preserved — those paths are allowlisted in the drift checker and carry an in-file `// Why:`.

`Input` sizes `default` · `lg` · `sm` · `xs` · `inline-edit`; variants `default` · `subtle` · `color` · `chrome-free`. `Textarea`: `default` · `sm` · `chrome-free` · `editor`.

The house layout is `components/settings/settings-form-controls.tsx`: two-column row with a `min-w-0 flex-1` label column and `shrink-0` control column; `<Label>` plus description in `text-xs text-muted-foreground`; section stack `space-y-3`, compact control `space-y-2`, label group `space-y-1`; trailing metadata *below* the control in `text-[11px] text-muted-foreground`. Errors surface through `aria-invalid` and the primitive paints the destructive border — don't paint your own.

Immediate on/off → `Switch`. Independent boolean → `Checkbox`. Never `Button role="switch"`.

### Badges

`Badge` for compact persistent metadata. Variants `default` · `secondary` · `outline` · `ghost` · `dot` · `link` · `destructive` · `success` · `warning`; sizes `default` (12px) and `xs` (11px, dense chips). Use `success`/`warning` instead of hand-rolling green/amber pills.

### Picking the right primitive

| You want | Reach for | Not |
| --- | --- | --- |
| Name an icon-only control | `Tooltip` | `HoverCard`, `title` attribute |
| Hover preview of rich content | `HoverCard` | `Tooltip` |
| Click-revealed action list | `DropdownMenu` | `Popover` with a hand-rolled list |
| Right-click actions | `ContextMenu` | A hand-rolled `role="menu"` portal |
| Click-revealed arbitrary content | `Popover` | `Dialog` — it traps focus and dims |
| A decision required before continuing | `Dialog` | `Popover`, inline overlay |
| Panel sliding from an edge | No primitive yet — build one in `components/ui/` when the need arises | Repurposing a centered `Dialog`, or a hand-rolled fixed/translate panel |
| One choice from a known list | `Select` | Native `<select>`, custom listbox |
| One choice with search | `Command` inside `Popover` | `Select` |
| Transient confirmation | `sonner` toast | `Dialog`, inline banner |
| Persistent inline status | Inline text + `Badge` | A toast — toasts disappear |

If you're styling a `Popover` to behave like a `Dialog` or the reverse, stop: their focus semantics differ and the mismatch misleads the next reader.

### Tooltips

A tooltip **names** a control whose appearance doesn't convey its meaning — icon-only buttons, abbreviation chips, truncated paths. It never teaches, persuades, or warns; anything the user must read while acting belongs in visible UI, and critical messages go inline.

Pass the trigger through `render` so Base UI merges accessibility props onto the control itself rather than a wrapper span — keyboard focus depends on it. The app root mounts one `<TooltipProvider delay={400}>`; default `side="top" sideOffset={4}` and change it only to avoid clipping.

```tsx
<Tooltip>
  <TooltipTrigger
    render={
      <Button variant="ghost" size="icon-sm" onClick={openSettings}>
        <Settings />
      </Button>
    }
  />
  <TooltipContent side="top" sideOffset={4}>
    {t('settings.title')}
  </TooltipContent>
</Tooltip>
```

### Icons

Icons come from `@phosphor-icons/react`; don't add a second library.

- **Size:** `size-4` is the default and `Button` applies it automatically to a bare `<svg>` child, so most call sites set nothing. `size-3` / `size-3.5` for metadata and dense rows; `size-7`+ for empty-state heroes only.
- **Weight:** the renderer-wide `IconContext` defaults to `duotone`. `regular` is correct for arrows and carets (including aliases like `ChevronDown`, `ExternalLink`, `RefreshCw`), standalone `X`/close glyphs, and deliberately quiet compact chrome (new-workspace, new-tab, tab-strip overflow, terminal-tab chrome, project headers). Pass `weight="regular"` directly to each exceptional icon. `PhosphorIconContextProvider` is root infrastructure, not a local styling tool.
- **Color** inherits from surrounding text — don't set a token on the SVG when the parent already carries it.
- **Loading** is `<LoadingIndicator className="size-4" />`. It follows the user's Appearance setting and always paints `foreground`, so call sites set size and layout only. Never import a one-off spinner.

### Keyboard shortcut chips

`<ShortcutKeyCombo keys={[…]} />` renders the key-cap style and inserts `+` separators on Windows/Linux. It does **not** transform key names — the caller supplies platform-correct labels, and the label must match the real binding (`⌘`/`⇧` on Mac, `Ctrl`/`Shift` elsewhere). A wrong chip is worse than no chip, and a placeholder for an unimplemented shortcut must not ship.

```tsx
const isMac = navigator.userAgent.includes('Mac')
<ShortcutKeyCombo keys={[isMac ? '⌘' : 'Ctrl', isMac ? '⇧' : 'Shift', 'N']} />
```

Chips appear trailing in a tooltip after the label, and in menu items via `<DropdownMenuShortcut>` — never positioned by hand. Never on Cancel, Dismiss, or `link`-variant actions.

---

## 9. Behavior

### Match feedback to perceived duration

| Duration | Feedback |
| --- | --- |
| 0–100 ms | None. Anything visible reads as a glitch. |
| 100 ms – 1 s | Disabled state only. |
| 1–3 s | Disabled plus a spinner or label swap. |
| 3 s+ or multi-step | Stage labels naming the step ("Cloning…" → "Installing…"), progress. |

**Pre-reserve the space you'll occupy.** If a control may swap to a longer label or gain an icon, fix its footprint with `width`, not `min-width` — a control that resizes mid-action looks broken even on success.

**Split immediate from visible.** Bind the *disabled* state instantly so double-clicks can't double-submit; defer the *visible* loading state ~200 ms. Local users see nothing, remote users get real feedback.

### Copy

Never imply the app acted, decided, or observed something without real state behind it. Use neutral process language while work is pending; reserve result verbs — "skipped", "protected", "found", "verified", "deleted" — for actual results.

Text is typo-free, concise, specific: direct verbs, concrete nouns. Cut "please", "simply", "just", "you can", and success language not backed by state.

### Don't overload the back-out path

`destructive` is for actions that lose data or can't be undone. **Cancel, Dismiss, Close, and Discard are not destructive** — they stay quiet (ghost, no color, no shortcut chip, no animated affordance) so the affirmative action keeps the weight. Esc can still back out; it's the decoration that stays minimal.

### Siblings and motion

If your component has a sibling — same domain, adjacent in the same flow — the two read as one design: same icons, same shortcut conventions, same submit semantics. Diverging needs a reason: either the sibling is wrong (fix both) or your component has a genuinely different role. With no sibling, match the surrounding chrome.

Motion softens expanding and collapsing content and prevents jumpy layout. It clarifies continuity; it does not decorate. Respect reduced-motion settings.

---

## 10. Platform and latency in the UI

- **Shortcut labels** show `⌘`/`⇧` on Mac and `Ctrl+`/`Shift+` elsewhere, always matching the actual binding. (The binding itself: `AGENTS.md` §7.)
- **macOS traffic lights** get a reserved 92px titlebar gutter so outer spacing stays symmetric — put no hit targets in that band on Mac. App-level header chrome shares `--titlebar-height`.
- **Remote hosts** add 50–200 ms. Disable submit controls immediately, defer visible spinners, keep focus stable while remote data arrives, and verify under real or simulated latency.

Every change holds up on macOS, Linux, and Windows, in light and dark mode.

---

## 11. When this guide is silent

Check `components/ui/README.md` for a primitive that already encodes the pattern, then the closest sibling in `components/` — provided it uses primitives correctly. For color, stay inside the shadcn roles or the Tailwind palette. If none of that resolves it, **ask** — don't add a token, invent a visual rule, or ship a native control on your own judgment.

---

## 12. Mobile chrome

These rules are canonical for mobile headers, toolbars, tabs, segmented selectors, and Liquid
Glass controls. Use platform controls before reproducing their appearance:

1. Expo Router native headers and `Stack.Toolbar` for route navigation.
2. Expo UI SwiftUI controls on iOS: `Button`, `ControlGroup`, `Picker`, `Menu`, and their semantic
   `controlSize` and `buttonStyle` modifiers.
3. Shared wrappers in `apps/mobile/src/components/glass/` for custom chrome and non-iOS fallback.
4. Feature-local layout only after the choices above are exhausted.

This hierarchy follows Apple's guidance to keep custom toolbars consistent with system behavior,
use tab bars for navigation rather than actions, and give buttons a 44×44pt hit region. Expo UI's
native Button exposes `small`, `regular`, and `large` control sizes plus `glass` and
`glassProminent`; glass styles require iOS 26 and an Xcode 26 build. `GlassEffectContainer` groups
related glass shapes, and its spacing controls when neighboring shapes begin to merge.

References:

- [Apple Human Interface Guidelines: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- [Apple Human Interface Guidelines: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [Apple Human Interface Guidelines: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Apple: Applying Liquid Glass to custom views](https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views)
- [Expo UI: Button](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/button/)
- [Expo UI: Picker](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/picker/)
- [Expo GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/)

### Control sizes

The semantic size is the API. Numeric dimensions below define Yiru's opaque fallback and stabilize
custom circular geometry; feature code must not invent another visible diameter.

| Size | Visible control | Glyph | Use |
| --- | ---: | ---: | --- |
| `large` | 44pt | 20pt | FAB and standalone primary actions |
| `regular` | 36pt | 18pt | All header actions, document-tab actions, ordinary toolbar controls |
| `small` | 32pt | 16pt | Space-constrained toolbars, composer accessories, filter and key rails |

Every control still has a minimum 44pt hit region. A 36pt or 32pt visible control expands its hit
region without making the glass shape larger. Use `controlSize(...)` on iOS and the matching shared
component size elsewhere; don't put a second fixed height, width, padding, or glyph size at the call
site.

### Spacing and grouping

- **8pt is the only gap between sibling chrome controls.** Use `gap-2`, `HStack(spacing={8})`, and
  `GlassEffectContainer(spacing={8})` together. Matching layout and glass-container spacing gives
  every group the same system-controlled blend and morph threshold.
- Page chrome uses 12pt horizontal insets (`px-3`). Chrome immediately above working content uses
  8pt vertical separation (`gap-2`, `py-2`, or the nearest semantic safe-area utility).
- Put controls that act on the same scope in one glass container. Do not wrap the entire header or
  tab region in another painted card.
- Native Liquid Glass supplies its own edge and interaction state. Do not add a border, shadow,
  opacity wash, or nested background on top of available native glass. The unsupported-platform and
  Reduce Transparency fallback uses `bg-card` plus `border-border` while preserving geometry.
- Use `glassProminent` only for the primary action or current selection. Ordinary header actions use
  `glass`.

### Headers

Prefer the native route header. It owns safe areas, title placement, back behavior, control geometry,
and the iOS material. A custom header is justified only for an embedded panel or a working surface
whose layout cannot use route chrome.

#### Custom page header

- One line: leading navigation, `text-base font-semibold` title, trailing actions.
- `regular` controls with a 44pt hit region, 8pt gaps, 12pt horizontal inset.
- Only the page title is emphasized. Status, account, host, and action labels remain regular.
- Keep at most two visible trailing actions; overflow the rest into a native menu.

#### Embedded or panel header

- A 60pt minimum row supports a two-line title without shrinking controls.
- `regular` controls, 8pt gaps, 12pt horizontal inset.
- Primary label is `text-sm font-semibold`; secondary context is `text-xs` regular and muted.
- A selected panel action changes glass tint, not size, shadow, or font weight.

### Tabs and adjacent controls

“Tab” describes navigation, not a visual shape. Choose the category first.

#### App tab bar

Use the native `TabView` or Expo Router native tabs for top-level app sections. Keep labels visible,
use familiar platform symbols, and never place commands such as Add or Refresh in the tab bar.

#### Document tab rail

Terminals, files, Markdown documents, and browser documents use a horizontally scrollable document
rail because the set is dynamic and closable.

- Every tab is a `regular` capsule in one glass container; tabs are separated by 8pt.
- Show a 16pt symbol and a `text-sm` regular label. Truncate; don't shrink below `text-sm`.
- The selected tab uses prominent or tinted glass and foreground color. Feature code does not add
  bold text, an underline, a shadow, or a different height.
- New-tab and overflow commands are separate `regular` circular toolbar buttons after the rail,
  separated from it and each other by 8pt. They are not tabs.

#### Segmented selector

Use a segmented selector for a small fixed set of mutually exclusive local views, such as Changes /
Pull Request / History or Preview / Source.

- On iOS use SwiftUI `Picker` with `pickerStyle('segmented')`; use the shared opaque equivalent on
  other platforms.
- Render one grouped control, not several independent glass pills.
- Use visible `text-sm` regular labels. Feature code does not add an underline or bold text; the
  native control owns its selection emphasis.
- A segmented selector is `regular` by default. Use `small` only inside a space-constrained toolbar.

#### Filter and shortcut rail

A scrollable set of filters, modifier keys, or terminal shortcuts is a toolbar rail, not navigation.
Use `small` controls with 8pt gaps. Selection may use prominent glass, but accessibility role remains
button or switch rather than tab.

### Implementation rules

- `apps/mobile/src/components/glass/` owns availability, native and fallback paint, control
  dimensions, glyph dimensions, hit regions, grouping, and segmented-control selection treatment.
- Features own placement and product copy. Their TSX may specify flex behavior, safe-area placement,
  width, and the standard 8pt gap; it must not restyle a shared control.
- Keep one-off layout utilities directly on the TSX element. Do not create `const styles = { ... }`
  for strings used once.
- Use regular-weight mobile icons. Use SF Symbols through Expo UI on iOS and the shared icon mapping
  elsewhere.
- Verify every new chrome variant in UI Lab in light and dark appearance, with native glass and the
  opaque fallback. Check title centering, 44pt hit regions, selected state, long labels, and a
  horizontally crowded rail.
