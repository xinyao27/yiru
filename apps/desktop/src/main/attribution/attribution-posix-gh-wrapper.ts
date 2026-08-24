import { POSIX_COMMON } from './attribution-posix-shell'
import { YIRU_GH_FOOTER } from './attribution-values'

const SHELL_DOLLAR = '$'

export const POSIX_GH_WRAPPER = `${POSIX_COMMON}
real_path="$(clean_path)"
real_gh="$(PATH="$real_path" command -v gh || true)"
if [[ -z "$real_gh" ]]; then
  echo "Yiru attribution wrapper could not locate gh on PATH." >&2
  exit 127
fi

append_footer() {
  local kind="$1"
  local url_pattern="$2"
  local footer="$3"
  local stdout_capture="$4"
  local stderr_capture="$5"
  local url=""

  url="$(printf '%s\n%s\n' "$stdout_capture" "$stderr_capture" | grep -Eo "$url_pattern" | tail -n 1 || true)"
  append_footer_url "$kind" "$footer" "$url"
}

append_footer_url() {
  local kind="$1"
  local footer="$2"
  local url="$3"

  if [[ -z "$url" ]]; then
    return 0
  fi

  local api_path
  api_path="$(github_api_path "$kind" "$url" || true)"
  if [[ -z "$api_path" ]]; then
    return 0
  fi

  local body
  if ! body="$(PATH="$real_path" "$real_gh" api "$api_path" --jq '.body // ""' 2>/dev/null)"; then
    return 0
  fi
  if grep -Fqi "$footer" <<<"$body"; then
    return 0
  fi

  local tmp_file
  tmp_file="$(mktemp)"
  if [[ -n "$body" ]]; then
    printf '%s\n\n%s\n' "$body" "$footer" >"$tmp_file"
  else
    printf '%s\n' "$footer" >"$tmp_file"
  fi
  # Why: gh exposes create output as a URL, but does not provide a transactional
  # body append. Use REST instead of gh pr edit because that command can
  # hit unrelated GraphQL fields, while the URL maps directly to one REST item.
  PATH="$real_path" "$real_gh" api -X PATCH "$api_path" -F "body=@$tmp_file" >/dev/null || true
  rm -f "$tmp_file"
}

github_api_path() {
  local kind="$1"
  local url="$2"
  if [[ "$kind" == "pr" && "$url" =~ ^https://github[.]com/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
    printf 'repos/%s/%s/pulls/%s' "${SHELL_DOLLAR}{BASH_REMATCH[1]}" "${SHELL_DOLLAR}{BASH_REMATCH[2]}" "${SHELL_DOLLAR}{BASH_REMATCH[3]}"
    return 0
  fi
  return 1
}

has_noninteractive_create_args() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --title|-t|--title=*|--body|-b|--body=*|--body-file|-F|--body-file=*|--fill|--fill-first|--fill-verbose|--template|-T|--template=*|--recover|--recover=*|--web)
        return 0
        ;;
    esac
  done
  return 1
}

has_passthrough_create_args() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --help|-h|--version)
        return 0
        ;;
    esac
  done
  return 1
}

if [[ "\${YIRU_ENABLE_GIT_ATTRIBUTION:-0}" != "1" || "\${YIRU_ATTRIBUTION_BYPASS:-0}" == "1" ]]; then
  PATH="$real_path" exec "$real_gh" "$@"
fi

if [[ "\${1:-}" == "pr" && "\${2:-}" == "create" ]]; then
  footer="\${YIRU_GH_PR_FOOTER:-${YIRU_GH_FOOTER}}"
  if has_passthrough_create_args "$@"; then
    PATH="$real_path" exec "$real_gh" "$@"
  fi
  if ! has_noninteractive_create_args "$@"; then
    # Why: gh switches off interactive prompts when stdout/stderr are redirected,
    # and post-create "pr view" can select the wrong PR in fork/multi-PR cases.
    # Preserve interactive UX and skip attribution rather than guessing.
    PATH="$real_path" exec "$real_gh" "$@"
  fi
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"
  cleanup_capture() {
    rm -f "$stdout_file" "$stderr_file"
  }
  trap cleanup_capture EXIT
  if PATH="$real_path" "$real_gh" "$@" >"$stdout_file" 2>"$stderr_file"; then
    status=0
  else
    status=$?
  fi
  stdout_capture="$(cat "$stdout_file")"
  stderr_capture="$(cat "$stderr_file")"
  cat "$stderr_file" >&2
  cat "$stdout_file"
  if [[ $status -eq 0 ]]; then
    append_footer "pr" 'https://github.com/[^[:space:]]+/pull/[0-9]+' "$footer" "$stdout_capture" "$stderr_capture"
  fi
  cleanup_capture
  trap - EXIT
  exit $status
fi

PATH="$real_path" exec "$real_gh" "$@"
`
