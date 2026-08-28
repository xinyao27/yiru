# Chrome Web Store submission

This is the release and reviewer checklist for the Yiru MV3 extension. The extension key in
[`wxt.config.ts`](../../apps/extension/wxt.config.ts) pins ID
`mfgmfiabfncmdekmikepemddejoeihbf`; changing it breaks Native Messaging and enterprise force-install
policy.

## Listing

**Single purpose:** Operate coding agents and local development workspaces from Chrome's side panel,
with explicit browser-context and debugging tools for the page being developed.

**Short description:** Run local coding agents, terminals, worktrees, and browser debugging from a
project-aware Chrome side panel.

Category: Developer Tools. Support URL: `https://github.com/xinyao27/yiru/issues`. Privacy-policy URL:
the published copy of `PRIVACY.md`. The listing must state that the daemon is installed separately,
that Yiru has no account or developer-operated stateful backend, and that browser context is sent to
the local or user-configured daemon only after the user activates the feature.

The dashboard privacy form must disclose website content, web browsing activity, and user-generated
content because optional capture, history, DevTools, and agent workflows handle those categories
even when processing stays local. Certify no sale, advertising, credit use, or human reading and
link the Limited Use statement in `PRIVACY.md`.

## Permission rationale

| Permission | Required only for |
| --- | --- |
| `sidePanel` | The product's primary workbench and cross-tab navigator. |
| `nativeMessaging` | Starting the local daemon and receiving a short-lived authenticated bootstrap. |
| `storage` | Device-local credentials, managed policy, and synced non-secret preferences. |
| `tabGroups` | Exact project/worktree tab organization. |
| `contextMenus` | Explicit selection/link/image actions chosen by the user. |
| Loopback host access | Daemon health/bootstrap traffic on `127.0.0.1`, `::1`, or `localhost`. |
| `activeTab` + `scripting` + optional site origin | Bounded page context or a site adapter after an explicit gesture/grant. |
| `tabs` + `webNavigation` | Focus-or-create navigation and exact daemon-owned preview grouping. |
| `debugger` | User-started CDP recording/replay, network simulation, Console/Network sensors, and performance capture; detach is explicit and automatic on failure. |
| `tabCapture` | User-started preview recording; never background browsing capture. |
| `history` | A reviewed, time-bounded context window; disabled by default. |
| `downloads` | Saving a daemon artifact through Chrome's native download surface. |
| `bookmarks` | Creating the exact Yiru project folder requested by the user. |
| `notifications`, `idle`, `power` | Agent progress/return digest and an explicitly enabled keep-awake mode. |
| `system.display` | Applying a user-selected multi-display window layout. |
| `userScripts` | Locally installed, reviewable community adapters in an isolated world. |

Every permission outside the five core permissions and loopback host access is optional. The Store
build contains no remote executable code and does not download it; Chrome on-device AI is
feature-detected, opt-in, and runs in Chrome.

## Build and review

Run `vp run @yiru/extension#package:web-store`. It builds dependencies, validates the MV3 manifest,
rejects source maps, keys, environment files, and dependency directories, normalizes timestamps,
then writes a versioned ZIP and SHA-256 file under `apps/extension/release/`. Upload the ZIP without
repacking it.

Before submission:

1. Install the matching daemon and load the ZIP unpacked once on the minimum Chrome version.
2. Verify toolbar click opens the side panel and Native Messaging recovery handles a stopped daemon.
3. Exercise every required permission without granting optional permissions.
4. Grant each optional permission only from its feature entry point, verify its visible disclosure,
   then revoke it and verify graceful degradation.
5. For `debugger`, show recording, interception teardown, and the unavoidable Chrome debugging
   banner to the reviewer. For `history` and `tabCapture`, show the review screen and time bound.
6. Confirm the package contains the 128 px icon, localized name and description, and no credentials
   or remote-code loader. Confirm the Web Store listing links to the published privacy policy.

Actual Web Store review remains an external gate. Record the submitted package checksum, reviewer
notes, decision, and any requested permission changes in the release issue. A locally valid ZIP is
not evidence that Google approved the permission combination.

After the first item has complete Listing and Privacy tabs, configure the protected
`chrome-web-store` GitHub environment with `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
`CWS_REFRESH_TOKEN`, and `CWS_PUBLISHER_ID`. Pushing `extension-v<package version>` then builds the
same deterministic ZIP, uploads it through Chrome Web Store API v2, and submits the revision for
review. Google approval remains asynchronous; the workflow submission is not an approval signal.
