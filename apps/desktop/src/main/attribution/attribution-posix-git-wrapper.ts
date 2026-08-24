import { POSIX_COMMON } from './attribution-posix-shell'

const SHELL_DOLLAR = '$'

export const POSIX_GIT_WRAPPER = `${POSIX_COMMON}
real_path="$(clean_path)"
real_git="$(PATH="$real_path" command -v git || true)"
if [[ -z "$real_git" ]]; then
  echo "Yiru attribution wrapper could not locate git on PATH." >&2
  exit 127
fi

is_commit_command() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -c|--config|-C|--git-dir|--work-tree|--namespace)
        shift 2
        ;;
      --config=*|--git-dir=*|--work-tree=*|--namespace=*)
        shift
        ;;
      commit)
        return 0
        ;;
      -*)
        shift
        ;;
      *)
        return 1
        ;;
    esac
  done
  return 1
}

if [[ "\${YIRU_ENABLE_GIT_ATTRIBUTION:-0}" != "1" || "\${YIRU_ATTRIBUTION_BYPASS:-0}" == "1" ]] || ! is_commit_command "$@"; then
  PATH="$real_path" exec "$real_git" "$@"
fi

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      PATH="$real_path" exec "$real_git" "$@"
      ;;
  esac
done

trailer="\${YIRU_GIT_COMMIT_TRAILER:-Co-authored-by: Yiru <noreply@yiru.ai>}"

has_explicit_commit_message() {
  local arg
  while [[ $# -gt 0 ]]; do
    arg="$1"
    case "$arg" in
      -m|--message|-F|--file)
        return 0
        ;;
      --message=*|--file=*|-[!-]*m|-m?*|-F?*)
        return 0
        ;;
    esac
    shift
  done
  return 1
}

has_unsupported_commit_message_source() {
  local arg next_arg
  local saw_commit=0
  while [[ $# -gt 0 ]]; do
    arg="$1"
    if [[ $saw_commit -eq 0 ]]; then
      case "$arg" in
        -c|--config|-C|--git-dir|--work-tree|--namespace)
          shift 2
          continue
          ;;
        --config=*|--git-dir=*|--work-tree=*|--namespace=*)
          shift
          continue
          ;;
        commit)
          saw_commit=1
          shift
          continue
          ;;
      esac
    fi
    case "$arg" in
      -C|--reuse-message|-c|--reedit-message|--fixup|--squash)
        return 0
        ;;
      -F|--file)
        shift
        next_arg="${SHELL_DOLLAR}{1:-}"
        [[ -z "$next_arg" || ! -f "$next_arg" ]] && return 0
        ;;
      --file=*)
        next_arg="${SHELL_DOLLAR}{arg#--file=}"
        [[ ! -f "$next_arg" ]] && return 0
        ;;
      -F?*)
        next_arg="${SHELL_DOLLAR}{arg:2}"
        [[ ! -f "$next_arg" ]] && return 0
        ;;
    esac
    shift
  done
  return 1
}

message_already_has_trailer() {
  local arg next_arg
  while [[ $# -gt 0 ]]; do
    arg="$1"
    case "$arg" in
      -m|--message)
        shift
        next_arg="${SHELL_DOLLAR}{1:-}"
        grep -Fqi "$trailer" <<<"$next_arg" && return 0
        ;;
      --message=*)
        grep -Fqi "$trailer" <<<"${SHELL_DOLLAR}{arg#--message=}" && return 0
        ;;
      -m?*)
        grep -Fqi "$trailer" <<<"${SHELL_DOLLAR}{arg:2}" && return 0
        ;;
      -[!-]*m)
        shift
        next_arg="${SHELL_DOLLAR}{1:-}"
        grep -Fqi "$trailer" <<<"$next_arg" && return 0
        ;;
      -F|--file)
        shift
        next_arg="${SHELL_DOLLAR}{1:-}"
        [[ -n "$next_arg" && -f "$next_arg" ]] && grep -Fqi "$trailer" "$next_arg" && return 0
        ;;
      --file=*)
        next_arg="${SHELL_DOLLAR}{arg#--file=}"
        [[ -f "$next_arg" ]] && grep -Fqi "$trailer" "$next_arg" && return 0
        ;;
      -F?*)
        next_arg="${SHELL_DOLLAR}{arg:2}"
        [[ -f "$next_arg" ]] && grep -Fqi "$trailer" "$next_arg" && return 0
        ;;
    esac
    shift
  done
  return 1
}

if ! has_explicit_commit_message "$@" || has_unsupported_commit_message_source "$@" || message_already_has_trailer "$@"; then
  PATH="$real_path" exec "$real_git" "$@"
fi

tmp_file=""
cleanup_commit_message() {
  if [[ -n "$tmp_file" ]]; then
    rm -f "$tmp_file"
  fi
}
trap cleanup_commit_message EXIT

attributed_args=()
replaced_file_message=0
while [[ $# -gt 0 ]]; do
  arg="$1"
  case "$arg" in
    -F|--file)
      if [[ $replaced_file_message -eq 0 ]]; then
        shift
        source_file="${SHELL_DOLLAR}{1:-}"
        tmp_file="$(mktemp)"
        if [[ -n "$source_file" && -f "$source_file" ]]; then
          printf '%s\n\n%s\n' "$(cat "$source_file")" "$trailer" >"$tmp_file"
          attributed_args+=("$arg" "$tmp_file")
          replaced_file_message=1
        else
          attributed_args+=("$arg" "$source_file")
        fi
      else
        attributed_args+=("$arg")
      fi
      ;;
    --file=*)
      if [[ $replaced_file_message -eq 0 ]]; then
        source_file="${SHELL_DOLLAR}{arg#--file=}"
        tmp_file="$(mktemp)"
        if [[ -f "$source_file" ]]; then
          printf '%s\n\n%s\n' "$(cat "$source_file")" "$trailer" >"$tmp_file"
          attributed_args+=("--file=$tmp_file")
          replaced_file_message=1
        else
          attributed_args+=("$arg")
        fi
      else
        attributed_args+=("$arg")
      fi
      ;;
    -F?*)
      if [[ $replaced_file_message -eq 0 ]]; then
        source_file="${SHELL_DOLLAR}{arg:2}"
        tmp_file="$(mktemp)"
        if [[ -f "$source_file" ]]; then
          printf '%s\n\n%s\n' "$(cat "$source_file")" "$trailer" >"$tmp_file"
          attributed_args+=("-F$tmp_file")
          replaced_file_message=1
        else
          attributed_args+=("$arg")
        fi
      else
        attributed_args+=("$arg")
      fi
      ;;
    *)
      attributed_args+=("$arg")
      ;;
  esac
  shift
done

if [[ $replaced_file_message -eq 0 ]]; then
  attributed_args+=("-m" "$trailer")
fi

# Why: commit-msg hooks and commit signing must see the final message. Only
# commands that already provide a noninteractive message get attribution; editor
# based commits pass through unchanged instead of being amended after success.
YIRU_ATTRIBUTION_BYPASS=1 PATH="$real_path" exec "$real_git" "${SHELL_DOLLAR}{attributed_args[@]}"
`
