import { translate } from '../i18n/translate'

type NativeFileKind = 'attachment' | 'audio' | 'image'

export async function pickNativeDirectory(defaultPath?: string): Promise<string | null> {
  return (await pickNativeDirectories({ defaultPath }))[0] ?? null
}

export async function pickNativeDirectories(
  options: {
    defaultPath?: string
    multiple?: boolean
  } = {}
): Promise<string[]> {
  const prompt = translate('Choose a project for Yiru')
  if (process.platform === 'darwin') {
    const selection = await runPicker([
      'osascript',
      '-e',
      options.multiple
        ? multipleDirectoryAppleScript(prompt, options.defaultPath)
        : `POSIX path of (choose folder with prompt ${appleScriptString(prompt)}${options.defaultPath ? ` default location POSIX file ${appleScriptString(options.defaultPath)}` : ''})`
    ])
    return splitPickerOutput(selection)
  }
  if (process.platform === 'win32') {
    const powershell = Bun.which('pwsh.exe') ?? Bun.which('powershell.exe')
    if (!powershell) {
      return []
    }
    return splitPickerOutput(
      await runPicker([
        powershell,
        '-STA',
        '-NoProfile',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = $args[0]; if ($dialog.ShowDialog() -eq 'OK') { [Console]::Write($dialog.SelectedPath) }",
        prompt
      ])
    )
  }
  const zenity = Bun.which('zenity')
  if (zenity) {
    return splitPickerOutput(
      await runPicker([
        zenity,
        '--file-selection',
        '--directory',
        `--title=${prompt}`,
        ...(options.multiple ? ['--multiple', '--separator=\n'] : []),
        ...(options.defaultPath ? [`--filename=${options.defaultPath}/`] : [])
      ])
    )
  }
  const kdialog = Bun.which('kdialog')
  return kdialog
    ? splitPickerOutput(
        await runPicker([kdialog, '--getexistingdirectory', options.defaultPath ?? process.cwd()])
      )
    : []
}

export async function pickNativeFile(kind: NativeFileKind): Promise<string | null> {
  const prompt = translate('Choose a file for Yiru')
  if (process.platform === 'darwin') {
    return runPicker([
      'osascript',
      '-e',
      `POSIX path of (choose file with prompt ${appleScriptString(prompt)})`
    ])
  }
  if (process.platform === 'win32') {
    const powershell = Bun.which('pwsh.exe') ?? Bun.which('powershell.exe')
    if (!powershell) {
      return null
    }
    return runPicker([
      powershell,
      '-STA',
      '-NoProfile',
      '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title = $args[0]; $dialog.Filter = $args[1]; if ($dialog.ShowDialog() -eq 'OK') { [Console]::Write($dialog.FileName) }",
      prompt,
      windowsFileFilter(kind)
    ])
  }
  const filter = linuxFileFilter(kind)
  const zenity = Bun.which('zenity')
  if (zenity) {
    return runPicker([
      zenity,
      '--file-selection',
      `--title=${prompt}`,
      ...(filter ? [`--file-filter=${filter}`] : [])
    ])
  }
  const kdialog = Bun.which('kdialog')
  return kdialog ? runPicker([kdialog, '--getopenfilename', process.cwd(), filter]) : null
}

async function runPicker(argumentsList: string[]): Promise<string | null> {
  try {
    const child = Bun.spawn(argumentsList, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' })
    const [exitCode, output] = await Promise.all([child.exited, new Response(child.stdout).text()])
    if (exitCode !== 0) {
      return null
    }
    return output.trim().replace(/[\\/]$/, '') || null
  } catch {
    return null
  }
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function multipleDirectoryAppleScript(prompt: string, defaultPath?: string): string {
  return `set chosenFolders to choose folder with prompt ${appleScriptString(prompt)}${defaultPath ? ` default location POSIX file ${appleScriptString(defaultPath)}` : ''} with multiple selections allowed
set resultText to ""
repeat with chosenFolder in chosenFolders
  set resultText to resultText & POSIX path of chosenFolder & linefeed
end repeat
return resultText`
}

function splitPickerOutput(output: string | null): string[] {
  return output
    ? output
        .split(/\r?\n/)
        .map((path) => path.trim().replace(/[\\/]$/, ''))
        .filter(Boolean)
    : []
}

function windowsFileFilter(kind: NativeFileKind): string {
  if (kind === 'image') {
    return 'Images|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.bmp;*.ico|All files|*.*'
  }
  if (kind === 'audio') {
    return 'Audio|*.ogg;*.mp3;*.wav;*.m4a;*.aac;*.flac|All files|*.*'
  }
  return 'All files|*.*'
}

function linuxFileFilter(kind: NativeFileKind): string {
  if (kind === 'image') {
    return 'Images | *.png *.jpg *.jpeg *.gif *.webp *.svg *.bmp *.ico'
  }
  if (kind === 'audio') {
    return 'Audio | *.ogg *.mp3 *.wav *.m4a *.aac *.flac'
  }
  return ''
}
