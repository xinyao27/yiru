export const ROOT_HELP_REFERENCE = `Common Commands:
  yiru open [directory] [--json]
  yiru .
  yiru serve [--port <port>] [--mobile-pairing [--pairing-address <host>]] [--electron] [--json]
  yiru status [--json]
  yiru diagnostics memory [--json]
  yiru agent-context [--json]
  yiru worktree list [--repo <selector>] [--limit <n>] [--json]
  yiru worktree create --name <name> [--repo <selector>|--project <id> [--host <host-id>]|--project-host-setup <id>] [--agent <id>] [--prompt <text>] [--setup run|skip|inherit] [--base-branch <ref>] [--comment <text>] [--parent-worktree <selector>] [--no-parent] [--run-hooks] [--activate] [--json]
  yiru worktree show --worktree <selector> [--json]
  yiru worktree current [--json]
  yiru worktree set --worktree <selector> [--display-name <name>] [--comment <text>] [--workspace-status <id>] [--parent-worktree <selector>|--no-parent] [--json]
  yiru worktree rm --worktree <selector> [--force] [--run-hooks] [--json]
  yiru worktree ps [--limit <n>] [--json]
  yiru file open <path> [--worktree <selector>] [--json]
  yiru file diff <path> [--staged] [--worktree <selector>] [--json]
  yiru file open-changed [--mode edit|diff|both] [--worktree <selector>] [--json]
  yiru terminal list [--worktree <selector>] [--limit <n>] [--json]
  yiru terminal show [--terminal <handle>] [--json]
  yiru terminal read [--terminal <handle>] [--cursor <n>] [--limit <n>] [--json]
  yiru terminal send [--terminal <handle>] [--text <text>] [--enter] [--interrupt] [--json]
  yiru terminal wait [--terminal <handle>] --for exit|tui-idle [--timeout-ms <ms>] [--json]
  yiru terminal stop --worktree <selector> [--json]
  yiru terminal create [--worktree <selector>] [--title <name>] [--command <text>] [--focus] [--json]
  yiru terminal split [--terminal <handle>] [--direction horizontal|vertical] [--json]
  yiru terminal switch [--terminal <handle>] [--json]
  yiru terminal close [--terminal <handle>] [--tab] [--json]
  yiru project list [--json]
  yiru project setups [--project <id>] [--host <host-id>] [--json]
  yiru project setup-existing-folder --project <id> --host <host-id> --path <path> [--kind git|folder] [--display-name <name>] [--json]
  yiru project setup-clone --project <id> --host <host-id> --url <clone-url> --destination <path> [--display-name <name>] [--json]
  yiru project setup-create --project <id> --host <host-id> [--setup-id <id>] [--path <path>] [--kind git|folder] [--display-name <name>] [--worktree-base-path <path>] [--git-username <name>] [--state ready|not-set-up|setting-up|error|unsupported] [--method imported-existing-folder|cloned|provisioned] [--json]
  yiru project setup-update --setup <setup-id> [--display-name <name>] [--path <path>] [--worktree-base-path <path>] [--git-username <name>] [--kind git|folder] [--state ready|not-set-up|setting-up|error|unsupported] [--method legacy-repo|imported-existing-folder|cloned|provisioned] [--json]
  yiru project setup-delete --setup <setup-id> [--json]
  yiru repo list [--json]
  yiru repo add --path <path> [--json]
  yiru repo show --repo <selector> [--json]
  yiru repo set-base-ref --repo <selector> --ref <ref> [--json]
  yiru repo search-refs --repo <selector> --query <text> [--limit <n>] [--json]

Selectors:
  --repo <selector>         Registered repo selector such as id:<id>, name:<name>, or path:<path>
  --worktree <selector>     Worktree selector such as id:<repo-id>::<path>, name:<displayName>, branch:<branch>, path:<path>, or active/current
  --terminal <handle>       Runtime-issued terminal handle returned by \`yiru terminal list --json\`
  --parent-worktree <selector> Parent worktree selector such as id:<repo-id>::<path>, branch:<branch>, path:<path>, or active/current
  --no-parent               Force no parent lineage for unrelated worktree creation/update

Terminal Send Options:
  --text <text>             Text to send to the terminal
  --enter                   Append Enter after sending text
  --interrupt               Send as an interrupt-style input when supported

Wait Options:
  --for exit                Wait until the target terminal exits
  --timeout-ms <ms>         Maximum wait time before timing out

Output Options:
  --json                    Emit machine-readable JSON instead of human text
  --help                    Show this help message

Behavior:
  Most commands require a running Yiru runtime. If Yiru is not open yet, run \`yiru open\` first.
  A single bare directory is shorthand for open, so \`yiru .\` opens the current directory.
  Remote host access is authorized through Coworking in the Yiru app.
  Use selectors for discovery and handles for repeated live terminal operations.

Agent Sessions And Worktrees:
  \`worktree create --agent\` creates a new checkout with an agent.
  To start a fresh agent in the current worktree, use:
    yiru terminal create --worktree active --command "codex"

Browser Workflow:
  1. Create or navigate:  yiru tab create --url https://example.com
                          yiru goto --url https://example.com
  2. Inspect the page:    yiru snapshot
     (Returns an accessibility tree with element refs like e1, e2, e3)
     For concurrent workflows, prefer: yiru tab list --json
     then reuse tabs[].browserPageId with --page <id> on later commands.
  3. Interact:            yiru click --element e2
                          yiru fill --element e5 --value "search query"
                          yiru keypress --key Enter
  4. Re-inspect:          yiru snapshot
     (Element refs change after navigation — always re-snapshot before interacting)

Browser Options:
  --element <ref>           Element ref from snapshot (e.g. @e3)
  --url <url>               URL to navigate to
  --value <text>            Value to fill or select
  --input <text>            Text to type at current focus (no element needed)
  --expression <js>         JavaScript expression to evaluate
  --key <key>               Key to press (Enter, Tab, Escape, Control+a, etc.)
  --direction <dir>         Scroll direction: up or down
  --amount <pixels>         Scroll distance in pixels (default: viewport height)
  --index <n>               Tab index (from \`tab list\`)
  --page <id>               Stable browser page id (preferred for concurrent workflows)
  --profile <id>            Browser profile id
  --show-profile            Include the tab's browser profile in text output
  --format <png|jpeg>       Screenshot image format
  --from <ref>              Drag source element ref
  --to <ref>                Drag target element ref
  --files <path,...>        Comma-separated file paths for upload
  --timeout <ms>            Wait timeout in milliseconds
  --worktree <selector>     Scope commands to a specific worktree's browser tabs

Examples:
  $ yiru open
  $ yiru .
  $ yiru open ../another-project
  $ yiru status --json
  $ yiru diagnostics memory --json
  $ yiru repo list
  $ yiru worktree create --name agent-task --agent codex --prompt "hi"
  $ yiru worktree create --repo name:yiru --name cli-test-1
  $ yiru worktree show --worktree branch:Jinwoo-H/cli
  $ yiru worktree current
  $ yiru worktree set --worktree active --comment "waiting on review"
  $ yiru worktree ps --limit 10
  $ yiru file open-changed --mode diff
  $ yiru file open src/App.tsx
  $ yiru terminal create --worktree active --command "codex"
  $ yiru terminal list --worktree path:/Users/me/yiru/workspaces/yiru/cli-test-1 --json
  $ yiru terminal send --terminal term_123 --text "hi" --enter
  $ yiru terminal wait --terminal term_123 --for exit --timeout-ms 60000 --json
  $ yiru tab current --json
  $ yiru tab show --page page_123 --json
  $ yiru tab create --url https://example.com --profile work
  $ yiru tab profile clone --page page_123 --profile work --json
  $ yiru snapshot
  $ yiru click --element e3
  $ yiru fill --element e5 --value "hello"
  $ yiru goto --url https://example.com/login
  $ yiru keypress --key Enter
  $ yiru eval --expression "document.title"
  $ yiru tab list --json`
