export type PosixCommandPathLookupTarget =
  | { kind: 'literal'; value: string }
  | { kind: 'shell-variable'; name: string }

const SHELL_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function buildPosixCommandPathLookupScript(target: PosixCommandPathLookupTarget): string {
  const commandAssignment = buildCommandAssignment(target)
  // Shell command resolution can be masked by aliases, functions, and builtins, so inspect PATH.
  return [
    `_yiru_lookup_command=${commandAssignment}`,
    'resolved=',
    'case "$_yiru_lookup_command" in',
    '  */*)',
    '    case "$_yiru_lookup_command" in',
    '      /*) _yiru_lookup_candidate=$_yiru_lookup_command ;;',
    '      *) _yiru_lookup_candidate=${PWD%/}/$_yiru_lookup_command ;;',
    '    esac',
    '    if [ -x "$_yiru_lookup_candidate" ] && [ ! -d "$_yiru_lookup_candidate" ]; then',
    '      resolved=$_yiru_lookup_candidate',
    '    fi',
    '    ;;',
    '  *)',
    '    _yiru_lookup_remaining=${PATH-}',
    '    while :; do',
    '      case "$_yiru_lookup_remaining" in',
    '        *:*)',
    '          _yiru_lookup_component=${_yiru_lookup_remaining%%:*}',
    '          _yiru_lookup_remaining=${_yiru_lookup_remaining#*:}',
    '          _yiru_lookup_has_more=1',
    '          ;;',
    '        *)',
    '          _yiru_lookup_component=$_yiru_lookup_remaining',
    '          _yiru_lookup_has_more=',
    '          ;;',
    '      esac',
    '      [ -n "$_yiru_lookup_component" ] || _yiru_lookup_component=.',
    '      case "$_yiru_lookup_component" in',
    '        /*) _yiru_lookup_candidate=$_yiru_lookup_component/$_yiru_lookup_command ;;',
    '        *) _yiru_lookup_candidate=${PWD%/}/$_yiru_lookup_component/$_yiru_lookup_command ;;',
    '      esac',
    '      if [ -x "$_yiru_lookup_candidate" ] && [ ! -d "$_yiru_lookup_candidate" ]; then',
    '        resolved=$_yiru_lookup_candidate',
    '        break',
    '      fi',
    '      [ -n "$_yiru_lookup_has_more" ] || break',
    '    done',
    '    ;;',
    'esac'
  ].join('\n')
}

function buildCommandAssignment(target: PosixCommandPathLookupTarget): string {
  if (target.kind === 'literal') {
    return shellQuote(target.value)
  }
  if (!SHELL_VARIABLE_NAME_PATTERN.test(target.name)) {
    throw new Error(`Invalid shell variable name: ${target.name}`)
  }
  return `\${${target.name}-}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
