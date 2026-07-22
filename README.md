<h1 align="center">
  <a href="https://yiru.ai"><img src="apps/desktop/resources/build/icon.png" alt="Yiru" width="64" valign="middle" /></a> Yiru
</h1>

<p align="center">
  <a href="https://github.com/xinyao27/yiru/stargazers"><img src="https://badgen.net/github/stars/xinyao27/yiru?label=%E2%98%85" alt="GitHub stars" /></a>
  <a href="https://github.com/xinyao27/yiru/releases"><img src="docs/assets/readme-downloads.svg" alt="Yiru downloads" /></a>
  <img src="https://badgen.net/github/license/xinyao27/yiru" alt="License" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="Supported platforms: macOS, Windows, and Linux" />
</p>

<p align="center">
  <strong>A workspace for running coding agents in parallel.</strong><br />
  Keep agents, isolated Git worktrees, terminals, files, diffs, and reviews together.
</p>

<h3 align="center"><a href="https://yiru.ai/download"><ins>Download Yiru</ins></a></h3>

<p align="center">
  <img src="docs/assets/yiru-hero.svg" alt="Yiru desktop workspace" width="960" />
</p>

## What is Yiru?

Yiru is an open-source desktop and mobile workspace for agent-assisted software development. It lets you run several coding tasks at once without mixing their files, terminal state, or Git history.

Each task can live in its own worktree while Yiru keeps the surrounding workflow visible: agent sessions, terminals, source control, file changes, pull requests, and notifications.

## Core capabilities

- **Parallel worktrees:** Run independent tasks against the same repository and compare their results before merging.
- **Agent sessions:** Start, monitor, resume, and organize terminal-based coding agents from one workspace.
- **Integrated terminals:** Use persistent terminal panes, splits, scrollback, and remote sessions without leaving the project.
- **Files and diffs:** Browse and edit files, preview common formats, inspect changes, and annotate diff lines for follow-up work.
- **Source control:** Stage, commit, sync, review history, and manage branches from the desktop or mobile interface.
- **Code review:** Inspect GitHub pull requests and GitLab merge requests, including discussions, checks, and review state.
- **Remote development:** Work with local, WSL, and SSH hosts while keeping host-specific execution and reconnection behavior explicit.
- **Mobile companion:** Pair an iOS or Android device to monitor sessions, receive notifications, and send follow-up instructions away from the desktop.

## Coding agents

Yiru works with terminal-based coding agents installed on the selected local or remote host. Authentication, model access, and usage limits remain under the control of each agent provider.

The workspace does not require every agent to expose the same capabilities. Yiru keeps provider-specific behavior isolated while presenting sessions, worktrees, files, terminals, and reviews through a consistent interface.

## Install

### Desktop

Yiru supports macOS, Windows, and Linux.

- [Download Yiru](https://yiru.ai/download)
- [Browse all GitHub releases](https://github.com/xinyao27/yiru/releases)

Windows builds are published when release signing is available. macOS and Linux releases can ship independently.

### Mobile companion

Install the mobile app, then pair it with Yiru Desktop from the Mobile settings screen.

- **iOS:** [Join the TestFlight beta](https://testflight.apple.com/join/67PVx1Se)
- **Android:** [Download the latest APK](https://github.com/xinyao27/yiru/releases/download/mobile-android-latest/app-release.apk)
- **Documentation:** [Mobile companion guide](https://yiru.ai/docs/mobile)

## Develop locally

Yiru is a pnpm monorepo. Development currently requires Node.js 24 and pnpm 11.15.0.

```bash
pnpm install
pnpm dev:desktop
```

Useful commands:

```bash
pnpm dev:mobile   # Start the Expo mobile app
pnpm typecheck    # Type-check all workspace projects
pnpm test         # Run the test suite
pnpm lint         # Run and fix lint checks
pnpm fmt          # Format the repository
```

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for repository conventions, platform setup, and contribution guidance.

## Support and privacy

- [Report a bug or request a feature](https://github.com/xinyao27/yiru/issues)
- [Read the privacy and telemetry documentation](https://yiru.ai/docs/telemetry)
- [Review release notes and downloads](https://github.com/xinyao27/yiru/releases)

## Release signing

Windows code signing is provided through [SignPath.io](https://signpath.io), with a certificate issued by the [SignPath Foundation](https://signpath.org).

## License

Yiru is free and open source under the [MIT License](LICENSE).
