import { getPosixOmpShellWrapper } from '../pty/omp-shell-wrapper'

export function getDaemonBashShellReadyScript(shellReadyMarker: string): string {
  return `# Yiru daemon bash shell-ready wrapper
[[ -f /etc/profile ]] && source /etc/profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi
# Why: enable bracketed paste so Yiru can deliver a multiline startup prompt as
# a single literal paste (ESC[200~…ESC[201~); without it, older readline builds
# treat each embedded newline as Enter and mangle the prompt into PS2
# continuation. Modern readline defaults this on; force it for the rest.
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
# Why: user startup files may set the default OpenCode config after Yiru's
# spawn env; restore the Yiru-managed config dir before the first prompt.
[[ -n "\${YIRU_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${YIRU_OPENCODE_CONFIG_DIR}"
[[ -n "\${YIRU_MIMOCODE_HOME:-}" ]] && export MIMOCODE_HOME="\${YIRU_MIMOCODE_HOME}"
${getPosixOmpShellWrapper()}
# Why: Codex must keep using Yiru's runtime CODEX_HOME after profile scripts.
[[ -n "\${YIRU_CODEX_HOME:-}" ]] && export CODEX_HOME="\${YIRU_CODEX_HOME}"
# Why: emit OSC 133 C/D so terminal-command-lifecycle can drop stale agent
# status when the foreground command exits — mirrors the zsh daemon wrapper.
# Without this, bash users (default on most Linux distros) keep a stuck
# 'working' spinner after the CLI exits without a Stop/SessionEnd hook.
__yiru_osc133_precmd() {
  local exit_code=$?
  __yiru_in_prompt_command=1
  if [[ -n "\${__yiru_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __yiru_in_command
  fi
  printf "\\033]133;A\\007"
  # Why: emit the shell-ready marker here (not a trailing PROMPT_COMMAND entry)
  # so a framework that must be last in PROMPT_COMMAND — bash-preexec — is not
  # displaced by one of Yiru's own hooks.
  [[ "\${YIRU_SHELL_READY_MARKER:-0}" == "1" ]] && printf "${shellReadyMarker}"
}
__yiru_run_user_debug_trap() {
  if [[ -n "\${__yiru_user_debug_trap:-}" ]]; then
    eval "$__yiru_user_debug_trap" || true
  fi
}
__yiru_osc133_preexec() {
  __yiru_run_user_debug_trap
  # Why: a framework (bash-preexec/starship) may replace our DEBUG trap at the
  # first prompt; __yiru_osc133_epilogue re-takes it each prompt and stores the
  # framework's trap here, so the framework's own preexec still runs while our
  # command-start C survives its re-arm.
  if [[ -n "\${__yiru_chained_debug_trap:-}" ]]; then
    eval "$__yiru_chained_debug_trap" || true
  fi
  [[ -z "\${__yiru_in_prompt_command:-}" ]] || return
  # Why: a chained trap can invoke us more than once for a single command, so
  # emit C only on the first fire (the __yiru_in_command gate), and never for a
  # prompt-time hook — ours or bash-preexec's __bp_* helpers.
  [[ -z "\${__yiru_in_command:-}" ]] || return
  case "$BASH_COMMAND" in
    *__yiru_osc133_*|*__bp_*) return ;;
  esac
  printf "\\033]133;C\\007"
  __yiru_in_command=1
}
# Why: runs LAST every prompt — closes the prompt window (so command starts emit
# C) and re-arms our single DEBUG trap. A framework that replaced DEBUG at the
# first prompt is captured and chained rather than discarded, so it keeps working
# while its re-arm can no longer silence Yiru's command-start signal.
__yiru_osc133_epilogue() {
  unset __yiru_in_prompt_command
  local __yiru_spec="$(trap -p DEBUG)"
  case "$__yiru_spec" in
    "" | *__yiru_osc133_preexec* ) __yiru_chained_debug_trap="" ;;
    * )
      __yiru_spec="\${__yiru_spec#trap -- }"
      __yiru_spec="\${__yiru_spec% DEBUG}"
      eval "__yiru_chained_debug_trap=$__yiru_spec"
      ;;
  esac
  trap '__yiru_osc133_preexec' DEBUG
}
# Why: normalize an array PROMPT_COMMAND (bash 5.1+) to a string so prepend/append
# below is uniform, and capture $? in precmd before the user's chain mutates it.
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
__yiru_normalize_prompt_command
PROMPT_COMMAND="__yiru_osc133_precmd\${PROMPT_COMMAND:+;\${PROMPT_COMMAND}};__yiru_osc133_epilogue"
__yiru_debug_trap_spec="$(trap -p DEBUG)"
if [[ -n "$__yiru_debug_trap_spec" ]]; then
  __yiru_debug_trap_command="\${__yiru_debug_trap_spec#trap -- }"
  __yiru_debug_trap_command="\${__yiru_debug_trap_command% DEBUG}"
  eval "__yiru_user_debug_trap=$__yiru_debug_trap_command"
fi
unset __yiru_debug_trap_spec __yiru_debug_trap_command
unset -f __yiru_normalize_prompt_command
# Why: arm DEBUG after wrapper setup; otherwise bash treats our own rcfile
# commands as a foreground command and emits a fake C/D before the first prompt.
trap '__yiru_osc133_preexec' DEBUG
`
}
