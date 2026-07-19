// Why: local PTYs and the daemon/SSH path must use identical ZDOTDIR discovery;
// small drift here breaks different terminal transports in different ways.

function quotePosixSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function getZshEnvTemplate(zshDir: string, headerPrefix = ''): string {
  const header = headerPrefix
    ? `Yiru ${headerPrefix} zsh shell-ready wrapper`
    : 'Yiru zsh shell-ready wrapper'
  return `# ${header}
# Why: capture the runtime wrapper dir before it is unset below. On WSL this
# file is generated with a Windows path but sourced via /mnt/c, so the baked
# literal is unusable there and ZDOTDIR must be restored from this value.
# Derive it from the file being sourced (%x, zsh's internal script name) rather
# than the env-imported $ZDOTDIR: zsh corrupts environment values whose UTF-8
# bytes fall in its 0x84-0x9D token range (e.g. a non-ASCII Windows username
# such as a Korean login), which would make the self-check below fail and fall
# back to the unusable baked literal, so the user's .zshrc never loads (#8003).
# %x is not subject to that corruption; keep $ZDOTDIR as a fallback for the
# rare shell where %x prompt expansion yields nothing.
_yiru_wrapper_zdotdir_self="\${\${(%):-%x}:h}"
if [[ -z "\${_yiru_wrapper_zdotdir_self:-}" ]]; then
  _yiru_wrapper_zdotdir_self="\${ZDOTDIR:-}"
fi
while [[ "\${_yiru_wrapper_zdotdir_self:-}" == */ ]]; do
  _yiru_wrapper_zdotdir_self="\${_yiru_wrapper_zdotdir_self%/}"
done
_yiru_spawn_orig_zdotdir="\${YIRU_ORIG_ZDOTDIR:-}"
_yiru_user_zdotdir="\${_yiru_spawn_orig_zdotdir:-$HOME}"
_yiru_zshenv_source_dir="\${YIRU_ZSHENV_SOURCE_DIR:-$HOME}"
_yiru_zshenv_path=""
unset YIRU_ZSHENV_SOURCE_DIR

# Normalize fallback and source roots before reading user .zshenv so nested
# Yiru PTYs never source another Yiru wrapper recursively.
while [[ "\${_yiru_user_zdotdir}" == */ ]]; do
  _yiru_user_zdotdir="\${_yiru_user_zdotdir%/}"
done
case "\${_yiru_user_zdotdir}" in
  ""|*/shell-ready/zsh) _yiru_user_zdotdir="$HOME" ;;
esac
while [[ "\${_yiru_zshenv_source_dir}" == */ ]]; do
  _yiru_zshenv_source_dir="\${_yiru_zshenv_source_dir%/}"
done
case "\${_yiru_zshenv_source_dir}" in
  ""|*/shell-ready/zsh) _yiru_zshenv_source_dir="$HOME" ;;
esac

# Why: source at wrapper top level, not in a function/subshell, so .zshenv
# exports, functions, path/fpath typesets, and zsh options keep normal scope.
unset ZDOTDIR
if [[ -n "\${_yiru_zshenv_source_dir:-}" && -f "\${_yiru_zshenv_source_dir}/.zshenv" ]]; then
  _yiru_zshenv_path="\${_yiru_zshenv_source_dir}/.zshenv"
fi
if [[ -n "\${_yiru_zshenv_path:-}" ]]; then
  source "\${_yiru_zshenv_path}"
fi

_yiru_discovered_zdotdir="\${ZDOTDIR:-}"

while [[ "\${_yiru_discovered_zdotdir}" == */ ]]; do
  _yiru_discovered_zdotdir="\${_yiru_discovered_zdotdir%/}"
done

case "\${_yiru_discovered_zdotdir}" in
  *[![:space:]]*) ;;
  *) _yiru_discovered_zdotdir="" ;;
esac

if [[ -n "\${_yiru_discovered_zdotdir}" && ! -d "\${_yiru_discovered_zdotdir}" ]]; then
  [[ "\${YIRU_DEBUG:-0}" == "1" ]] && echo "[yiru-shell-ready] Discovered ZDOTDIR '\${_yiru_discovered_zdotdir}' does not exist, falling back" >&2
  _yiru_discovered_zdotdir=""
fi

export YIRU_ORIG_ZDOTDIR="\${_yiru_discovered_zdotdir:-\${_yiru_user_zdotdir:-$HOME}}"

while [[ "\${YIRU_ORIG_ZDOTDIR}" == */ ]]; do
  YIRU_ORIG_ZDOTDIR="\${YIRU_ORIG_ZDOTDIR%/}"
done

case "\${YIRU_ORIG_ZDOTDIR}" in
  ""|*/shell-ready/zsh) export YIRU_ORIG_ZDOTDIR="$HOME" ;;
esac

# Why: use :- after user .zshenv — a pathological unset under set -u must not
# abort the wrapper; empty falls through to the baked-literal branch.
if [[ -n "\${_yiru_wrapper_zdotdir_self:-}" && -f "\${_yiru_wrapper_zdotdir_self:-}/.zshenv" ]]; then
  export ZDOTDIR="\${_yiru_wrapper_zdotdir_self:-}"
else
  export ZDOTDIR=${quotePosixSingle(zshDir)}
fi
unset _yiru_spawn_orig_zdotdir _yiru_user_zdotdir _yiru_zshenv_source_dir _yiru_zshenv_path _yiru_discovered_zdotdir _yiru_wrapper_zdotdir_self
`
}

export function getZshStartupFileSourceBlock(options: {
  fileName: '.zprofile' | '.zshrc' | '.zlogin'
  homeExpression?: string
  interactiveOnly?: boolean
  skipWhenHomeIsCurrentZdotdir?: boolean
}): string {
  const homeExpression = options.homeExpression ?? '"${YIRU_ORIG_ZDOTDIR:-$HOME}"'
  const checks = [
    options.skipWhenHomeIsCurrentZdotdir ? '"$_yiru_home" != "$ZDOTDIR"' : null,
    options.interactiveOnly ? '-o interactive' : null,
    `-f "$_yiru_home/${options.fileName}"`
  ].filter(Boolean)

  return `_yiru_home=${homeExpression}
case "\${_yiru_home%/}" in
  */shell-ready/zsh) _yiru_home="$HOME" ;;
esac
if [[ ${checks.join(' && ')} ]]; then
  _yiru_wrapper_zdotdir="$ZDOTDIR"
  # Why: user startup files resolve plugin/config paths from their own ZDOTDIR;
  # Yiru restores its wrapper dir afterward so zsh still loads wrapper files.
  export ZDOTDIR="$_yiru_home"
  source "$_yiru_home/${options.fileName}"
  export ZDOTDIR="$_yiru_wrapper_zdotdir"
  unset _yiru_wrapper_zdotdir
fi
`
}

// Why: zsh precmd fires before zle switches the PTY into line-editing mode,
// so the marker must be emitted from zle-line-init. Registering it through
// add-zle-hook-widget is unsafe: the azhw dispatcher aborts its hook chain
// when an earlier hook exits non-zero, and a pre-existing raw user widget
// (e.g. oh-my-zsh vi-mode without VI_MODE_SET_CURSOR) is preserved as the
// first hook and fails — silently suppressing the marker and stalling every
// startup command on the pre-ready timeout. Instead, own zle-line-init: emit
// the marker first, then chain to whatever widget was installed before.
export function getZshShellReadyMarkerRegistrationBlock(escapedMarker: string): string {
  return `if [[ "\${YIRU_SHELL_READY_MARKER:-0}" == "1" ]]; then
  # Why: capture the prior zle-line-init so the marker chains to it. On a
  # re-source we are already the bound widget, so keep the function captured
  # the first time instead of clobbering it to empty (which would silently
  # drop the user's widget on every prompt after the second source). Only
  # user-defined widgets are chainable as plain functions; builtin/completion
  # forms (rare for zle-line-init) are left unchained.
  if [[ "\${widgets[zle-line-init]:-}" == "user:__yiru_prompt_mark" ]]; then
    :
  elif (( \${+widgets[zle-line-init]} )) && [[ "\${widgets[zle-line-init]}" == user:* ]]; then
    __yiru_prev_line_init_fn="\${widgets[zle-line-init]#user:}"
  else
    __yiru_prev_line_init_fn=""
  fi
  __yiru_prompt_mark() {
    printf "${escapedMarker}"
    # Why: call the prior hook as a plain function, not an aliased widget, so
    # $WIDGET stays zle-line-init for add-zle-hook-widget dispatchers.
    if [[ -n "\${__yiru_prev_line_init_fn:-}" ]]; then
      "\${__yiru_prev_line_init_fn}" "$@"
    fi
  }
  zle -N zle-line-init __yiru_prompt_mark
fi
`
}

export function getZshFinalZdotdirRestoreBlock(homeExpression = '"${YIRU_ORIG_ZDOTDIR:-$HOME}"') {
  return `_yiru_home=${homeExpression}
case "\${_yiru_home%/}" in
  */shell-ready/zsh) _yiru_home="$HOME" ;;
esac
# Why: after Yiru's last wrapper file has loaded, the interactive shell should
# expose the same ZDOTDIR a normal zsh startup would expose.
export ZDOTDIR="$_yiru_home"
unset _yiru_home
`
}
