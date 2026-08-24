const SHELL_DOLLAR = '$'

export const POSIX_COMMON = String.raw`#!/usr/bin/env bash
set -euo pipefail

clean_path() {
  local current_path="${SHELL_DOLLAR}{PATH:-}"
  local script_dir
  script_dir="$(cd -- "$(dirname "${SHELL_DOLLAR}{BASH_SOURCE[0]}")" && pwd)"
  local cleaned=()
  local entry
  IFS=':' read -r -a entries <<<"$current_path"
  for entry in "${SHELL_DOLLAR}{entries[@]}"; do
    case "$entry" in
      "$script_dir"|*/yiru-terminal-attribution/posix|*/yiru-terminal-attribution/win32|*\\yiru-terminal-attribution\\posix|*\\yiru-terminal-attribution\\win32)
        ;;
      *)
        cleaned+=("$entry")
        ;;
    esac
  done
  (IFS=':'; printf '%s' "${SHELL_DOLLAR}{cleaned[*]:-}")
}
`
