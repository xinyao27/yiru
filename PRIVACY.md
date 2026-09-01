# Yiru privacy policy

Last updated: August 25, 2026

Yiru's single purpose is to let you operate coding agents and local development workspaces from
Chrome. Yiru has no advertising, analytics, account system, or developer-operated stateful backend.
The Chrome extension connects to a Yiru daemon that you run locally or at an endpoint you explicitly
configure.

## Data Yiru handles

Yiru handles data only when needed for a feature you invoke. Depending on the optional permissions
you grant, this can include page URLs and titles, selected or captured page content, screenshots and
tab recordings, DOM interaction timelines, browser history from the time window you choose,
DevTools Console and Network details, project bookmarks, downloaded daemon artifacts, and coding
workspace/session content. A community site adapter is code you review and install locally; Yiru
does not fetch adapter code from a remote catalog.

The extension stores its UI preferences, project favorites, layout choices, optional on-device AI
setting, and daemon endpoint in Chrome extension storage. If Chrome Sync is enabled, Google may sync
the endpoint and preferences under Google's privacy terms. Daemon authentication tokens, captured
browser content, recordings, history results, and workspace data remain in device-local extension
storage or the selected Yiru daemon; authentication tokens are never placed in Chrome Sync.

## Use, sharing, and retention

Yiru uses this data only to provide the user-facing workspace, agent, browser-context, debugging,
recording, replay, and automation features you request. It does not sell data, use it for advertising
or credit decisions, or allow the developer or other humans to read it. Browser data is sent only to
the daemon endpoint you selected and to coding-agent processes that you explicitly invoke. If that
endpoint or an agent provider is operated by a third party, its own terms and retention policy apply.

If you enable iOS background notifications, the daemon sends an opaque encrypted notification
envelope through Yiru's stateless Cloudflare Worker gateway and Apple Push Notification service.
The gateway keeps no device registry or session state. Apple and Cloudflare can observe delivery
metadata and the generic fallback alert, but notification details are decrypted only on the paired
iPhone by Yiru's Notification Service Extension.

Data stored by the extension remains until you remove the related item, clear extension storage, or
uninstall Yiru. Daemon workspace events and artifacts remain on the selected host until you delete
them or the daemon's data directory. Chrome bookmarks and downloads follow Chrome's own retention
controls. Disabling remote notifications or unpairing the iPhone removes its push registration from
the daemon; the APNs gateway stores no copy.

## Permission and security controls

Broad page access, history, debugger, tab capture, downloads, bookmarks, notifications, idle,
keep-awake, display, user-script, and navigation capabilities are optional and requested only when
you activate their corresponding feature. Page content is labelled as untrusted before it reaches
an agent. Persistent site grants are exact-origin grants and can be reviewed or revoked in Yiru and
Chrome. The local daemon requires a random token and an exact extension Origin before accepting a
browser WebSocket.

Yiru's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy,
including the Limited Use requirements.

For privacy questions or deletion help, open an issue at
[github.com/xinyao27/yiru/issues](https://github.com/xinyao27/yiru/issues).
