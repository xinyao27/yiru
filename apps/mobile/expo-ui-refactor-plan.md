# Expo UI refactor plan

Status: code migration complete. Static checks and iOS, Android, and web exports pass. Android
emulator visual and interaction inspection passes; iOS runtime and manual screen-reader inspection
remain the release gate for closing this document.

Execution checkpoint (2026-08-03):

- the AST native-control contract, closed `ExpoUiHost`, and UI Lab matrix are implemented;
- the catalog uses Expo UI 57.0.8, including its fitted iPad Community Bottom Sheet sizing fix;
- standard boolean rows now use the reviewed `SettingsToggleRow` seam;
- typed segmented selection uses intrinsic native height and a 44pt minimum interaction region;
- the two legacy picker drawers are replaced by one virtualized `SelectionDrawer`;
- every BottomDrawer now uses the Expo UI Community Bottom Sheet, retaining native iOS system
  material while Android and web receive semantic popover paint;
- every ActionSheet action has a stable ID, explicit icon, and explicit dismiss owner;
- Glass availability, grouping, and surfaces have platform implementations, while leaf Host islands
  and shallow button wrappers have been removed;
- settings navigation and external links use Expo Router `Link` with React Native content rows so
  native opening, real web href semantics, and 44pt targets remain intact; product Pickers and
  Universal ListItem are closed React Native exceptions because Expo UI 57.0.8 cannot meet their
  accessibility and target-size contracts;
- native attachment, review-filter, and host actions use Expo UI or Expo Router menus, with usable
  web fallbacks where Community Menu has no implementation;
- workspace creation owns its Smart Source modules and uses the typed segmented control;
- home, workspace, workspace creation, and terminal now own their feature-only components instead
  of leaving them in the global component directory;
- touched controls have 44pt interaction regions and localized accessible names; all localization
  candidates were removed from the touched surface, reducing the legacy baseline to 467 candidates
  across 425 signatures;
- no newly introduced ordinary layout uses inline `style`; remaining style props are dynamic,
  animated, native-only, or required by a third-party Host API.
- Android 17 on the `Pixel_10` emulator now records UI Lab light/dark and 1.3 font-scale evidence,
  semantic checked/disabled states, Picker and segmented selection changes, and 44pt control bounds;
- Terminal Settings records BottomDrawer semantic paint in light/dark appearance, selected radio
  state, large-font layout, and select, scrim, and pan-down dismissal;
- runtime inspection caught and removed a Glass icon-button negative margin that reduced one axis of
  the nominal 44pt target, and moved Expo UI Switch labels to the React Native semantic row because
  the package-owned Android label paints black in dark appearance.

## Problem statement

Mobile UI construction currently mixes React Native controls, Expo UI Universal controls, Expo UI
Community controls, direct SwiftUI/Compose implementations, and Yiru wrappers without one reliable
decision boundary. The result is inconsistent sheets and controls, duplicated theme and platform
logic, shallow wrappers that obscure the real dependency, and feature code that cannot tell whether
a shared component is policy or merely indirection.

The refactor must make the normal choice predictable:

- prefer behaviorally equivalent Expo Router and Expo UI controls;
- call Expo UI directly unless a real product or platform invariant needs a module;
- keep React Native as the content, layout, virtualization, gesture, and complex-input substrate;
- give every retained Yiru module enough depth that deleting it would spread complexity;
- preserve accessibility, localization, theme, keyboard, and supported-platform behavior while
  migrating incrementally.

## Current evidence

The current mobile tree contains 620 TypeScript/TSX source files. The initial inventory found:

| Area | Current use |
| --- | ---: |
| Files importing Expo UI | 29 |
| Switch call sites | 10 |
| Segmented selection call sites | 8 |
| Picker drawer call sites | 7 across two legacy implementations |
| Action sheet call sites | 13 |
| Confirmation drawer call sites | 7 |
| Text-entry drawer call sites | 4 |
| Shared search-field call sites | 3 |
| Files using React Native TextInput | 24 |
| Files using React Native Pressable | 55 |
| Files using React Native ScrollView | 41 |
| Files using FlatList or SectionList | 14 |

The first Switch and segmented-control spike proved that package-level “Universal” does not yet
guarantee equivalent behavior in every supported environment:

- Expo UI 57.0.8 Switch labels do not provide a reliable accessible name for the Android switch or
  the web checkbox, and its Android native label paints black in dark appearance.
- A root Host cannot wrap the Expo Router/React Native tree. Host is a rendered native layout
  bridge, so ownership must stay with a contiguous native island.
- Web Host safe-area padding and inline-flex Switch layout differ unless the local host contract
  explicitly chooses inline behavior.
- Dynamic labels such as branch names cannot be moved into a native Switch label without a
  truncation policy.
- Fixed 32/36pt frames can clip Android Material segmented controls and do not create a 44pt hit
  region.
- A regex-only import checker misses alias, namespace, re-export, dynamic-import, and JSX-parent
  violations.
- Existing localization baselines can hide untranslated strings in touched files; the refactor must
  clean the whole touched surface, not only newly added strings.

These findings make Phase 0 a release gate rather than optional cleanup.

### Expo UI 57.0.8 capability closure

The catalog now uses Expo UI 57.0.8. Its published Universal Picker API still has no accessible-name
prop and its web implementation fixes the select height at 40pt. Universal ListItem has no link
destination or cross-platform accessibility-role prop, and its plain iOS HStack does not establish
a 44pt minimum target. Therefore Picker items 22 and 23 and ListItem item 24 are closed React Native
exceptions; item 25 uses the higher-priority Expo Router `Link` path. Re-open either migration only
when the package API can satisfy the direct-call contract; a version bump alone is not evidence.

## Solution

### End-state decision order

Every mobile control uses the first matching option:

1. Expo Router for route navigation, native headers, toolbars, and route menus.
2. Direct Expo UI Universal control inside a local Expo UI Host when behavior is equivalent.
3. Direct Expo UI Community control when it exposes the required React Native boundary.
4. Direct SwiftUI or Compose inside a platform implementation for a real platform difference.
5. A deep Yiru module for repeated product behavior, accessibility repair, platform fallback,
   lifecycle, or domain-value mapping.
6. React Native for content, layout, virtualization, gestures, editors, WebViews, and behavior not
   equivalently supplied by Expo UI.

### Native-island contract

`ExpoUiHost` remains the single theme bridge for Universal controls. It owns color scheme, semantic
primary seed, transparent paint, safe-area behavior, and the small set of inline/fill sizing modes.
It is not a root Provider and does not accept arbitrary Host props.

One Host owns one complete contiguous native control cluster. Feature code must not create one Host
per child inside a cluster, place React Native children directly in a native tree, or pass native
children across a component boundary that hides where the Host lives. Community controls that
already expose a React Native boundary do not receive an outer Host.

### Direct-call contract

Direct use is the default only while the control satisfies all supported-platform behavior. A
direct call must preserve accessible naming, localization, semantic color, disabled/busy state,
44pt interaction area, long content, and light/dark appearance. A package defect or missing prop is
a valid reason for a narrow adapter; it is not a reason to recreate the entire Expo catalog.

### Module deletion test

A retained or new Yiru module must hide at least one of:

- two real platform implementations;
- theme/token conversion into a native environment;
- an accessibility repair that callers cannot express reliably;
- presentation, keyboard, window, or dismiss lifecycle;
- a repeated product interaction with a closed semantic interface;
- stable domain-value to native-index mapping;
- Liquid Glass availability, geometry, grouping, and semantic fallback.

Modules that only rename an Expo component, mirror its props, or anticipate a future difference are
deleted. Generic `MobileButton`, `MobileSwitch`, `MobilePicker`, and `MobileTextInput` facades are
not part of the target architecture.

## Module workstreams

### Module 0: foundation and repository contracts

Owner: primary agent. This module is sequential and blocks all feature agents.

Scope:

- finish the `ExpoUiHost` inline/fill contract with safe-area behavior valid on iOS, Android, and
  web;
- replace the regex import checker with TypeScript-AST import and JSX-boundary validation;
- remove the blanket React Native Modal ban because Expo UI has no behaviorally equivalent generic
  full-screen modal;
- restrict platform imports to platform implementations and reject re-export/namespace bypasses;
- add a UI Lab native-control matrix for Host, Switch, Picker, segmented selection, disabled state,
  long labels, and light/dark appearance;
- document temporary Expo UI 57.0.8 exceptions and the condition for deleting each adapter.

Decisions:

- `ignoreSafeArea="all"` is an inline-host rule on every platform, not a runtime platform branch.
- Cross-platform files do not select SwiftUI versus Compose with `Platform.OS`.
- A repository rule only enforces what can be proved statically. It must not claim that a control is
  accessible or visually correct; those are runtime gates.

Exit gate:

- the contract rejects forbidden import forms and naked Universal-control JSX;
- UI Lab renders the native-control matrix in both bundles;
- the full repository check passes before feature migration starts.

### Module 1: settings and standard form rows

Owner boundary: settings, appearance, browser preferences, notification preferences, and terminal
preference routes. The owner does not edit shared component implementations.

Direct candidates:

- static navigation and external-link rows using Expo Router `Link` with semantic React Native
  content rows;
- simple closed choice menus such as browser link mode and terminal text size;
- a pilot Universal FieldGroup only on a screen without Reanimated scrolling, drag/reorder, nested
  Community hosts, or product-state rows.

Deep adapter:

- `SettingsToggleRow`, not `MobileSwitch`, owns the full setting interaction: visible localized
  label, optional supporting text, value, disabled state, 44pt hit region, trailing alignment, long
  label behavior, and Android/web accessible naming;
- its platform implementations may use Expo UI Switch/Toggle where semantics are complete and a
  React Native fallback where Expo UI 57.0.8 cannot meet accessibility.

Keep React Native:

- animated terminal preference scrolling and drag/reorder rows;
- credential cleanup, spinner/retry, and other product-state rows;
- navigation rows until Universal ListItem supplies 44pt iOS targets and link semantics;
- complex controlled fields.

Exit gate:

- the smallest static preference screens establish the row grammar first;
- Universal Picker pilots pass long-label, large-text, VoiceOver/TalkBack, and Android anchor-width
  inspection before additional screens migrate.

### Module 2: selection controls and selection drawers

Owner boundary: shared typed segmented selection and shared selection-drawer behavior.

Direct candidates:

- Expo UI Community segmented control as the platform implementation;
- Universal Picker only for short, closed, non-searchable choices with no subtitle, icon, long
  press, or dynamic-list requirement.

Deep modules:

- typed segmented selection retains value/index mapping, disabled semantics, theme, accessible
  group naming, and a 44pt outer interaction region;
- it does not promise 32/36pt fixed native heights that Android cannot honor, and it accepts native
  intrinsic control geometry;
- the two existing picker drawers converge into one `SelectionDrawer` product module owning sheet
  lifecycle, virtualization, selected state, disabled items, supporting text, leading content, and
  select-then-close behavior.

Keep React Native:

- virtualized repository, agent, branch, reviewer, and other dynamic option lists;
- searchable/custom pickers and rows with arbitrary product content;
- feature-specific inline filters that wrap or mix nonexclusive actions.

Exit gate:

- segmented selection has no clipping at large text and retains a 44pt interaction area;
- the consolidated selection drawer replaces both old implementations without losing subtitles,
  icons, disabled state, or list virtualization.

### Module 3: overlays, menus, and Liquid Glass chrome

Owner boundary: shared overlay behavior, shared Glass modules, and simple feature action menus.

Direct candidates:

- Expo Router toolbar/menu APIs for route chrome;
- Expo UI Community Menu for anchored actions that only need labels, selection, disabled, and
  destructive state;
- direct SwiftUI/Compose button and menu clusters inside existing platform implementations.

Deep modules to retain:

- `BottomDrawer` and its modal host because they own controlled presentation, chained flows,
  dynamic height, scrolling, keyboard, dismiss races, and semantic background;
- confirmation and text-entry drawers because they own product flow and keyboard/submit state;
- the Glass family because it owns Liquid Glass availability, Reduce Transparency, native/fallback
  implementations, grouping, dimensions, hit regions, and icon mapping;
- action-sheet content where messages, hints, loading, custom icons, or deferred close make a native
  menu behaviorally insufficient.

Consolidation candidates:

- simple action sheets become anchored Community menus one feature at a time;
- action icons become explicit instead of being inferred from English words such as “delete” or
  “remove,” which breaks after localization;
- action dismissal becomes one closed policy so a caller and the shared module cannot both close
  the same sheet;
- action-sheet and selection rows share content grammar only if doing so removes duplicate product
  policy without creating a generic prop mirror;
- default confirmation and text-entry copy becomes localized at the owning module boundary.
- BottomDrawer and Glass availability move platform-only decisions into platform implementations;
  the cross-platform entry owns context and product behavior only.

Keep React Native:

- full-screen overlays that are not sheets;
- content-row press interactions and high-density inline affordances;
- custom drawing and fallback surfaces under shared Glass modules.

Exit gate:

- no Glass overlay opens in a separate native window;
- menu migrations preserve long-press/tap trigger semantics and destructive/disabled behavior;
- BottomDrawer remains the only shared sheet lifecycle owner.

### Module 4: workspace creation and host/home flows

Owner boundary: workspace creation, source selection, host rows/actions, and home/workspace lists.

Refactors:

- move Smart Workspace source and advanced-field modules into the workspace-creation feature that
  owns them;
- use the standard toggle-row interaction for branch reuse and setup-command choices only when its
  static-label contract fits;
- keep branch names and other dynamic values in supporting content with explicit truncation;
- use typed segmented selection for the fixed GitLab state filter, not for dynamic mode chips;
- consider Community Menu for simple host actions while retaining confirmation as a separate
  product flow.

Keep React Native:

- virtualized host/workspace/source lists;
- provider logos, status-rich content rows, drag/reorder, dynamic wrapping chips, and async source
  discovery;
- content pressables whose entire row is the selection target.

Exit gate:

- feature ownership is discoverable from the workspace-creation name;
- no source-picker behavior, virtualization, or truncation regresses;
- host and workspace list scrolling remain React Native owned.

### Module 5: session, terminal, and pull-request flows

Owner boundary: session controls, quick commands, terminal accessories, native chat, and pull-request
sidebar interactions.

Refactors:

- migrate static boolean rows such as draft, auto-merge, append-enter, and terminal shortcut
  visibility through an accessibility-correct product row rather than a naked Switch facade;
- keep feature-local dynamic leading content outside a native island unless the platform
  implementation explicitly bridges it;
- replace simple header action sheets with Community Menu where no message/loading/custom-content
  semantics are required;
- continue direct SwiftUI clusters in existing iOS platform implementations instead of adding leaf
  wrappers.

Keep React Native:

- terminal input and accessory event plumbing;
- chat composer, question/ask forms, diff comment input, multiline PR compose, selection tracking,
  and keyboard-sensitive controlled fields;
- transcript, diff, terminal, file, and code virtualized/scrolling content;
- inline code and message actions.

Exit gate:

- VoiceOver/TalkBack announces every boolean action with label, role, state, and disabled state;
- busy footprints do not move surrounding content;
- terminal key events, keyboard behavior, and PR form state ownership remain unchanged.

### Module 6: source control, review, files, and browser

Owner boundary: source-control panels, review screens, file explorer/preview, and browser chrome.

Refactors:

- keep typed segmented selection for fixed peer views after Module 2 stabilizes;
- use native toolbar/menu implementations for chrome actions where the platform API is equivalent;
- migrate simple option menus only after the Community Menu trigger and accessibility gates pass;
- retain direct platform clusters already used for commit, bulk action, review, and browser chrome.

Keep React Native:

- diff/file lists, code and markdown rendering, editable file contents, browser WebView, terminal-like
  key rows, pointer modifiers, and horizontal/virtual scrolling;
- source-control rows with multiple independent inline actions;
- custom error, progress, and conflict content.

Exit gate:

- scroll, selection, editing, and WebView focus behavior is unchanged;
- every migrated chrome action retains a 44pt target and localized accessible name;
- no feature duplicates a shared Host, theme, menu, or segmented mapping rule.

## Dependency and parallel-execution map

The foundation and shared-control work is sequential. Feature migrations become parallel only after
the relevant shared contract is committed.

| Wave | Primary agent | Subagent A | Subagent B | Subagent C |
| --- | --- | --- | --- | --- |
| 0 | Foundation, contracts, UI Lab | Audit only | Audit only | Audit only |
| 1 | Shared toggle and segmented modules | Settings/forms | Workspace creation/home | Session/PR/terminal |
| 2 | Shared selection drawer and menu integration | Source control | Review/files | Browser and remaining host flows |
| 3 | Integration, localization sweep, dead-code deletion | Focused review | Focused accessibility review | Focused architecture review |

Parallel agents must have disjoint feature ownership. They do not edit shared modules, DESIGN,
package scripts, or localization baselines. They format only owned files, do not run whole-tree
auto-fix while another agent is editing, and do not commit. The primary agent integrates and creates
small commits after inspecting the combined worktree.

## Commits

Every commit leaves typecheck, repository contracts, and both platform bundles in a working state.
The intended sequence is deliberately small:

### Phase 0: make the architecture enforceable

1. Commit the Expo UI-first design and wrapper-deletion policy. Completed by the design-contract
   commit.
2. Replace regex import checks with AST-based import and JSX-host checks; remove the generic Modal
   ban.
3. Finalize the cross-platform inline/fill `ExpoUiHost` contract with no runtime platform branch.
4. Add the UI Lab native-control matrix and document the Expo UI 57.0.8 observed gaps.
5. Resolve or discard the initial direct-Switch spike so no known accessibility/layout regression
   remains in the working tree.

### Phase 1: establish safe shared seams

6. Add the full settings-toggle-row contract and generic fallback implementation.
7. Add the iOS native toggle-row implementation.
8. Add the Android native toggle-row implementation with merged toggle semantics.
9. Add the web accessible implementation and verify label/input association.
10. Correct typed segmented selection to use intrinsic height and a 44pt outer interaction region.
11. Remove the obsolete Glass-named segmented modules and update one representative caller.
12. Introduce the consolidated selection-drawer interface without moving callers.

### Phase 2: stabilize shared overlay and Glass seams

13. Isolate BottomDrawer platform paint and native-sheet policy without changing its public product
    interface.
14. Replace action-sheet implicit/duplicate closing with one explicit dismiss policy.
15. Require explicit action icons and remove localized-label heuristics.
16. Localize and tighten confirmation and text-entry drawer defaults without replacing RN input.
17. Split Glass availability into platform implementations while preserving the public provider.
18. Correct Glass accessibility ownership and 44pt hit regions before splitting the large iOS
    implementation by capability.

### Phase 3: migrate the safest product surfaces

19. Migrate native-chat preferences to the standard toggle row and localize the touched screen.
20. Migrate notification preferences and verify blocked/disabled behavior.
21. Migrate terminal autocomplete while leaving animated/drag settings in React Native.
22. Migrate the browser link-mode choice as the first simple Picker/ListItem pilot.
23. Migrate terminal text-size selection if the Picker pilot meets runtime gates.
24. Migrate the smallest static settings navigation group to Universal ListItem/Icon.
25. Migrate the settings external-link group; leave async product-state rows in React Native.

### Phase 4: consolidate selection and workspace creation

26. Move the loader and branch picker callers to the consolidated selection drawer.
27. Move repository and agent selection to the same drawer while preserving virtualization and
    leading content.
28. Delete the two superseded picker implementations and unused long-select surface.
29. Move Smart Workspace modules under workspace creation without changing behavior.
30. Migrate branch-reuse/setup toggles with static labels and separate truncated supporting values.
31. Migrate the fixed GitLab state filter to typed segmented selection.

### Phase 5: migrate feature controls in parallel

32. Migrate PR draft and auto-merge boolean rows, including busy behavior and localization.
33. Migrate quick-command append-enter and terminal-shortcut visibility with feature-correct row
    layouts.
34. Convert the simplest session/header action sheet to Community Menu.
35. Convert the simplest host action sheet to Community Menu while retaining confirmation flow.
36. Apply stabilized segmented selection to source control, review comments, browser view mode,
    history scope, HTML preview, and contribution metrics in separate feature commits.
37. Apply only proven Picker patterns to remaining static settings; stop when a screen requires
    nested scrolling, custom content, or mixed native/RN state.

### Phase 6: close the migration

38. Remove dead shallow wrappers, old imports, obsolete props, and superseded styles.
39. Localize every visible/accessibility string in all touched files without expanding the baseline.
40. Run the architecture review and correct module ownership or cross-feature imports.
41. Run the complete static, bundle, and runtime verification matrix.
42. Update this plan with completed/exception decisions and remove it when no active migration work
    remains.

## Completion ledger

As of 2026-08-03, items 1–7, 9–21, 25–33, and 35–40 are implemented. The remaining decisions
are explicit:

- Item 8 is superseded. Expo UI 57.0.8 does not reliably expose an Android/web Switch accessible
  name, so `SettingsToggleRow` keeps the reviewed React Native fallback on those platforms.
- Items 22–24 are closed as deliberate React Native exceptions, not migration backlog. Universal
  Picker cannot meet the accessible-name and 44pt web-target contract; Universal ListItem cannot
  guarantee a 44pt iOS target or preserve link semantics. Item 25 uses Expo Router `Link` for both
  internal and external navigation.
- Item 34 is satisfied by the native attachment menu and Expo Router native session toolbar menu.
  The hint-bearing non-native header sheet deliberately remains an ActionSheet because Community
  Menu cannot preserve its richer content or web behavior.
- Item 41 is complete for formatting, lint, typecheck, repository contracts, iOS/Android/web
  exports, and the recorded Android emulator matrix. iOS runtime remains pending because this
  worktree has no booted iOS Simulator. Automated Android semantics inspection is not recorded as
  manual TalkBack or VoiceOver proof.
- Item 42 retains this plan until the runtime matrix below is recorded. The code migration is not a
  reason to weaken that release gate.

## Decision document

- Expo UI is preferred by behavior, not by component count.
- Host is a local native bridge, never a root Provider.
- Direct Expo UI calls are the default; Switch is a temporary exception because version 57.0.8
  does not provide reliable Android/web accessible naming and its Android label is not dark-theme
  safe.
- The Switch exception is a full product row, not a naked control facade.
- Typed segmented selection remains a deep module; fixed cross-platform native heights do not.
- BottomDrawer, Glass, search, selection drawer, confirmation, and text-entry flows remain deep
  modules.
- Complex controlled TextInput, terminal/editor input, WebView, virtualized lists, gestures, and
  content rows remain React Native.
- Universal FieldGroup/Picker adoption begins with pilots and expands only after native accessory,
  scrolling, accessibility, and anchor-layout gates pass.
- Community Menu replaces only simple anchored action sheets. Rich sheets remain product overlays.
- Platform imports live only in platform implementations. Cross-platform files do not branch to
  choose UI toolkits.
- No component barrel or Expo UI re-export layer will be introduced.
- No new design token is required for this refactor.
- No localization baseline expansion is allowed.

## Verification decisions

This repository forbids tests, so the refactor adds and retains no test files or suites.

Per-commit static gate:

- mobile lint and formatting;
- mobile typecheck;
- localization coverage;
- native-control import/Host contract;
- source-path and max-lines contracts when files move;
- full repository check at each phase boundary.

Per-module bundle gate:

- iOS Expo export;
- Android Expo export;
- web bundle when a Universal control has a distinct web implementation.

Runtime gate for every migrated native control:

- UI Lab in light and dark appearance;
- iOS Simulator and an Android emulator/device;
- VoiceOver and TalkBack accessible name, role, value/state, disabled state, and focus order;
- long labels, dynamic type/font scaling, 44pt interaction region, and RTL where practical;
- keyboard open/close, focus restoration, sheet dismissal, and nested scrolling where applicable;
- Reduce Transparency for Glass paths.

Recorded Android evidence (2026-08-03):

- Android 17 `Pixel_10`, 1080×2424 at 420 dpi, in light and dark appearance;
- UI Lab native Switch, disabled/long-label Switch, Picker, product toggle row, and segmented
  selection render and update semantic state; 1.3 font scale does not clip their labels;
- the UI Lab close button exposes a 116×116 px interaction bound after the Glass target correction,
  corresponding to 44×44 dp at the emulator density;
- Terminal Settings BottomDrawer has visible semantic background paint in light and dark
  appearance, preserves radio selection, fits all choices at 1.3 font scale, and closes after
  selection, scrim press, and pan-down gesture;
- iOS Simulator, VoiceOver, TalkBack speech/focus order, RTL, keyboard-specific sheet flows, and
  Reduce Transparency remain unrecorded and cannot be inferred from Android hierarchy output.

A platform control does not graduate from pilot to broad migration until its runtime gate is
recorded as passed. Bundle success alone is insufficient. The rejected ListItem pilot remains
closed until its package-level 44pt and link-semantics gaps are fixed.

## Out of scope

- replacing React Native layout primitives or all Pressable usage;
- replacing FlatList, SectionList, Reanimated scrolling, gestures, terminal/editor input, WebView,
  diff/code rendering, or complex controlled fields;
- redesigning feature workflows while changing their control implementation;
- introducing a complete Yiru UI facade over Expo UI;
- changing desktop components or tokens;
- upgrading Expo UI again unless a separately reviewed package change removes a known blocker;
- adding tests, snapshots, or test infrastructure.
