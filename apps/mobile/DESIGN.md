# Yiru mobile design system

This is the binding visual contract for `apps/mobile`. New screens and visual changes must follow
it. [`global.css`](./global.css) is the executable token source, shared controls live in
[`src/components/`](./src/components/), and the extended cross-client reference is
[`docs/style-guide.md`](../../docs/style-guide.md).

If this document, the token source, and a component disagree, resolve the design decision first.
Do not hide the disagreement with a one-off class.

## 1. Product character

Yiru mobile is a focused companion for checking and steering coding work. It should feel native,
quiet, and spatially obvious:

- neutral surfaces; color communicates state rather than decoration;
- system geometry and typography instead of desktop UI scaled down;
- Liquid Glass for every eligible navigation and control surface, never as content decoration;
- compact information with touch-comfortable controls;
- stable alignment across headers, lists, forms, and toolbars;
- motion only when it explains navigation, disclosure, or progress.

When a choice is not covered, choose the result that feels most like a restrained system app.

## 2. Source-of-truth order

Use these layers in order:

1. This document defines the mobile visual and interaction rules.
2. `global.css` defines semantic colors, type sizes, spacing, and radii.
3. Expo Router and Expo UI own standard native control behavior.
4. Deep shared modules in `src/components/` own repeated product interactions and platform policy.
5. Feature code arranges those pieces and supplies product behavior and copy.

Features may control placement, flex behavior, safe-area layout, and the standard spacing scale.
They may not invent a parallel palette, control size, Glass treatment, back button, or row grammar.

## 3. Component architecture

Use Expo UI first, and call it directly by default. Yiru does not maintain a parallel copy of the
Expo UI component catalog.

Choose the first matching form:

1. Expo Router owns navigation chrome, headers, toolbars, and native menus.
2. A feature directly calls `@expo/ui` Universal controls inside `ExpoUiHost`.
3. A feature directly calls `@expo/ui/community/*`; community controls already expose a React
   Native boundary and must not be wrapped in `ExpoUiHost`.
4. A platform implementation (`.ios.tsx` or `.android.tsx`) directly calls SwiftUI or Compose when
   that platform has a real, different interaction.
5. A shared Yiru module owns a repeated product interaction or a real platform adapter.
6. React Native owns content, layout, virtualized lists, gestures, WebViews, editors, and controls
   for which Expo UI has no behaviorally equivalent implementation.

`ExpoUiHost` is the one shared adapter for Universal controls. It maps the current Yiru color
scheme and semantic primary token into the native environment. The feature chooses only the closed
`inline` or `fill` layout; the adapter owns `matchContents`, safe-area, and transparent paint. It is
a rendered native bridge, not a React context provider, so it cannot wrap the Expo Router or React
Native tree at the app root. Use one host around a complete, contiguous native control cluster
instead of one host per child control. Do not put React Native children directly in a native tree;
use `RNHostView` only when a cluster genuinely needs embedded React Native content.

```tsx
<ExpoUiHost layout="fill">
  <Button
    label={translate('mobile.actions.save', 'Save')}
    onPress={save}
  />
</ExpoUiHost>
```

A shared module must pass the deletion test: deleting it would spread platform behavior, theme
mapping, accessibility, lifecycle, or a product invariant back across multiple callers. Keep deep
modules such as the Glass family, `BottomDrawer`, and typed segmented selection. Do not create
one-to-one shadows such as `MobileButton`, `MobileText`, `MobilePicker`, or `MobileSwitch` that only
rename an Expo control and mirror its props.

Expo UI 57.0.7 does not give its Android/web Universal Switch a reliable accessible name. Until the
package closes that gap, standard boolean settings use the complete `SettingsToggleRow` product
interaction; feature code must not create a naked Switch facade or directly repeat the workaround.

Shared interfaces use product semantics and stay closed. They do not expose arbitrary Expo
`modifiers`, colors, or a generic style escape hatch unless layout is part of the module's job.
Feature copy and business state stay in the feature. Platform files exist only for two real
implementations, not in anticipation of a future difference.

Use `className` for feature and React Native layout. Use `style` only where an Expo/native modifier
or third-party API has no `className` path, or where the API requires a numeric native measurement.
Keep that exception inside the owning adapter whenever possible.

Universal imports come from `@expo/ui`. Community controls come from their explicit
`@expo/ui/community/*` entry point. SwiftUI and Compose imports are allowed only in `.ios.tsx` and
`.android.tsx` implementations respectively; a cross-platform file must not choose a platform at
runtime.

Expo UI adoption is behavioral, not numerical. Do not replace `FlatList`, complex controlled
`TextInput`, terminal input, or searchable/custom pickers merely to increase Expo UI usage. Migrate
them only when the Expo control supports the required selection, keyboard, virtualization,
accessibility, and layout behavior on every supported platform.

## 4. Foundations

### Color and surfaces

Use semantic classes from `global.css`: `background`, `foreground`, `card`, `popover`, `primary`,
`secondary`, `muted`, `accent`, `destructive`, `border`, `input`, and `ring`.

- The page, safe-area fill, and custom header share `bg-background`. A header must not create a
  visible color seam with its page.
- `card` groups real content; it is not a default wrapper for every section.
- `popover` is only for floating content. `input` is only for editable fields.
- `accent` is the common pressed, hovered, or selected neutral state.
- Green, amber, and red are reserved for success/activity, warning, and destructive/error state.
- Never hardcode a color in feature TSX or add decorative gradients, glow, or shadows.

### Typography

The system font is the default. Use the closed mobile scale from `global.css`:

| Role | Utility | Use |
| --- | --- | --- |
| Metadata | `text-xs` | Counts, badges, timestamps, tertiary context |
| Supporting | `text-sm` | List metadata, toolbar labels, descriptions |
| Primary | `text-base` | Page titles, row titles, form values, body copy |
| Emphasis | `text-lg` / `text-xl` | A single screen or empty-state heading |

Prefer regular weight. Use semibold for page titles and short section labels, not for whole rows or
paragraphs. Truncate secondary context before shrinking type.

### Spacing and geometry

Spacing uses the 4pt scale: 4, 8, 12, 16, 20, and 24pt. Normal sibling spacing is 8pt; page chrome
uses a 12pt horizontal inset. Do not add arbitrary spacing to optically repair one screen.

| Control size | Visible size | Glyph | Use |
| --- | ---: | ---: | --- |
| `small` | 32pt | 16pt | Crowded toolbars and composer accessories |
| `regular` | 36pt | 18pt | Headers and ordinary toolbar actions |
| `large` | 44pt | 20pt | FABs and standalone primary actions |

Every action keeps at least a 44pt hit region. Shared controls own visible size, glyph size, shape,
and hit slop; feature call sites do not override them.

## 5. Navigation and chrome

- Prefer Expo Router native headers and `Stack.Toolbar`. They own safe areas, title placement,
  system material, and back behavior.
- Every pushed page uses the shared back control. Do not introduce a local chevron, label, diameter,
  or inset.
- A custom page header is one row: back, one flexible title, then at most two visible actions.
  Overflow additional actions into a native menu.
- Controls with the same scope belong in one Glass group with an 8pt layout and container gap.
- Tabs navigate between peer views. Filters, sort controls, and commands are buttons, not tabs.
- Icon-only actions have an accessibility label; their position and diameter remain stable when
  state changes.
- A standalone command never uses a bare `Pressable`. Use the shared Glass icon, text, or custom
  pressable control; reserve bare pressables for transparent content rows, high-density inline
  affordances intrinsic to those rows, and interactions nested inside an existing Glass surface.

## 6. Liquid Glass

Liquid Glass is the default functional layer above content. Comprehensive adoption means every
eligible header, tab rail, toolbar, grouped control, floating action, sheet, drawer, input shell,
and composer uses native Glass on supported iOS versions. Missing Glass on eligible chrome is a
design defect, not a discretionary styling choice.

### Global scope

- `MobileGlassAvailabilityProvider` is mounted once at the app root. Feature code never probes the
  OS version, reimplements Reduce Transparency, or forces a semantic fallback.
- Glass must remain in the same native window as the content it samples. Full-window iOS overlays
  use `FullWindowOverlay`; transparent native `Modal` windows are forbidden around Glass. Shared
  drawers own this boundary so their callers receive Glass automatically.
- Prefer Expo Router native headers, `Stack.Toolbar`, native menus, and Expo UI SwiftUI controls;
  they receive system Liquid Glass without feature-level material code.
- Unsupported platforms and Reduce Transparency use the shared opaque semantic fallback. Layout,
  hierarchy, action prominence, and accessibility remain identical across both paths.

### Local scope

- A custom header uses `MobileGlassHeader`. A functional container uses `MobileGlassSurface` with
  `isFunctional`; a tappable or focusable surface uses `isInteractive`.
- `MobileGlassSurface` requires one of those intents explicitly at compile time. Content grouping
  uses `MobileContentSection`; omitting the intent is not an opaque-card shortcut.
- Standalone actions use `MobileGlassIconButton`, `MobileGlassTextButton`, or
  `MobileGlassPressable`. Do not recreate Glass with blur, opacity, a border, or a background class.
- Two or more controls with the same task scope always live in one `MobileGlassGroup` with an 8pt
  visual gap and container spacing. Native SwiftUI implementations use one `Host` and one
  `GlassEffectContainer`, not a row of independent hosts.
- Apply Glass at the feature boundary that owns the complete control cluster. Do not make every
  child accept material props and do not nest one Glass group inside another.
- Use prominent Glass only for the primary action or current selection. Ordinary controls use the
  regular treatment.

### Content plane

Scrolling rows, messages, settings sections, terminal/editor surfaces, diffs, error copy, and
decorative cards remain semantic content behind the Glass layer. Standalone control chrome that
acts on that content still uses Glass; row-wide selection/disclosure and high-density inline
affordances remain direct content interactions. Content grouping uses `MobileContentSection`;
control code that renders a `MobileGlassSurface` without `isFunctional` or `isInteractive` is
almost always a bug.

Native Glass supplies its own edge and interaction state. Never add a border, nested background,
opacity wash, or shadow to the active Glass path.

## 7. Lists and alignment

Lists use a shared visual grid. A section header and its rows must agree on content start, metadata
start, and trailing alignment.

- Standard grouped rows use `20pt leading / flexible content / 20pt trailing`, with 8pt gaps.
- Center repo icons, status dots, unread marks, and similar glyphs in the leading column.
- Align the primary and secondary text lines to the same content column.
- Put disclosure arrows and compact counts in the trailing column. A disclosure arrow is trailing,
  never before a project title.
- Keep closely related text, such as a title and its count, at 4pt.
- Preserve column boxes when glyph sizes differ. Matching `gap` values without matching columns is
  not aligned.
- Rows are transparent at rest and use `accent` for press/selection. Do not wrap each row in Glass
  or a card.

## 8. Forms, feedback, and motion

- Use the behaviorally equivalent Expo UI control before React Native or a new wrapper. Use a shared
  module for a picker, sheet, drawer, or confirmation flow only when it owns repeated product
  behavior or platform policy.
- Immediate booleans use `SettingsToggleRow` while the Expo UI Switch accessibility exception is
  active; independent selections use a checkbox; one known choice uses a picker.
- Disable an action immediately. Show a spinner only when work lasts long enough to be perceived,
  and reserve its final footprint before loading begins.
- Destructive styling is only for irreversible actions. Back, Cancel, Close, and Dismiss stay quiet.
- Motion explains expansion, navigation, and continuity. Respect Reduce Motion and never animate a
  working surface merely for decoration.

## 9. Verification checklist

Before finishing a mobile visual change, check:

1. Does the screen use the shared header, back control, and semantic background?
2. Are all controls using the 32/36/44pt system and a 44pt hit region?
3. Does every eligible navigation and control surface use shared Glass, with no bare standalone
   command or feature-owned fallback?
4. Do neighboring headers and rows share fixed leading/content/trailing columns?
5. Are spacing values from the 4pt scale, with 8pt as the default sibling gap?
6. Does state remain understandable without color alone?
7. Does it work with long labels, large text, Reduce Transparency, and Reduce Motion? Switch the
   mounted screen light → dark and resume it after a backgrounded appearance change; header, safe
   area, and content must update together.
8. Do overlays stay in the current iOS window so Glass can sample the screen behind them?
9. Has the result been inspected in UI Lab or the iOS Simulator rather than inferred from TSX?
10. Was a standard control imported directly from Expo UI, with any wrapper justified by a real
    product or platform invariant?
