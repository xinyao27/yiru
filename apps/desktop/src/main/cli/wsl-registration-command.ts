import {
  buildRegistrationLockPrelude,
  buildSafeReplaceGuard,
  buildWslBridgeScript,
  buildWslLauncher,
  getBridgePathFromCommandPath,
  getPosixDirname,
  quoteShell
} from './wsl-cli-scripts'

export function buildWslRegistrationCommand(args: {
  commandPath: string
  launcherPath: string
  pathDirectory: string
  managedMarker: string
  bridgeManagedMarker: string
}): string {
  const bridgePath = getBridgePathFromCommandPath(args.commandPath)
  return [
    'set -euo pipefail',
    `mkdir -p ${quoteShell(args.pathDirectory)}`,
    `mkdir -p ${quoteShell(getPosixDirname(bridgePath))}`,
    buildRegistrationLockPrelude(args.commandPath),
    `command_tmp=${quoteShell(`${args.commandPath}.tmp`)}.$$`,
    `bridge_path=${quoteShell(bridgePath)}`,
    'bridge_tmp="${bridge_path}.tmp.$$"',
    'bridge_backup="${bridge_tmp}.backup"',
    'bridge_had_original=0',
    'bridge_touched=0',
    'committed=0',
    'rollback() {',
    '  result=$?',
    '  set +e',
    '  if [ "$committed" -ne 1 ]; then',
    `    if [ "$bridge_had_original" -eq 1 ]; then mv -f "$bridge_backup" ${quoteShell(bridgePath)}; elif [ "$bridge_touched" -eq 1 ]; then rm -f ${quoteShell(bridgePath)}; fi`,
    '  fi',
    '  rm -f "$command_tmp" "$bridge_tmp" "$bridge_backup"',
    '  exit "$result"',
    '}',
    'trap rollback EXIT',
    buildSafeReplaceGuard(args.commandPath, args.managedMarker),
    buildSafeReplaceGuard(bridgePath, args.bridgeManagedMarker),
    `cat > "$command_tmp" <<'YIRU_WSL_CLI'`,
    buildWslLauncher(args.launcherPath, bridgePath),
    'YIRU_WSL_CLI',
    `cat > "$bridge_tmp" <<'YIRU_WSL_BRIDGE'`,
    buildWslBridgeScript(),
    'YIRU_WSL_BRIDGE',
    'chmod 755 "$command_tmp"',
    'chmod 644 "$bridge_tmp"',
    buildSafeReplaceGuard(args.commandPath, args.managedMarker),
    buildSafeReplaceGuard(bridgePath, args.bridgeManagedMarker),
    `if [ -f ${quoteShell(bridgePath)} ]; then cp -p ${quoteShell(bridgePath)} "$bridge_backup"; bridge_had_original=1; fi`,
    `mv -f "$bridge_tmp" ${quoteShell(bridgePath)}`,
    'bridge_touched=1',
    `mv -f "$command_tmp" ${quoteShell(args.commandPath)}`,
    'committed=1',
    'rm -f "$bridge_backup"',
    'trap - EXIT'
  ].join('\n')
}
