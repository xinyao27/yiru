import { getPosixOmpShellWrapper } from '../pty/omp-shell-wrapper'
import { getZshFinalZdotdirRestoreBlock, getZshStartupFileSourceBlock } from '../shell-templates'

export const SHELL_READY_MARKER_ESCAPED = '\\033]777;yiru-shell-ready\\007'

export function normalizeOriginalZdotdirCandidate(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const normalized = value.replace(/\/+$/, '')
  return !normalized || normalized.endsWith('/shell-ready/zsh') ? null : value
}

export function resolveOriginalZdotdir(): string {
  return (
    normalizeOriginalZdotdirCandidate(process.env.ZDOTDIR) ||
    normalizeOriginalZdotdirCandidate(process.env.YIRU_ORIG_ZDOTDIR) ||
    process.env.HOME ||
    ''
  )
}

export function resolveOriginalZshenvSourceDir(): string {
  return normalizeOriginalZdotdirCandidate(process.env.ZDOTDIR) || process.env.HOME || ''
}

export function getBashShellReadyRcfileContent(): string {
  return `# Yiru bash shell-ready wrapper
[[ -f /etc/profile ]] && source /etc/profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi
[[ $- == *i* ]] && bind 'set enable-bracketed-paste on' 2>/dev/null
__yiru_restore_attribution_path() {
  [[ -n "\${YIRU_ATTRIBUTION_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${YIRU_ATTRIBUTION_SHIM_DIR}"|"\${YIRU_ATTRIBUTION_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${YIRU_ATTRIBUTION_SHIM_DIR}:$PATH"
}
__yiru_restore_attribution_path
__yiru_restore_agent_teams_path() {
  [[ -n "\${YIRU_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${YIRU_AGENT_TEAMS_SHIM_DIR}"|"\${YIRU_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${YIRU_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
__yiru_restore_agent_teams_path
[[ -n "\${YIRU_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${YIRU_OPENCODE_CONFIG_DIR}"
[[ -n "\${YIRU_MIMOCODE_HOME:-}" ]] && export MIMOCODE_HOME="\${YIRU_MIMOCODE_HOME}"
${getPosixOmpShellWrapper()}
[[ -n "\${YIRU_CODEX_HOME:-}" ]] && export CODEX_HOME="\${YIRU_CODEX_HOME}"
__yiru_osc133_precmd() {
  local exit_code=$?
  __yiru_in_prompt_command=1
  if [[ -n "\${__yiru_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __yiru_in_command
  fi
  printf "\\033]133;A\\007"
}
__yiru_osc133_prompt_done() {
  unset __yiru_in_prompt_command
}
__yiru_run_user_debug_trap() {
  if [[ -n "\${__yiru_user_debug_trap:-}" ]]; then
    eval "$__yiru_user_debug_trap" || true
  fi
}
__yiru_osc133_preexec() {
  __yiru_run_user_debug_trap
  [[ -z "\${__yiru_in_prompt_command:-}" ]] || return
  case "$BASH_COMMAND" in
    *__yiru_osc133_precmd*|*__yiru_osc133_prompt_done*|*__yiru_prompt_mark*) return ;;
  esac
  printf "\\033]133;C\\007"
  __yiru_in_command=1
}
__yiru_normalize_prompt_command() {
  local __yiru_joined="" __yiru_prompt_part
  if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
    for __yiru_prompt_part in "\${PROMPT_COMMAND[@]}"; do
      [[ -n "$__yiru_prompt_part" ]] || continue
      if [[ -n "$__yiru_joined" ]]; then
        __yiru_joined="$__yiru_joined;$__yiru_prompt_part"
      else
        __yiru_joined="$__yiru_prompt_part"
      fi
    done
    PROMPT_COMMAND="$__yiru_joined"
  fi
}
__yiru_prepend_prompt_command() {
  __yiru_normalize_prompt_command
  PROMPT_COMMAND="__yiru_osc133_precmd\${PROMPT_COMMAND:+;\${PROMPT_COMMAND}}"
}
__yiru_append_prompt_command() {
  local command="$1"
  __yiru_normalize_prompt_command
  if [[ -n "\${PROMPT_COMMAND:-}" ]]; then
    PROMPT_COMMAND="\${PROMPT_COMMAND};$command"
  else
    PROMPT_COMMAND="$command"
  fi
}
__yiru_prepend_prompt_command
if [[ "\${YIRU_SHELL_READY_MARKER:-0}" == "1" ]]; then
  __yiru_prompt_mark() {
    printf "${SHELL_READY_MARKER_ESCAPED}"
  }
  __yiru_append_prompt_command "__yiru_prompt_mark"
fi
__yiru_append_prompt_command "__yiru_osc133_prompt_done"
__yiru_debug_trap_spec="$(trap -p DEBUG)"
if [[ -n "$__yiru_debug_trap_spec" ]]; then
  __yiru_debug_trap_command="\${__yiru_debug_trap_spec#trap -- }"
  __yiru_debug_trap_command="\${__yiru_debug_trap_command% DEBUG}"
  eval "__yiru_user_debug_trap=$__yiru_debug_trap_command"
fi
unset __yiru_debug_trap_spec __yiru_debug_trap_command
unset -f __yiru_normalize_prompt_command __yiru_prepend_prompt_command __yiru_append_prompt_command
trap '__yiru_osc133_preexec' DEBUG
`
}

export function getZshShellReadyRcfileContent(): string {
  return `# Yiru zsh shell-ready wrapper
${getZshStartupFileSourceBlock({
  fileName: '.zshrc',
  interactiveOnly: true,
  skipWhenHomeIsCurrentZdotdir: true
})}
__yiru_restore_attribution_path() {
  [[ -n "\${YIRU_ATTRIBUTION_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${YIRU_ATTRIBUTION_SHIM_DIR}"|"\${YIRU_ATTRIBUTION_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${YIRU_ATTRIBUTION_SHIM_DIR}:$PATH"
}
[[ ! -o login ]] && __yiru_restore_attribution_path
__yiru_restore_agent_teams_path() {
  [[ -n "\${YIRU_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${YIRU_AGENT_TEAMS_SHIM_DIR}"|"\${YIRU_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${YIRU_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
[[ ! -o login ]] && __yiru_restore_agent_teams_path
if [[ ! -o login ]]; then
  [[ -n "\${YIRU_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${YIRU_OPENCODE_CONFIG_DIR}"
[[ -n "\${YIRU_MIMOCODE_HOME:-}" ]] && export MIMOCODE_HOME="\${YIRU_MIMOCODE_HOME}"
  ${getPosixOmpShellWrapper()}
  [[ -n "\${YIRU_CODEX_HOME:-}" ]] && export CODEX_HOME="\${YIRU_CODEX_HOME}"
fi
__yiru_osc133_precmd() {
  local exit_code=$?
  if [[ -n "\${__yiru_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __yiru_in_command
  fi
  printf "\\033]133;A\\007"
}
__yiru_osc133_preexec() {
  printf "\\033]133;C\\007"
  __yiru_in_command=1
}
precmd_functions=(__yiru_osc133_precmd \${precmd_functions[@]})
preexec_functions=(__yiru_osc133_preexec \${preexec_functions[@]})
if [[ ! -o login ]]; then
${getZshFinalZdotdirRestoreBlock()}
fi
`
}
