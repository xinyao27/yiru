import { execFile } from 'node:child_process'
import { isSpoolIncarnationMarkerId } from '../../shared/spool/spool-incarnation-marker-id'
import { parseWslUncPath } from '../../shared/wsl-paths'
import { SpoolWorktreeIncarnationHostError } from './spool-worktree-incarnation'

const MARKER_RESULT_PREFIX = '__ORCA_SPOOL_MARKER_ID__'
const MARKER_INVALID = '__ORCA_SPOOL_MARKER_INVALID__'
const MARKER_HOST_UNAVAILABLE = '__ORCA_SPOOL_MARKER_HOST_UNAVAILABLE__'
const MARKER_FILENAMES = new Set(['orca-spool-incarnation-v1', '.orca-spool-incarnation-v1'])
const WSL_MARKER_TIMEOUT_MS = 15_000

const WSL_MARKER_SCRIPT = [
  `invalid='${MARKER_INVALID}'`,
  `host_unavailable='${MARKER_HOST_UNAVAILABLE}'`,
  'fail() { printf %s "$invalid"; exit 0; }',
  'for tool in readlink stat cat ln rm sync tail od; do',
  '  command -v "$tool" >/dev/null 2>&1 || { printf %s "$host_unavailable"; exit 0; }',
  'done',
  'canonical=$(readlink -f "$1" 2>/dev/null) || fail',
  'test -d "$canonical" || fail',
  'cd -P "$canonical" 2>/dev/null || fail',
  'working_directory=$(pwd -P 2>/dev/null) || fail',
  'test "$canonical" = "$working_directory" || fail',
  'expected_name=$2',
  'proposed_id=$3',
  'marker="./$expected_name"',
  'directory_before=$(stat -Lc "%d:%i" . 2>/dev/null) || fail',
  'temp=""',
  'cleanup() { test -z "$temp" || rm -f "$temp" >/dev/null 2>&1 || true; }',
  'trap cleanup EXIT HUP INT TERM',
  'sync_path() { sync "$1" >/dev/null 2>&1 || sync >/dev/null 2>&1 || fail; }',
  'read_marker() {',
  '  test ! -L "$marker" && test -f "$marker" || fail',
  '  links=$(stat -Lc "%h" "$marker" 2>/dev/null) || fail',
  '  if test "$links" -gt 1; then',
  '    for entry in "./$expected_name.tmp-"*; do',
  '      if test -f "$entry" && test ! -L "$entry" && test "$entry" -ef "$marker"; then',
  '        rm -f "$entry" || fail',
  '      fi',
  '    done',
  '    sync_path .',
  '  fi',
  '  metadata_before=$(stat -Lc "%d:%i:%h:%s" "$marker" 2>/dev/null) || fail',
  '  links=$(stat -Lc "%h" "$marker" 2>/dev/null) || fail',
  '  size=$(stat -Lc "%s" "$marker" 2>/dev/null) || fail',
  '  test "$links" -eq 1 || fail',
  '  exec 3< "$marker" || fail',
  '  opened_metadata=$(stat -Lc "%d:%i:%h:%s" /proc/self/fd/3 2>/dev/null) || fail',
  '  test "$metadata_before" = "$opened_metadata" || fail',
  '  if test "$size" -eq 36; then :; elif test "$size" -eq 37; then',
  '    last_byte=$(tail -c 1 /proc/self/fd/3 2>/dev/null | od -An -t u1) || fail',
  '    test "$last_byte" -eq 10 || fail',
  '  else fail; fi',
  '  actual_path=$(readlink /proc/self/fd/3 2>/dev/null) || fail',
  '  actual_name=${actual_path##*/}',
  '  test "$actual_name" = "$expected_name" || fail',
  '  marker_content=$(cat /proc/self/fd/3 2>/dev/null) || fail',
  '  test "${#marker_content}" -eq 36 || fail',
  '  metadata_after=$(stat -Lc "%d:%i:%h:%s" /proc/self/fd/3 2>/dev/null) || fail',
  '  test "$metadata_before" = "$metadata_after" || fail',
  '  path_metadata_after=$(stat -Lc "%d:%i:%h:%s" "$marker" 2>/dev/null) || fail',
  '  test "$metadata_before" = "$path_metadata_after" || fail',
  '  exec 3<&-',
  '}',
  'if test -e "$marker" || test -L "$marker"; then',
  '  read_marker',
  'else',
  '  temp="$marker.tmp-$$-$proposed_id"',
  '  (umask 077; set -C; printf "%s\\n" "$proposed_id" > "$temp") 2>/dev/null || fail',
  '  sync_path "$temp"',
  '  if ln -T -- "$temp" "$marker" 2>/dev/null; then',
  '    rm -f "$temp" || fail',
  '    temp=""',
  '    sync_path .',
  '  elif test -e "$marker" || test -L "$marker"; then',
  '    rm -f "$temp" || fail',
  '    temp=""',
  '    sync_path .',
  '  else',
  '    fail',
  '  fi',
  '  read_marker',
  'fi',
  'directory_after=$(stat -Lc "%d:%i" . 2>/dev/null) || fail',
  'test "$directory_before" = "$directory_after" || fail',
  'path_after=$(readlink -f "$1" 2>/dev/null) || fail',
  'test "$canonical" = "$path_after" || fail',
  'path_identity_after=$(stat -Lc "%d:%i" "$path_after" 2>/dev/null) || fail',
  'test "$directory_before" = "$path_identity_after" || fail',
  `printf '${MARKER_RESULT_PREFIX}%s' "$marker_content"`
].join('\n')

export function readOrCreateSpoolWslIncarnationMarker(
  directory: string,
  filename: string,
  proposedMarkerId: string
): Promise<string> {
  const parsed = parseWslUncPath(directory)
  if (
    process.platform !== 'win32' ||
    !parsed ||
    !MARKER_FILENAMES.has(filename) ||
    !isSpoolIncarnationMarkerId(proposedMarkerId)
  ) {
    return Promise.reject(new SpoolWorktreeIncarnationHostError('marker-unavailable'))
  }
  return new Promise((resolve, reject) => {
    execFile(
      'wsl.exe',
      [
        '-d',
        parsed.distro,
        '--',
        'sh',
        '-c',
        WSL_MARKER_SCRIPT,
        'orca-spool-marker',
        parsed.linuxPath,
        filename,
        proposedMarkerId
      ],
      {
        encoding: 'utf8',
        maxBuffer: 1_024,
        timeout: WSL_MARKER_TIMEOUT_MS,
        windowsHide: true
      },
      (error, stdout) => {
        if (error || typeof stdout !== 'string' || stdout === MARKER_HOST_UNAVAILABLE) {
          reject(new SpoolWorktreeIncarnationHostError('host-unavailable', { cause: error }))
          return
        }
        const markerId = stdout.startsWith(MARKER_RESULT_PREFIX)
          ? stdout.slice(MARKER_RESULT_PREFIX.length)
          : ''
        if (stdout === MARKER_INVALID || !isSpoolIncarnationMarkerId(markerId)) {
          reject(new SpoolWorktreeIncarnationHostError('marker-unavailable'))
          return
        }
        resolve(markerId)
      }
    )
  })
}
