# AskForPermission provenance

Source: https://github.com/riko2chen/AskForPermission

Revision: `91f4dde33f9f5dd58a89d72f3f05aa4b149a1f0e`

Only the library sources and license are vendored. The upstream examples, docs, and tests are not
part of the Yiru build. Yiru resolves System Settings windows by the owning process bundle ID, with
the upstream English owner names as a fallback, so the flow works when macOS uses another display
language.

The SwiftUI item modifier also uses the macOS 14 `onChange` signature because the helper's minimum
deployment target is macOS 14.

The facade accepts an enabled permission set so Yiru polls only Accessibility and Screen Recording;
the unused Full Disk Access probes and private TCC SPI are never executed by the helper.

Yiru also treats a drag operation with no accepted drop target as cancellation, activates both the
legacy and current System Settings bundle identifiers, localizes the reachable UI through the host
application bundle, and constructs probe paths from path components.

The guide accepts a drop only when its end point is inside the current System Settings window. Its
card uses native Liquid Glass when compiled with the macOS 26 SDK, with the upstream opaque card as
the older-SDK and older-system fallback.
