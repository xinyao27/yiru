const POWERSHELL_TICK = '`'

export const WIN32_GIT_PS_WRAPPER = String.raw`$ErrorActionPreference = 'Stop'
$realGit = if ($env:YIRU_REAL_GIT) { $env:YIRU_REAL_GIT } else { 'git' }
$trailer = if ($env:YIRU_GIT_COMMIT_TRAILER) { $env:YIRU_GIT_COMMIT_TRAILER } else { 'Co-authored-by: Yiru <noreply@yiru.ai>' }

if ($args -contains '--dry-run') {
  & $realGit @args
  exit $LASTEXITCODE
}

function Test-GitCommitCommand {
  param([string[]]$CommandArgs)
  for ($i = 0; $i -lt $CommandArgs.Count; $i++) {
    $arg = $CommandArgs[$i]
    if ($arg -eq '-c' -or $arg -eq '--config' -or $arg -eq '-C' -or $arg -eq '--git-dir' -or $arg -eq '--work-tree' -or $arg -eq '--namespace') {
      $i++
      continue
    }
    if ($arg.StartsWith('--config=') -or $arg.StartsWith('--git-dir=') -or $arg.StartsWith('--work-tree=') -or $arg.StartsWith('--namespace=')) {
      continue
    }
    if ($arg -eq 'commit') {
      return $true
    }
    if ($arg.StartsWith('-')) {
      continue
    }
    return $false
  }
  return $false
}

function Test-ExplicitCommitMessage {
  param([string[]]$CommandArgs)
  foreach ($arg in $CommandArgs) {
    if ($arg -eq '-m' -or $arg -eq '--message' -or $arg -eq '-F' -or $arg -eq '--file' -or $arg.StartsWith('--message=') -or $arg.StartsWith('--file=') -or ($arg.StartsWith('-m') -and $arg.Length -gt 2) -or ($arg.StartsWith('-F') -and $arg.Length -gt 2) -or ($arg.StartsWith('-') -and -not $arg.StartsWith('--') -and $arg.EndsWith('m'))) {
      return $true
    }
  }
  return $false
}

function Test-UnsupportedCommitMessageSource {
  param([string[]]$CommandArgs)
  $sawCommit = $false
  for ($i = 0; $i -lt $CommandArgs.Count; $i++) {
    $arg = $CommandArgs[$i]
    if (-not $sawCommit) {
      if ($arg -eq '-c' -or $arg -eq '--config' -or $arg -eq '-C' -or $arg -eq '--git-dir' -or $arg -eq '--work-tree' -or $arg -eq '--namespace') {
        $i++
        continue
      }
      if ($arg.StartsWith('--config=') -or $arg.StartsWith('--git-dir=') -or $arg.StartsWith('--work-tree=') -or $arg.StartsWith('--namespace=')) {
        continue
      }
      if ($arg -eq 'commit') {
        $sawCommit = $true
        continue
      }
    }
    if ($arg -eq '-C' -or $arg -eq '--reuse-message' -or $arg -eq '-c' -or $arg -eq '--reedit-message' -or $arg -eq '--fixup' -or $arg -eq '--squash') {
      return $true
    }
    if ($arg -eq '-F' -or $arg -eq '--file') {
      $i++
      if ($i -ge $CommandArgs.Count -or -not (Test-Path -LiteralPath $CommandArgs[$i])) {
        return $true
      }
      continue
    }
    if ($arg.StartsWith('--file=')) {
      if (-not (Test-Path -LiteralPath $arg.Substring('--file='.Length))) {
        return $true
      }
      continue
    }
    if ($arg.StartsWith('-F') -and $arg.Length -gt 2) {
      if (-not (Test-Path -LiteralPath $arg.Substring(2))) {
        return $true
      }
      continue
    }
  }
  return $false
}

function Test-CommitMessageHasTrailer {
  param([string[]]$CommandArgs)
  for ($i = 0; $i -lt $CommandArgs.Count; $i++) {
    $arg = $CommandArgs[$i]
    if ($arg -eq '-m' -or $arg -eq '--message') {
      $i++
      if ($i -lt $CommandArgs.Count -and $CommandArgs[$i] -match [Regex]::Escape($trailer)) {
        return $true
      }
    } elseif ($arg.StartsWith('--message=')) {
      if ($arg.Substring('--message='.Length) -match [Regex]::Escape($trailer)) {
        return $true
      }
    } elseif ($arg.StartsWith('-m') -and $arg.Length -gt 2) {
      if ($arg.Substring(2) -match [Regex]::Escape($trailer)) {
        return $true
      }
    } elseif ($arg.StartsWith('-') -and -not $arg.StartsWith('--') -and $arg.EndsWith('m')) {
      $i++
      if ($i -lt $CommandArgs.Count -and $CommandArgs[$i] -match [Regex]::Escape($trailer)) {
        return $true
      }
    } elseif ($arg -eq '-F' -or $arg -eq '--file') {
      $i++
      if ($i -lt $CommandArgs.Count -and (Test-Path -LiteralPath $CommandArgs[$i]) -and (Get-Content -LiteralPath $CommandArgs[$i] -Raw) -match [Regex]::Escape($trailer)) {
        return $true
      }
    } elseif ($arg.StartsWith('--file=')) {
      $path = $arg.Substring('--file='.Length)
      if ((Test-Path -LiteralPath $path) -and (Get-Content -LiteralPath $path -Raw) -match [Regex]::Escape($trailer)) {
        return $true
      }
    } elseif ($arg.StartsWith('-F') -and $arg.Length -gt 2) {
      $path = $arg.Substring(2)
      if ((Test-Path -LiteralPath $path) -and (Get-Content -LiteralPath $path -Raw) -match [Regex]::Escape($trailer)) {
        return $true
      }
    }
  }
  return $false
}

if (-not (Test-GitCommitCommand $args) -or -not (Test-ExplicitCommitMessage $args) -or (Test-UnsupportedCommitMessageSource $args) -or (Test-CommitMessageHasTrailer $args)) {
  & $realGit @args
  exit $LASTEXITCODE
}

$tmpFile = $null
$attributedArgs = New-Object System.Collections.Generic.List[string]
$replacedFileMessage = $false
for ($i = 0; $i -lt $args.Count; $i++) {
  $arg = $args[$i]
  if (($arg -eq '-F' -or $arg -eq '--file') -and -not $replacedFileMessage) {
    $i++
    $sourceFile = if ($i -lt $args.Count) { $args[$i] } else { '' }
    if ($sourceFile -and (Test-Path -LiteralPath $sourceFile)) {
      $tmpFile = [System.IO.Path]::GetTempFileName()
      Set-Content -LiteralPath $tmpFile -Value ((Get-Content -LiteralPath $sourceFile -Raw).TrimEnd("${POWERSHELL_TICK}r", "${POWERSHELL_TICK}n") + "${POWERSHELL_TICK}r${POWERSHELL_TICK}n${POWERSHELL_TICK}r${POWERSHELL_TICK}n" + $trailer) -NoNewline
      $attributedArgs.Add($arg)
      $attributedArgs.Add($tmpFile)
      $replacedFileMessage = $true
    } else {
      $attributedArgs.Add($arg)
      $attributedArgs.Add($sourceFile)
    }
  } elseif ($arg.StartsWith('--file=') -and -not $replacedFileMessage) {
    $sourceFile = $arg.Substring('--file='.Length)
    if (Test-Path -LiteralPath $sourceFile) {
      $tmpFile = [System.IO.Path]::GetTempFileName()
      Set-Content -LiteralPath $tmpFile -Value ((Get-Content -LiteralPath $sourceFile -Raw).TrimEnd("${POWERSHELL_TICK}r", "${POWERSHELL_TICK}n") + "${POWERSHELL_TICK}r${POWERSHELL_TICK}n${POWERSHELL_TICK}r${POWERSHELL_TICK}n" + $trailer) -NoNewline
      $attributedArgs.Add("--file=$tmpFile")
      $replacedFileMessage = $true
    } else {
      $attributedArgs.Add($arg)
    }
  } elseif ($arg.StartsWith('-F') -and $arg.Length -gt 2 -and -not $replacedFileMessage) {
    $sourceFile = $arg.Substring(2)
    if (Test-Path -LiteralPath $sourceFile) {
      $tmpFile = [System.IO.Path]::GetTempFileName()
      Set-Content -LiteralPath $tmpFile -Value ((Get-Content -LiteralPath $sourceFile -Raw).TrimEnd("${POWERSHELL_TICK}r", "${POWERSHELL_TICK}n") + "${POWERSHELL_TICK}r${POWERSHELL_TICK}n${POWERSHELL_TICK}r${POWERSHELL_TICK}n" + $trailer) -NoNewline
      $attributedArgs.Add("-F$tmpFile")
      $replacedFileMessage = $true
    } else {
      $attributedArgs.Add($arg)
    }
  } else {
    $attributedArgs.Add($arg)
  }
}

if (-not $replacedFileMessage) {
  $attributedArgs.Add('-m')
  $attributedArgs.Add($trailer)
}

# Why: commit-msg hooks and signing should validate the final message. Editor
# commits pass through unchanged rather than being amended after success.
$env:YIRU_ATTRIBUTION_BYPASS = '1'
try {
  $attributedArgArray = $attributedArgs.ToArray()
  & $realGit @attributedArgArray
  exit $LASTEXITCODE
} finally {
  if ($tmpFile) {
    Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
  }
}
`
